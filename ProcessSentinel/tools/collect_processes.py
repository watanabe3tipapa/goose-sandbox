#!/usr/bin/env python3
"""Collect running macOS processes into a Process Sentinel snapshot.

The viewer is intentionally dumb about how the data was produced: it only
needs a JSON document with ``meta`` and ``processes``. This script produces
that document from the tools macOS already ships with.

    python3 ProcessSentinel/tools/collect_processes.py

Optional flags:

    --output PATH       destination (default: ProcessSentinel/viewer/data/process_snapshot.json)
    --baseline PATH     copy the previous snapshot here before writing the new one
    --watch N           take N samples and keep a short per-process history
    --interval SECONDS  delay between samples (default: 2)
    --no-network        skip lsof
    --no-codesign       skip codesign (faster, but signed becomes null)

No third-party Python packages are required.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import ctypes
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = PROJECT_ROOT / "viewer" / "data" / "process_snapshot.json"
SIGNATURE_TIMEOUT = 6
MAX_HISTORY = 60
MAX_NETWORK_ENTRIES = 12

# `ps` truncates the comm column, so ask libproc for the real executable path.
try:
    _libproc = ctypes.CDLL("/usr/lib/libproc.dylib", use_errno=True)
    _libproc.proc_pidpath.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
    _libproc.proc_pidpath.restype = ctypes.c_int
except OSError:  # pragma: no cover - only on non-macOS
    _libproc = None


def executable_path(pid: int) -> str | None:
    if _libproc is None:
        return None
    buffer = ctypes.create_string_buffer(4096)
    length = _libproc.proc_pidpath(pid, buffer, len(buffer))
    if length <= 0:
        return None
    return buffer.value.decode("utf-8", "replace") or None


def run(command: list[str], timeout: float = 20) -> str:
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


def collect_processes() -> list[dict]:
    """Parse `ps` into the raw process fields used by the viewer."""
    output = run(
        [
            "ps",
            "-axo",
            "pid=,ppid=,user=,pcpu=,pmem=,rss=,state=,args=",
        ]
    )
    processes = []
    for line in output.splitlines():
        parts = line.split(None, 7)
        if len(parts) < 7:
            continue
        pid, ppid, user, pcpu, pmem, rss, state = parts[:7]
        command = parts[7].strip() if len(parts) > 7 else ""
        try:
            numeric_pid = int(pid)
            path = executable_path(numeric_pid)
            if not path:
                first = command.split(None, 1)[0] if command else ""
                path = first or f"pid:{numeric_pid}"
            processes.append(
                {
                    "pid": numeric_pid,
                    "ppid": int(ppid),
                    "user": user,
                    "cpu": round(float(pcpu), 1),
                    "memory": round(float(pmem), 1),
                    "rss": int(rss),
                    "state": state,
                    "name": Path(path).name or path,
                    "path": path,
                    "command": command or path,
                }
            )
        except (ValueError, IndexError):
            continue
    processes.sort(key=lambda item: item["pid"])
    return processes


def collect_network() -> dict[int, list[dict]]:
    """Map pid -> network endpoints using a single lsof call."""
    output = run(["lsof", "-nP", "-iTCP", "-iUDP", "-F", "pcnPT"], timeout=30)
    connections: dict[int, list[dict]] = {}
    current_pid: int | None = None
    endpoint: dict | None = None

    def flush():
        nonlocal endpoint
        if current_pid is None or not endpoint:
            endpoint = None
            return
        if endpoint.get("remote") or endpoint.get("local"):
            bucket = connections.setdefault(current_pid, [])
            if len(bucket) < MAX_NETWORK_ENTRIES:
                bucket.append(
                    {
                        "proto": endpoint.get("proto") or "TCP",
                        "local": endpoint.get("local") or "—",
                        "remote": endpoint.get("remote") or "—",
                        "state": endpoint.get("state") or "—",
                    }
                )
        endpoint = None

    for raw in output.splitlines():
        if not raw:
            continue
        tag, value = raw[0], raw[1:]
        if tag == "p":
            flush()
            try:
                current_pid = int(value)
            except ValueError:
                current_pid = None
        elif tag == "n":
            flush()
            endpoint = {"local": value, "remote": ""}
            if "->" in value:
                local, remote = value.split("->", 1)
                endpoint["local"], endpoint["remote"] = local, remote
            elif value.startswith("*:"):
                endpoint["remote"] = "*:*"
        elif tag == "P" and endpoint is not None:
            endpoint["proto"] = value
        elif tag == "T" and endpoint is not None:
            endpoint["state"] = value.split("=", 1)[-1]
    flush()
    return connections


def read_signature(path: str) -> dict:
    """Inspect a code signature with codesign."""
    if not path or not os.path.exists(path):
        return {"signed": None, "adhoc": False, "teamId": None, "signature": "パスを確認できません"}
    try:
        result = subprocess.run(
            ["codesign", "-dv", "--verbose=2", path],
            capture_output=True,
            text=True,
            timeout=SIGNATURE_TIMEOUT,
            errors="replace",
        )
    except (OSError, subprocess.TimeoutExpired):
        return {"signed": None, "adhoc": False, "teamId": None, "signature": "署名を確認できません"}

    details = f"{result.stdout}\n{result.stderr}"
    if result.returncode != 0:
        if "not signed" in details or "code object is not signed" in details:
            return {"signed": False, "adhoc": False, "teamId": None, "signature": "未署名"}
        return {"signed": None, "adhoc": False, "teamId": None, "signature": "署名を確認できません"}

    authority = None
    team_id = None
    adhoc = "Signature=adhoc" in details
    for line in details.splitlines():
        if line.startswith("Authority=") and authority is None:
            authority = line.split("=", 1)[1].strip()
        elif line.startswith("TeamIdentifier="):
            value = line.split("=", 1)[1].strip()
            team_id = None if value in ("not set", "") else value
    return {
        "signed": True,
        "adhoc": adhoc,
        "teamId": team_id,
        "signature": authority or ("アドホック署名" if adhoc else "署名済み"),
    }


def enrich(processes: list[dict], network: dict[int, list[dict]], inspect_signatures: bool) -> None:
    unique_paths = sorted({process["path"] for process in processes})
    signatures: dict[str, dict] = {}
    if inspect_signatures:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            for path, signature in zip(unique_paths, pool.map(read_signature, unique_paths)):
                signatures[path] = signature
    for process in processes:
        signature = signatures.get(
            process["path"],
            {"signed": None, "adhoc": False, "teamId": None, "signature": "未検査"},
        )
        process.update(signature)
        process["network"] = network.get(process["pid"], [])
        process["history"] = []


def snapshot(processes: list[dict], interval_ms: int, samples: int, source: str) -> dict:
    now = datetime.now().astimezone()
    return {
        "meta": {
            "generated_at": now.isoformat(timespec="seconds"),
            "host": platform.node() or "unknown-host",
            "os": f"macOS {platform.mac_ver()[0]}" if platform.system() == "Darwin" else platform.platform(),
            "source": source,
            "interval_ms": interval_ms,
            "samples": samples,
            "collector": "collect_processes.py",
        },
        "processes": processes,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect macOS processes for Process Sentinel.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="snapshot destination")
    parser.add_argument("--baseline", type=Path, help="copy the previous snapshot here before writing")
    parser.add_argument("--watch", type=int, default=1, metavar="N", help="number of samples to take")
    parser.add_argument("--interval", type=float, default=2.0, metavar="SECONDS", help="delay between samples")
    parser.add_argument("--no-network", action="store_true", help="skip lsof network correlation")
    parser.add_argument("--no-codesign", action="store_true", help="skip codesign inspection")
    args = parser.parse_args()

    if platform.system() != "Darwin":
        print("[collector] this collector targets macOS", file=sys.stderr)
        return 2

    samples = max(1, args.watch)
    interval_ms = max(0, int(args.interval * 1000))
    incorporated: dict[str, dict] = {}
    processes: list[dict] = []
    network: dict[int, list[dict]] = {}

    for index in range(samples):
        if index:
            time.sleep(max(0.0, args.interval))
        processes = collect_processes()
        network = {} if args.no_network else collect_network()
        enrich(processes, network, not args.no_codesign)
        for process in processes:
            point = {
                "t": datetime.now().strftime("%H:%M:%S"),
                "cpu": process["cpu"],
                "memory": process["memory"],
            }
            history = incorporated.setdefault(process["path"], [])
            history.append(point)
            process["history"] = history[-MAX_HISTORY:]
        print(f"[collector] sample {index + 1}/{samples}: {len(processes)} processes", file=sys.stderr)

    tools = ["ps"]
    if not args.no_network:
        tools.append("lsof")
    if not args.no_codesign:
        tools.append("codesign")
    document = snapshot(processes, interval_ms, samples, " + ".join(tools))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.baseline and args.output.exists():
        args.baseline.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.output, args.baseline)
        print(f"[collector] previous snapshot saved to {args.baseline}", file=sys.stderr)

    args.output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[collector] wrote {args.output} ({len(document['processes'])} processes)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
