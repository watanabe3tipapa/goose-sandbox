/*
 * Mobile Safety Kit viewer
 *
 * Reads browser facts through scanner.collectFacts(), turns them into a
 * report with scanner.buildReport(), and renders the diagnostic pipeline.
 * No network requests and no third-party code.
 */
(function () {
  "use strict";

  const S = window.SafetyScanner;
  const byId = (id) => document.getElementById(id);
  const FILTERS = ["all", "error", "warning", "healthy", "unknown"];
  const BASELINE_KEYS = { real: "msk:baseline:v1", demo: "msk:baseline:demo:v1" };
  const params = new URLSearchParams(window.location.search);
  const statusParam = params.get("status");

  if (!S) {
    const message = document.createElement("p");
    message.style.padding = "24px";
    message.style.fontFamily = "monospace";
    message.textContent = "scanner.js の読み込みに失敗しました。";
    document.body.textContent = "";
    document.body.appendChild(message);
    return;
  }

  const state = {
    report: null,
    baseline: null,
    diff: null,
    selected: params.get("check") || null,
    filter: FILTERS.indexOf(statusParam) !== -1 ? statusParam : "all",
    demo: params.get("demo") === "1",
    loading: false,
  };

  /* ---------- small helpers ---------- */

  function h(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function statusLabel(status) {
    return S.STATUS_LABEL[status] || "Unknown";
  }

  function protocolLabel(protocol) {
    if (protocol === "https:") return "HTTPS";
    if (protocol === "http:") return "HTTP";
    return protocol || "—";
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function matchesFilter(check) {
    return state.filter === "all" || check.status === state.filter;
  }

  function deltaFor(id) {
    if (!state.diff) return null;
    const item = state.diff.checks.find((entry) => entry.id === id);
    return item ? item.delta : null;
  }

  function groupLabel(id) {
    const group = S.GROUPS.find((entry) => entry.id === id);
    return group ? `${group.no} · ${group.label} / ${group.sub}` : id;
  }

  function addRow(list, term, value) {
    list.appendChild(h("dt", null, term));
    list.appendChild(h("dd", null, value));
  }

  /* ---------- storage ---------- */

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      /* private mode / file:// without storage */
    }
  }

  function baselineKey() {
    return BASELINE_KEYS[state.demo ? "demo" : "real"];
  }

  function loadBaseline() {
    const raw = storageGet(baselineKey());
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.schema !== S.SCHEMA || !Array.isArray(parsed.checks)) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function saveBaseline(report) {
    storageSet(baselineKey(), JSON.stringify(report));
  }

  /* ---------- URL ---------- */

  function syncUrl() {
    const next = new URLSearchParams();
    if (state.demo) next.set("demo", "1");
    if (state.filter !== "all") next.set("status", state.filter);
    if (state.selected) next.set("check", state.selected);
    const query = next.toString();
    const url = window.location.pathname + (query ? `?${query}` : "");
    try {
      window.history.replaceState(null, "", url);
    } catch (error) {
      /* replaceState can be blocked on file:// */
    }
  }

  /* ---------- toast ---------- */

  let toastTimer = null;
  function showToast(message) {
    const toast = byId("toast");
    toast.textContent = message;
    toast.hidden = false;
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2600);
  }

  /* ---------- render: banner ---------- */

  function renderBanner() {
    const banner = byId("banner");
    const text = byId("banner-text");
    const action = byId("banner-action");
    banner.classList.remove("info");
    action.hidden = true;
    action.onclick = null;

    if (state.error) {
      banner.hidden = false;
      text.textContent = `スキャンに失敗しました: ${state.error.message || state.error}`;
      return;
    }
    if (state.demo) {
      banner.hidden = false;
      banner.classList.add("info");
      text.textContent = "デモデータを表示しています。実端末の診断ではありません。";
      action.hidden = false;
      action.textContent = "実スキャンに切り替える";
      action.onclick = () => setDemo(false);
      return;
    }
    banner.hidden = true;
  }

  /* ---------- render: scoreboard ---------- */

  function renderScore() {
    const report = state.report;
    byId("score").textContent = report && report.score !== null ? String(report.score) : "—";

    const level = byId("level");
    const value = report ? report.level : "unknown";
    level.textContent = report ? statusLabel(value) : "Scanning";
    level.className = `level ${value}`;

    const delta = byId("score-delta");
    const change = state.diff ? state.diff.scoreDelta : null;
    if (typeof change === "number" && change !== 0) {
      delta.hidden = false;
      delta.textContent = `基準比 ${change > 0 ? "+" : ""}${change}`;
      delta.className = `delta ${change > 0 ? "plus" : "minus"}`;
    } else {
      delta.hidden = true;
    }

    if (report) {
      byId("host").textContent = report.facts.host || "local";
      byId("host-meta").textContent = [
        report.facts.os,
        report.facts.browser,
        protocolLabel(report.facts.protocol),
      ].join(" · ");
      byId("pulse").classList.toggle("off", state.demo);
    } else {
      byId("host").textContent = "local";
      byId("host-meta").textContent = "スキャン中…";
      byId("pulse").classList.add("off");
    }
  }

  function renderKpis() {
    const counts = state.report
      ? state.report.counts
      : { error: 0, warning: 0, healthy: 0, unknown: 0 };
    ["error", "warning", "healthy", "unknown"].forEach((status) => {
      byId(`count-${status}`).textContent = String(counts[status]);
    });
  }

  function renderMeta() {
    const meta = byId("meta");
    meta.textContent = "";
    if (!state.report) {
      addRow(meta, "状態", "スキャン待ち");
      return;
    }
    const facts = state.report.facts;
    const connection = state.report.checks.find((check) => check.id === "connection");
    addRow(meta, "端末", facts.os);
    addRow(meta, "ブラウザ", facts.browser);
    addRow(meta, "画面", facts.screen || "—");
    addRow(meta, "通信", protocolLabel(facts.protocol));
    addRow(meta, "接続", connection ? connection.detail : "—");
    addRow(meta, "言語", facts.languages.length ? facts.languages.join(", ") : "—");
    addRow(meta, "方式", state.report.demo ? "合成データ" : "実スキャン");
    addRow(meta, "時刻", formatTime(state.report.generated_at));
    addRow(
      meta,
      "基準",
      state.diff && state.diff.beforeScore !== null ? `${state.diff.beforeScore} / 100` : "—"
    );
  }

  /* ---------- render: pipeline ---------- */

  function arrowEl() {
    const arrow = h("div", "flow-arrow", "→");
    arrow.setAttribute("aria-hidden", "true");
    return arrow;
  }

  function checkButton(check) {
    const delta = deltaFor(check.id);
    const button = h(
      "button",
      `check ${check.status}${matchesFilter(check) ? "" : " dim"}`
    );
    button.type = "button";
    button.dataset.id = check.id;
    button.setAttribute("aria-pressed", String(state.selected === check.id));
    button.setAttribute(
      "aria-label",
      `${check.label}: ${statusLabel(check.status)}${check.score === null ? "" : `, スコア ${check.score}`}`
    );
    button.appendChild(h("span", "dot"));

    const main = h("span", "check-main");
    main.appendChild(h("span", "check-label", check.label));
    main.appendChild(h("span", "check-detail", check.message));
    button.appendChild(main);

    button.appendChild(h("span", "check-score", check.score === null ? "—" : String(check.score)));
    const deltaEl = h(
      "span",
      `check-delta${delta > 0 ? " plus" : delta < 0 ? " minus" : ""}`,
      typeof delta === "number" && delta !== 0 ? `${delta > 0 ? "+" : ""}${delta}` : ""
    );
    button.appendChild(deltaEl);

    button.addEventListener("click", () => selectCheck(check.id));
    return button;
  }

  function stageEl(group) {
    const stage = h("div", "stage");
    const head = h("div", "stage-head");
    head.appendChild(h("span", "stage-no", group.no));

    const title = h("div");
    title.appendChild(h("b", null, group.label));
    title.appendChild(h("small", null, group.sub));
    head.appendChild(title);
    head.appendChild(h("span", "stage-score", group.score === null ? "—" : String(group.score)));
    stage.appendChild(head);

    const body = h("div", "stage-body");
    group.checks.forEach((check) => body.appendChild(checkButton(check)));
    stage.appendChild(body);
    return stage;
  }

  function judgeEl(report) {
    const stage = h("div", `stage judge ${report.level}`);
    const head = h("div", "stage-head");
    head.appendChild(h("span", "stage-no", "04"));

    const title = h("div");
    title.appendChild(h("b", null, "Risk Judge"));
    title.appendChild(h("small", null, "総合判定"));
    head.appendChild(title);
    stage.appendChild(head);

    const body = h("div", "judge-body");
    body.appendChild(h("span", "judge-score", report.score === null ? "—" : String(report.score)));
    body.appendChild(h("span", "judge-label", "Safety score"));
    body.appendChild(h("span", `level ${report.level}`, statusLabel(report.level)));
    body.appendChild(
      h(
        "span",
        "judge-note",
        report.alerts.length
          ? `${report.alerts.length} alert${report.alerts.length === 1 ? "" : "s"}`
          : "アラートなし"
      )
    );
    stage.appendChild(body);
    return stage;
  }

  function renderFlow() {
    const flow = byId("flow");
    flow.textContent = "";
    if (!state.report) {
      flow.appendChild(h("p", "judge-empty", "スキャン結果がありません。"));
      byId("flow-summary").textContent = "—";
      return;
    }
    state.report.groups.forEach((group, index) => {
      if (index > 0) flow.appendChild(arrowEl());
      flow.appendChild(stageEl(group));
    });
    flow.appendChild(arrowEl());
    flow.appendChild(judgeEl(state.report));
    byId("flow-summary").textContent =
      `${state.report.checks.length} checks · ${state.report.alerts.length} alerts`;
  }

  function renderFilters() {
    const counts = state.report
      ? state.report.counts
      : { error: 0, warning: 0, healthy: 0, unknown: 0 };
    byId("n-all").textContent = String(state.report ? state.report.checks.length : 0);
    ["error", "warning", "healthy", "unknown"].forEach((status) => {
      byId(`n-${status}`).textContent = String(counts[status]);
    });
    document.querySelectorAll("#filters button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.filter === state.filter));
    });
  }

  /* ---------- render: inspector ---------- */

  function summaryText(report) {
    const counts = report.counts;
    if (report.level === "error") {
      return `Error ${counts.error} 件。まず Error の項目から確認してください。`;
    }
    if (report.level === "warning") {
      return `Warning ${counts.warning} 件。更新と権限の設定を確認してください。`;
    }
    if (report.level === "healthy") {
      return "Error / Warning はありません。現在の設定を維持してください。";
    }
    return "判定できる項目がありません。HTTPS のページで開くと精度が上がります。";
  }

  function diffText(id) {
    if (!state.diff) return "基準なし";
    const item = state.diff.checks.find((entry) => entry.id === id);
    if (!item || item.before === null || item.after === null) return "比較なし";
    if (item.delta === 0) return `${item.before} → ${item.after}（±0）`;
    const sign = item.delta > 0 ? "+" : "";
    return `${item.before} → ${item.after}（${sign}${item.delta}）`;
  }

  function renderInspector() {
    const body = byId("inspector");
    const hint = byId("inspector-hint");
    body.textContent = "";

    if (!state.report) {
      hint.textContent = "スキャン待ち";
      body.appendChild(h("p", "insp-empty", "スキャンが完了すると、チェックの詳細を表示します。"));
      return;
    }

    const check = state.selected
      ? state.report.checks.find((entry) => entry.id === state.selected)
      : null;

    if (!check) {
      hint.textContent = "チェックを選択";
      body.appendChild(
        h("p", "insp-empty", "左のパイプラインからチェックを選ぶと、観測値と対処法を表示します。")
      );
      body.appendChild(h("p", "insp-empty", summaryText(state.report)));
      return;
    }

    hint.textContent = check.id;
    const head = h("div", "insp-head");
    const title = h("div");
    title.appendChild(h("span", "insp-group", groupLabel(check.group)));
    title.appendChild(h("div", "insp-title", check.label));
    head.appendChild(title);
    head.appendChild(h("span", `level insp-status ${check.status}`, statusLabel(check.status)));
    body.appendChild(head);

    body.appendChild(h("p", "insp-message", check.message));
    if (check.advice) body.appendChild(h("p", "insp-advice", check.advice));

    const bar = h("div", "insp-bar");
    const barHead = h("div", "insp-bar-head");
    barHead.appendChild(h("span", null, check.score === null ? "スコアなし" : `score ${check.score} / 100`));
    barHead.appendChild(h("span", null, `weight ${check.weight}`));
    bar.appendChild(barHead);
    const track = h("div", "bar");
    track.style.setProperty("--status-color", `var(--${check.status})`);
    const fill = h("i");
    fill.style.width = `${check.score === null ? 0 : check.score}%`;
    track.appendChild(fill);
    bar.appendChild(track);
    body.appendChild(bar);

    const grid = h("dl", "insp-grid");
    addRow(grid, "観測値", check.detail || "—");
    addRow(grid, "データ源", check.hint);
    addRow(grid, "前回", diffText(check.id));
    body.appendChild(grid);
  }

  /* ---------- render: alerts ---------- */

  function renderAlerts() {
    const list = byId("alerts");
    const count = byId("alert-count");
    list.textContent = "";

    if (!state.report) {
      count.textContent = "0";
      list.appendChild(h("li", "alert-empty", "スキャン待ち"));
      return;
    }

    const alerts = state.report.alerts;
    count.textContent = `${alerts.length} 件`;
    if (alerts.length === 0) {
      list.appendChild(h("li", "alert-empty", "Error / Warning はありません。"));
      return;
    }

    alerts.forEach((check) => {
      const item = h("li", `alert-item ${check.status}`);
      const button = h("button");
      button.type = "button";
      button.appendChild(h("span", "dot"));

      const main = h("span", "alert-main");
      main.appendChild(h("span", "alert-label", check.label));
      main.appendChild(h("span", "alert-message", check.message));
      button.appendChild(main);
      button.appendChild(h("span", "alert-score", check.score === null ? "—" : String(check.score)));
      button.addEventListener("click", () => selectCheck(check.id));
      item.appendChild(button);
      list.appendChild(item);
    });
  }

  /* ---------- render: all ---------- */

  function updateButtons() {
    byId("btn-scan").disabled = state.loading;
    byId("btn-demo").disabled = state.loading;
    byId("btn-baseline").disabled = state.loading || !state.report;
    byId("btn-export").disabled = state.loading || !state.report;
    byId("btn-demo").setAttribute("aria-pressed", String(state.demo));
  }

  function render() {
    renderBanner();
    renderScore();
    renderKpis();
    renderMeta();
    renderFlow();
    renderFilters();
    renderInspector();
    renderAlerts();
    updateButtons();
  }

  /* ---------- actions ---------- */

  function selectCheck(id) {
    state.selected = state.selected === id ? null : id;
    renderFlow();
    renderInspector();
    syncUrl();
    if (state.selected) {
      const target = document.querySelector(`.check[data-id="${state.selected}"]`);
      if (target) target.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function setDemo(value) {
    state.demo = value;
    state.selected = null;
    state.filter = "all";
    syncUrl();
    scan();
  }

  function setLoading(loading) {
    state.loading = loading;
    const button = byId("btn-scan");
    button.textContent = loading ? "スキャン中…" : "再スキャン";
    updateButtons();
  }

  async function scan() {
    if (state.loading) return;
    state.error = null;
    setLoading(true);
    renderBanner();
    try {
      const facts = state.demo ? S.DEMO_FACTS : await S.collectFacts(window);
      const report = S.buildReport(facts);
      state.report = report;
      state.baseline = loadBaseline();
      if (!state.baseline) {
        state.baseline = report;
        saveBaseline(report);
      }
      state.diff = S.diffReports(state.baseline, report);
      if (state.selected && !report.checks.some((check) => check.id === state.selected)) {
        state.selected = null;
      }
      render();
    } catch (error) {
      state.report = null;
      state.diff = null;
      state.error = error;
      render();
    } finally {
      setLoading(false);
      syncUrl();
    }
  }

  function updateBaseline() {
    if (!state.report) return;
    saveBaseline(state.report);
    state.baseline = state.report;
    state.diff = S.diffReports(state.baseline, state.report);
    render();
    showToast("現在の結果を比較の基準として保存しました");
  }

  function exportReport() {
    if (!state.report) return;
    const blob = new Blob([`${JSON.stringify(state.report, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mobile-safety-report-${state.report.demo ? "demo" : "local"}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("レポートを JSON で保存しました");
  }

  /* ---------- boot ---------- */

  byId("btn-scan").addEventListener("click", () => scan());
  byId("btn-demo").addEventListener("click", () => setDemo(!state.demo));
  byId("btn-baseline").addEventListener("click", updateBaseline);
  byId("btn-export").addEventListener("click", exportReport);

  document.querySelectorAll("#filters button").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      renderFilters();
      renderFlow();
      syncUrl();
    });
  });

  renderFilters();
  scan();
})();
