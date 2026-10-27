/*
 * Process Sentinel viewer
 *
 * Fetches a normalized snapshot (and optional baseline), classifies the
 * processes with SentinelModel, then renders the tree, alerts, diff and
 * inspector. All state lives in the URL so a view can be shared.
 */
(function () {
  "use strict";

  const MODEL = window.SentinelModel;
  if (!MODEL) {
    document.body.innerHTML = '<p style="padding:24px;color:#fecaca">model.js を読み込めませんでした。</p>';
    return;
  }

  const LIVE_INTERVAL = 8000;
  const els = {
    banner: document.getElementById("banner"),
    search: document.getElementById("search"),
    statusFilters: document.getElementById("status-filters"),
    unsignedToggle: document.getElementById("unsigned-toggle"),
    unsignedCount: document.getElementById("unsigned-count"),
    diffToggle: document.getElementById("diff-toggle"),
    diffCount: document.getElementById("diff-count"),
    resetFilters: document.getElementById("reset-filters"),
    kpiTotal: document.getElementById("kpi-total"),
    kpiError: document.getElementById("kpi-error"),
    kpiWarning: document.getElementById("kpi-warning"),
    kpiHealthy: document.getElementById("kpi-healthy"),
    kpiDiff: document.getElementById("kpi-diff"),
    host: document.getElementById("host-label"),
    metaTime: document.getElementById("meta-time"),
    metaSource: document.getElementById("meta-source"),
    liveDot: document.getElementById("live-dot"),
    liveToggle: document.getElementById("live-toggle"),
    reload: document.getElementById("reload"),
    treeSummary: document.getElementById("tree-summary"),
    stage: document.getElementById("stage"),
    stageScroll: document.getElementById("stage-scroll"),
    edges: document.getElementById("edges"),
    nodes: document.getElementById("nodes"),
    empty: document.getElementById("empty"),
    inspector: document.getElementById("inspector"),
    inspectorStatus: document.getElementById("inspector-status"),
    inspectorBody: document.getElementById("inspector-body"),
    alerts: document.getElementById("alerts"),
    alertCount: document.getElementById("alert-count"),
    diffMeta: document.getElementById("diff-meta"),
    diffBody: document.getElementById("diff-body"),
  };

  const initial = MODEL.parseQuery(window.location.search);
  const state = {
    model: null,
    snapshotMeta: null,
    baselineMeta: null,
    hasBaseline: false,
    filters: {
      status: initial.status,
      query: initial.query,
      unsignedOnly: initial.unsignedOnly,
      diffOnly: initial.diffOnly,
    },
    selectedPid: initial.pid,
    selectedRemoved: null,
    filtered: null,
    dataFile: initial.data,
    baselineFile: initial.baseline,
    live: initial.live,
    timer: null,
    loading: false,
    lastLoadedAt: null,
  };

  /* ---------------- utilities ---------------- */

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatCpu(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  function formatMemory(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  function relativeTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso || "—";
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(date);
    } catch (error) {
      return iso;
    }
  }

  function statusLabel(status) {
    return MODEL.STATUS_LABEL[status] || status;
  }

  function setBanner(kind, html) {
    if (!kind) {
      els.banner.hidden = true;
      els.banner.innerHTML = "";
      return;
    }
    els.banner.hidden = false;
    els.banner.className = kind === "warn" ? "banner warn" : "banner";
    els.banner.innerHTML = html;
  }

  function syncQuery() {
    const query = MODEL.buildQuery({
      pid: state.selectedPid,
      status: state.filters.status,
      query: state.filters.query,
      unsignedOnly: state.filters.unsignedOnly,
      diffOnly: state.filters.diffOnly,
      live: state.live,
      data: state.dataFile,
      baseline: state.baselineFile,
    });
    try {
      window.history.replaceState(null, "", `${window.location.pathname}${query}`);
    } catch (error) {
      /* file:// or sandboxed contexts may refuse; the view still works */
    }
  }

  /* ---------------- loading ---------------- */

  async function fetchJson(file) {
    const response = await fetch(`${encodeURIComponent(file)}`, { cache: "no-store" });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function load(options) {
    const opts = options || {};
    if (state.loading) return;
    if (window.location.protocol === "file:") {
      setBanner(
        "error",
        "<div><strong>ローカルサーバー経由で開いてください。</strong><br>" +
          "<code>python3 -m http.server 8000</code> をリポジトリ直下で実行し、" +
          " <code>http://localhost:8000/ProcessSentinel/viewer/</code> を開きます。</div>"
      );
      return;
    }

    state.loading = true;
    updateLiveDot();
    if (!opts.quiet) {
      els.reload.disabled = true;
      els.reload.textContent = "読込中";
    }

    try {
      const snapshot = await fetchJson(`data/${state.dataFile}`);
      let baseline = null;
      if (state.baselineFile) {
        try {
          baseline = await fetchJson(`data/${state.baselineFile}`);
        } catch (error) {
          if (error.status !== 404) throw error;
        }
      }

      const validation = MODEL.validateSnapshot(snapshot);
      if (!validation.ok) {
        setBanner(
          "error",
          `<div><strong>スナップショットの検証に失敗しました。</strong><ul>${validation.issues
            .slice(0, 6)
            .map((issue) => `<li><code>${escapeHtml(issue.path || "root")}</code>: ${escapeHtml(issue.message)}</li>`)
            .join("")}</ul></div>`
        );
        return;
      }
      if (validation.issues.length) {
        setBanner(
          "warn",
          `<div><strong>警告 ${validation.issues.length} 件。</strong> ${escapeHtml(validation.issues[0].message)}</div>`
        );
      } else {
        setBanner(null);
      }

      state.model = MODEL.buildModel(snapshot, baseline);
      state.snapshotMeta = snapshot.meta || {};
      state.baselineMeta = baseline ? baseline.meta || {} : null;
      state.hasBaseline = Boolean(baseline);
      state.lastLoadedAt = new Date();

      if (state.selectedPid !== null && !state.model.byPid.has(state.selectedPid)) {
        state.selectedPid = null;
      }
      if (state.selectedRemoved && !state.model.removed.some((process) => process.key === state.selectedRemoved.key)) {
        state.selectedRemoved = null;
      }
      renderAll();
      if (!opts.quiet) {
        if (state.selectedPid !== null || state.selectedRemoved) revealSelected();
        else scrollToRoot();
      }
    } catch (error) {
      setBanner(
        "error",
        `<div><strong>データを読み込めませんでした。</strong> ${escapeHtml(error.message)}<br>` +
          `<code>${escapeHtml(`data/${state.dataFile}`)}</code> の配置とローカルサーバーを確認してください。</div>`
      );
    } finally {
      state.loading = false;
      els.reload.disabled = false;
      els.reload.textContent = "再読込";
      updateLiveDot();
    }
  }

  /* ---------------- render: summary ---------------- */

  function renderAll() {
    if (!state.model) return;
    renderKpis();
    renderCounts();
    renderMeta();
    renderTree();
    renderAlerts();
    renderDiff();
    renderInspector();
  }

  function renderKpis() {
    const model = state.model;
    els.kpiTotal.innerHTML = `${MODEL.formatNumber(model.processes.length)}<small>procs</small>`;
    els.kpiError.innerHTML = `${MODEL.formatNumber(model.byStatus.error)}<small>error</small>`;
    els.kpiWarning.innerHTML = `${MODEL.formatNumber(model.byStatus.warning)}<small>warn</small>`;
    els.kpiHealthy.innerHTML =
      `${MODEL.formatNumber(model.byStatus.healthy)}<small>healthy</small>` +
      `<span class="delta">/ ${MODEL.formatNumber(model.byStatus.external)} external</span>`;
    if (!state.hasBaseline) {
      els.kpiDiff.innerHTML = `—<small>no baseline</small>`;
    } else {
      els.kpiDiff.innerHTML =
        `<span class="delta plus">+${model.newCount}</span>` +
        `<span class="delta tilde">~${model.changedCount}</span>` +
        `<span class="delta minus">−${model.removedCount}</span>`;
    }
  }

  function renderCounts() {
    const counts = state.model.byStatus;
    els.statusFilters.querySelectorAll("button[data-status]").forEach((button) => {
      const key = button.getAttribute("data-status");
      const target = button.querySelector("[data-count]");
      if (target) {
        target.textContent = key === "all" ? String(state.model.processes.length) : String(counts[key] || 0);
      }
      button.setAttribute("aria-pressed", String(state.filters.status === key));
    });
    els.unsignedCount.textContent = String(state.model.unsigned);
    els.unsignedToggle.setAttribute("aria-pressed", String(state.filters.unsignedOnly));
    const diffTotal = state.model.newCount + state.model.changedCount + state.model.removedCount;
    els.diffCount.textContent = state.hasBaseline ? String(diffTotal) : "—";
    els.diffToggle.disabled = !state.hasBaseline;
    els.diffToggle.title = state.hasBaseline ? "前回スナップショットから変化したプロセスのみ表示" : "ベースラインが未読込です";
    els.diffToggle.setAttribute("aria-pressed", String(state.filters.diffOnly));
  }

  function renderMeta() {
    const meta = state.snapshotMeta || {};
    els.host.textContent = meta.host ? `${meta.host}${meta.os ? ` · ${meta.os}` : ""}` : "unknown host";
    const loaded = state.lastLoadedAt ? `確認 ${state.lastLoadedAt.toLocaleTimeString("ja-JP")}` : "";
    els.metaTime.textContent = meta.generated_at
      ? `snapshot ${relativeTime(meta.generated_at)}${loaded ? ` · ${loaded}` : ""}`
      : loaded || "—";
    els.metaSource.textContent = meta.source ? `${meta.source}` : state.hasBaseline ? "baseline loaded" : "no baseline";
    updateLiveDot();
  }

  function updateLiveDot() {
    const active = state.live && !state.loading;
    els.liveDot.classList.toggle("off", !active);
    els.liveToggle.setAttribute("aria-pressed", String(state.live));
    els.liveToggle.textContent = state.live ? "LIVE" : "PAUSED";
    els.liveToggle.classList.toggle("primary", state.live);
  }

  /* ---------------- render: tree ---------------- */

  function layoutCompact(model, filtered, width) {
    const nodes = [];
    const edges = [];
    const placed = new Map();
    let row = 0;

    function walk(process, depth) {
      if (placed.has(process.pid)) return;
      const nodeWidth = Math.max(154, width - 24 - depth * 18);
      const node = Object.assign({}, process, {
        x: 12 + depth * 18,
        y: 12 + row * 70,
        depth,
        width: nodeWidth,
        height: 62,
      });
      row += 1;
      placed.set(process.pid, node);
      nodes.push(node);
      (model.children.get(process.pid) || []).forEach((child) => {
        if (child.pid !== process.pid && filtered.visible.has(child.pid)) walk(child, depth + 1);
      });
    }

    const roots = model.processes.filter(
      (process) => filtered.visible.has(process.pid) && !placed.has(process.ppid) && !model.byPid.has(process.ppid)
    );
    const connectedRoots = roots.length
      ? roots
      : model.processes.filter((process) => filtered.visible.has(process.pid) && !filtered.visible.has(process.ppid));
    connectedRoots
      .sort((a, b) => a.name.localeCompare(b.name, "en") || a.pid - b.pid)
      .forEach((root) => {
        if (!placed.has(root.pid)) walk(root, 0);
      });
    model.processes.forEach((process) => {
      if (!filtered.visible.has(process.pid) || placed.has(process.pid)) return;
      walk(process, 0);
    });

    placed.forEach((node) => {
      const parent = placed.get(node.ppid);
      if (!parent || parent.pid === node.pid) return;
      const x1 = parent.x + 14;
      const y1 = parent.y + parent.height;
      const x2 = node.x + 8;
      const y2 = node.y + node.height / 2;
      edges.push({ from: parent.pid, to: node.pid, x1, y1, x2, y2 });
    });

    return {
      nodes,
      edges,
      width,
      height: Math.max(12 + row * 70, 200),
      compact: true,
    };
  }

  function renderTree() {
    const model = state.model;
    const filtered = MODEL.filterModel(model, state.filters);
    state.filtered = filtered;
    const compact = window.innerWidth < 900;
    state.compact = compact;
    const layout = compact
      ? layoutCompact(model, filtered, Math.max(260, els.stageScroll.clientWidth - 2))
      : MODEL.layoutForest(model, filtered.visible);

    els.empty.hidden = filtered.matches.size > 0;
    els.stage.hidden = filtered.matches.size === 0;
    if (filtered.matches.size === 0) {
      els.treeSummary.textContent = `0 / ${model.processes.length} プロセス`;
      return;
    }

    els.stage.style.width = `${layout.width}px`;
    els.stage.style.height = `${layout.height}px`;
    els.edges.setAttribute("width", layout.width);
    els.edges.setAttribute("height", layout.height);
    els.edges.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);

    els.edges.innerHTML = layout.edges
      .map((edge) => {
        const child = model.byPid.get(edge.to);
        const bend = Math.max(28, (edge.x2 - edge.x1) / 2);
        const active = state.selectedPid !== null && (edge.from === state.selectedPid || edge.to === state.selectedPid);
        const classes = `edge status-${child ? child.status : "external"}${active ? " active" : ""}`;
        const d = compact
          ? `M ${edge.x1} ${edge.y1} C ${edge.x1} ${edge.y1 + 18}, ${edge.x2 - 10} ${edge.y2}, ${edge.x2} ${edge.y2}`
          : `M ${edge.x1} ${edge.y1} C ${edge.x1 + bend} ${edge.y1}, ${edge.x2 - bend} ${edge.y2}, ${edge.x2} ${edge.y2}`;
        return `<path class="${classes}" d="${d}"></path>`;
      })
      .join("");

    els.nodes.innerHTML = layout.nodes
      .map((process) => {
        const context = filtered.context.has(process.pid);
        const selected = state.selectedPid === process.pid;
        const diff = process.diff
          ? `<span class="node-diff ${process.diff === "changed" ? "changed" : ""}">${
              process.diff === "new" ? "NEW" : "DIFF"
            }</span>`
          : "";
        const score = process.status === "error" || process.status === "warning"
          ? `<span class="node-score">${process.score}</span>`
          : "";
        const net = process.network && process.network.length
          ? `<span class="node-net" title="ネットワーク接続 ${process.network.length} 件">NET ${process.network.length}</span>`
          : "";
        const cpuClass = process.cpu >= 80 ? "bad" : process.cpu >= 40 ? "warn" : "";
        const memClass = process.memory >= 15 ? "warn" : "";
        return (
          `<button type="button" class="node status-${process.status}${context ? " context" : ""}${
            selected ? " selected" : ""
          }" data-pid="${process.pid}" style="left:${process.x}px;top:${process.y}px;width:${process.width}px;height:${process.height}px" ` +
          `title="${escapeHtml(process.path)}\nPID ${process.pid} · ${escapeHtml(statusLabel(process.status))}" ` +
          `aria-label="${escapeHtml(process.name)} PID ${process.pid} ${escapeHtml(statusLabel(process.status))}" ` +
          `aria-pressed="${selected}">` +
          diff +
          `<span class="node-top"><span class="node-name">${escapeHtml(process.name)}</span>${score}</span>` +
          `<span class="node-meta"><span>PID ${process.pid}</span><span class="user">${escapeHtml(process.user)}</span></span>` +
          `<span class="node-metrics">` +
          `<span>CPU <b class="${cpuClass}">${formatCpu(process.cpu)}</b></span>` +
          `<span>MEM <b class="${memClass}">${formatMemory(process.memory)}</b></span>` +
          `</span>` +
          net +
          `</button>`
        );
      })
      .join("");

    const hint = document.getElementById("stage-hint-text");
    if (hint) hint.textContent = compact ? "親子をインデントで表示。" : "親から子へ左→右に配置。";
    const filterNote = describeFilters();
    els.treeSummary.textContent =
      `${filtered.matches.size} / ${model.processes.length} プロセス` +
      (filtered.context.size ? ` · 文脈 ${filtered.context.size}` : "") +
      (filterNote ? ` · ${filterNote}` : "");
  }

  function describeFilters() {
    const parts = [];
    if (state.filters.status !== "all") parts.push(statusLabel(state.filters.status));
    if (state.filters.query) parts.push(`"${state.filters.query}"`);
    if (state.filters.unsignedOnly) parts.push("未署名");
    if (state.filters.diffOnly) parts.push("差分");
    return parts.join(" / ");
  }

  function scrollToRoot() {
    const root = state.model && state.model.roots[0];
    if (!root) return;
    const node = els.nodes.querySelector(`[data-pid="${root.pid}"]`);
    if (!node) return;
    const box = els.stageScroll;
    box.scrollLeft = 0;
    box.scrollTop = Math.max(0, node.offsetTop - box.clientHeight / 2 + node.offsetHeight / 2);
  }

  function revealSelected() {
    if (state.selectedPid === null) return;
    const node = els.nodes.querySelector(`[data-pid="${state.selectedPid}"]`);
    if (!node) return;
    const box = els.stageScroll;
    const left = node.offsetLeft;
    const top = node.offsetTop;
    const right = left + node.offsetWidth;
    const bottom = top + node.offsetHeight;
    if (left < box.scrollLeft || right > box.scrollLeft + box.clientWidth - 20) {
      box.scrollLeft = Math.max(0, left - 40);
    }
    if (top < box.scrollTop || bottom > box.scrollTop + box.clientHeight - 20) {
      box.scrollTop = Math.max(0, top - 40);
    }
  }

  /* ---------------- render: alerts ---------------- */

  function renderAlerts() {
    const alerts = state.model.alerts;
    els.alertCount.textContent = `${alerts.length} open`;
    if (!alerts.length) {
      els.alerts.innerHTML = '<p class="alert-empty">警告・エラーはありません。</p>';
      return;
    }
    els.alerts.innerHTML = alerts
      .map((process) => {
        const selected = state.selectedPid === process.pid;
        return (
          `<button type="button" class="alert-row ${process.status}${selected ? " selected" : ""}" data-alert-pid="${process.pid}">` +
          `<span class="dot" aria-hidden="true"></span>` +
          `<span><span class="alert-name">${escapeHtml(process.name)}</span>` +
          `<span class="alert-reason">${escapeHtml(process.reasons[0] || statusLabel(process.status))}</span></span>` +
          `<span class="alert-score">${process.score}</span>` +
          `</button>`
        );
      })
      .join("");
  }

  /* ---------------- render: diff ---------------- */

  function renderDiff() {
    if (!state.hasBaseline) {
      els.diffMeta.textContent = "no baseline";
      els.diffBody.innerHTML =
        '<p class="diff-empty">ベースライン未読込。前回スナップショットを <code>process_baseline.json</code> に置くと差分を表示します。</p>';
      return;
    }
    const model = state.model;
    els.diffMeta.textContent = state.baselineMeta && state.baselineMeta.generated_at
      ? `基準 ${relativeTime(state.baselineMeta.generated_at)}`
      : "baseline";
    const rows = [
      { kind: "plus", label: "NEW", items: model.processes.filter((process) => process.diff === "new") },
      { kind: "tilde", label: "CHG", items: model.processes.filter((process) => process.diff === "changed") },
      { kind: "minus", label: "DEL", items: model.removed },
    ];
    els.diffBody.innerHTML =
      rows
        .map((row) => {
          const items = row.items.length
            ? row.items
                .map((process) => {
                  const selected =
                    row.kind === "minus"
                      ? Boolean(state.selectedRemoved && state.selectedRemoved.key === process.key)
                      : state.selectedPid === process.pid;
                  const action = row.kind === "minus" ? "data-removed-key" : "data-diff-pid";
                  return (
                    `<button type="button" class="diff-item${selected ? " selected" : ""}${row.kind === "minus" ? " removed" : ""}" ` +
                    `${action}="${escapeHtml(action === "data-removed-key" ? process.key : process.pid)}">` +
                    `${escapeHtml(process.name)}</button>`
                  );
                })
                .join("")
            : `<span class="diff-empty">なし</span>`;
          return (
            `<div class="diff-row"><span class="diff-label ${row.kind}">${row.label}</span>` +
            `<span class="diff-items">${items}</span></div>`
          );
        })
        .join("") +
      '<p class="diff-note">実行パスをキーに比較。CPU ±10pt / メモリ ±3pt / 署名の変化を「変更」とします。</p>';
  }

  /* ---------------- render: inspector ---------------- */

  function sparkline(history, key, color) {
    if (!Array.isArray(history) || history.length === 0) {
      return '<p class="diff-empty">履歴がありません（コレクタを <code>--watch 2</code> 以上で実行）。</p>';
    }
    const width = 320;
    const height = 44;
    const pad = 5;
    const values = history.map((point) => Number(point[key]) || 0);
    const max = Math.max(0.1, ...values);
    const min = 0;
    const span = max - min || 1;
    const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
    const points = values.map((value, index) => {
      const x = pad + step * index + (values.length === 1 ? (width - pad * 2) / 2 : 0);
      const y = height - pad - ((value - min) / span) * (height - pad * 2);
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });
    const line = points.map((point) => point.join(",")).join(" ");
    const area = `${pad},${height - pad} ${line} ${points[points.length - 1][0]},${height - pad}`;
    const last = points[points.length - 1];
    const unit = key === "cpu" ? "%" : "%";
    const label = key === "cpu" ? "CPU" : "MEM";
    return (
      `<div class="spark-label"><span>${label} ${values[values.length - 1].toFixed(1)}${unit}</span>` +
      `<span>${values.length} samples · max ${max.toFixed(1)}${unit}</span></div>` +
      `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" ` +
      `aria-label="${label} 推移">` +
      `<path d="M ${area} Z" fill="${color}" opacity="0.12"></path>` +
      `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="1.6" ` +
      `vector-effect="non-scaling-stroke" stroke-linejoin="round"></polyline>` +
      `<circle cx="${last[0]}" cy="${last[1]}" r="2.2" fill="${color}"></circle>` +
      `</svg>`
    );
  }

  function renderInspector() {
    const process = state.selectedPid !== null
      ? state.model.byPid.get(state.selectedPid)
      : state.selectedRemoved;

    if (!process) {
      els.inspectorStatus.textContent = "未選択";
      els.inspectorStatus.className = "pill";
      const picks = state.model.alerts.slice(0, 3);
      els.inspectorBody.innerHTML =
        '<div class="inspector-empty"><b>アラートから確認を始める</b>ノードを選ぶと、署名・CPU / メモリ推移・ネットワーク接続を表示します。</div>' +
        (picks.length
          ? '<div class="alert-list" style="max-height:none;padding:0 12px 12px">' +
            picks
              .map(
                (process) =>
                  `<button type="button" class="alert-row ${process.status}" data-inspector-pid="${process.pid}">` +
                  `<span class="dot" aria-hidden="true"></span>` +
                  `<span><span class="alert-name">${escapeHtml(process.name)}</span>` +
                  `<span class="alert-reason">${escapeHtml(process.reasons[0] || statusLabel(process.status))}</span></span>` +
                  `<span class="alert-score">${process.score}</span></button>`
              )
              .join("") +
            "</div>"
          : "");
      return;
    }

    const removed = process.status === "removed";
    const visible = state.filtered && state.filtered.visible.has(process.pid);
    els.inspectorStatus.textContent = statusLabel(process.status).toUpperCase();
    els.inspectorStatus.className = `pill badge ${process.status}`;

    const badges =
      `<span class="badge ${process.status}">${escapeHtml(statusLabel(process.status))}</span>` +
      (process.diff
        ? `<span class="badge diff">${process.diff === "new" ? "NEW" : process.diff === "changed" ? "CHANGED" : "REMOVED"}</span>`
        : "");

    const reasons = [];
    if (process.reasons && process.reasons.length) {
      process.reasons.forEach((reason) => reasons.push(`<li>${escapeHtml(reason)}</li>`));
    } else {
      reasons.push('<li class="ok">既知のシグネチャと実行パスの範囲。追加の警告条件はありません。</li>');
    }
    if (removed) reasons.push('<li>前回スナップショットにのみ存在（現在は終了済み）</li>');
    if (!removed && state.filtered && !visible) {
      reasons.push('<li>現在のフィルタではツリーに表示されていません</li>');
    }

    const history = process.history || [];
    const signatureLabel = process.signed === false
      ? "未署名"
      : process.adhoc
        ? "アドホック署名"
        : process.signed === true
          ? "署名済み"
          : "未確認";

    const networkRows = (process.network || []).length
      ? `<table class="net-table"><thead><tr><th>Proto</th><th>Local</th><th>Remote</th><th>State</th></tr></thead><tbody>` +
        process.network
          .map(
            (entry) =>
              `<tr><td>${escapeHtml(entry.proto || "TCP")}</td><td>${escapeHtml(entry.local || "—")}</td>` +
              `<td>${escapeHtml(entry.remote || "—")}</td><td class="state">${escapeHtml(entry.state || "—")}</td></tr>`
          )
          .join("") +
        `</tbody></table>`
      : '<p class="diff-empty">外部接続はありません。</p>';

    const lineage = [];
    const seen = new Set();
    let ancestor = process;
    while (ancestor && !seen.has(ancestor.pid)) {
      seen.add(ancestor.pid);
      lineage.unshift(ancestor);
      ancestor = state.model.byPid.get(ancestor.ppid);
    }
    const lineageHtml = lineage.length > 1
      ? `<div class="lineage"><span class="label">系譜</span>${lineage
          .map(
            (item) =>
              `<button type="button" data-lineage-pid="${item.pid}" title="PID ${item.pid}">${escapeHtml(item.name)}</button>`
          )
          .join('<span class="sep">›</span>')}</div>`
      : "";

    els.inspectorBody.innerHTML =
      `<div class="insp-head"><div class="insp-name">${escapeHtml(process.name)}</div><div>${badges}</div></div>` +
      `<div class="insp-path">${escapeHtml(process.path)}</div>` +
      lineageHtml +
      `<ul class="reasons">${reasons.join("")}</ul>` +
      `<dl class="facts">` +
      `<div class="fact"><dt>PID</dt><dd>${process.pid}</dd></div>` +
      `<div class="fact"><dt>PPID</dt><dd>${process.ppid}</dd></div>` +
      `<div class="fact"><dt>User</dt><dd>${escapeHtml(process.user)}</dd></div>` +
      `<div class="fact"><dt>State</dt><dd>${escapeHtml(process.state)}</dd></div>` +
      `<div class="fact"><dt>CPU</dt><dd>${formatCpu(process.cpu)}</dd></div>` +
      `<div class="fact"><dt>Memory</dt><dd>${formatMemory(process.memory)}</dd></div>` +
      `<div class="fact"><dt>RSS</dt><dd>${MODEL.formatBytes(process.rss)}</dd></div>` +
      `<div class="fact"><dt>Score</dt><dd>${process.score}</dd></div>` +
      `<div class="fact"><dt>Network</dt><dd>${(process.network || []).length}</dd></div>` +
      `</dl>` +
      `<div class="insp-section"><h3>History <span class="tag">${history.length} samples</span></h3>` +
      sparkline(history, "cpu", "#f59e0b") +
      sparkline(history, "memory", "#8ef0cf") +
      `</div>` +
      `<div class="insp-section"><h3>Signature</h3><dl class="sql-grid">` +
      `<dt>Status</dt><dd>${escapeHtml(signatureLabel)}</dd>` +
      `<dt>Team ID</dt><dd>${escapeHtml(process.teamId || "—")}</dd>` +
      `<dt>Authority</dt><dd>${escapeHtml(process.signature || "—")}</dd>` +
      `<dt>Executable</dt><dd>${escapeHtml(process.path)}</dd>` +
      `</dl></div>` +
      `<div class="insp-section"><h3>Network <span class="tag">${(process.network || []).length} endpoints</span></h3>${networkRows}</div>` +
      `<div class="insp-section"><h3>Command</h3><div class="cmd">${escapeHtml(process.command)}</div></div>`;
  }

  /* ---------------- interaction ---------------- */

  function selectProcess(pid, options) {
    if (pid === null || pid === undefined) return;
    state.selectedPid = Number(pid);
    state.selectedRemoved = null;
    renderTree();
    renderAlerts();
    renderDiff();
    renderInspector();
    syncQuery();
    if (!options || options.reveal !== false) revealSelected();
    if (options && options.focus) {
      const node = els.nodes.querySelector(`[data-pid="${state.selectedPid}"]`);
      if (node) node.focus({ preventScroll: true });
    }
  }

  function selectRemoved(key) {
    const process = state.model.removed.find((item) => item.key === key);
    if (!process) return;
    state.selectedRemoved = process;
    state.selectedPid = null;
    renderTree();
    renderAlerts();
    renderDiff();
    renderInspector();
    syncQuery();
  }

  function clearSelection() {
    state.selectedPid = null;
    state.selectedRemoved = null;
    renderTree();
    renderAlerts();
    renderDiff();
    renderInspector();
    syncQuery();
  }

  function applyFilters() {
    renderTree();
    renderInspector();
    renderCounts();
    syncQuery();
  }

  function resetFilters() {
    state.filters = { status: "all", query: "", unsignedOnly: false, diffOnly: false };
    els.search.value = "";
    applyFilters();
    els.search.focus();
  }

  function startLive() {
    stopLive();
    if (!state.live) return;
    state.timer = window.setInterval(() => load({ quiet: true }), LIVE_INTERVAL);
    updateLiveDot();
  }

  function stopLive() {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  function bind() {
    els.statusFilters.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-status]");
      if (!button) return;
      state.filters.status = button.getAttribute("data-status");
      state.filters.query = els.search.value.trim();
      applyFilters();
    });

    els.search.addEventListener("input", () => {
      state.filters.query = els.search.value.trim();
      applyFilters();
    });
    els.search.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        els.search.value = "";
        state.filters.query = "";
        applyFilters();
        els.search.blur();
      }
    });

    els.unsignedToggle.addEventListener("click", () => {
      state.filters.unsignedOnly = !state.filters.unsignedOnly;
      applyFilters();
    });

    els.diffToggle.addEventListener("click", () => {
      state.filters.diffOnly = !state.filters.diffOnly;
      applyFilters();
    });

    els.resetFilters.addEventListener("click", resetFilters);

    els.nodes.addEventListener("click", (event) => {
      const node = event.target.closest("button[data-pid]");
      if (!node) return;
      selectProcess(node.getAttribute("data-pid"), { focus: event.detail === 0 });
    });

    els.alerts.addEventListener("click", (event) => {
      const row = event.target.closest("button[data-alert-pid]");
      if (!row) return;
      selectProcess(row.getAttribute("data-alert-pid"));
    });

    els.inspectorBody.addEventListener("click", (event) => {
      const pick = event.target.closest("button[data-inspector-pid]");
      if (pick) {
        selectProcess(pick.getAttribute("data-inspector-pid"));
        return;
      }
      const lineage = event.target.closest("button[data-lineage-pid]");
      if (lineage) selectProcess(lineage.getAttribute("data-lineage-pid"));
    });

    els.diffBody.addEventListener("click", (event) => {
      const removed = event.target.closest("button[data-removed-key]");
      if (removed) {
        selectRemoved(removed.getAttribute("data-removed-key"));
        return;
      }
      const diffed = event.target.closest("button[data-diff-pid]");
      if (diffed) selectProcess(diffed.getAttribute("data-diff-pid"));
    });

    els.reload.addEventListener("click", () => load());

    els.liveToggle.addEventListener("click", () => {
      state.live = !state.live;
      if (state.live) {
        startLive();
        load({ quiet: true });
      } else {
        stopLive();
      }
      updateLiveDot();
      syncQuery();
    });

    document.addEventListener("keydown", (event) => {
      const target = event.target;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        els.search.focus();
        els.search.select();
      } else if (event.key === "Escape" && !typing) {
        clearSelection();
      } else if (event.key.toLowerCase() === "r" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        load();
      }
    });

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!state.model) return;
        const compact = window.innerWidth < 900;
        if (compact === state.compact) return;
        renderTree();
        if (state.selectedPid !== null) revealSelected();
        else scrollToRoot();
      }, 160);
    });

    window.addEventListener("popstate", () => {
      const parsed = MODEL.parseQuery(window.location.search);
      state.filters = {
        status: parsed.status,
        query: parsed.query,
        unsignedOnly: parsed.unsignedOnly,
        diffOnly: parsed.diffOnly,
      };
      state.selectedPid = parsed.pid;
      state.selectedRemoved = null;
      state.live = parsed.live;
      els.search.value = parsed.query;
      if (parsed.data !== state.dataFile || parsed.baseline !== state.baselineFile) {
        state.dataFile = parsed.data;
        state.baselineFile = parsed.baseline;
        load();
      } else {
        state.model && renderAll();
      }
      state.live ? startLive() : stopLive();
    });
  }

  /* ---------------- boot ---------------- */

  function boot() {
    bind();
    els.search.value = state.filters.query;
    updateLiveDot();
    load().then(() => {
      if (state.live) startLive();
    });
  }

  boot();
})();
