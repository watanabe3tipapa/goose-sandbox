/*
 * Node tests for the Mobile Safety Kit scanner.
 * Run with: node --test MobileSafetyKit/viewer/lib/scanner.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const scanner = require("./scanner.js");

function facts(overrides) {
  return Object.assign(
    {
      collected_at: "2026-10-28T12:00:00+09:00",
      location: { protocol: "https:", hostname: "example.test" },
      secure_context: true,
      user_agent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      ua_platform_version: "",
      screen: { width: 390, height: 844, dpr: 3 },
      languages: ["ja-JP", "ja"],
      cookie_enabled: true,
      referrer_policy: "strict-origin-when-cross-origin",
      do_not_track: null,
      global_privacy_control: false,
      connection: { effectiveType: "4g", saveData: false },
      permissions: { geolocation: "prompt", camera: "prompt", microphone: "prompt", notifications: "prompt" },
      touch: true,
      standalone: false,
    },
    overrides
  );
}

function check(report, id) {
  return report.checks.find((item) => item.id === id);
}

test("detectBrowser distinguishes Edge, Chrome, Safari and Firefox", () => {
  assert.equal(scanner.detectBrowser("Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36").name, "chrome");
  assert.equal(scanner.detectBrowser("Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0").name, "edge");
  assert.equal(scanner.detectBrowser("Mozilla/5.0 Firefox/132.0").name, "firefox");
  const safari = scanner.detectBrowser(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Version/18.1 Mobile/15E148 Safari/604.1"
  );
  assert.equal(safari.name, "safari");
  assert.equal(safari.major, 18);
});

test("detectBrowser recognises iOS Chrome and Firefox builds", () => {
  assert.equal(scanner.detectBrowser("Mozilla/5.0 (iPhone) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1").name, "chrome");
  assert.equal(scanner.detectBrowser("Mozilla/5.0 (iPhone) FxiOS/132.0 Mobile/15E148 Safari/604.1").name, "firefox");
});

test("detectOS reads Client Hints first and flags frozen UA versions", () => {
  const ios = scanner.detectOS("", "iOS", "18.1.0");
  assert.deepEqual(
    { name: ios.name, major: ios.major, uncertain: ios.uncertain },
    { name: "ios", major: 18, uncertain: false }
  );

  const android = scanner.detectOS("Mozilla/5.0 (Linux; Android 14; Pixel 8)", "", "");
  assert.equal(android.name, "android");
  assert.equal(android.major, 14);

  const frozenMac = scanner.detectOS(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15",
    "",
    ""
  );
  assert.equal(frozenMac.name, "macos");
  assert.equal(frozenMac.major, 10);
  assert.equal(frozenMac.uncertain, true);

  const hintedMac = scanner.detectOS("", "macOS", "15.7.0");
  assert.equal(hintedMac.major, 15);
  assert.equal(hintedMac.uncertain, false);

  const windows = scanner.detectOS("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "", "");
  assert.equal(windows.name, "windows");
  assert.equal(windows.uncertain, true);
});

test("OS check grades current, warning and unsupported versions", () => {
  assert.equal(scanner.checkOS(facts()).status, "healthy");
  assert.equal(scanner.checkOS(facts({ os: scanner.detectOS("", "iOS", "17.0") })).status, "warning");
  assert.equal(scanner.checkOS(facts({ os: scanner.detectOS("", "iOS", "14.8") })).status, "error");
});

test("OS check stays unknown when the UA version is frozen", () => {
  const result = scanner.checkOS(
    facts({
      os: scanner.detectOS(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15"
      ),
    })
  );
  assert.equal(result.status, "unknown");
  assert.equal(result.score, null);
});

test("HTTPS check flags plain HTTP as an error", () => {
  assert.equal(scanner.checkHTTPS(facts()).status, "healthy");
  const insecure = scanner.checkHTTPS(facts({ location: { protocol: "http:", hostname: "example.test" } }));
  assert.equal(insecure.status, "error");
  assert.equal(insecure.score, 20);
  assert.equal(scanner.checkHTTPS(facts({ location: { protocol: "file:", hostname: "" } })).status, "unknown");
});

test("connection check reacts to effectiveType and saveData", () => {
  assert.equal(scanner.checkConnection(facts()).status, "healthy");
  assert.equal(scanner.checkConnection(facts({ connection: { effectiveType: "3g" } })).status, "warning");
  assert.equal(scanner.checkConnection(facts({ connection: { effectiveType: "slow-2g" } })).status, "error");
  assert.equal(scanner.checkConnection(facts({ connection: null })).status, "unknown");
});

test("permission check treats granted sensitive permissions as a warning", () => {
  const granted = scanner.checkPermissions(facts({ permissions: { geolocation: "granted", camera: "prompt", microphone: "denied" } }));
  assert.equal(granted.status, "warning");
  assert.equal(granted.score, 40);

  const denied = scanner.checkPermissions(facts({ permissions: { geolocation: "denied", camera: "denied", microphone: "denied" } }));
  assert.equal(denied.status, "healthy");
  assert.equal(denied.score, 100);

  const unsupported = scanner.checkPermissions(facts({ permissions: {} }));
  assert.equal(unsupported.status, "unknown");
});

test("tracking check reports unknown when no signal is set", () => {
  assert.equal(scanner.checkTracking(facts()).status, "unknown");
  assert.equal(scanner.checkTracking(facts({ global_privacy_control: true })).status, "healthy");
  assert.equal(scanner.checkTracking(facts({ do_not_track: "1" })).status, "healthy");
});

test("referrer check grades safe, legacy and unsafe policies", () => {
  assert.equal(scanner.checkReferrer(facts()).status, "healthy");
  assert.equal(scanner.checkReferrer(facts({ referrer_policy: "" })).status, "healthy");
  assert.equal(scanner.checkReferrer(facts({ referrer_policy: "origin-when-cross-origin" })).status, "warning");
  assert.equal(scanner.checkReferrer(facts({ referrer_policy: "unsafe-url" })).status, "error");
});

test("buildReport returns a weighted score and the worst level", () => {
  const report = scanner.buildReport(scanner.DEMO_FACTS);
  assert.equal(report.score, 67);
  assert.equal(report.level, "warning");
  assert.deepEqual(report.counts, { error: 0, warning: 4, healthy: 2, unknown: 2 });
  assert.equal(report.groups.length, 3);
  assert.equal(report.alerts.length, 4);
  assert.equal(check(report, "device_lock").status, "unknown");
  assert.equal(check(report, "device_lock").score, null);
});

test("unknown checks are excluded from the weighted score", () => {
  const report = scanner.buildReport(facts());
  const knownWeight = report.checks
    .filter((item) => typeof item.score === "number")
    .reduce((sum, item) => sum + item.weight, 0);
  // device_lock, tracking are unknown for these facts.
  assert.equal(knownWeight, 3 + 2 + 3 + 1 + 3 + 1);
  // Permissions are all "prompt", so that check scores 85.
  assert.equal(report.score, 97);
});

test("one failing check sets the overall level to error", () => {
  const report = scanner.buildReport(
    facts({ location: { protocol: "http:", hostname: "example.test" } })
  );
  assert.equal(report.level, "error");
  assert.ok(report.score > 50, "score can stay high while the level reflects the weak item");
  assert.equal(report.alerts[0].id, "https");
});

test("all-unknown facts produce an unknown report without a score", () => {
  const report = scanner.buildReport({});
  assert.equal(report.level, "unknown");
  assert.equal(report.score, null);
  assert.equal(report.counts.unknown, report.checks.length);
});

test("diffReports reports score and per-check deltas", () => {
  const before = scanner.buildReport(scanner.DEMO_FACTS);
  const after = scanner.buildReport(
    Object.assign({}, scanner.DEMO_FACTS, {
      permissions: { geolocation: "denied", camera: "denied", microphone: "denied" },
      connection: { effectiveType: "4g", saveData: false },
      referrer_policy: "no-referrer",
    })
  );
  const diff = scanner.diffReports(before, after);
  assert.ok(diff.scoreDelta > 0);
  assert.equal(diff.beforeScore, 67);
  assert.ok(diff.improved.some((item) => item.id === "permissions"));
  assert.ok(diff.improved.some((item) => item.id === "connection"));
  assert.deepEqual(diff.regressed, []);
  assert.ok(diff.statusChanged.some((item) => item.id === "permissions"));
  assert.equal(scanner.diffReports(null, after), null);
});

test("collectFacts maps browser APIs without throwing", async () => {
  const fakeWindow = {
    isSecureContext: true,
    location: { protocol: "https:", hostname: "example.test" },
    navigator: {
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
      languages: ["ja-JP", "en-US"],
      cookieEnabled: true,
      doNotTrack: "1",
      globalPrivacyControl: true,
      maxTouchPoints: 5,
      permissions: {
        query: async ({ name }) => ({ state: name === "geolocation" ? "granted" : "prompt" }),
      },
      connection: { effectiveType: "4g", saveData: false },
    },
    document: { referrerPolicy: "strict-origin-when-cross-origin", querySelector: () => null },
    screen: { width: 412, height: 915 },
    devicePixelRatio: 2.6,
    matchMedia: () => ({ matches: false }),
  };
  const collected = await scanner.collectFacts(fakeWindow);
  assert.equal(collected.os.name, "android");
  assert.equal(collected.os.major, 14);
  assert.equal(collected.browser.name, "chrome");
  assert.equal(collected.permissions.geolocation, "granted");
  assert.equal(collected.permissions.camera, "prompt");
  assert.equal(collected.touch, true);

  const report = scanner.buildReport(collected);
  assert.equal(check(report, "permissions").status, "warning");
  assert.equal(check(report, "https").status, "healthy");
});

test("collectFacts tolerates a window without permissions or connection", async () => {
  const collected = await scanner.collectFacts({ navigator: {}, location: {}, document: {} });
  assert.equal(collected.permissions.geolocation, "unknown");
  assert.equal(collected.connection, null);
  const report = scanner.buildReport(collected);
  assert.equal(report.level, "unknown");
});

test("weightedScore clamps and handles missing weights", () => {
  assert.equal(scanner.weightedScore([{ weight: 1, score: 120 }, { weight: 1, score: -20 }]), 50);
  assert.equal(scanner.weightedScore([{ weight: 1, score: null }]), null);
});
