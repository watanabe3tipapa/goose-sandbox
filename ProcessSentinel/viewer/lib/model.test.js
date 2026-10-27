/*
 * Node tests for the Process Sentinel model.
 * Run with: node --test ProcessSentinel/viewer/lib/model.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("./model.js");

function proc(overrides) {
  return Object.assign(
    {
      pid: 100,
      ppid: 1,
      name: "sample",
      path: "/Applications/sample",
      user: "tester",
      state: "S",
      command: "/Applications/sample --flag",
      cpu: 0.5,
      memory: 1.2,
      rss: 20480,
      signed: true,
      adhoc: false,
    },
    overrides
  );
}

function snapshot(processes) {
  return {
    meta: { generated_at: "2026-10-27T09:00:00+09:00", host: "test-mbp", os: "macOS 15" },
    processes,
  };
}

test("normalize lowercases, trims and collapses whitespace", () => {
  assert.equal(model.normalize("  Safari\n\tWeb Content  "), "safari web content");
  assert.equal(model.normalize(null), "");
});

test("isSystemProcess detects Apple paths and core names", () => {
  assert.equal(model.isSystemProcess(proc({ path: "/usr/sbin/syslogd" })), true);
  assert.equal(model.isSystemProcess(proc({ path: "/System/Library/CoreServices/Finder.app", name: "Finder" })), true);
  assert.equal(model.isSystemProcess(proc({ name: "launchd", path: "/whatever/launchd" })), true);
  assert.equal(model.isSystemProcess(proc({ path: "/Applications/Safari.app" })), false);
});

test("isSuspiciousPath flags temp and shared locations", () => {
  assert.equal(model.isSuspiciousPath("/private/tmp/.cache/agent"), true);
  assert.equal(model.isSuspiciousPath("/Users/Shared/tool"), true);
  assert.equal(model.isSuspiciousPath("/Applications/Tool.app"), false);
  assert.equal(model.isSuspiciousPath(undefined), false);
});

test("validateSnapshot accepts a well-formed snapshot", () => {
  const result = model.validateSnapshot(snapshot([proc()]));
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("validateSnapshot rejects empty and malformed input", () => {
  assert.equal(model.validateSnapshot(null).ok, false);
  assert.equal(model.validateSnapshot({ meta: {} }).ok, false);
  const dup = model.validateSnapshot(snapshot([proc(), proc({ name: "dup" })]));
  assert.equal(dup.ok, false);
  assert.ok(dup.issues.some((issue) => issue.path === "processes[1].pid"));
});

test("validateSnapshot requires numeric metrics and tri-state signature", () => {
  const result = model.validateSnapshot(
    snapshot([proc({ cpu: -1, signed: "yes", adhoc: "no", network: "tcp" })])
  );
  assert.equal(result.ok, false);
  const paths = result.issues.map((issue) => issue.path);
  assert.ok(paths.includes("processes[0].cpu"));
  assert.ok(paths.includes("processes[0].signed"));
  assert.ok(paths.includes("processes[0].adhoc"));
  assert.ok(paths.includes("processes[0].network"));
});

test("validateSnapshot accepts signed:null and history points", () => {
  const result = model.validateSnapshot(
    snapshot([
      proc({ signed: null, history: [{ t: "09:00", cpu: 1, memory: 2 }], network: [] }),
    ])
  );
  assert.equal(result.ok, true);
});

test("classifyProcess marks unsigned binaries as error", () => {
  const result = model.classifyProcess(proc({ signed: false }), null);
  assert.equal(result.status, "error");
  assert.ok(result.score >= 50);
  assert.match(result.reasons.join(" "), /未署名/);
});

test("classifyProcess marks suspicious paths as error even when signed", () => {
  const result = model.classifyProcess(proc({ path: "/tmp/helper", signed: true }), null);
  assert.equal(result.status, "error");
  assert.match(result.reasons.join(" "), /一時領域/);
});

test("classifyProcess warns on adhoc, high CPU, high memory and new processes", () => {
  assert.equal(model.classifyProcess(proc({ adhoc: true }), null).status, "warning");
  assert.equal(model.classifyProcess(proc({ cpu: 82 }), null).status, "warning");
  assert.equal(model.classifyProcess(proc({ memory: 18 }), null).status, "warning");
  assert.equal(model.classifyProcess(proc({ path: "/usr/bin/curl" }), "new").status, "warning");
});

test("classifyProcess keeps system binaries external and clears their score", () => {
  const result = model.classifyProcess(proc({ path: "/usr/libexec/opendirectoryd", cpu: 0.2 }), null);
  assert.equal(result.status, "external");
  assert.equal(result.score, 0);
});

test("classifyProcess treats unknown signature outside system paths as warning", () => {
  const result = model.classifyProcess(proc({ signed: null, path: "/Applications/Tool.app" }), null);
  assert.equal(result.status, "warning");
  assert.match(result.reasons.join(" "), /署名を確認できません/);
});

test("buildModel assigns keys, status counts and alerts", () => {
  const snap = snapshot([
    proc({ pid: 1, ppid: 0, name: "launchd", path: "/sbin/launchd", signed: true }),
    proc({ pid: 10, ppid: 1, name: "bad", path: "/tmp/bad", signed: false, cpu: 3 }),
    proc({ pid: 11, ppid: 1, name: "busy", path: "/Applications/busy", cpu: 91 }),
    proc({ pid: 12, ppid: 1, name: "fine", path: "/Applications/fine" }),
  ]);
  const built = model.buildModel(snap, null);
  assert.equal(built.processes.length, 4);
  assert.equal(built.byStatus.error, 1);
  assert.equal(built.byStatus.warning, 1);
  assert.equal(built.byStatus.external, 1);
  assert.equal(built.byStatus.healthy, 1);
  assert.equal(built.unsigned, 1);
  assert.equal(built.alerts.length, 2);
  assert.equal(built.alerts[0].name, "bad");
  assert.deepEqual(built.roots.map((process) => process.pid), [1]);
  assert.equal(built.children.get(1).length, 3);
});

test("buildModel detects new, changed and removed processes against a baseline", () => {
  const base = snapshot([
    proc({ pid: 10, ppid: 1, name: "stable", path: "/Applications/stable" }),
    proc({ pid: 11, ppid: 1, name: "shift", path: "/Applications/shift", cpu: 5 }),
    proc({ pid: 12, ppid: 1, name: "gone", path: "/Applications/gone" }),
  ]);
  const current = snapshot([
    proc({ pid: 10, ppid: 1, name: "stable", path: "/Applications/stable" }),
    proc({ pid: 11, ppid: 1, name: "shift", path: "/Applications/shift", cpu: 42 }),
    proc({ pid: 13, ppid: 1, name: "fresh", path: "/Applications/fresh" }),
  ]);
  const built = model.buildModel(current, base);
  const diffs = new Map(built.processes.map((process) => [process.name, process.diff]));
  assert.equal(diffs.get("stable"), null);
  assert.equal(diffs.get("shift"), "changed");
  assert.equal(diffs.get("fresh"), "new");
  assert.equal(built.newCount, 1);
  assert.equal(built.changedCount, 1);
  assert.equal(built.removedCount, 1);
  assert.equal(built.removed[0].name, "gone");
  assert.equal(built.removed[0].status, "removed");
});

test("filterModel keeps ancestors of matches as context", () => {
  const snap = snapshot([
    proc({ pid: 1, ppid: 0, name: "launchd", path: "/sbin/launchd" }),
    proc({ pid: 20, ppid: 1, name: "parent", path: "/Applications/parent" }),
    proc({ pid: 21, ppid: 20, name: "target", path: "/Applications/target", cpu: 90 }),
    proc({ pid: 22, ppid: 1, name: "other", path: "/Applications/other" }),
  ]);
  const built = model.buildModel(snap, null);
  const filtered = model.filterModel(built, { status: "warning", query: "target" });
  assert.deepEqual([...filtered.matches], [21]);
  assert.deepEqual([...filtered.visible].sort((a, b) => a - b), [1, 20, 21]);
  assert.deepEqual([...filtered.context].sort((a, b) => a - b), [1, 20]);
});

test("filterModel supports unsigned and diff-only filters", () => {
  const base = snapshot([
    proc({ pid: 10, ppid: 1, name: "old", path: "/Applications/old" }),
    proc({ pid: 12, ppid: 1, name: "rogue", path: "/tmp/rogue", signed: false }),
  ]);
  const current = snapshot([
    proc({ pid: 10, ppid: 1, name: "old", path: "/Applications/old" }),
    proc({ pid: 11, ppid: 1, name: "new", path: "/Applications/new" }),
    proc({ pid: 12, ppid: 1, name: "rogue", path: "/tmp/rogue", signed: false }),
  ]);
  const built = model.buildModel(current, base);
  const unsigned = model.filterModel(built, { unsignedOnly: true });
  assert.deepEqual([...unsigned.matches], [12]);
  const diffed = model.filterModel(built, { diffOnly: true });
  assert.deepEqual([...diffed.matches].sort((a, b) => a - b), [11]);
  assert.equal(diffed.removed.length, 0);
});

test("layoutForest positions parents left of children and sizes the canvas", () => {
  const snap = snapshot([
    proc({ pid: 1, ppid: 0, name: "root", path: "/sbin/root" }),
    proc({ pid: 2, ppid: 1, name: "a", path: "/Applications/a" }),
    proc({ pid: 3, ppid: 1, name: "b", path: "/Applications/b" }),
    proc({ pid: 4, ppid: 2, name: "c", path: "/Applications/c" }),
  ]);
  const built = model.buildModel(snap, null);
  const layout = model.layoutForest(built, new Set([1, 2, 3, 4]));
  const byPid = new Map(layout.nodes.map((node) => [node.pid, node]));
  assert.equal(layout.nodes.length, 4);
  assert.equal(layout.edges.length, 3);
  assert.ok(byPid.get(1).x < byPid.get(2).x);
  assert.ok(byPid.get(2).x < byPid.get(4).x);
  assert.equal(byPid.get(2).depth, 1);
  assert.equal(layout.width, model.LAYOUT.padding * 2 + 2 * (model.LAYOUT.nodeWidth + model.LAYOUT.columnGap) + model.LAYOUT.nodeWidth);
  assert.ok(layout.height >= model.LAYOUT.padding * 2 + model.LAYOUT.nodeHeight);
});

test("layoutForest ignores edges to invisible parents", () => {
  const snap = snapshot([
    proc({ pid: 1, ppid: 0, name: "root", path: "/sbin/root" }),
    proc({ pid: 2, ppid: 1, name: "child", path: "/Applications/child" }),
  ]);
  const built = model.buildModel(snap, null);
  const layout = model.layoutForest(built, new Set([2]));
  assert.equal(layout.nodes.length, 1);
  assert.equal(layout.edges.length, 0);
  assert.equal(layout.nodes[0].x, model.LAYOUT.padding);
});

test("formatBytes and formatNumber render readable values", () => {
  assert.equal(model.formatBytes(512), "512 KB");
  assert.equal(model.formatBytes(2048), "2.0 MB");
  assert.equal(model.formatBytes(3 * 1024 * 1024), "3.00 GB");
  assert.equal(model.formatBytes(undefined), "—");
  assert.equal(model.formatNumber(1234), "1,234");
  assert.equal(model.formatNumber("nope"), "—");
});

test("parseQuery validates status, pid, flags and data file names", () => {
  const parsed = model.parseQuery(
    "?pid=42&status=error&q=safari&unsigned=1&diff=1&live=0&data=my.json&baseline=prev.json"
  );
  assert.deepEqual(parsed, {
    pid: 42,
    status: "error",
    query: "safari",
    unsignedOnly: true,
    diffOnly: true,
    live: false,
    data: "my.json",
    baseline: "prev.json",
  });

  const fallback = model.parseQuery("?pid=abc&status=broken&data=../evil.json&baseline=/etc/passwd");
  assert.equal(fallback.pid, null);
  assert.equal(fallback.status, "all");
  assert.equal(fallback.data, "process_snapshot.json");
  assert.equal(fallback.baseline, "process_baseline.json");
});

test("buildQuery omits defaults and round-trips non-default state", () => {
  assert.equal(model.buildQuery({ pid: null, status: "all", query: "", live: true }), "");
  const query = model.buildQuery({
    pid: 42,
    status: "warning",
    query: "webkit",
    unsignedOnly: true,
    diffOnly: true,
    live: false,
    data: "local.json",
    baseline: "base.json",
  });
  assert.equal(
    query,
    "?pid=42&status=warning&q=webkit&unsigned=1&diff=1&live=0&data=local.json&baseline=base.json"
  );
  const state = model.parseQuery(query);
  assert.equal(state.pid, 42);
  assert.equal(state.query, "webkit");
  assert.equal(state.live, false);
  assert.equal(state.data, "local.json");
});
