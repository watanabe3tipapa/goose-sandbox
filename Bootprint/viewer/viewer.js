/*
 * Bootprint viewer
 *
 * Fetches a launchd snapshot (and optional baseline), classifies the jobs
 * with BootprintModel, then renders the four-lane persistence map, alerts,
 * baseline diff, inspector and 24h schedule. All state lives in the URL so a
 * view can be shared.
 */
(function () {
  "use strict";

  const MODEL = window.BootprintModel;
  if (!MODEL) {
    document.body.innerHTML = '<p style="padding:24px;color:#fecaca">model.js を読み込めませんでした。</p>';
    return;
  }

  const LIVE_INTERVAL = 30000;

  const els = {
    banner: document.getElementById("banner"),
    search: document.getElementById("search"),
    statusFilters: document.getElementById("status-filters"),
    triggerFilters: document.getElementById("trigger-filters"),
    unsignedToggle: document.getElementById("unsigned-toggle"),
    unsignedCount: document.getElementById("unsigned-count"),
    diffToggle: document.getElementById("diff-toggle"),
    diffCount: document.getElementById("diff-count"),
    appleToggle: document.getElementById("apple-toggle"),
    appleCount: document.getElementById("apple-count"),
    resetFilters: document.getElementById("reset-filters"),
    kpiJobs: document.getElementById("kpi-jobs"),
    kpiThird: document.getElementById("kpi-third"),
    kpiUnsigned: document.getElementById("kpi-unsigned"),
    kpiRunAtLoad: document.getElementById("kpi-runatload"),
    kpiNew: document.getElementById("kpi-new"),
    kpiChanged: document.getElementById("kpi-changed"),
    kpiRemoved: document.getElementById("kpi-removed"),
    host: document.getElementById("host"),
    metaSource: document.getElementById("meta-source"),
    metaTime: document.getElementById("meta-time"),
    liveDot: document.getElementById("live-dot"),
    liveToggle: document.getElementById("live-toggle"),
    reload: document.getElementById("reload"),
    mapSummary: document.getElementById("map-summary"),
    lanes: document.getElementById("lanes"),
    empty: document.getElementById("empty"),
    inspectorSummary: document.getElementById("inspector-summary"),
    inspector: document.getElementById("inspector"),
    alertCount: document.getElementById("alert-count"),
    alerts: document.getElementById("alerts"),
    diffMeta: document.getElementById("diff-meta"),
    diffBody: document.getElementById("diff-body"),
    scheduleCount: document.getElementById("schedule-count"),
    schedule: document.getElementById("schedule"),
  };

  const STATUS_META = {
    all: { label: "All", color: "var(--accent)" },
    error: { label: "Error", color: "var(--error)" },
    warning: { label: "Warning", color: "var(--warning)" },
    healthy: { label: "Healthy", color: "var(--healthy)" },
    external: { label: "External", color: "var(--external)" },
  };

  const TRIGGER_META = [
    { id: "all", label: "すべて" },
    { id: "boot", label: "起動時" },
    { id: "keepalive", label: "常駐" },
    { id: "calendar", label: "定刻" },
    { id: "interval", label: "間隔" },
    { id: "watch", label: "監視" },
  ];

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
      lane: initial.lane,
      trigger: initial.trigger,
      showApple: initial.showApple,
    },
    selectedKey: initial.job,
    selectedRemoved: null,
    vendorExpanded: new Map(),
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

  function relativeTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso || "—";
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch (error) {
      return iso;
    }
  }

  function statusLabel(status) {
    return MODEL.STATUS_LABEL[status] || status;
  }

  function signatureLabel(job) {
    if (job.signed === false) return "未署名";
    if (job.adhoc) return "アドホック署名";
    if (job.signed === true) return job.team_id ? `署名済み · ${job.team_id}` : "署名済み";
    return "未確認";
  }

  function setBanner(kind, html) {
    if (!kind) {
      els.banner.hidden = true;
      els.banner.className = "";
      els.banner.innerHTML = "";
      return;
    }
    els.banner.hidden = false;
    els.banner.className = kind === "warn" ? "banner warn" : "banner";
    els.banner.innerHTML = html;
  }

  function syncQuery() {
    const query = MODEL.buildQuery({
      job: state.selectedRemoved ? state.selectedRemoved.key : state.selectedKey,
      status: state.filters.status,
      query: state.filters.query,
      unsignedOnly: state.filters.unsignedOnly,
      diffOnly: state.filters.diffOnly,
      showApple: state.filters.showApple,
      lane: state.filters.lane,
      trigger: state.filters.trigger,
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

  function describeFilters() {
    const parts = [];
    if (state.filters.status !== "all") parts.push(statusLabel(state.filters.status));
    if (state.filters.lane !== "all") {
      const lane = MODEL.LANES.find((item) => item.id === state.filters.lane);
      parts.push(lane ? lane.label : state.filters.lane);
    }
    if (state.filters.trigger !== "all") {
      const trigger = TRIGGER_META.find((item) => item.id === state.filters.trigger);
      parts.push(trigger ? trigger.label : state.filters.trigger);
    }
    if (state.filters.query) parts.push(`"${state.filters.query}"`);
    if (state.filters.unsignedOnly) parts.push("未署名");
    if (state.filters.diffOnly) parts.push("差分");
    return parts.join(" / ");
  }

  /* ---------------- loading ---------------- */

  async function fetchJson(file) {
    const response = await fetch(`data/${encodeURIComponent(file)}`, { cache: "no-store" });
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
          " <code>http://localhost:8000/Bootprint/viewer/</code> を開きます。</div>"
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
      const snapshot = await fetchJson(state.dataFile);
      let baseline = null;
      if (state.baselineFile) {
        try {
          baseline = await fetchJson(state.baselineFile);
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
      if (!state.hasBaseline && state.filters.diffOnly) {
        state.filters.diffOnly = false;
        syncQuery();
      }
      state.lastLoadedAt = new Date();

      resolveSelection();
      renderAll();
      if (!opts.quiet && (state.selectedKey || state.selectedRemoved)) revealSelected();
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

  function resolveSelection() {
    const model = state.model;
    if (state.selectedKey && model.byKey.has(state.selectedKey)) {
      state.selectedRemoved = null;
      return;
    }
    if (state.selectedKey) {
      const removed = model.removed.find((job) => job.key === state.selectedKey);
      if (removed) {
        state.selectedRemoved = removed;
        return;
      }
    }
    state.selectedKey = null;
    state.selectedRemoved = null;
  }

  /* ---------------- render: summary ---------------- */

  function renderAll() {
    if (!state.model) return;
    renderKpis();
    renderCounts();
    renderMeta();
    renderMap();
    renderAlerts();
    renderDiff();
    renderInspector();
    renderSchedule();
  }

  function renderKpis() {
    const model = state.model;
    els.kpiJobs.textContent = String(model.jobs.length);
    els.kpiThird.textContent = String(model.thirdParty);
    els.kpiUnsigned.textContent = String(model.unsigned);
    els.kpiRunAtLoad.textContent = String(model.runAtLoad);
    if (!state.hasBaseline) {
      els.kpiNew.textContent = "+—";
      els.kpiChanged.textContent = "~—";
      els.kpiRemoved.textContent = "−—";
    } else {
      els.kpiNew.textContent = `+${model.newCount}`;
      els.kpiChanged.textContent = `~${model.changedCount}`;
      els.kpiRemoved.textContent = `−${model.removedCount}`;
    }
  }

  function triggerCounts(model) {
    const counts = { boot: 0, keepalive: 0, calendar: 0, interval: 0, watch: 0 };
    model.jobs.forEach((job) => {
      const triggers = job.triggers;
      if (triggers.run_at_load) counts.boot += 1;
      if (triggers.keep_alive) counts.keepalive += 1;
      if (triggers.start_calendar.length > 0) counts.calendar += 1;
      if (triggers.start_interval !== null) counts.interval += 1;
      if (triggers.watch_paths.length > 0) counts.watch += 1;
    });
    return counts;
  }

  function renderCounts() {
    const model = state.model;
    const counts = { all: model.jobs.length };
    MODEL.STATUSES.forEach((status) => { counts[status] = model.byStatus[status] || 0; });

    els.statusFilters.innerHTML = Object.keys(STATUS_META)
      .map((status) => {
        const meta = STATUS_META[status];
        return (
          `<button type="button" data-status="${status}" aria-pressed="${state.filters.status === status}" ` +
          `style="--seg-color:${meta.color}">` +
          `<span class="dot" aria-hidden="true"></span>${meta.label}` +
          `<span class="count" data-count>${counts[status]}</span></button>`
        );
      })
      .join("");

    const triggers = triggerCounts(model);
    els.triggerFilters.innerHTML = TRIGGER_META.map((trigger) => {
      const count = trigger.id === "all" ? model.jobs.length : triggers[trigger.id] || 0;
      return (
        `<button type="button" data-trigger="${trigger.id}" aria-pressed="${state.filters.trigger === trigger.id}">` +
        `${trigger.label}<span class="count" data-count>${count}</span></button>`
      );
    }).join("");

    const diffTotal = model.newCount + model.changedCount + model.removedCount;
    els.unsignedCount.textContent = String(model.unsigned);
    els.unsignedToggle.setAttribute("aria-pressed", String(state.filters.unsignedOnly));
    els.diffCount.textContent = state.hasBaseline ? String(diffTotal) : "—";
    els.diffToggle.disabled = !state.hasBaseline;
    els.diffToggle.title = state.hasBaseline ? "前回スナップショットから変化したジョブのみ表示" : "ベースライン未読込です";
    els.diffToggle.setAttribute("aria-pressed", String(state.filters.diffOnly));
    els.appleCount.textContent = String(model.jobs.filter((job) => MODEL.isAppleJob(job)).length);
    els.appleToggle.setAttribute("aria-pressed", String(state.filters.showApple));
  }

  function renderMeta() {
    const meta = state.snapshotMeta || {};
    els.host.textContent = meta.host || "unknown host";
    els.metaSource.textContent = `${meta.source || "snapshot"}${meta.os ? ` · ${meta.os}` : ""}`;
    const loaded = state.lastLoadedAt ? `読込 ${state.lastLoadedAt.toLocaleTimeString("ja-JP")}` : "";
    els.metaTime.textContent = meta.generated_at
      ? `snapshot ${relativeTime(meta.generated_at)}${loaded ? ` · ${loaded}` : ""}`
      : loaded || "—";
    updateLiveDot();
  }

  function updateLiveDot() {
    const active = state.live && !state.loading;
    els.liveDot.classList.toggle("off", !active);
    els.liveToggle.setAttribute("aria-pressed", String(state.live));
    els.liveToggle.textContent = state.live ? "LIVE" : "PAUSED";
    els.liveToggle.classList.toggle("primary", false);
  }

  /* ---------------- render: persistence map ---------------- */

  function vendorKey(laneId, name) {
    return `${laneId}:${name}`;
  }

  function vendorOpen(lane, vendor) {
    const key = vendorKey(lane.id, vendor.name);
    if (state.vendorExpanded.has(key)) return state.vendorExpanded.get(key);
    return !vendor.apple || state.filters.showApple;
  }

  function jobCard(job) {
    const selected = state.selectedKey === job.key;
    const score = job.status === "error" || job.status === "warning"
      ? `<span class="job-score">${job.score}</span>`
      : "";
    const tags = MODEL.toggleLabels(job)
      .map((tag) => `<span class="tag ${tag.kind}">${escapeHtml(tag.label)}</span>`)
      .join("");
    const diff = job.diff
      ? `<span class="diff-badge ${job.diff}">${job.diff === "new" ? "NEW" : "DIFF"}</span>`
      : "";
    const title = `${job.label}\n${job.plist}\n${MODEL.describeTrigger(job)}`;
    return (
      `<button type="button" class="job-card status-${job.status}${selected ? " selected" : ""}" ` +
      `data-key="${escapeHtml(job.key)}" title="${escapeHtml(title)}" ` +
      `aria-label="${escapeHtml(`${job.label} ${statusLabel(job.status)}`)}" aria-pressed="${selected}">` +
      diff +
      `<span class="job-top"><span class="job-label">${escapeHtml(job.label)}</span>${score}</span>` +
      `<span class="job-sub"><span class="program">${escapeHtml(job.program || "（プログラム未指定）")}</span></span>` +
      `<span class="job-tags">${tags}</span>` +
      `</button>`
    );
  }

  function renderMap() {
    const model = state.model;
    const filtered = MODEL.filterModel(model, state.filters);
    state.filtered = filtered;

    const summary = [`${filtered.matches.size} / ${model.jobs.length} jobs`];
    const filterNote = describeFilters();
    if (filterNote) summary.push(filterNote);
    els.mapSummary.textContent = summary.join(" · ");
    els.empty.hidden = filtered.matches.size > 0;

    els.lanes.innerHTML = model.lanes
      .map((lane) => {
        const jobs = lane.jobs.filter((job) => filtered.matches.has(job.key));
        const laneActive = state.filters.lane === lane.id;
        const alertText = [
          lane.error ? `${lane.error} error` : "",
          lane.warning ? `${lane.warning} warn` : "",
        ].filter(Boolean).join(" · ");
        const alert = alertText
          ? `<span class="lane-alert${lane.error ? "" : " warn"}">${alertText}</span>`
          : "";

        let body;
        if (jobs.length === 0) {
          body = '<div class="empty-state">該当なし</div>';
        } else {
          body = lane.vendors
            .map((vendor) => {
              const vendorJobs = vendor.jobs.filter((job) => filtered.matches.has(job.key));
              if (vendorJobs.length === 0) return "";
              const open = vendorOpen(lane, vendor);
              const dots = [
                ...Array(Math.min(3, vendor.error)).fill('<i class="e"></i>'),
                ...Array(Math.min(3, vendor.warning)).fill('<i class="w"></i>'),
              ].join("");
              return (
                `<div class="vendor${open ? "" : " collapsed"}" data-vendor="${escapeHtml(vendorKey(lane.id, vendor.name))}">` +
                `<button type="button" class="vendor-head" data-vendor-toggle="${escapeHtml(vendorKey(lane.id, vendor.name))}" aria-expanded="${open}">` +
                `<span class="chev" aria-hidden="true"></span>` +
                `<span class="name">${escapeHtml(vendor.name)}</span>` +
                `<span class="n">${vendorJobs.length}</span>` +
                `<span class="dots" aria-hidden="true">${dots}</span>` +
                `</button>` +
                `<div class="vendor-body">${vendorJobs.map(jobCard).join("")}</div>` +
                `</div>`
              );
            })
            .join("");
        }

        return (
          `<section class="lane" data-lane-panel="${lane.id}">` +
          `<button type="button" class="lane-head" data-lane="${lane.id}" aria-pressed="${laneActive}" ` +
          `title="${escapeHtml(`${lane.note} / クリックでこのレーンに絞り込み`)}">` +
          `<span class="lane-name">${escapeHtml(lane.label)}</span>` +
          `<span class="lane-path">${escapeHtml(lane.path)}</span>` +
          `</button>` +
          `<div class="lane-meta">` +
          `<span class="lane-count"><b>${jobs.length}</b> / ${lane.jobs.length}</span>${alert}` +
          `</div>` +
          `<div class="lane-scroll">${body}</div>` +
          `</section>`
        );
      })
      .join("");
  }

  /* ---------------- render: alerts ---------------- */

  function renderAlerts() {
    const alerts = state.model.alerts;
    els.alertCount.textContent = `${alerts.length} open`;
    if (!alerts.length) {
      els.alerts.innerHTML = '<p class="rail-empty">警告・エラーはありません。</p>';
      return;
    }
    els.alerts.innerHTML = alerts
      .map((job) => {
        const selected = state.selectedKey === job.key;
        return (
          `<button type="button" class="alert-row${selected ? " selected" : ""}" data-alert-key="${escapeHtml(job.key)}" ` +
          `title="${escapeHtml(job.reasons.concat(MODEL.describeTrigger(job)).join(" / "))}">` +
          `<span class="dot ${job.status}" aria-hidden="true"></span>` +
          `<span class="label">${escapeHtml(job.label)}</span>` +
          `<span class="score">${job.score}</span>` +
          `</button>`
        );
      })
      .join("");
  }

  /* ---------------- render: baseline diff ---------------- */

  function renderDiff() {
    if (!state.hasBaseline) {
      els.diffMeta.textContent = "no baseline";
      els.diffBody.innerHTML =
        '<p class="rail-empty">ベースライン未読込。前回スナップショットを <code>jobs_baseline.json</code> に置くと差分を表示します。</p>';
      return;
    }
    const model = state.model;
    els.diffMeta.textContent = state.baselineMeta && state.baselineMeta.generated_at
      ? `基準 ${relativeTime(state.baselineMeta.generated_at)}`
      : "baseline";
    const rows = [
      { kind: "new", label: "NEW", items: model.jobs.filter((job) => job.diff === "new") },
      { kind: "changed", label: "CHG", items: model.jobs.filter((job) => job.diff === "changed") },
      { kind: "removed", label: "DEL", items: model.removed },
    ];
    els.diffBody.innerHTML = rows
      .map((row) => {
        const items = row.items.length
          ? row.items
              .map((job) => {
                const selected = row.kind === "removed"
                  ? Boolean(state.selectedRemoved && state.selectedRemoved.key === job.key)
                  : state.selectedKey === job.key;
                const action = row.kind === "removed" ? "data-removed-key" : "data-diff-key";
                const value = row.kind === "removed" ? job.key : job.key;
                return (
                  `<button type="button" class="diff-row${selected ? " selected" : ""}" ${action}="${escapeHtml(value)}">` +
                  `<span class="kind ${row.kind}">${row.label}</span>` +
                  `<span class="label">${escapeHtml(job.label)}</span>` +
                  `<span class="where">${escapeHtml(job.lane)}</span>` +
                  `</button>`
                );
              })
              .join("")
          : '<p class="rail-empty">なし</p>';
        return items;
      })
      .join("");
  }

  /* ---------------- render: inspector ---------------- */

  function selectedJob() {
    if (state.selectedRemoved) return state.selectedRemoved;
    if (state.selectedKey && state.model) return state.model.byKey.get(state.selectedKey) || null;
    return null;
  }

  function renderInspector() {
    const job = selectedJob();
    if (!job) {
      els.inspectorSummary.textContent = "未選択";
      const picks = state.model.alerts.slice(0, 3);
      els.inspector.innerHTML =
        '<div class="inspector-empty"><b>アラートから確認を始める</b>ジョブカードを選ぶと、plist・実行パス・トリガー・署名を表示します。</div>' +
        (picks.length
          ? '<div class="rail-list" style="max-height:none;padding:0 8px 10px">' +
            picks
              .map(
                (alert) =>
                  `<button type="button" class="alert-row" data-inspector-key="${escapeHtml(alert.key)}">` +
                  `<span class="dot ${alert.status}" aria-hidden="true"></span>` +
                  `<span class="label">${escapeHtml(alert.label)}</span>` +
                  `<span class="score">${alert.score}</span></button>`
              )
              .join("") +
            "</div>"
          : "");
      return;
    }

    els.inspectorSummary.textContent = `${statusLabel(job.status)} · ${job.lane}`;

    let reasons = job.reasons && job.reasons.length
      ? job.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")
      : '<li>既知の警告条件には該当しません。</li>';
    if (job.status === "removed") {
      reasons += "<li>現在のスナップショットには存在しません。</li>";
    }
    if (state.filtered && !state.filtered.matches.has(job.key) && job.status !== "removed") {
      reasons += "<li>現在のフィルタではマップに表示されていません。</li>";
    }

    const args = job.args && job.args.length
      ? `<ul class="args">${job.args.map((arg) => `<li><code>${escapeHtml(arg)}</code></li>`).join("")}</ul>`
      : '<p class="path-line">引数なし</p>';

    const calendar = MODEL.calendarEntries(job.triggers.start_calendar);
    const triggerDetail = [];
    if (job.triggers.run_at_load) triggerDetail.push("RunAtLoad");
    if (job.triggers.keep_alive) triggerDetail.push("KeepAlive");
    if (job.triggers.start_interval !== null) {
      triggerDetail.push(`StartInterval ${MODEL.formatInterval(job.triggers.start_interval)}`);
    }
    calendar.forEach((entry) => {
      triggerDetail.push(`StartCalendar ${MODEL.formatClock(entry.hour * 60 + entry.minute)}`);
    });
    if (job.triggers.watch_paths.length) {
      triggerDetail.push(`WatchPaths ${job.triggers.watch_paths.length}`);
    }
    if (job.triggers.sockets) triggerDetail.push(`Sockets ${job.triggers.sockets}`);

    const watchRows = job.triggers.watch_paths.length
      ? job.triggers.watch_paths
          .map((path) => `<code class="path-line">${escapeHtml(path)}</code>`)
          .join("")
      : "";

    const pid = job.pid === null || job.pid === undefined ? "—" : String(job.pid);
    const exit = job.last_exit_status === null || job.last_exit_status === undefined
      ? "—"
      : String(job.last_exit_status);

    els.inspector.innerHTML =
      `<div class="inspector-title"><h3>${escapeHtml(job.label)}</h3>` +
      `<span class="pill ${job.status}">${escapeHtml(statusLabel(job.status).toUpperCase())}</span></div>` +
      `<div class="inspector-score">score <b>${job.score}</b> / 100 · ${escapeHtml(signatureLabel(job))}</div>` +
      `<dl class="meta-grid">` +
      `<dt>Domain</dt><dd><code>${escapeHtml(job.domain)}</code></dd>` +
      `<dt>Scope</dt><dd>${escapeHtml(job.scope)}</dd>` +
      `<dt>Vendor</dt><dd>${escapeHtml(job.vendor || "—")}</dd>` +
      `<dt>PID</dt><dd>${pid} · ${job.loaded ? "loaded" : "not loaded"}</dd>` +
      `<dt>Exit</dt><dd>${exit}${job.disabled ? " · disabled" : ""}</dd>` +
      `<dt>Trigger</dt><dd>${escapeHtml(MODEL.describeTrigger(job))}</dd>` +
      `<dt>Plist</dt><dd><code>${escapeHtml(job.plist || "—")}</code></dd>` +
      `</dl>` +
      `<div class="section-label">Program</div>` +
      `<code class="path-line">${escapeHtml(job.program || "—")}</code>` +
      (job.diff ? `<p class="section-label">Baseline · ${escapeHtml(job.diff)}</p>` : "") +
      `<div class="section-label">Why this status</div>` +
      `<ul class="reasons">${reasons}</ul>` +
      `<div class="section-label">Triggers</div>` +
      `<p class="path-line">${escapeHtml(triggerDetail.join(" · ") || "on demand")}</p>` +
      (watchRows ? `<div class="section-label">Watch paths</div>${watchRows}` : "") +
      `<div class="section-label">Args</div>${args}`;
  }

  /* ---------------- render: schedule ---------------- */

  function renderSchedule() {
    if (!state.model) return;
    const matches = state.filtered ? state.filtered.matches : null;
    const entries = state.model.schedule.filter((entry) => !matches || matches.has(entry.job.key));
    els.scheduleCount.textContent = `${entries.length} 件`;
    if (!entries.length) {
      els.schedule.innerHTML = '<div class="empty-state">表示できる定期実行はありません。</div>';
      return;
    }
    els.schedule.innerHTML = entries
      .map((entry) => {
        const job = entry.job;
        const selected = state.selectedKey === job.key;
        const interval = job.triggers.start_interval;
        const dense = interval !== null && interval < 3600;
        const ticks = entry.events
          .filter((event) => !(dense && event.kind === "interval"))
          .map((event) => {
            const percent = Math.max(0, Math.min(100, (event.minute / 1440) * 100));
            const kind = event.kind === "calendar" ? "calendar" : job.status === "error" ? "error" : "";
            return `<span class="sched-tick ${kind}" style="left:${percent.toFixed(3)}%"></span>`;
          })
          .join("");
        const band = dense
          ? `<span class="sched-band" title="${escapeHtml(`every ${MODEL.formatInterval(interval)}`)}"></span>`
          : "";
        return (
          `<button type="button" class="sched-row${selected ? " selected" : ""}" data-sched-key="${escapeHtml(job.key)}" ` +
          `aria-label="${escapeHtml(`${job.label} ${MODEL.describeTrigger(job)}`)}">` +
          `<span class="sched-id"><span class="label">${escapeHtml(job.label)}</span>` +
          `<span class="desc">${escapeHtml(MODEL.describeTrigger(job))} · ${escapeHtml(job.lane)}</span></span>` +
          `<span class="sched-track">${band}${ticks}</span>` +
          `</button>`
        );
      })
      .join("");
  }

  /* ---------------- interaction ---------------- */

  function rerenderMapOnly() {
    renderMap();
    renderSchedule();
  }

  function selectJob(key) {
    if (!key) return;
    const job = state.model.byKey.get(key);
    if (!job) return;
    state.selectedKey = key;
    state.selectedRemoved = null;
    const lane = state.model.lanes.find((item) => item.id === job.lane);
    if (lane) {
      const vendor = lane.vendors.find((item) => item.name === job.vendor);
      if (vendor && !vendorOpen(lane, vendor)) {
        state.vendorExpanded.set(vendorKey(lane.id, vendor.name), true);
      }
    }
    rerenderMapOnly();
    renderAlerts();
    renderDiff();
    renderInspector();
    syncQuery();
    revealSelected();
  }

  function selectRemoved(key) {
    const job = state.model.removed.find((item) => item.key === key);
    if (!job) return;
    state.selectedRemoved = job;
    state.selectedKey = null;
    rerenderMapOnly();
    renderAlerts();
    renderDiff();
    renderInspector();
    syncQuery();
  }

  function clearSelection() {
    state.selectedKey = null;
    state.selectedRemoved = null;
    rerenderMapOnly();
    renderAlerts();
    renderDiff();
    renderInspector();
    syncQuery();
  }

  function applyFilters() {
    renderMap();
    renderCounts();
    renderSchedule();
    renderInspector();
    syncQuery();
  }

  function resetFilters() {
    state.filters = {
      status: "all",
      query: "",
      unsignedOnly: false,
      diffOnly: false,
      lane: "all",
      trigger: "all",
      showApple: false,
    };
    state.vendorExpanded.clear();
    els.search.value = "";
    applyFilters();
    els.search.focus();
  }

  function revealSelected() {
    const key = state.selectedKey;
    if (!key) return;
    const card = els.lanes.querySelector(`.job-card[data-key="${cssEscape(key)}"]`);
    if (card) card.scrollIntoView({ block: "nearest" });
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
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

    els.triggerFilters.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-trigger]");
      if (!button) return;
      state.filters.trigger = button.getAttribute("data-trigger");
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
      if (!state.hasBaseline) return;
      state.filters.diffOnly = !state.filters.diffOnly;
      applyFilters();
    });

    els.appleToggle.addEventListener("click", () => {
      state.filters.showApple = !state.filters.showApple;
      state.vendorExpanded.clear();
      rerenderMapOnly();
      renderCounts();
      syncQuery();
    });

    els.resetFilters.addEventListener("click", resetFilters);

    els.lanes.addEventListener("click", (event) => {
      const laneButton = event.target.closest("button[data-lane]");
      if (laneButton) {
        const lane = laneButton.getAttribute("data-lane");
        state.filters.lane = state.filters.lane === lane ? "all" : lane;
        applyFilters();
        return;
      }
      const vendorButton = event.target.closest("button[data-vendor-toggle]");
      if (vendorButton) {
        const key = vendorButton.getAttribute("data-vendor-toggle");
        const panel = vendorButton.closest(".vendor");
        const open = panel ? panel.classList.contains("collapsed") : false;
        state.vendorExpanded.set(key, open);
        rerenderMapOnly();
        return;
      }
      const card = event.target.closest("button[data-key]");
      if (card) selectJob(card.getAttribute("data-key"));
    });

    els.alerts.addEventListener("click", (event) => {
      const row = event.target.closest("button[data-alert-key]");
      if (!row) return;
      selectJob(row.getAttribute("data-alert-key"));
    });

    els.inspector.addEventListener("click", (event) => {
      const pick = event.target.closest("button[data-inspector-key]");
      if (pick) selectJob(pick.getAttribute("data-inspector-key"));
    });

    els.diffBody.addEventListener("click", (event) => {
      const removed = event.target.closest("button[data-removed-key]");
      if (removed) {
        selectRemoved(removed.getAttribute("data-removed-key"));
        return;
      }
      const diffed = event.target.closest("button[data-diff-key]");
      if (diffed) selectJob(diffed.getAttribute("data-diff-key"));
    });

    els.schedule.addEventListener("click", (event) => {
      const row = event.target.closest("button[data-sched-key]");
      if (row) selectJob(row.getAttribute("data-sched-key"));
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

    window.addEventListener("popstate", () => {
      const parsed = MODEL.parseQuery(window.location.search);
      state.filters = {
        status: parsed.status,
        query: parsed.query,
        unsignedOnly: parsed.unsignedOnly,
        diffOnly: parsed.diffOnly,
        lane: parsed.lane,
        trigger: parsed.trigger,
        showApple: parsed.showApple,
      };
      state.selectedKey = parsed.job;
      state.selectedRemoved = null;
      state.live = parsed.live;
      els.search.value = parsed.query;
      if (parsed.data !== state.dataFile || parsed.baseline !== state.baselineFile) {
        state.dataFile = parsed.data;
        state.baselineFile = parsed.baseline;
        load();
      } else if (state.model) {
        resolveSelection();
        renderAll();
      }
      if (state.live) startLive();
      else stopLive();
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
