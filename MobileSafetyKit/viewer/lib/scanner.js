/*
 * Mobile Safety Kit scanner
 *
 * Dependency-free evaluation core shared by the viewer and the Node tests.
 * Facts are collected from browser APIs (collectFacts) and evaluated by pure
 * functions, so the rules can be tested without a browser.
 *
 * Design notes:
 *   - The report keeps observed facts and judgments separate.
 *   - A check that cannot be observed is "unknown" and is excluded from the
 *     weighted score instead of being guessed.
 *   - The overall level is the worst check status: a weak item is not
 *     averaged away by healthy ones.
 *
 * Loaded with a plain <script> tag and required from node:test.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SafetyScanner = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA = "mobile-safety-kit/report@1";
  const SUPPORT_AS_OF = "2026-10";

  const STATUSES = ["error", "warning", "healthy", "unknown"];
  const STATUS_LABEL = {
    error: "Error",
    warning: "Warning",
    healthy: "Healthy",
    unknown: "Unknown",
  };
  const STATUS_RANK = { error: 3, warning: 2, unknown: 1, healthy: 0 };

  /*
   * Static support table. This is a snapshot, not a live feed: update the
   * numbers (and SUPPORT_AS_OF) when browser / OS support moves.
   */
  const OS_SUPPORT = {
    ios: { label: "iOS", healthy: 18, warn: 16 },
    android: { label: "Android", healthy: 14, warn: 12 },
    macos: { label: "macOS", healthy: 14, warn: 13 },
  };

  const BROWSER_SUPPORT = {
    chrome: { label: "Chrome", healthy: 120, warn: 110 },
    safari: { label: "Safari", healthy: 17, warn: 16 },
    firefox: { label: "Firefox", healthy: 120, warn: 110 },
    edge: { label: "Edge", healthy: 120, warn: 110 },
  };

  const SAFE_REFERRER_POLICIES = [
    "no-referrer",
    "same-origin",
    "strict-origin",
    "strict-origin-when-cross-origin",
    "origin",
  ];

  const GROUPS = [
    { id: "device", no: "01", label: "Device Scan", sub: "端末・OS" },
    { id: "network", no: "02", label: "Security Check", sub: "接続・通信" },
    { id: "privacy", no: "03", label: "Privacy Check", sub: "権限・追跡" },
  ];

  const PERMISSION_LABEL = {
    geolocation: "位置情報",
    camera: "カメラ",
    microphone: "マイク",
    notifications: "通知",
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function majorOf(value) {
    const match = String(value === null || value === undefined ? "" : value).match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  function majorFrom(value, pattern) {
    const match = String(value || "").match(pattern);
    return match ? Number(match[1]) : null;
  }

  function osResult(name, label, major, raw, uncertain) {
    return {
      name,
      label,
      major: Number.isInteger(major) ? major : null,
      raw: raw || "",
      uncertain: uncertain === true,
    };
  }

  function detectOS(userAgent, platform, platformVersion) {
    const ua = String(userAgent || "");
    const p = String(platform || "");
    const pv = String(platformVersion || "");

    if (p === "iOS" || /iPhone|iPad|iPod/.test(ua)) {
      return osResult("ios", "iOS", majorOf(pv) || majorFrom(ua, /OS (\d+)[._]/), pv || ua, false);
    }
    if (p === "Android" || /Android/.test(ua)) {
      return osResult("android", "Android", majorOf(pv) || majorFrom(ua, /Android (\d+)/), pv || ua, false);
    }
    if (p === "macOS" || /Macintosh|Mac OS X/.test(ua)) {
      if (p === "macOS" && pv) {
        return osResult("macos", "macOS", majorOf(pv), pv, false);
      }
      const major = majorFrom(ua, /Mac OS X (\d+)[._]/);
      // Safari freezes the macOS version at 10.15 in the UA string.
      return osResult("macos", "macOS", major, ua, major === 10);
    }
    if (p === "Windows" || /Windows NT/.test(ua)) {
      const nt = majorFrom(ua, /Windows NT (\d+)/);
      // Windows NT 10.0 covers both Windows 10 and 11.
      return osResult("windows", "Windows", nt === 10 ? 10 : nt, ua, true);
    }
    if (/CrOS/.test(ua)) {
      return osResult("chromeos", "ChromeOS", majorFrom(ua, /CrOS \w+ (\d+)/), ua, false);
    }
    if (p === "Linux" || /Linux/.test(ua)) {
      return osResult("linux", "Linux", null, ua, false);
    }
    return osResult("unknown", "不明な OS", null, ua, false);
  }

  function detectBrowser(userAgent) {
    const ua = String(userAgent || "");
    const rules = [
      ["edge", /Edg(?:e|A|iOS)?\/(\d+(?:\.\d+)*)/],
      ["chrome", /(?:Chrome|CriOS)\/(\d+(?:\.\d+)*)/],
      ["firefox", /(?:Firefox|FxiOS)\/(\d+(?:\.\d+)*)/],
      ["safari", /Version\/(\d+(?:\.\d+)*).*Safari\//],
    ];
    for (let index = 0; index < rules.length; index += 1) {
      const name = rules[index][0];
      const match = ua.match(rules[index][1]);
      if (!match) continue;
      const support = BROWSER_SUPPORT[name];
      return {
        name,
        label: support ? support.label : name,
        version: match[1],
        major: Number(match[1].split(".")[0]),
      };
    }
    return { name: "unknown", label: "不明なブラウザ", version: null, major: null };
  }

  function describeOS(os) {
    if (!os || !os.name || os.name === "unknown") return "不明";
    if (os.uncertain) {
      if (os.name === "windows") return "Windows（10 / 11 不明）";
      return `${os.label}（バージョン不明）`;
    }
    return os.major ? `${os.label} ${os.major}` : os.label;
  }

  function describeBrowser(browser) {
    if (!browser || !browser.name || browser.name === "unknown") return "不明";
    return browser.version ? `${browser.label} ${browser.version}` : browser.label;
  }

  /* ---------- checks ---------- */

  function checkOS(facts) {
    const os = facts.os || detectOS(facts.user_agent, facts.platform, facts.ua_platform_version);
    const label = describeOS(os);
    const raw = String(os.raw || "");
    const detail = raw && raw !== label && raw.length <= 32 ? `${label}（${raw}）` : label;

    if (!os.name || os.name === "unknown") {
      return {
        status: "unknown",
        score: null,
        message: "OS を判定できませんでした",
        advice: "端末の設定 > 一般 > 情報 で OS のバージョンを確認してください。",
        detail,
      };
    }
    if (os.uncertain) {
      return {
        status: "unknown",
        score: null,
        message: "OS のバージョンを正確に判定できません",
        advice: "ブラウザが UA のバージョンを固定しているため、端末設定で実際のバージョンを確認してください。",
        detail,
      };
    }
    const support = OS_SUPPORT[os.name];
    if (!support || !os.major) {
      return {
        status: "unknown",
        score: null,
        message: "この OS は自動判定の対象外です",
        advice: "OS の更新状況を端末設定から確認してください。",
        detail,
      };
    }
    if (os.major >= support.healthy) {
      return {
        status: "healthy",
        score: 100,
        message: `${support.label} ${os.major} は更新目安を満たしています`,
        advice: "自動更新を有効にしておくと、セキュリティ修正が届きます。",
        detail,
      };
    }
    if (os.major >= support.warn) {
      return {
        status: "warning",
        score: 60,
        message: `${support.label} ${os.major} は更新を推奨します`,
        advice: `目安は ${support.label} ${support.healthy} 以降です。設定 > 一般 > ソフトウェアアップデート を確認してください。`,
        detail,
      };
    }
    return {
      status: "error",
      score: 30,
      message: `${support.label} ${os.major} はサポートが古い可能性があります`,
      advice: `目安は ${support.label} ${support.healthy} 以降です。更新できない場合は端末の買い替えも検討してください。`,
      detail,
    };
  }

  function checkBrowser(facts) {
    const browser = facts.browser || detectBrowser(facts.user_agent);
    const detail = describeBrowser(browser);
    const support = BROWSER_SUPPORT[browser.name];

    if (!support || !browser.major) {
      return {
        status: "unknown",
        score: null,
        message: "ブラウザのバージョンを判定できません",
        advice: "ブラウザの「バージョン情報」から更新状態を確認してください。",
        detail,
      };
    }
    if (browser.major >= support.healthy) {
      return {
        status: "healthy",
        score: 100,
        message: `${support.label} ${browser.major} は更新目安を満たしています`,
        advice: "自動更新を有効にしておくと、既知の脆弱性が修正されます。",
        detail,
      };
    }
    if (browser.major >= support.warn) {
      return {
        status: "warning",
        score: 60,
        message: `${support.label} ${browser.major} は更新を推奨します`,
        advice: `目安は ${support.label} ${support.healthy} 以降です。ブラウザを最新版に更新してください。`,
        detail,
      };
    }
    return {
      status: "error",
      score: 30,
      message: `${support.label} ${browser.major} は古いバージョンです`,
      advice: `目安は ${support.label} ${support.healthy} 以降です。早めに更新してください。`,
      detail,
    };
  }

  function checkHTTPS(facts) {
    const protocol = (facts.location && facts.location.protocol) || "";
    if (protocol === "https:") {
      return {
        status: "healthy",
        score: 100,
        message: "HTTPS で通信しています",
        advice: "アドレスバーの鍵アイコンで証明書の状態も確認できます。",
        detail: "https:",
      };
    }
    if (protocol === "http:") {
      return {
        status: "error",
        score: 20,
        message: "HTTP で通信しています",
        advice: "入力内容が平文で流れる可能性があります。HTTPS のページを利用してください。",
        detail: "http:",
      };
    }
    return {
      status: "unknown",
      score: null,
      message: "通信プロトコルを判定できません",
      advice: "HTTPS で公開されたページで確認してください（file:// では判定できません）。",
      detail: protocol || "不明",
    };
  }

  function checkConnection(facts) {
    const connection = facts.connection;
    if (!connection || !connection.effectiveType) {
      return {
        status: "unknown",
        score: null,
        message: "回線種別を取得できません",
        advice: "Network Information API 非対応のブラウザでは判定できません。",
        detail: "Network Information API 非対応",
      };
    }
    const type = String(connection.effectiveType).toLowerCase();
    const saveData = connection.saveData === true;
    const detail = `${type}${saveData ? " / データセーバー有効" : ""}`;

    if (type === "4g") {
      if (saveData) {
        return {
          status: "warning",
          score: 65,
          message: "データセーバーが有効です",
          advice: "画像や更新の取得が制限されます。必要なら設定を確認してください。",
          detail,
        };
      }
      return {
        status: "healthy",
        score: 100,
        message: "接続は 4g です",
        advice: "公衆 Wi-Fi では、HTTPS と VPN の利用を併用してください。",
        detail,
      };
    }
    if (type === "3g") {
      return {
        status: "warning",
        score: 55,
        message: "接続は 3g（低速）です",
        advice: "更新確認や証明書失効確認が遅れることがあります。安定した回線で再確認してください。",
        detail,
      };
    }
    return {
      status: "error",
      score: 30,
      message: `接続は ${type}（低速）です`,
      advice: "セキュリティ更新の取得に失敗しやすい状態です。Wi-Fi など安定した回線を使ってください。",
      detail,
    };
  }

  function checkPermissions(facts) {
    const permissions = facts.permissions || {};
    const names = ["geolocation", "camera", "microphone"];
    const known = names.filter((name) => permissions[name] && permissions[name] !== "unknown");

    if (known.length === 0) {
      return {
        status: "unknown",
        score: null,
        message: "権限の状態を取得できませんでした",
        advice: "Permissions API 非対応のブラウザでは判定できません。端末設定 > アプリ > ブラウザ で確認してください。",
        detail: "Permissions API 非対応",
      };
    }

    const granted = known.filter((name) => permissions[name] === "granted");
    const prompted = known.filter((name) => permissions[name] === "prompt");
    const summary = names
      .map((name) => `${PERMISSION_LABEL[name]}: ${permissions[name] || "unknown"}`)
      .join(" / ");

    if (granted.length > 0) {
      const labels = granted.map((name) => PERMISSION_LABEL[name]).join("・");
      return {
        status: "warning",
        score: 40,
        message: `${labels}が許可されています`,
        advice: `不要なら端末またはブラウザの設定で拒否してください。許可中: ${labels}。`,
        detail: summary,
      };
    }
    if (prompted.length > 0) {
      return {
        status: "healthy",
        score: 85,
        message: "主要な権限は未許可です",
        advice: "必要になったときだけ許可すると、常時追跡のリスクを下げられます。",
        detail: summary,
      };
    }
    return {
      status: "healthy",
      score: 100,
      message: "主要な権限は拒否されています",
      advice: "位置情報・カメラ・マイクは、必要な場面だけ許可する運用が安全です。",
      detail: summary,
    };
  }

  function checkTracking(facts) {
    const gpc = facts.global_privacy_control === true;
    const dnt = String(facts.do_not_track === null || facts.do_not_track === undefined ? "" : facts.do_not_track);
    if (gpc || dnt === "1") {
      return {
        status: "healthy",
        score: 100,
        message: "トラッキング防止の意思表示が有効です",
        advice: "Global Privacy Control / Do Not Track を送信しています。",
        detail: gpc ? "Global Privacy Control: 有効" : `Do Not Track: ${dnt}`,
      };
    }
    return {
      status: "unknown",
      score: null,
      message: "トラッキング防止の意思表示は未設定です",
      advice: "GPC 対応ブラウザなら設定で有効化できます。未設定でも直ちに危険というわけではありません。",
      detail: `Global Privacy Control: ${gpc ? "有効" : "無効"} / Do Not Track: ${dnt || "未設定"}`,
    };
  }

  function checkReferrer(facts) {
    if (facts.referrer_policy === undefined || facts.referrer_policy === null) {
      return {
        status: "unknown",
        score: null,
        message: "Referrer-Policy を取得できませんでした",
        advice: "ブラウザの開発者ツールで、ページの Referrer-Policy を確認してください。",
        detail: "未取得",
      };
    }
    const policy = String(facts.referrer_policy || "").trim().toLowerCase();
    if (!policy) {
      return {
        status: "healthy",
        score: 85,
        message: "Referrer-Policy はブラウザ既定です",
        advice: "明示指定はありません。モダンブラウザの既定（strict-origin-when-cross-origin 相当）で運用されます。",
        detail: "未指定",
      };
    }
    if (SAFE_REFERRER_POLICIES.indexOf(policy) !== -1) {
      return {
        status: "healthy",
        score: 100,
        message: `Referrer-Policy: ${policy}`,
        advice: "遷移先へ渡す URL 情報が制限されています。",
        detail: policy,
      };
    }
    if (policy === "no-referrer-when-downgrade" || policy === "origin-when-cross-origin") {
      return {
        status: "warning",
        score: 60,
        message: `Referrer-Policy: ${policy}`,
        advice: "遷移先へパス情報が渡る場合があります。strict-origin-when-cross-origin への変更を検討してください。",
        detail: policy,
      };
    }
    return {
      status: "error",
      score: 25,
      message: `Referrer-Policy: ${policy}`,
      advice: "URL が遷移先へ過剰に共有されます。no-referrer または strict-origin-when-cross-origin を設定してください。",
      detail: policy,
    };
  }

  function checkDeviceLock() {
    return {
      status: "unknown",
      score: null,
      message: "画面ロックは Web から確認できません",
      advice: "端末の設定 > 画面ロック でパスコードや生体認証を確認してください。",
      detail: "手動確認",
    };
  }

  const CHECKS = [
    { id: "os_version", group: "device", label: "OS バージョン", weight: 3, hint: "UA / Client Hints", run: checkOS },
    { id: "browser_version", group: "device", label: "ブラウザ更新", weight: 2, hint: "User-Agent", run: checkBrowser },
    { id: "device_lock", group: "device", label: "画面ロック", weight: 1, hint: "手動確認", run: checkDeviceLock },
    { id: "https", group: "network", label: "HTTPS 通信", weight: 3, hint: "Location / isSecureContext", run: checkHTTPS },
    { id: "connection", group: "network", label: "回線品質", weight: 1, hint: "Network Information", run: checkConnection },
    { id: "permissions", group: "privacy", label: "権限の許可状態", weight: 3, hint: "Permissions API", run: checkPermissions },
    { id: "tracking", group: "privacy", label: "トラッキング防止", weight: 1, hint: "DNT / GPC", run: checkTracking },
    { id: "referrer", group: "privacy", label: "Referrer-Policy", weight: 1, hint: "Document policy", run: checkReferrer },
  ];

  /* ---------- report ---------- */

  function normalizeFacts(facts) {
    const result = Object.assign({}, facts || {});
    result.location = Object.assign({ protocol: "", hostname: "" }, result.location || {});
    result.permissions = Object.assign({}, result.permissions || {});
    if (!result.os) {
      result.os = detectOS(result.user_agent, result.platform, result.ua_platform_version);
    }
    if (!result.browser) {
      result.browser = detectBrowser(result.user_agent);
    }
    if (!result.collected_at) {
      result.collected_at = new Date().toISOString();
    }
    return result;
  }

  function worstStatus(checks) {
    let worst = null;
    checks.forEach((check) => {
      if (check.status === "unknown") return;
      if (worst === null || STATUS_RANK[check.status] > STATUS_RANK[worst]) worst = check.status;
    });
    return worst || "unknown";
  }

  function weightedScore(checks) {
    const scored = checks.filter((check) => typeof check.score === "number");
    const weight = scored.reduce((sum, check) => sum + check.weight, 0);
    if (weight === 0) return null;
    const total = scored.reduce((sum, check) => sum + check.score * check.weight, 0);
    return clamp(Math.round(total / weight), 0, 100);
  }

  function summarizeFacts(facts) {
    const os = facts.os || detectOS(facts.user_agent, facts.platform, facts.ua_platform_version);
    const browser = facts.browser || detectBrowser(facts.user_agent);
    const screen = facts.screen || null;
    return {
      host: facts.location.hostname || null,
      protocol: facts.location.protocol || null,
      os: describeOS(os),
      os_raw: os.raw || "",
      browser: describeBrowser(browser),
      platform: facts.platform || null,
      screen: screen ? `${screen.width}×${screen.height} @${screen.dpr || 1}x` : null,
      languages: Array.isArray(facts.languages) ? facts.languages.slice(0, 4) : [],
      touch: facts.touch === true,
      standalone: facts.standalone === true,
      cookie_enabled: facts.cookie_enabled !== false,
      user_agent: facts.user_agent || "",
    };
  }

  function buildReport(facts) {
    const normalized = normalizeFacts(facts);
    const checks = CHECKS.map((definition) => {
      const result = definition.run(normalized) || {};
      const status = STATUSES.indexOf(result.status) !== -1 ? result.status : "unknown";
      return {
        id: definition.id,
        group: definition.group,
        label: definition.label,
        hint: definition.hint,
        weight: definition.weight,
        status,
        score: typeof result.score === "number" && status !== "unknown"
          ? clamp(Math.round(result.score), 0, 100)
          : null,
        message: result.message || "",
        advice: result.advice || "",
        detail: result.detail || "",
      };
    });

    const counts = { error: 0, warning: 0, healthy: 0, unknown: 0 };
    checks.forEach((check) => { counts[check.status] += 1; });

    const groups = GROUPS.map((group) => {
      const groupChecks = checks.filter((check) => check.group === group.id);
      return {
        id: group.id,
        no: group.no,
        label: group.label,
        sub: group.sub,
        checks: groupChecks,
        score: weightedScore(groupChecks),
      };
    });

    const alerts = checks
      .filter((check) => check.status === "error" || check.status === "warning")
      .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status] || a.score - b.score);

    return {
      schema: SCHEMA,
      generated_at: normalized.collected_at,
      demo: normalized.demo === true,
      support_as_of: SUPPORT_AS_OF,
      score: weightedScore(checks),
      level: worstStatus(checks),
      counts,
      checks,
      groups,
      alerts,
      facts: summarizeFacts(normalized),
    };
  }

  function diffReports(baseline, current) {
    if (!baseline || !current || !Array.isArray(baseline.checks) || !Array.isArray(current.checks)) {
      return null;
    }
    const before = new Map(baseline.checks.map((check) => [check.id, check]));
    const checks = current.checks.map((check) => {
      const previous = before.get(check.id) || null;
      const delta = previous && typeof previous.score === "number" && typeof check.score === "number"
        ? check.score - previous.score
        : null;
      return {
        id: check.id,
        label: check.label,
        before: previous ? previous.score : null,
        after: check.score,
        delta,
        beforeStatus: previous ? previous.status : null,
        status: check.status,
        statusChanged: Boolean(previous) && previous.status !== check.status,
      };
    });

    return {
      beforeScore: baseline.score,
      afterScore: current.score,
      scoreDelta: typeof baseline.score === "number" && typeof current.score === "number"
        ? current.score - baseline.score
        : null,
      beforeLevel: baseline.level,
      afterLevel: current.level,
      checks,
      improved: checks.filter((check) => check.delta !== null && check.delta >= 5).sort((a, b) => b.delta - a.delta),
      regressed: checks.filter((check) => check.delta !== null && check.delta <= -5).sort((a, b) => a.delta - b.delta),
      statusChanged: checks.filter((check) => check.statusChanged),
    };
  }

  /* ---------- browser facts ---------- */

  async function queryPermissions(navigatorObject) {
    const names = ["geolocation", "camera", "microphone", "notifications"];
    const result = {};
    const permissions = navigatorObject && navigatorObject.permissions;
    if (!permissions || typeof permissions.query !== "function") {
      names.forEach((name) => { result[name] = "unknown"; });
      return result;
    }
    await Promise.all(names.map(async (name) => {
      try {
        const status = await permissions.query({ name });
        result[name] = status && ["granted", "denied", "prompt"].indexOf(status.state) !== -1
          ? status.state
          : "unknown";
      } catch (error) {
        result[name] = "unknown";
      }
    }));
    return result;
  }

  function readReferrerPolicy(documentObject) {
    if (!documentObject) return undefined;
    if (typeof documentObject.referrerPolicy === "string") {
      // An empty string is an observation: the page relies on the browser default.
      return documentObject.referrerPolicy;
    }
    if (typeof documentObject.querySelector === "function") {
      try {
        const meta = documentObject.querySelector('meta[name="referrer"]');
        if (meta && meta.content) return String(meta.content).trim();
      } catch (error) {
        /* ignore */
      }
    }
    return undefined;
  }

  function readStorage(windowObject) {
    const result = { local_storage: false, session_storage: false };
    try {
      if (windowObject.localStorage) {
        windowObject.localStorage.setItem("__msk__", "1");
        windowObject.localStorage.removeItem("__msk__");
        result.local_storage = true;
      }
    } catch (error) {
      /* ignore */
    }
    try {
      if (windowObject.sessionStorage) {
        windowObject.sessionStorage.setItem("__msk__", "1");
        windowObject.sessionStorage.removeItem("__msk__");
        result.session_storage = true;
      }
    } catch (error) {
      /* ignore */
    }
    return result;
  }

  function readStandalone(windowObject) {
    try {
      return typeof windowObject.matchMedia === "function"
        && windowObject.matchMedia("(display-mode: standalone)").matches === true;
    } catch (error) {
      return false;
    }
  }

  async function collectFacts(windowObject) {
    const w = windowObject || (typeof window !== "undefined" ? window : {});
    const nav = w.navigator || {};
    const loc = w.location || {};
    const doc = w.document || {};
    const ua = typeof nav.userAgent === "string" ? nav.userAgent : "";
    const uaData = nav.userAgentData || null;
    const platform = uaData && uaData.platform ? uaData.platform : (nav.platform || "");
    const platformVersion = uaData && uaData.platformVersion ? uaData.platformVersion : "";
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection || null;

    return {
      collected_at: new Date().toISOString(),
      demo: false,
      location: { protocol: loc.protocol || "", hostname: loc.hostname || "" },
      secure_context: w.isSecureContext === true,
      user_agent: ua,
      platform,
      ua_platform_version: platformVersion,
      os: detectOS(ua, platform, platformVersion),
      browser: detectBrowser(ua),
      screen: w.screen
        ? {
          width: Number(w.screen.width) || 0,
          height: Number(w.screen.height) || 0,
          dpr: Number(w.devicePixelRatio) || 1,
        }
        : null,
      languages: Array.isArray(nav.languages)
        ? nav.languages.slice()
        : (nav.language ? [nav.language] : []),
      cookie_enabled: nav.cookieEnabled !== false,
      referrer_policy: readReferrerPolicy(doc),
      do_not_track: nav.doNotTrack === undefined ? null : nav.doNotTrack,
      global_privacy_control: typeof nav.globalPrivacyControl === "boolean"
        ? nav.globalPrivacyControl
        : null,
      connection: connection
        ? {
          effectiveType: connection.effectiveType || null,
          type: connection.type || null,
          saveData: connection.saveData === true,
          downlink: typeof connection.downlink === "number" ? connection.downlink : null,
        }
        : null,
      permissions: await queryPermissions(nav),
      storage: readStorage(w),
      touch: (typeof nav.maxTouchPoints === "number" && nav.maxTouchPoints > 0)
        || (typeof w === "object" && "ontouchstart" in w),
      standalone: readStandalone(w),
    };
  }

  /*
   * Synthetic facts used by ?demo=1 and by tools/build-demo-report.js.
   * They describe an iPhone on iOS 16.6 / Safari 16.6 over 3g, with the
   * location permission granted. Everything is invented.
   */
  const DEMO_FACTS = {
    collected_at: "2026-10-28T12:00:00+09:00",
    demo: true,
    location: { protocol: "https:", hostname: "watanabe3tipapa.github.io" },
    secure_context: true,
    user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    platform: "iPhone",
    ua_platform_version: "",
    screen: { width: 390, height: 844, dpr: 3 },
    languages: ["ja-JP", "ja", "en-US", "en"],
    cookie_enabled: true,
    referrer_policy: "strict-origin-when-cross-origin",
    do_not_track: null,
    global_privacy_control: false,
    connection: { effectiveType: "3g", type: "cellular", saveData: false, downlink: 1.4 },
    permissions: {
      geolocation: "granted",
      camera: "prompt",
      microphone: "denied",
      notifications: "granted",
    },
    storage: { local_storage: true, session_storage: true },
    touch: true,
    standalone: false,
  };

  return {
    SCHEMA,
    SUPPORT_AS_OF,
    STATUSES,
    STATUS_LABEL,
    STATUS_RANK,
    OS_SUPPORT,
    BROWSER_SUPPORT,
    GROUPS,
    CHECKS,
    DEMO_FACTS,
    clamp,
    detectOS,
    detectBrowser,
    describeOS,
    describeBrowser,
    checkOS,
    checkBrowser,
    checkHTTPS,
    checkConnection,
    checkPermissions,
    checkTracking,
    checkReferrer,
    checkDeviceLock,
    normalizeFacts,
    worstStatus,
    weightedScore,
    buildReport,
    diffReports,
    collectFacts,
  };
});
