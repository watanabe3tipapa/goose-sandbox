/*
 * Process Sentinel model
 *
 * Dependency-free helpers shared by the viewer and the Node tests:
 *   - snapshot validation
 *   - status classification (healthy / warning / error / external)
 *   - baseline diff (new / changed / removed)
 *   - filtering with ancestor context
 *   - left-to-right process tree layout
 *   - URL query <-> state conversion
 *
 * Loaded with a plain <script> tag and required from node:test.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SentinelModel = api;
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

  const SYSTEM_PREFIXES = [
    "/System/",
    "/usr/libexec/",
    "/usr/sbin/",
    "/sbin/",
    "/Library/Apple/",
    "/usr/lib/dyld",
    "/usr/lib/system/",
  ];

  const SYSTEM_NAMES = new Set([
    "launchd",
    "kernel_task",
    "syslogd",
    "opendirectoryd",
    "loginwindow",
  ]);

  const DEFAULT_FILTERS = Object.freeze({
    status: "all",
    query: "",
    unsignedOnly: false,
    diffOnly: false,
  });

  const DATA_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

  const LAYOUT = Object.freeze({
    nodeWidth: 204,
    nodeHeight: 62,
    columnGap: 74,
    rowGap: 14,
    padding: 26,
  });

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

  function isSystemProcess(process) {
    if (!process || typeof process.path !== "string") return false;
    if (SYSTEM_NAMES.has(process.name)) return true;
    return SYSTEM_PREFIXES.some((prefix) => process.path.startsWith(prefix));
  }

  function isSuspiciousPath(path) {
    if (typeof path !== "string") return false;
    return (
      path.startsWith("/tmp/") ||
      path.startsWith("/private/tmp/") ||
      path.startsWith("/var/tmp/") ||
      path.startsWith("/Users/Shared/")
    );
  }

  function keyOf(process) {
    if (!process) return "";
    return process.path || process.name || `pid:${process.pid}`;
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
    if (!Array.isArray(snapshot.processes) || snapshot.processes.length === 0) {
      push("error", "processes", "processes が空か配列ではありません");
      return { ok: false, issues };
    }
    if (snapshot.processes.length > 5000) {
      push("warning", "processes", "プロセス数が 5,000 を超えています");
    }

    const pids = new Set();
    snapshot.processes.forEach((process, index) => {
      const path = `processes[${index}]`;
      if (!process || typeof process !== "object") {
        push("error", path, "プロセスがオブジェクトではありません");
        return;
      }
      if (!Number.isInteger(process.pid) || process.pid < 0) {
        push("error", `${path}.pid`, "pid は 0 以上の整数である必要があります");
      } else if (pids.has(process.pid)) {
        push("error", `${path}.pid`, `pid が重複しています: ${process.pid}`);
      } else {
        pids.add(process.pid);
      }
      if (!Number.isInteger(process.ppid) || process.ppid < 0) {
        push("error", `${path}.ppid`, "ppid は 0 以上の整数である必要があります");
      }
      ["name", "path", "user", "state", "command"].forEach((field) => {
        if (typeof process[field] !== "string" || process[field].trim() === "") {
          push("error", `${path}.${field}`, `${field} が空です`);
        }
      });
      ["cpu", "memory"].forEach((field) => {
        if (!isFiniteNumber(process[field])) {
          push("error", `${path}.${field}`, `${field} は 0 以上の数値である必要があります`);
        }
      });
      if (!isFiniteNumber(process.rss)) {
        push("error", `${path}.rss`, "rss は 0 以上の数値である必要があります");
      }
      if (!(process.signed === true || process.signed === false || process.signed === null)) {
        push("error", `${path}.signed`, "signed は true / false / null のいずれかです");
      }
      if (typeof process.adhoc !== "boolean") {
        push("error", `${path}.adhoc`, "adhoc は boolean である必要があります");
      }
      if (process.network !== undefined && !Array.isArray(process.network)) {
        push("error", `${path}.network`, "network は配列である必要があります");
      }
      if (process.history !== undefined) {
        if (!Array.isArray(process.history)) {
          push("error", `${path}.history`, "history は配列である必要があります");
        } else {
          process.history.forEach((point, pointIndex) => {
            if (!point || !isFiniteNumber(point.cpu) || !isFiniteNumber(point.memory)) {
              push("error", `${path}.history[${pointIndex}]`, "history の cpu / memory が不正です");
            }
          });
        }
      }
    });

    return { ok: issues.every((issue) => issue.level !== "error"), issues };
  }

  function classifyProcess(process, diff) {
    const reasons = [];
    let score = 0;
    const system = isSystemProcess(process);
    const networkCount = Array.isArray(process.network) ? process.network.length : 0;

    if (process.signed === false) {
      score += 50;
      reasons.push("未署名の実行ファイル");
    } else if (process.adhoc) {
      score += 20;
      reasons.push("アドホック署名");
    } else if (process.signed === null) {
      score += 10;
      reasons.push("署名を確認できません");
    }

    if (isSuspiciousPath(process.path)) {
      score += 30;
      reasons.push("一時領域または共有領域から実行");
    }
    if (diff === "new") {
      score += 15;
      reasons.push("前回スナップショット以降に新規出現");
    }
    if (networkCount > 0) {
      score += 10;
      reasons.push(`ネットワーク接続 ${networkCount} 件`);
    }
    if (process.cpu >= 80) {
      score += 20;
      reasons.push(`CPU 使用率が高い (${process.cpu.toFixed(1)}%)`);
    } else if (process.cpu >= 40) {
      score += 12;
      reasons.push(`CPU 使用率が上昇 (${process.cpu.toFixed(1)}%)`);
    }
    if (process.memory >= 15) {
      score += 15;
      reasons.push(`メモリ使用率が高い (${process.memory.toFixed(1)}%)`);
    }

    let status;
    if (process.signed === false || isSuspiciousPath(process.path)) status = "error";
    else if (
      process.adhoc ||
      process.cpu >= 40 ||
      process.memory >= 15 ||
      diff === "new" ||
      (!system && process.signed === null)
    ) status = "warning";
    else if (system) status = "external";
    else status = "healthy";

    if (status === "external") score = 0;
    return { status, score: Math.min(100, score), reasons };
  }

  function sameSignature(a, b) {
    return a.signed === b.signed && a.adhoc === b.adhoc && (a.teamId || "") === (b.teamId || "");
  }

  function isChanged(current, base, currentStatus, baseStatus) {
    if (currentStatus !== baseStatus) return true;
    if (Math.abs(current.cpu - base.cpu) >= 10) return true;
    if (Math.abs(current.memory - base.memory) >= 3) return true;
    if (!sameSignature(current, base)) return true;
    if (keyOf(current) !== keyOf(base)) return true;
    return false;
  }

  function buildModel(snapshot, baseline) {
    const baseProcesses = baseline && Array.isArray(baseline.processes) ? baseline.processes : [];
    const baseByKey = new Map();
    baseProcesses.forEach((process) => {
      baseByKey.set(keyOf(process), process);
    });
    const currentKeys = new Set();

    const processes = snapshot.processes.map((raw) => {
      const process = Object.assign({}, raw);
      process.key = keyOf(process);
      currentKeys.add(process.key);
      const base = baseByKey.get(process.key);
      let diff = null;
      if (baseProcesses.length > 0) {
        if (!base) diff = "new";
        else {
          const baseStatus = classifyProcess(base, null).status;
          const currentStatus = classifyProcess(process, base ? "changed" : null).status;
          if (isChanged(process, base, currentStatus, baseStatus)) diff = "changed";
        }
      }
      const classification = classifyProcess(process, diff);
      process.diff = diff;
      process.status = classification.status;
      process.score = classification.score;
      process.reasons = classification.reasons;
      return process;
    });

    const byPid = new Map(processes.map((process) => [process.pid, process]));
    const children = new Map();
    processes.forEach((process) => {
      if (!children.has(process.ppid)) children.set(process.ppid, []);
      children.get(process.ppid).push(process);
    });
    const roots = processes.filter(
      (process) => process.ppid === process.pid || !byPid.has(process.ppid)
    );
    roots.sort(compareProcesses);
    children.forEach((list) => list.sort(compareProcesses));

    const removed = baseProcesses
      .filter((process) => !currentKeys.has(keyOf(process)))
      .map((process) => {
        const classification = classifyProcess(process, null);
        return Object.assign({}, process, {
          key: keyOf(process),
          diff: "removed",
          status: "removed",
          score: classification.score,
          reasons: classification.reasons,
        });
      });

    const byStatus = Object.create(null);
    STATUSES.forEach((status) => { byStatus[status] = 0; });
    let unsigned = 0;
    processes.forEach((process) => {
      byStatus[process.status] += 1;
      if (process.signed === false) unsigned += 1;
    });

    const model = {
      meta: snapshot.meta,
      baselineMeta: baseline ? baseline.meta : null,
      processes,
      byPid,
      children,
      roots,
      removed,
      byStatus,
      unsigned,
      newCount: processes.filter((process) => process.diff === "new").length,
      changedCount: processes.filter((process) => process.diff === "changed").length,
      removedCount: removed.length,
      alerts: processes
        .filter((process) => process.status === "error" || process.status === "warning")
        .sort((a, b) => {
          const order = { error: 0, warning: 1 };
          return order[a.status] - order[b.status] || b.score - a.score || a.pid - b.pid;
        }),
    };
    return model;
  }

  function compareProcesses(a, b) {
    return a.name.localeCompare(b.name, "en") || a.pid - b.pid;
  }

  function searchText(process) {
    return normalize(
      [
        process.name,
        process.path,
        process.user,
        process.command,
        process.teamId,
        process.signature,
        process.reasons ? process.reasons.join(" ") : "",
      ].join(" ")
    );
  }

  function filterModel(model, filters) {
    const options = Object.assign({}, DEFAULT_FILTERS, filters || {});
    const query = normalize(options.query);
    const matches = new Set();
    const visible = new Set();
    const context = new Set();

    model.processes.forEach((process) => {
      if (options.status !== "all" && process.status !== options.status) return;
      if (options.unsignedOnly && process.signed !== false) return;
      if (options.diffOnly && !process.diff) return;
      if (query && !searchText(process).includes(query)) return;
      matches.add(process.pid);
    });

    matches.forEach((pid) => {
      let current = model.byPid.get(pid);
      const seen = new Set();
      while (current && !seen.has(current.pid)) {
        seen.add(current.pid);
        visible.add(current.pid);
        current = model.byPid.get(current.ppid);
      }
    });
    visible.forEach((pid) => {
      if (!matches.has(pid)) context.add(pid);
    });

    const removed = options.diffOnly
      ? model.removed.filter((process) => {
          if (query && !searchText(process).includes(query)) return false;
          return true;
        })
      : [];

    return { matches, visible, context, removed };
  }

  function layoutForest(model, visible) {
    const ids = visible instanceof Set ? visible : new Set(visible || []);
    const nodes = model.processes.filter((process) => ids.has(process.pid));
    const nodeById = new Map(nodes.map((process) => [process.pid, process]));
    const children = new Map();
    const roots = [];

    nodes.forEach((process) => {
      if (process.ppid !== process.pid && nodeById.has(process.ppid)) {
        if (!children.has(process.ppid)) children.set(process.ppid, []);
        children.get(process.ppid).push(process);
      } else {
        roots.push(process);
      }
    });
    roots.sort(compareProcesses);
    children.forEach((list) => list.sort(compareProcesses));

    const rowHeight = LAYOUT.nodeHeight + LAYOUT.rowGap;
    const columnWidth = LAYOUT.nodeWidth + LAYOUT.columnGap;
    const visiting = new Set();
    const measured = new Map();

    function measure(process) {
      if (measured.has(process.pid)) return measured.get(process.pid);
      if (visiting.has(process.pid)) return 1;
      visiting.add(process.pid);
      const kids = children.get(process.pid) || [];
      const height = kids.length === 0 ? 1 : kids.reduce((sum, child) => sum + measure(child), 0);
      visiting.delete(process.pid);
      measured.set(process.pid, height);
      return height;
    }

    const placed = [];
    let cursor = LAYOUT.padding;
    let maxDepth = 0;

    function place(process, depth, top) {
      const height = measure(process);
      const centerY = top + ((height - 1) * rowHeight) / 2;
      const x = LAYOUT.padding + depth * columnWidth;
      placed.push(Object.assign({}, process, {
        x,
        y: centerY,
        depth,
        width: LAYOUT.nodeWidth,
        height: LAYOUT.nodeHeight,
      }));
      maxDepth = Math.max(maxDepth, depth);
      let childTop = top;
      (children.get(process.pid) || []).forEach((child) => {
        place(child, depth + 1, childTop);
        childTop += measure(child) * rowHeight;
      });
    }

    roots.forEach((root) => {
      place(root, 0, cursor);
      cursor += measure(root) * rowHeight;
    });

    const nodeByIdPlaced = new Map(placed.map((node) => [node.pid, node]));
    const edges = [];
    placed.forEach((node) => {
      if (node.ppid !== node.pid && nodeByIdPlaced.has(node.ppid)) {
        const parent = nodeByIdPlaced.get(node.ppid);
        edges.push({
          from: parent.pid,
          to: node.pid,
          x1: parent.x + parent.width,
          y1: parent.y,
          x2: node.x,
          y2: node.y,
        });
      }
    });

    return {
      nodes: placed,
      edges,
      width: LAYOUT.padding * 2 + maxDepth * columnWidth + LAYOUT.nodeWidth,
      height: Math.max(cursor + LAYOUT.padding - LAYOUT.rowGap, LAYOUT.padding * 2 + LAYOUT.nodeHeight),
      nodeWidth: LAYOUT.nodeWidth,
      nodeHeight: LAYOUT.nodeHeight,
    };
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    try {
      return new Intl.NumberFormat("ja-JP").format(number);
    } catch (error) {
      return String(number);
    }
  }

  function formatBytes(kilobytes) {
    const number = Number(kilobytes);
    if (!Number.isFinite(number) || number < 0) return "—";
    if (number < 1024) return `${number} KB`;
    const megabytes = number / 1024;
    if (megabytes < 1024) return `${megabytes.toFixed(1)} MB`;
    return `${(megabytes / 1024).toFixed(2)} GB`;
  }

  function parseQuery(search) {
    let params;
    try {
      params = new URLSearchParams(search || "");
    } catch (error) {
      params = new URLSearchParams("");
    }
    const pidValue = params.get("pid");
    const pid = pidValue !== null && /^\d+$/.test(pidValue) ? Number(pidValue) : null;
    const status = params.get("status");
    const data = params.get("data");
    const baseline = params.get("baseline");
    return {
      pid,
      status: STATUSES.includes(status) ? status : "all",
      query: params.get("q") || "",
      unsignedOnly: params.get("unsigned") === "1",
      diffOnly: params.get("diff") === "1",
      live: params.get("live") !== "0",
      data: data && DATA_FILE.test(data) ? data : "process_snapshot.json",
      baseline: baseline && DATA_FILE.test(baseline) ? baseline : "process_baseline.json",
    };
  }

  function buildQuery(state) {
    const params = new URLSearchParams();
    if (state.pid !== null && state.pid !== undefined) params.set("pid", String(state.pid));
    if (state.status && state.status !== "all") params.set("status", state.status);
    if (state.query) params.set("q", state.query);
    if (state.unsignedOnly) params.set("unsigned", "1");
    if (state.diffOnly) params.set("diff", "1");
    if (state.live === false) params.set("live", "0");
    if (state.data && state.data !== "process_snapshot.json") params.set("data", state.data);
    if (state.baseline && state.baseline !== "process_baseline.json") params.set("baseline", state.baseline);
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  return {
    STATUSES,
    STATUS_LABEL,
    DEFAULT_FILTERS,
    DATA_FILE,
    LAYOUT,
    normalize,
    isSystemProcess,
    isSuspiciousPath,
    keyOf,
    validateSnapshot,
    classifyProcess,
    buildModel,
    filterModel,
    layoutForest,
    formatNumber,
    formatBytes,
    parseQuery,
    buildQuery,
  };
});
