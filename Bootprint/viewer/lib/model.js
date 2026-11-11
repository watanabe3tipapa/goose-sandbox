/*
 * Bootprint model
 *
 * Dependency-free helpers shared by the viewer and the Node tests:
 *   - snapshot validation
 *   - status classification (error / warning / healthy / external)
 *   - baseline diff keyed by domain:label
 *   - lane and vendor grouping
 *   - 24h schedule expansion
 *   - filtering and URL query <-> state conversion
 *
 * Loaded with a plain <script> tag and required from node:test.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BootprintModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STATUSES = ["error", "warning", "healthy", "external"];
  const STATUS_LABEL = {
    error: "Error",
    warning: "Warning",
    healthy: "Healthy",
    external: "External",
    removed: "Removed",
  };

  const LANES = Object.freeze([
    { id: "system", label: "System", path: "/System/Library", note: "Apple daemons & agents" },
    { id: "global", label: "Global", path: "/Library", note: "all users" },
    { id: "gui", label: "GUI", path: "~/Library/LaunchAgents", note: "login session" },
    { id: "user", label: "User", path: "user/$UID", note: "user domain" },
  ]);

  const LANE_IDS = LANES.map((lane) => lane.id);

  const DEFAULT_FILTERS = Object.freeze({
    status: "all",
    query: "",
    unsignedOnly: false,
    diffOnly: false,
    lane: "all",
    trigger: "all",
    showApple: false,
  });

  const DATA_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

  const APPLE_PREFIXES = [
    "/System/",
    "/usr/libexec/",
    "/usr/sbin/",
    "/sbin/",
    "/Library/Apple/",
    "/usr/lib/dyld",
  ];

  const SUSPICIOUS_PREFIXES = ["/tmp/", "/private/tmp/", "/var/tmp/", "/Users/Shared/"];
  const WRITABLE_PREFIXES = ["~/", "/Users/", "/tmp/", "/private/tmp/", "/var/tmp/", "/Users/Shared/"];

  const VENDOR_NAMES = {
    apple: "Apple",
    google: "Google",
    docker: "Docker",
    tailscale: "Tailscale",
    microsoft: "Microsoft",
    github: "GitHub",
    example: "Example",
    shady: "Shady",
    "1password": "1Password",
    jetbrains: "JetBrains",
    spotify: "Spotify",
    raycast: "Raycast",
    postmanlabs: "Postman",
    mozilla: "Mozilla",
    figma: "Figma",
  };

  function normalize(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }

  function isAppleJob(job) {
    if (!job || typeof job !== "object") return false;
    if (typeof job.label === "string" && job.label.startsWith("com.apple.")) return true;
    if (typeof job.program !== "string") return false;
    return APPLE_PREFIXES.some((prefix) => job.program.startsWith(prefix));
  }

  function hasPrefix(path, prefixes) {
    if (typeof path !== "string") return false;
    return prefixes.some((prefix) => path.startsWith(prefix));
  }

  function isSuspiciousPath(path) {
    return hasPrefix(path, SUSPICIOUS_PREFIXES);
  }

  function isUserWritablePath(path) {
    return hasPrefix(path, WRITABLE_PREFIXES);
  }

  function keyOf(job) {
    if (!job) return "";
    return `${job.domain || ""}:${job.label || ""}`;
  }

  function vendorOf(job) {
    const label = job && typeof job.label === "string" ? job.label : "";
    if (label.startsWith("homebrew.")) return "Homebrew";
    if (label.startsWith("org.mozilla.")) return "Mozilla";
    const parts = label.split(".");
    if (parts.length >= 3) {
      const segment = parts[1];
      return VENDOR_NAMES[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
    }
    return label || "Unknown";
  }

  function bool(value) {
    return value === true;
  }

  function normalizeTriggers(raw) {
    const triggers = raw && typeof raw === "object" ? raw : {};
    return {
      run_at_load: bool(triggers.run_at_load),
      keep_alive: bool(triggers.keep_alive),
      start_interval: isFiniteNumber(triggers.start_interval) && triggers.start_interval > 0
        ? triggers.start_interval
        : null,
      start_calendar: Array.isArray(triggers.start_calendar) ? triggers.start_calendar : [],
      watch_paths: Array.isArray(triggers.watch_paths) ? triggers.watch_paths : [],
      sockets: isFiniteNumber(triggers.sockets) ? triggers.sockets : 0,
    };
  }

  function validateSnapshot(snapshot) {
    const issues = [];
    const push = (level, path, message) => issues.push({ level, path, message });

    if (!snapshot || typeof snapshot !== "object") {
      push("error", "", "スナップショットがオブジェクトではありません");
      return { ok: false, issues };
    }
    if (!snapshot.meta || typeof snapshot.meta !== "object") {
      push("error", "meta", "meta がありません");
    }
    if (!Array.isArray(snapshot.jobs) || snapshot.jobs.length === 0) {
      push("error", "jobs", "jobs が空か配列ではありません");
      return { ok: false, issues };
    }
    if (snapshot.jobs.length > 3000) {
      push("warning", "jobs", "ジョブ数が 3,000 を超えています");
    }

    const keys = new Set();
    snapshot.jobs.forEach((job, index) => {
      const path = `jobs[${index}]`;
      if (!job || typeof job !== "object") {
        push("error", path, "ジョブがオブジェクトではありません");
        return;
      }
      ["label", "domain", "lane"].forEach((field) => {
        if (typeof job[field] !== "string" || job[field].trim() === "") {
          push("error", `${path}.${field}`, `${field} が空です`);
        }
      });
      if (job.lane && !LANE_IDS.includes(job.lane)) {
        push("error", `${path}.lane`, `lane が不正です: ${job.lane}`);
      }
      if (job.domain && !/^(system|gui\/\d+|user\/\d+)$/.test(job.domain)) {
        push("error", `${path}.domain`, `domain が不正です: ${job.domain}`);
      }
      if (job.scope !== "daemon" && job.scope !== "agent") {
        push("error", `${path}.scope`, "scope は daemon / agent のいずれかです");
      }
      const key = keyOf(job);
      if (keys.has(key)) {
        push("error", path, `domain:label が重複しています: ${key}`);
      } else {
        keys.add(key);
      }
      if (job.program !== undefined && typeof job.program !== "string") {
        push("error", `${path}.program`, "program は文字列である必要があります");
      }
      if (job.args !== undefined && !Array.isArray(job.args)) {
        push("error", `${path}.args`, "args は配列である必要があります");
      }
      if (job.program_exists !== undefined && typeof job.program_exists !== "boolean") {
        push("error", `${path}.program_exists`, "program_exists は boolean である必要があります");
      }
      if (job.pid !== null && job.pid !== undefined && (!Number.isInteger(job.pid) || job.pid < 0)) {
        push("error", `${path}.pid`, "pid は 0 以上の整数または null です");
      }
      if (
        job.last_exit_status !== null &&
        job.last_exit_status !== undefined &&
        !Number.isInteger(job.last_exit_status)
      ) {
        push("error", `${path}.last_exit_status`, "last_exit_status は整数または null です");
      }
      ["disabled", "loaded", "adhoc"].forEach((field) => {
        if (typeof job[field] !== "boolean") {
          push("error", `${path}.${field}`, `${field} は boolean である必要があります`);
        }
      });
      if (!(job.signed === true || job.signed === false || job.signed === null)) {
        push("error", `${path}.signed`, "signed は true / false / null のいずれかです");
      }
      const triggers = job.triggers;
      if (!triggers || typeof triggers !== "object") {
        push("error", `${path}.triggers`, "triggers がありません");
      } else {
        if (typeof triggers.run_at_load !== "boolean") {
          push("error", `${path}.triggers.run_at_load`, "run_at_load は boolean です");
        }
        if (typeof triggers.keep_alive !== "boolean") {
          push("error", `${path}.triggers.keep_alive`, "keep_alive は boolean です");
        }
        if (
          triggers.start_interval !== null &&
          triggers.start_interval !== undefined &&
          (!isFiniteNumber(triggers.start_interval) || triggers.start_interval <= 0)
        ) {
          push("error", `${path}.triggers.start_interval`, "start_interval は正の数値または null です");
        }
        if (
          triggers.start_calendar !== undefined &&
          !Array.isArray(triggers.start_calendar)
        ) {
          push("error", `${path}.triggers.start_calendar`, "start_calendar は配列です");
        }
        if (triggers.watch_paths !== undefined && !Array.isArray(triggers.watch_paths)) {
          push("error", `${path}.triggers.watch_paths`, "watch_paths は配列です");
        }
      }
    });

    return { ok: issues.every((issue) => issue.level !== "error"), issues };
  }

  function classifyJob(job, diff) {
    const reasons = [];
    let score = 0;
    const external = isAppleJob(job);
    const triggers = normalizeTriggers(job.triggers);
    const suspicious = isSuspiciousPath(job.program);
    const writable = isUserWritablePath(job.program);
    const writableRisk = writable && (job.signed !== true || job.adhoc);
    const highFrequency = triggers.start_interval !== null && triggers.start_interval < 60;

    if (external) {
      return { status: "external", score: 0, reasons: ["Apple のシステムジョブ"] };
    }

    if (job.program_exists === false) {
      score += 50;
      reasons.push("実行ファイルが存在しない");
    }
    if (job.signed === false) {
      score += 40;
      reasons.push("未署名の実行ファイル");
    } else if (job.adhoc) {
      score += 25;
      reasons.push("アドホック署名（Team ID なし）");
    } else if (job.signed === null) {
      score += 10;
      reasons.push("署名を確認できません");
    }
    if (suspicious) {
      score += 30;
      reasons.push("一時領域または共有領域から実行");
    } else if (writableRisk) {
      score += 25;
      reasons.push("ユーザー書き込み可能な領域から実行");
    }
    if (triggers.run_at_load) {
      score += 10;
      reasons.push("ロード直後に起動 (RunAtLoad)");
    }
    if (triggers.keep_alive) {
      score += 10;
      reasons.push("終了しても再起動 (KeepAlive)");
    }
    if (highFrequency) {
      score += 10;
      reasons.push(`60 秒未満の高頻度実行 (${formatInterval(triggers.start_interval)})`);
    }
    if (diff === "new") {
      score += 15;
      reasons.push("前回スナップショット以降に新規出現");
    } else if (diff === "changed") {
      reasons.push("前回スナップショットから定義が変化");
    }

    let status;
    if (job.program_exists === false || suspicious || (job.signed === false && writable)) {
      status = "error";
    } else if (
      job.signed === false ||
      job.signed === null ||
      job.adhoc ||
      writableRisk ||
      highFrequency ||
      diff === "new" ||
      diff === "changed"
    ) {
      status = "warning";
    } else {
      status = "healthy";
    }

    return { status, score: Math.min(100, score), reasons };
  }

  function signatureOf(job) {
    return [job.signed, job.adhoc, job.team_id || ""].join("|");
  }

  function triggerSignature(job) {
    return JSON.stringify(normalizeTriggers(job.triggers));
  }

  function isChanged(current, base) {
    if (!base) return false;
    if (current.program !== base.program) return true;
    if (current.disabled !== base.disabled) return true;
    if (signatureOf(current) !== signatureOf(base)) return true;
    if (triggerSignature(current) !== triggerSignature(base)) return true;
    if (JSON.stringify(current.args || []) !== JSON.stringify(base.args || [])) return true;
    return false;
  }

  function severity(status) {
    return { error: 0, warning: 1, healthy: 2, external: 3, removed: 4 }[status] ?? 9;
  }

  function compareJobs(a, b) {
    return severity(a.status) - severity(b.status) || a.label.localeCompare(b.label, "en");
  }

  function buildModel(snapshot, baseline) {
    const baseJobs = baseline && Array.isArray(baseline.jobs) ? baseline.jobs : [];
    const baseByKey = new Map();
    baseJobs.forEach((job) => baseByKey.set(keyOf(job), job));
    const currentKeys = new Set();

    const jobs = snapshot.jobs.map((raw) => {
      const job = Object.assign({}, raw);
      job.key = keyOf(job);
      job.triggers = normalizeTriggers(job.triggers);
      job.vendor = vendorOf(job);
      currentKeys.add(job.key);
      const base = baseByKey.get(job.key);
      let diff = null;
      if (baseJobs.length > 0) {
        if (!base) diff = "new";
        else if (isChanged(job, base)) diff = "changed";
      }
      const classification = classifyJob(job, diff);
      job.diff = diff;
      job.status = classification.status;
      job.score = classification.score;
      job.reasons = classification.reasons;
      return job;
    });

    const removed = baseJobs
      .filter((job) => !currentKeys.has(keyOf(job)))
      .map((job) => {
        const normalized = Object.assign({}, job, {
          key: keyOf(job),
          triggers: normalizeTriggers(job.triggers),
          vendor: vendorOf(job),
          diff: "removed",
          status: "removed",
          reasons: ["前回スナップショットだけに存在"],
        });
        const classification = classifyJob(normalized, null);
        normalized.score = classification.score;
        return normalized;
      })
      .sort(compareJobs);

    const byStatus = Object.create(null);
    STATUSES.forEach((status) => { byStatus[status] = 0; });
    let unsigned = 0;
    let runAtLoad = 0;
    let thirdParty = 0;
    jobs.forEach((job) => {
      byStatus[job.status] += 1;
      if (job.signed === false) unsigned += 1;
      if (job.triggers.run_at_load) runAtLoad += 1;
      if (!isAppleJob(job)) thirdParty += 1;
    });

    const lanes = LANES.map((lane) => {
      const laneJobs = jobs.filter((job) => job.lane === lane.id);
      const vendorMap = new Map();
      laneJobs.forEach((job) => {
        if (!vendorMap.has(job.vendor)) vendorMap.set(job.vendor, []);
        vendorMap.get(job.vendor).push(job);
      });
      const vendors = [...vendorMap.entries()]
        .map(([name, list]) => ({
          name,
          apple: name === "Apple",
          jobs: list.sort(compareJobs),
          error: list.filter((job) => job.status === "error").length,
          warning: list.filter((job) => job.status === "warning").length,
        }))
        .sort((a, b) => {
          if (a.apple !== b.apple) return a.apple ? 1 : -1;
          return a.name.localeCompare(b.name, "en");
        });
      return Object.assign({}, lane, {
        jobs: laneJobs.sort(compareJobs),
        vendors,
        error: laneJobs.filter((job) => job.status === "error").length,
        warning: laneJobs.filter((job) => job.status === "warning").length,
      });
    });

    const schedule = jobs
      .filter((job) => job.triggers.start_interval !== null || job.triggers.start_calendar.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label, "en"))
      .map((job) => ({ job, events: scheduleEvents(job) }));

    return {
      meta: snapshot.meta,
      baselineMeta: baseline ? baseline.meta : null,
      jobs,
      byKey: new Map(jobs.map((job) => [job.key, job])),
      lanes,
      byStatus,
      unsigned,
      runAtLoad,
      thirdParty,
      newCount: jobs.filter((job) => job.diff === "new").length,
      changedCount: jobs.filter((job) => job.diff === "changed").length,
      removed,
      removedCount: removed.length,
      schedule,
      alerts: jobs
        .filter((job) => job.status === "error" || job.status === "warning")
        .sort((a, b) => severity(a.status) - severity(b.status) || b.score - a.score || a.label.localeCompare(b.label, "en")),
    };
  }

  function searchText(job) {
    return normalize(
      [
        job.label,
        job.program,
        job.domain,
        job.lane,
        job.vendor,
        job.team_id,
        job.plist,
        (job.args || []).join(" "),
        job.reasons ? job.reasons.join(" ") : "",
      ].join(" ")
    );
  }

  function filterModel(model, filters) {
    const options = Object.assign({}, DEFAULT_FILTERS, filters || {});
    const query = normalize(options.query);
    const matches = new Set();

    model.jobs.forEach((job) => {
      if (options.status !== "all" && job.status !== options.status) return;
      if (options.lane !== "all" && job.lane !== options.lane) return;
      if (options.unsignedOnly && job.signed !== false) return;
      if (options.diffOnly && !job.diff) return;
      if (options.trigger === "boot" && !job.triggers.run_at_load) return;
      if (options.trigger === "keepalive" && !job.triggers.keep_alive) return;
      if (options.trigger === "calendar" && job.triggers.start_calendar.length === 0) return;
      if (options.trigger === "interval" && job.triggers.start_interval === null) return;
      if (options.trigger === "watch" && job.triggers.watch_paths.length === 0) return;
      if (query && !searchText(job).includes(query)) return;
      matches.add(job.key);
    });

    const removed = options.diffOnly
      ? model.removed.filter((job) => {
          if (query && !searchText(job).includes(query)) return false;
          return true;
        })
      : [];

    return { matches, removed };
  }

  function calendarEntries(value) {
    const list = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
    return list
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        hour: Number.isInteger(entry.hour) ? entry.hour : 0,
        minute: Number.isInteger(entry.minute) ? entry.minute : 0,
        weekday: Number.isInteger(entry.weekday) ? entry.weekday : null,
        day: Number.isInteger(entry.day) ? entry.day : null,
        month: Number.isInteger(entry.month) ? entry.month : null,
      }))
      .filter((entry) => entry.hour >= 0 && entry.hour < 24 && entry.minute >= 0 && entry.minute < 60);
  }

  function scheduleEvents(job) {
    const triggers = normalizeTriggers(job.triggers);
    const events = [];
    calendarEntries(triggers.start_calendar).forEach((entry) => {
      events.push({
        kind: "calendar",
        minute: entry.hour * 60 + entry.minute,
        weekday: entry.weekday,
      });
    });
    if (triggers.start_interval !== null) {
      const step = Math.max(1, Math.floor(triggers.start_interval / 60));
      for (let minute = 0; minute < 1440 && events.length < 96; minute += step) {
        events.push({ kind: "interval", minute, weekday: null });
      }
    }
    return events.sort((a, b) => a.minute - b.minute);
  }

  function formatInterval(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) return "—";
    if (value < 60) return `${Math.round(value)}s`;
    if (value < 3600) return `${Math.round(value / 60)}m`;
    if (value < 86400) {
      const hours = value / 3600;
      return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
    }
    return `${Math.round(value / 86400)}d`;
  }

  function formatClock(minute) {
    const value = Math.max(0, Math.min(1439, Math.round(minute)));
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  }

  function toggleLabels(job) {
    const triggers = normalizeTriggers(job.triggers);
    const labels = [];
    if (triggers.run_at_load) labels.push({ kind: "boot", label: "起動時" });
    if (triggers.keep_alive) labels.push({ kind: "keepalive", label: "常駐" });
    if (triggers.start_interval !== null) {
      labels.push({ kind: "interval", label: formatInterval(triggers.start_interval) });
    }
    if (triggers.start_calendar.length > 0) labels.push({ kind: "calendar", label: "カレンダー" });
    if (triggers.watch_paths.length > 0) labels.push({ kind: "watch", label: "監視" });
    if (triggers.sockets > 0) labels.push({ kind: "socket", label: `Socket ${triggers.sockets}` });
    if (labels.length === 0) labels.push({ kind: "manual", label: "手動 / オンデマンド" });
    return labels;
  }

  function describeTrigger(job) {
    const triggers = normalizeTriggers(job.triggers);
    if (triggers.start_calendar.length > 0) {
      return calendarEntries(triggers.start_calendar)
        .map((entry) => formatClock(entry.hour * 60 + entry.minute))
        .join(", ");
    }
    if (triggers.start_interval !== null) return `every ${formatInterval(triggers.start_interval)}`;
    if (triggers.run_at_load && triggers.keep_alive) return "RunAtLoad + KeepAlive";
    if (triggers.run_at_load) return "RunAtLoad";
    if (triggers.keep_alive) return "KeepAlive";
    if (triggers.watch_paths.length > 0) return `${triggers.watch_paths.length} watch paths`;
    if (triggers.sockets > 0) return `${triggers.sockets} sockets`;
    return "on demand";
  }

  function parseQuery(search) {
    let params;
    try {
      params = new URLSearchParams(search || "");
    } catch (error) {
      params = new URLSearchParams("");
    }
    const status = params.get("status");
    const lane = params.get("lane");
    const trigger = params.get("trigger");
    const data = params.get("data");
    const baseline = params.get("baseline");
    return {
      job: params.get("job") || null,
      status: STATUSES.includes(status) ? status : "all",
      query: params.get("q") || "",
      unsignedOnly: params.get("unsigned") === "1",
      diffOnly: params.get("diff") === "1",
      showApple: params.get("apple") === "1",
      lane: LANE_IDS.includes(lane) ? lane : "all",
      trigger: ["boot", "keepalive", "calendar", "interval", "watch"].includes(trigger)
        ? trigger
        : "all",
      live: params.get("live") !== "0",
      data: data && DATA_FILE.test(data) ? data : "jobs_snapshot.json",
      baseline: baseline && DATA_FILE.test(baseline) ? baseline : "jobs_baseline.json",
    };
  }

  function buildQuery(state) {
    const params = new URLSearchParams();
    if (state.job) params.set("job", state.job);
    if (state.status && state.status !== "all") params.set("status", state.status);
    if (state.query) params.set("q", state.query);
    if (state.unsignedOnly) params.set("unsigned", "1");
    if (state.diffOnly) params.set("diff", "1");
    if (state.showApple) params.set("apple", "1");
    if (state.lane && state.lane !== "all") params.set("lane", state.lane);
    if (state.trigger && state.trigger !== "all") params.set("trigger", state.trigger);
    if (state.live === false) params.set("live", "0");
    if (state.data && state.data !== "jobs_snapshot.json") params.set("data", state.data);
    if (state.baseline && state.baseline !== "jobs_baseline.json") params.set("baseline", state.baseline);
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  return {
    STATUSES,
    STATUS_LABEL,
    LANES,
    LANE_IDS,
    DEFAULT_FILTERS,
    DATA_FILE,
    normalize,
    isAppleJob,
    isSuspiciousPath,
    isUserWritablePath,
    keyOf,
    vendorOf,
    normalizeTriggers,
    validateSnapshot,
    classifyJob,
    isChanged,
    buildModel,
    filterModel,
    calendarEntries,
    scheduleEvents,
    formatInterval,
    formatClock,
    toggleLabels,
    describeTrigger,
    parseQuery,
    buildQuery,
  };
});
