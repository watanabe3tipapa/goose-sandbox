#!/usr/bin/env python3
"""Collect macOS launchd jobs into a Bootprint snapshot.

The viewer only needs a JSON document with ``meta`` and ``jobs``. This script
produces that document from what macOS already ships with:

    plutil                 read LaunchAgents / LaunchDaemons plists
    launchctl print        loaded / PID / last exit status / disabled state
    codesign               signature and Team ID for third-party binaries

    python3 Bootprint/tools/collect_launch_jobs.py

The collector is read-only. It never loads, unloads, enables, disables or
deletes a job. Environment variables are not copied into the snapshot at all,
and token-like arguments are masked.

Optional flags:

    --output PATH       destination (default Bootprint/viewer/data/jobs_snapshot.json)
    --baseline PATH     copy the previous snapshot here before writing the new one
    --no-codesign       skip codesign (faster; signed becomes null)
    --pretty            pretty-print JSON (default)

No third-party Python packages are required.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = PROJECT_ROOT / "viewer" / "data" / "jobs_snapshot.json"
SIGNATURE_TIMEOUT = 6
HOME = Path.home()
UID = os.getuid()

PLIST_DIRS = [
    (Path("/System/Library/LaunchDaemons"), "system", "daemon"),
    (Path("/System/Library/LaunchAgents"), "system", "agent"),
    (Path("/Library/LaunchDaemons"), "global", "daemon"),
    (Path("/Library/LaunchAgents"), "global", "agent"),
    (HOME / "Library/LaunchAgents", "gui", "agent"),
]

SECRET_ARG = re.compile(
    r"(?i)^--?(?:token|password|passwd|secret|api[-_]?key|apikey|auth|credential|client[-_]?secret)$"
)
SECRET_PAIR = re.compile(
    r"(?i)^(--?(?:token|password|passwd|secret|api[-_]?key|apikey|auth|credential|client[-_]?secret)=)(.+)$"
)
SECRET_INLINE = re.compile(
    r"(?i)((?:token|password|passwd|secret|api[-_]?key|apikey|auth|credential|client[-_]?secret)=)([^&\s]+)"
)


def run(command: list[str], timeout: float = 25) -> str:
    """Run a command and return stdout. Never raises on a non-zero exit."""
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            errors="replace",
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        print(f"[collector] {command[0]} failed: {error}", file=sys.stderr)
        return ""
    return result.stdout or ""


def display_path(path: str) -> str:
    if not path:
        return ""
    try:
        expanded = str(Path(path).expanduser())
    except (OSError, RuntimeError):
        expanded = path
    if expanded.startswith(str(HOME)):
        return "~" + expanded[len(str(HOME)):]
    return expanded


def expand_path(path: str) -> str:
    if not path:
        return ""
    try:
        return str(Path(path).expanduser())
    except (OSError, RuntimeError):
        return path


def mask_args(args: list[str]) -> list[str]:
    """Mask token-like flags while keeping the flag name readable."""
    masked: list[str] = []
    hide_next = False
    for arg in args:
        if hide_next:
            masked.append("[REDACTED]")
            hide_next = False
            continue
        pair = SECRET_PAIR.match(arg)
        if pair:
            masked.append(f"{pair.group(1)}[REDACTED]")
            continue
        if SECRET_ARG.match(arg):
            masked.append(arg)
            hide_next = True
            continue
        masked.append(SECRET_INLINE.sub(lambda m: f"{m.group(1)}[REDACTED]", arg))
    return masked


def read_plist(path: Path) -> dict | None:
    output = run(["plutil", "-convert", "json", "-o", "-", str(path)])
    if not output.strip():
        return None
    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def parse_services(text: str) -> dict[str, dict]:
    """Parse the `services = { ... }` table from `launchctl print`."""
    services: dict[str, dict] = {}
    inside = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("services = {"):
            inside = True
            continue
        if not inside:
            continue
        if stripped == "}":
            break
        match = re.match(r"^(\d+|-)\s+(\d+|-)\s+(.+)$", stripped)
        if not match:
            continue
        pid_token, status_token, label = match.groups()
        pid = None if pid_token == "-" else int(pid_token)
        services[label.strip()] = {
            "pid": None if pid == 0 else pid,
            "last_exit_status": None if status_token == "-" else int(status_token),
        }
    return services


def parse_list(text: str) -> dict[str, dict]:
    services: dict[str, dict] = {}
    for line in text.splitlines():
        parts = line.split("\t")
        if len(parts) < 3 or parts[0] == "PID":
            continue
        pid_token, status_token, label = parts[0].strip(), parts[1].strip(), parts[2].strip()
        if not label:
            continue
        try:
            services[label] = {
                "pid": None if pid_token == "-" else int(pid_token),
                "last_exit_status": None if status_token == "-" else int(status_token),
            }
        except ValueError:
            continue
    return services


def parse_disabled(text: str) -> dict[str, bool]:
    disabled: dict[str, bool] = {}
    for line in text.splitlines():
        match = re.match(r'^\s*"([^"]+)"\s*=>\s*(enabled|disabled|true|false)\s*$', line)
        if not match:
            continue
        label, value = match.groups()
        disabled[label] = value == "disabled" or value == "true"
    return disabled


def collect_states() -> dict[str, dict[str, dict]]:
    states: dict[str, dict[str, dict]] = {}
    for domain in ("system", f"gui/{UID}", f"user/{UID}"):
        table = parse_services(run(["launchctl", "print", domain]))
        if domain == f"gui/{UID}":
            for label, state in parse_list(run(["launchctl", "list"])).items():
                current = table.setdefault(label, {"pid": None, "last_exit_status": None})
                if current.get("pid") is None and state.get("pid") is not None:
                    current["pid"] = state["pid"]
                if current.get("last_exit_status") is None and state.get("last_exit_status") is not None:
                    current["last_exit_status"] = state["last_exit_status"]
        states[domain] = table
    return states


def collect_disabled() -> dict[str, dict[str, bool]]:
    return {
        domain: parse_disabled(run(["launchctl", "print-disabled", domain]))
        for domain in ("system", f"gui/{UID}")
    }


def normalize_calendar(value) -> list[dict]:
    entries = value if isinstance(value, list) else [value] if isinstance(value, dict) else []
    result = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        normalized = {}
        for key in ("minute", "hour", "day", "weekday", "month"):
            if isinstance(entry.get(key), int):
                normalized[key] = entry[key]
        if "minute" in normalized or "hour" in normalized or "weekday" in normalized:
            result.append(normalized)
    return result


def normalize_triggers(plist: dict) -> dict:
    keep_alive = plist.get("KeepAlive")
    sockets = plist.get("Sockets")
    return {
        "run_at_load": plist.get("RunAtLoad") is True,
        "keep_alive": keep_alive is True or isinstance(keep_alive, dict),
        "start_interval": plist.get("StartInterval")
        if isinstance(plist.get("StartInterval"), int) and plist.get("StartInterval") > 0
        else None,
        "start_calendar": normalize_calendar(plist.get("StartCalendarInterval")),
        "watch_paths": [
            display_path(path)
            for path in plist.get("WatchPaths", [])
            if isinstance(path, str)
        ]
        if isinstance(plist.get("WatchPaths"), list)
        else [],
        "sockets": len(sockets) if isinstance(sockets, dict) else 0,
    }


def resolve_program(plist: dict) -> tuple[str, list[str]]:
    arguments = plist.get("ProgramArguments")
    arguments = [item for item in arguments if isinstance(item, str)] if isinstance(arguments, list) else []
    program = plist.get("Program") if isinstance(plist.get("Program"), str) else ""
    if not program and arguments:
        program = arguments[0]
        arguments = arguments[1:]
    elif program and arguments and arguments[0] == program:
        arguments = arguments[1:]
    if not program:
        bundle_program = plist.get("BundleProgram")
        if isinstance(bundle_program, str):
            program = bundle_program
    return display_path(program), mask_args(arguments)


def is_apple_path(path: str) -> bool:
    expanded = expand_path(path)
    return any(
        expanded.startswith(prefix)
        for prefix in ("/System/", "/usr/libexec/", "/usr/sbin/", "/sbin/", "/Library/Apple/")
    )


def read_signature(path: str) -> dict:
    expanded = expand_path(path)
    if not expanded or not os.path.exists(expanded):
        return {"signed": None, "adhoc": False, "team_id": None}
    try:
        result = subprocess.run(
            ["codesign", "-dv", "--verbose=2", expanded],
            capture_output=True,
            text=True,
            timeout=SIGNATURE_TIMEOUT,
            errors="replace",
        )
    except (OSError, subprocess.TimeoutExpired):
        return {"signed": None, "adhoc": False, "team_id": None}

    details = f"{result.stdout}\n{result.stderr}"
    if result.returncode != 0:
        if "not signed" in details or "code object is not signed" in details:
            return {"signed": False, "adhoc": False, "team_id": None}
        return {"signed": None, "adhoc": False, "team_id": None}

    team_id = None
    for line in details.splitlines():
        if line.startswith("TeamIdentifier="):
            value = line.split("=", 1)[1].strip()
            team_id = None if value in ("not set", "") else value
            break
    return {
        "signed": True,
        "adhoc": "Signature=adhoc" in details,
        "team_id": team_id,
    }


def signature_map(programs: set[str]) -> dict[str, dict]:
    unique = sorted(path for path in programs if path and not is_apple_path(path))
    results: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for path, signature in zip(unique, pool.map(read_signature, unique)):
            results[path] = signature
    return results


def collect_jobs(no_codesign: bool) -> list[dict]:
    states = collect_states()
    disabled = collect_disabled()
    seen: set[str] = set()
    jobs: list[dict] = []
    programs: set[str] = set()

    for directory, lane, scope in PLIST_DIRS:
        if not directory.is_dir():
            continue
        for plist_path in sorted(directory.glob("*.plist")):
            plist = read_plist(plist_path)
            if not plist:
                continue
            label = plist.get("Label")
            if not isinstance(label, str) or not label:
                label = plist_path.stem
            domain = "system" if scope == "daemon" else f"gui/{UID}"
            key = f"{domain}:{label}"
            if key in seen:
                continue
            seen.add(key)

            program, args = resolve_program(plist)
            triggers = normalize_triggers(plist)
            state = states.get(domain, {}).get(label, {})
            disabled_value = disabled.get(domain, {}).get(label)
            if disabled_value is None:
                disabled_value = plist.get("Disabled") is True

            program_exists = bool(program) and os.path.exists(expand_path(program))
            jobs.append(
                {
                    "label": label,
                    "domain": domain,
                    "lane": lane,
                    "scope": scope,
                    "plist": display_path(str(plist_path)),
                    "program": program,
                    "args": args,
                    "program_exists": program_exists,
                    "triggers": triggers,
                    "disabled": disabled_value,
                    "loaded": bool(label in states.get(domain, {})),
                    "pid": state.get("pid"),
                    "last_exit_status": state.get("last_exit_status"),
                    "signed": None,
                    "adhoc": False,
                    "team_id": None,
                }
            )
            if program and not is_apple_path(program):
                programs.add(program)

    signatures = {} if no_codesign else signature_map(programs)
    for job in jobs:
        signature = signatures.get(job["program"])
        if signature:
            job.update(signature)

    jobs.sort(key=lambda item: (item["lane"], item["label"]))
    return jobs


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect macOS launchd jobs into a Bootprint snapshot.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--baseline", type=Path, default=None)
    parser.add_argument("--no-codesign", action="store_true")
    parser.add_argument("--pretty", action="store_true", default=True)
    args = parser.parse_args()

    jobs = collect_jobs(args.no_codesign)
    if not jobs:
        print("[collector] no launchd jobs were collected", file=sys.stderr)
        return 1

    os_version = platform.mac_ver()[0] or platform.release()
    snapshot = {
        "meta": {
            "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "host": platform.node() or "localhost",
            "os": f"macOS {os_version}",
            "uid": UID,
            "source": "launchctl",
            "window": "24h",
        },
        "jobs": jobs,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.baseline and args.output.exists():
        args.baseline.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(args.output, args.baseline)

    text = json.dumps(snapshot, ensure_ascii=False, indent=2 if args.pretty else None)
    args.output.write_text(text + "\n", encoding="utf-8")

    loaded = sum(1 for job in jobs if job["loaded"])
    print(
        f"[collector] {len(jobs)} jobs ({loaded} loaded) -> {args.output}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
