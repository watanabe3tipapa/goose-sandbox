/*
 * Node tests for the Bootprint model.
 * Run with: node --test Bootprint/viewer/lib/model.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("./model.js");

function job(overrides) {
  return Object.assign(
    {
      label: "com.example.helper",
      domain: "gui/502",
      lane: "gui",
      scope: "agent",
      plist: "~/Library/LaunchAgents/com.example.helper.plist",
      program: "/Applications/Helper.app/Contents/MacOS/Helper",
      args: ["--daemon"],
      program_exists: true,
      triggers: {
        run_at_load: false,
        keep_alive: false,
        start_interval: null,
        start_calendar: [],
        watch_paths: [],
        sockets: 0,
      },
      disabled: false,
      loaded: true,
      pid: 4242,
      last_exit_status: 0,
      signed: true,
      adhoc: false,
      team_id: "TEAM123456",
    },
    overrides
  );
}

function snapshot(jobs) {
  return {
    meta: { generated_at: "2026-11-09T09:00:00+09:00", host: "test-mbp", os: "macOS 15.7", uid: 502 },
    jobs,
  };
}

test("normalize lowercases, trims and collapses whitespace", () => {
  assert.equal(model.normalize("  Google\n\tKeystone  "), "google keystone");
  assert.equal(model.normalize(null), "");
});

test("keyOf uses domain:label instead of pid", () => {
  assert.equal(model.keyOf(job()), "gui/502:com.example.helper");
  assert.equal(model.keyOf(job({ pid: 9999 })), "gui/502:com.example.helper");
  assert.equal(model.keyOf(null), "");
});

test("isAppleJob detects Apple labels and system paths", () => {
  assert.equal(model.isAppleJob(job({ label: "com.apple.WindowServer" })), true);
  assert.equal(model.isAppleJob(job({ program: "/usr/libexec/opendirectoryd" })), true);
  assert.equal(model.isAppleJob(job({ program: "/Library/Apple/System/Library/CoreServices/x" })), true);
  assert.equal(model.isAppleJob(job({ program: "/Applications/Helper.app/Contents/MacOS/Helper" })), false);
});

test("isSuspiciousPath flags temp and shared locations", () => {
  assert.equal(model.isSuspiciousPath("/tmp/agent"), true);
  assert.equal(model.isSuspiciousPath("/private/tmp/agent"), true);
  assert.equal(model.isSuspiciousPath("/Users/Shared/tool"), true);
  assert.equal(model.isSuspiciousPath("/Applications/Tool.app"), false);
});

test("isUserWritablePath flags home and shared locations", () => {
  assert.equal(model.isUserWritablePath("~/Library/Application Support/Helper/helper"), true);
  assert.equal(model.isUserWritablePath("/Users/tester/bin/helper"), true);
  assert.equal(model.isUserWritablePath("/Applications/Tool.app"), false);
});

test("vendorOf groups known and unknown labels", () => {
  assert.equal(model.vendorOf(job({ label: "com.google.keystone.agent" })), "Google");
  assert.equal(model.vendorOf(job({ label: "homebrew.mxcl.ollama" })), "Homebrew");
  assert.equal(model.vendorOf(job({ label: "org.mozilla.firefox.updater" })), "Mozilla");
  assert.equal(model.vendorOf(job({ label: "com.example.helper" })), "Example");
});

test("normalizeTriggers accepts partial input and rejects bad intervals", () => {
  const triggers = model.normalizeTriggers({ run_at_load: true, start_interval: -5 });
  assert.equal(triggers.run_at_load, true);
  assert.equal(triggers.keep_alive, false);
  assert.equal(triggers.start_interval, null);
  assert.deepEqual(triggers.start_calendar, []);
});

test("validateSnapshot accepts a well-formed snapshot", () => {
  const result = model.validateSnapshot(snapshot([job()]));
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("validateSnapshot rejects empty and malformed input", () => {
  assert.equal(model.validateSnapshot(null).ok, false);
  assert.equal(model.validateSnapshot({ meta: {} }).ok, false);
  const duplicate = model.validateSnapshot(snapshot([job(), job({ pid: 4243 })]));
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.issues.some((issue) => /重複/.test(issue.message)));
});

test("validateSnapshot requires lane, domain, scope and trigger booleans", () => {
  const result = model.validateSnapshot(
    snapshot([
      job({
        lane: "login",
        domain: "login/502",
        scope: "service",
        triggers: { run_at_load: "yes", keep_alive: 1, start_interval: 0 },
      }),
    ])
  );
  assert.equal(result.ok, false);
  const paths = result.issues.map((issue) => issue.path);
  assert.ok(paths.includes("jobs[0].lane"));
  assert.ok(paths.includes("jobs[0].domain"));
  assert.ok(paths.includes("jobs[0].scope"));
  assert.ok(paths.includes("jobs[0].triggers.run_at_load"));
  assert.ok(paths.includes("jobs[0].triggers.keep_alive"));
  assert.ok(paths.includes("jobs[0].triggers.start_interval"));
});

test("validateSnapshot accepts signed:null and null runtime fields", () => {
  const result = model.validateSnapshot(
    snapshot([job({ signed: null, pid: null, last_exit_status: null })])
  );
  assert.equal(result.ok, true);
});

test("classifyJob marks missing executables as error", () => {
  const result = model.classifyJob(job({ program_exists: false }), null);
  assert.equal(result.status, "error");
  assert.ok(result.score >= 50);
  assert.match(result.reasons.join(" "), /存在しない/);
});

test("classifyJob marks unsigned binaries in writable paths as error", () => {
  const result = model.classifyJob(
    job({ signed: false, program: "~/Library/Application Support/Helper/helper" }),
    null
  );
  assert.equal(result.status, "error");
  assert.match(result.reasons.join(" "), /未署名/);
  assert.match(result.reasons.join(" "), /書き込み可能/);
});

test("classifyJob marks suspicious paths as error even when signed", () => {
  const result = model.classifyJob(job({ program: "/Users/Shared/helper", signed: true }), null);
  assert.equal(result.status, "error");
  assert.match(result.reasons.join(" "), /共有領域/);
});

test("classifyJob warns on unsigned third-party binaries outside writable paths", () => {
  const result = model.classifyJob(job({ signed: false }), null);
  assert.equal(result.status, "warning");
  assert.ok(result.score >= 40);
});

test("classifyJob warns on adhoc signatures", () => {
  const result = model.classifyJob(job({ adhoc: true, team_id: null }), null);
  assert.equal(result.status, "warning");
  assert.match(result.reasons.join(" "), /アドホック/);
});

test("classifyJob warns on high-frequency intervals", () => {
  const result = model.classifyJob(
    job({ triggers: { run_at_load: false, keep_alive: false, start_interval: 30 } }),
    null
  );
  assert.equal(result.status, "warning");
  assert.match(result.reasons.join(" "), /高頻度/);
});

test("classifyJob warns on new and changed jobs", () => {
  assert.equal(model.classifyJob(job(), "new").status, "warning");
  assert.equal(model.classifyJob(job(), "changed").status, "warning");
  assert.match(model.classifyJob(job(), "new").reasons.join(" "), /新規/);
});

test("classifyJob keeps signed third-party jobs healthy", () => {
  const result = model.classifyJob(job(), null);
  assert.equal(result.status, "healthy");
  assert.equal(result.score, 0);
});

test("classifyJob does not warn only because a signed app lives in the home directory", () => {
  const result = model.classifyJob(
    job({ program: "~/Applications/Docker.app/Contents/MacOS/com.docker.helper" }),
    null
  );
  assert.equal(result.status, "healthy");
  assert.equal(result.score, 0);
});

test("classifyJob keeps Apple jobs external with score 0", () => {
  const result = model.classifyJob(
    job({ label: "com.apple.WindowServer", program: "/System/Library/CoreServices/WindowServer", signed: null }),
    "new"
  );
  assert.equal(result.status, "external");
  assert.equal(result.score, 0);
});

test("isChanged ignores runtime churn but detects trigger changes", () => {
  const base = job();
  assert.equal(model.isChanged(job({ pid: 9000, loaded: false, last_exit_status: 1 }), base), false);
  const changed = job({
    triggers: { run_at_load: true, keep_alive: false, start_interval: 300 },
  });
  assert.equal(model.isChanged(changed, base), true);
  assert.equal(model.isChanged(job({ program: "/Applications/Other.app" }), base), true);
  assert.equal(model.isChanged(job({ signed: false }), base), true);
});

test("buildModel assigns status counts, lanes and alerts", () => {
  const built = model.buildModel(
    snapshot([
      job({ label: "com.apple.WindowServer", program: "/System/Library/CoreServices/WindowServer", lane: "system", domain: "system", scope: "daemon" }),
      job({ label: "com.example.bad", program: "/tmp/bad", signed: false, lane: "gui" }),
      job({ label: "com.example.busy", triggers: { start_interval: 30 } }),
      job({ label: "com.example.fine" }),
    ]),
    null
  );
  assert.equal(built.jobs.length, 4);
  assert.equal(built.byStatus.error, 1);
  assert.equal(built.byStatus.warning, 1);
  assert.equal(built.byStatus.external, 1);
  assert.equal(built.byStatus.healthy, 1);
  assert.equal(built.unsigned, 1);
  assert.equal(built.alerts.length, 2);
  assert.equal(built.alerts[0].label, "com.example.bad");
  assert.equal(built.lanes.find((lane) => lane.id === "gui").jobs.length, 3);
  assert.equal(built.lanes.find((lane) => lane.id === "system").jobs.length, 1);
});

test("buildModel detects new, changed and removed jobs by domain:label", () => {
  const base = snapshot([
    job({ label: "com.example.stable" }),
    job({ label: "com.example.shift", triggers: { start_interval: 300 } }),
    job({ label: "com.example.gone" }),
  ]);
  const current = snapshot([
    job({ label: "com.example.stable", pid: 5555 }),
    job({ label: "com.example.shift", triggers: { start_interval: 60 } }),
    job({ label: "com.example.fresh" }),
  ]);
  const built = model.buildModel(current, base);
  const diffs = new Map(built.jobs.map((item) => [item.label, item.diff]));
  assert.equal(diffs.get("com.example.stable"), null);
  assert.equal(diffs.get("com.example.shift"), "changed");
  assert.equal(diffs.get("com.example.fresh"), "new");
  assert.equal(built.newCount, 1);
  assert.equal(built.changedCount, 1);
  assert.equal(built.removedCount, 1);
  assert.equal(built.removed[0].label, "com.example.gone");
  assert.equal(built.removed[0].status, "removed");
});

test("buildModel sorts Apple vendors last and counts third-party jobs", () => {
  const built = model.buildModel(
    snapshot([
      job({ label: "com.apple.WindowServer", program: "/System/Library/CoreServices/WindowServer", lane: "system", domain: "system", scope: "daemon" }),
      job({ label: "com.google.keystone.agent", lane: "gui" }),
      job({ label: "com.example.helper", lane: "gui" }),
    ]),
    null
  );
  const gui = built.lanes.find((lane) => lane.id === "gui");
  assert.deepEqual(gui.vendors.map((vendor) => vendor.name), ["Example", "Google"]);
  assert.equal(built.thirdParty, 2);
});

test("filterModel applies status, lane and query", () => {
  const built = model.buildModel(
    snapshot([
      job({ label: "com.apple.WindowServer", program: "/System/Library/CoreServices/WindowServer", lane: "system", domain: "system", scope: "daemon" }),
      job({ label: "com.example.bad", program: "/tmp/bad", signed: false }),
      job({ label: "com.example.fine" }),
    ]),
    null
  );
  const visible = model.filterModel(built, { status: "error" });
  assert.deepEqual([...visible.matches], ["gui/502:com.example.bad"]);
  const all = model.filterModel(built, {});
  assert.equal(all.matches.size, 3);
  const query = model.filterModel(built, { query: "fine" });
  assert.deepEqual([...query.matches], ["gui/502:com.example.fine"]);
  const lane = model.filterModel(built, { lane: "gui" });
  assert.equal(lane.matches.size, 2);
});

test("filterModel supports trigger and diff-only filters", () => {
  const base = snapshot([job({ label: "com.example.legacy" })]);
  const built = model.buildModel(
    snapshot([
      job({ label: "com.example.boot", triggers: { run_at_load: true } }),
      job({ label: "com.example.watch", triggers: { watch_paths: ["/tmp/inbox"] } }),
      job({ label: "com.example.fresh" }),
    ]),
    base
  );
  assert.equal(model.filterModel(built, { trigger: "boot" }).matches.size, 1);
  assert.equal(model.filterModel(built, { trigger: "watch" }).matches.size, 1);
  const diff = model.filterModel(built, { diffOnly: true });
  assert.equal(diff.matches.size, 3);
  assert.equal(diff.removed.length, 1);
});

test("calendarEntries normalizes dictionaries and arrays", () => {
  assert.deepEqual(model.calendarEntries({ hour: 9, minute: 30 }), [
    { hour: 9, minute: 30, weekday: null, day: null, month: null },
  ]);
  assert.equal(model.calendarEntries([{ hour: 8 }, { hour: 99 }]).length, 1);
  assert.equal(model.calendarEntries(null).length, 0);
});

test("scheduleEvents expands calendar and interval triggers", () => {
  const events = model.scheduleEvents(
    job({
      triggers: {
        start_calendar: [{ hour: 9, minute: 15 }, { hour: 18, minute: 0, weekday: 1 }],
        start_interval: 3600,
      },
    })
  );
  assert.ok(events.some((event) => event.kind === "calendar" && event.minute === 555));
  assert.ok(events.some((event) => event.kind === "calendar" && event.minute === 1080));
  assert.ok(events.some((event) => event.kind === "interval" && event.minute === 60));
  assert.ok(events.length <= 96);
});

test("schedule helpers format intervals and clocks", () => {
  assert.equal(model.formatInterval(30), "30s");
  assert.equal(model.formatInterval(300), "5m");
  assert.equal(model.formatInterval(7200), "2h");
  assert.equal(model.formatClock(0), "00:00");
  assert.equal(model.formatClock(555), "09:15");
});

test("toggleLabels and describeTrigger summarize triggers", () => {
  const boot = job({ triggers: { run_at_load: true, keep_alive: true } });
  assert.deepEqual(model.toggleLabels(boot).map((item) => item.kind), ["boot", "keepalive"]);
  assert.equal(model.describeTrigger(boot), "RunAtLoad + KeepAlive");
  const interval = job({ triggers: { start_interval: 300 } });
  assert.equal(model.describeTrigger(interval), "every 5m");
  const manual = job();
  assert.equal(model.toggleLabels(manual)[0].kind, "manual");
  assert.equal(model.describeTrigger(manual), "on demand");
});

test("parseQuery and buildQuery round-trip viewer state", () => {
  const state = {
    job: "gui/502:com.example.helper",
    status: "error",
    query: "helper",
    unsignedOnly: true,
    diffOnly: true,
    showApple: true,
    lane: "gui",
    trigger: "boot",
    live: false,
    data: "custom.json",
    baseline: "base.json",
  };
  const parsed = model.parseQuery(model.buildQuery(state));
  assert.equal(parsed.job, state.job);
  assert.equal(parsed.status, "error");
  assert.equal(parsed.query, "helper");
  assert.equal(parsed.unsignedOnly, true);
  assert.equal(parsed.diffOnly, true);
  assert.equal(parsed.showApple, true);
  assert.equal(parsed.lane, "gui");
  assert.equal(parsed.trigger, "boot");
  assert.equal(parsed.live, false);
  assert.equal(parsed.data, "custom.json");
  assert.equal(parsed.baseline, "base.json");
});

test("parseQuery rejects unsafe data file names", () => {
  const parsed = model.parseQuery("?data=../secret.json&baseline=https://evil/x.json&status=nope&lane=nope");
  assert.equal(parsed.data, "jobs_snapshot.json");
  assert.equal(parsed.baseline, "jobs_baseline.json");
  assert.equal(parsed.status, "all");
  assert.equal(parsed.lane, "all");
});

test("shipped demo snapshot keeps the documented shape", () => {
  const snapshot = require("../data/jobs_snapshot.json");
  const baseline = require("../data/jobs_baseline.json");
  assert.equal(model.validateSnapshot(snapshot).ok, true);
  assert.equal(model.validateSnapshot(baseline).ok, true);

  const built = model.buildModel(snapshot, baseline);
  assert.equal(built.jobs.length, 40);
  assert.deepEqual(
    { error: built.byStatus.error, warning: built.byStatus.warning, healthy: built.byStatus.healthy, external: built.byStatus.external },
    { error: 3, warning: 6, healthy: 11, external: 20 }
  );
  assert.equal(built.unsigned, 3);
  assert.equal(built.thirdParty, 20);
  assert.equal(built.runAtLoad, 20);
  assert.equal(built.newCount, 2);
  assert.equal(built.changedCount, 3);
  assert.equal(built.removedCount, 1);
  assert.equal(built.schedule.length, 8);
  assert.equal(built.alerts.length, 9);
  assert.equal(built.byKey.get("gui/502:com.example.helper").status, "error");
  assert.equal(built.removed[0].key, "gui/502:com.example.legacy");
});
