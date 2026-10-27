/*
 * GooseSamples explorer
 *
 * Fetches data/samples.json, renders the filterable card list, and opens the
 * matching source on demand from data/sources/. All state lives in the URL so
 * a view can be shared, and read progress lives in localStorage.
 */
(function () {
  "use strict";

  const C = window.GooseCatalog;
  const H = window.GooseHighlight;
  const DATA_URL = "data/samples.json";
  const READ_KEY = "goose-samples:read:v1";
  const NARROW = "(max-width: 1220px)";

  const state = {
    catalog: null,
    filters: Object.assign({}, C.DEFAULT_FILTERS),
    selected: null,
    visible: [],
    read: new Set(),
    sources: new Map(),
    currentSource: null,
    lastFocus: null,
    sourceToken: 0,
    toastTimer: 0,
  };

  const $ = (selector) => document.querySelector(selector);
  const els = {
    filters: $("#filters"),
    filterToggle: $("#filter-toggle"),
    categoryList: $("#category-list"),
    levelList: $("#level-list"),
    requirementList: $("#requirement-list"),
    unreadToggle: $("#unread-toggle"),
    unreadCount: $("#unread-count"),
    reset: $("#reset"),
    search: $("#search"),
    sort: $("#sort"),
    resultCount: $("#result-count"),
    activeFilters: $("#active-filters"),
    cards: $("#cards"),
    empty: $("#empty"),
    detail: $("#detail"),
    progressBar: $("#progress-bar"),
    progressFill: $("#progress-fill"),
    progressText: $("#progress-text"),
    miniRead: $("#mini-read"),
    toast: $("#toast"),
  };

  const esc = H.escapeHtml;

  /* ---------- persistence ---------- */

  function loadRead() {
    try {
      const raw = window.localStorage.getItem(READ_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
    } catch (error) {
      return new Set();
    }
  }

  function saveRead() {
    try {
      window.localStorage.setItem(READ_KEY, JSON.stringify(Array.from(state.read)));
    } catch (error) {
      /* storage can be unavailable in private mode; progress is then session-only */
    }
  }

  /* ---------- catalog lookups ---------- */

  function item(list, id) {
    return (list || []).find((entry) => entry.id === id) || null;
  }

  function label(list, id) {
    const found = item(list, id);
    return found ? found.label : id;
  }

  function categoryLabel(id) {
    return label(state.catalog.categories, id);
  }

  function levelLabel(id) {
    return label(state.catalog.levels, id);
  }

  function requirementLabel(id) {
    return label(state.catalog.requirements, id);
  }

  function featureLabel(id) {
    return label(state.catalog.features, id);
  }

  function requirementText(sample) {
    return sample.requirements.map(requirementLabel).join(" / ");
  }

  function urlFor(sampleId) {
    return C.buildQuery(Object.assign({}, state.filters, { sample: sampleId }));
  }

  /* ---------- filter UI ---------- */

  function optionHtml(filter, value, text, count) {
    return `<li><button class="opt" type="button" data-filter="${filter}" data-value="${esc(value)}"><span>${esc(text)}</span><b>${C.formatNumber(count)}</b></button></li>`;
  }

  function renderFilterLists() {
    const samples = state.catalog.samples;
    const byCategory = C.countBy(samples, "category");
    const byLevel = C.countBy(samples, "level");
    const byRequirement = C.countBy(samples.flatMap((sample) => sample.requirements.map((id) => ({ id }))), "id");

    els.categoryList.innerHTML =
      optionHtml("category", "all", "すべて", samples.length) +
      state.catalog.categories.map((category) => optionHtml("category", category.id, category.label, byCategory[category.id] || 0)).join("");

    els.levelList.innerHTML =
      optionHtml("level", "all", "すべて", samples.length) +
      state.catalog.levels.map((level) => optionHtml("level", level.id, level.label, byLevel[level.id] || 0)).join("");

    els.requirementList.innerHTML =
      optionHtml("requirement", "all", "すべて", samples.length) +
      state.catalog.requirements
        .filter((requirement) => byRequirement[requirement.id])
        .map((requirement) => optionHtml("requirement", requirement.id, requirement.label, byRequirement[requirement.id]))
        .join("");
  }

  function syncFilterUi() {
    const filters = state.filters;
    document.querySelectorAll(".opt[data-filter]").forEach((button) => {
      const name = button.dataset.filter;
      const active = name === "unread" ? filters.unreadOnly : filters[name] === button.dataset.value;
      button.setAttribute("aria-pressed", String(active));
    });
    if (els.search.value !== filters.query) els.search.value = filters.query;
    els.sort.value = filters.sort;
  }

  /* ---------- rendering ---------- */

  function cardHtml(sample) {
    const isRead = state.read.has(sample.id);
    const isCurrent = state.selected === sample.id;
    return `<a class="card${isRead ? " is-read" : ""}" href="${urlFor(sample.id)}" data-id="${esc(sample.id)}"${isCurrent ? ' aria-current="true"' : ""}>
      <span class="card-top">
        <span class="card-no">${String(sample.number).padStart(2, "0")}</span>
        <span class="card-cat">${esc(categoryLabel(sample.category))}</span>
        <span>${esc(levelLabel(sample.level))}</span>
      </span>
      <span class="card-title">${esc(sample.title)}</span>
      <span class="card-sum">${esc(sample.summary)}</span>
      <span class="card-foot">
        <span>${C.formatNumber(sample.lines)} 行</span>
        <span>${esc(requirementText(sample))}</span>
        <span class="read"${isRead ? "" : " hidden"}>✓ 読了</span>
      </span>
    </a>`;
  }

  function renderCards() {
    els.cards.innerHTML = state.visible.map(cardHtml).join("");
    els.empty.hidden = state.visible.length > 0;
  }

  function activeFilterParts() {
    const parts = [];
    if (state.filters.category !== "all") parts.push(categoryLabel(state.filters.category));
    if (state.filters.level !== "all") parts.push(levelLabel(state.filters.level));
    if (state.filters.requirement !== "all") parts.push(requirementLabel(state.filters.requirement));
    if (state.filters.query) parts.push(`“${state.filters.query}”`);
    if (state.filters.unreadOnly) parts.push("未読のみ");
    return parts;
  }

  function renderResultLine() {
    els.resultCount.textContent = C.formatNumber(state.visible.length);
    els.activeFilters.innerHTML = activeFilterParts()
      .map((part) => `<span class="chip-active">${esc(part)}</span>`)
      .join(" ");
  }

  function renderProgress() {
    const total = state.catalog.samples.length;
    const readCount = state.catalog.samples.filter((sample) => state.read.has(sample.id)).length;
    const percent = total ? (readCount / total) * 100 : 0;
    els.progressFill.style.width = `${percent}%`;
    els.progressBar.setAttribute("aria-valuemax", String(total));
    els.progressBar.setAttribute("aria-valuenow", String(readCount));
    els.progressText.textContent = `${C.formatNumber(readCount)} / ${C.formatNumber(total)}`;
    els.miniRead.textContent = C.formatNumber(readCount);
    els.unreadCount.textContent = C.formatNumber(total - readCount);
  }

  function updateUrl() {
    const query = C.buildQuery(Object.assign({}, state.filters, { sample: state.selected }));
    const next = query || window.location.pathname;
    if (next !== window.location.search && next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }

  function render(options) {
    const settings = options || {};
    const filtered = C.filterSamples(state.catalog, state.filters, state.read);
    state.visible = C.sortSamples(filtered, state.filters.sort);
    syncFilterUi();
    renderCards();
    renderResultLine();
    renderProgress();
    updateUrl();
    if (settings.scrollTop !== false) els.cards.scrollTop = 0;
  }

  /* ---------- detail ---------- */

  function highlightCode(text) {
    return H.highlightLines(text)
      .map((line, index) => `<span class="line"><span class="ln" aria-hidden="true">${index + 1}</span>${line || " "}</span>`)
      .join("");
  }

  function sourceBlock(sample, source) {
    if (source === null) {
      return `<p class="loading">ソースを読み込んでいます…</p>`;
    }
    if (source.error) {
      return `<div class="source-error" role="alert">
        <p><b>ソースを読み込めませんでした。</b> ${esc(source.error)}</p>
        <p><a href="${esc(sample.upstreamUrl)}" target="_blank" rel="noopener">公式リポジトリで読む ↗</a></p>
      </div>`;
    }
    return `<pre class="code" tabindex="0" aria-label="${esc(sample.upstream)} のソース"><code>${highlightCode(source.text)}</code></pre>`;
  }

  function detailHtml(sample, source) {
    const isRead = state.read.has(sample.id);
    const around = C.neighbors(state.catalog, sample.id);
    const notes = sample.notes ? `<p class="note">${esc(sample.notes)}</p>` : "";
    const sourceActions = source && !source.error
      ? `<button class="act" type="button" id="copy-code">コードをコピー</button>`
      : "";

    return `<div class="detail-inner">
      <div class="detail-top">
        <span class="detail-num">${String(sample.number).padStart(2, "0")}</span>
        <span class="chip">${esc(categoryLabel(sample.category))}</span>
        <span class="chip level-${esc(sample.level)}">${esc(levelLabel(sample.level))}</span>
        <button class="detail-close" type="button" id="detail-close" aria-label="詳細を閉じる">×</button>
      </div>

      <h2>${esc(sample.title)}</h2>
      <p class="detail-orig">${esc(sample.originalTitle)}</p>
      <p class="detail-summary">${esc(sample.summary)}</p>

      <div class="detail-actions">
        <button class="act" type="button" id="read-toggle" aria-pressed="${isRead}">${isRead ? "✓ 読了" : "読了にする"}</button>
        <a class="act ghost" href="${esc(sample.upstreamUrl)}" target="_blank" rel="noopener">公式ソース ↗</a>
      </div>

      <dl class="detail-meta">
        <div><dt>Lines</dt><dd>${C.formatNumber(sample.lines)}</dd></div>
        <div><dt>Level</dt><dd>${esc(levelLabel(sample.level))}</dd></div>
        <div><dt>Requires</dt><dd>${esc(requirementText(sample))}</dd></div>
        <div><dt>File</dt><dd>${esc(sample.upstream)}</dd></div>
      </dl>

      <h3>このサンプルで学べること</h3>
      <ul class="shows">${sample.shows.map((show) => `<li>${esc(show)}</li>`).join("")}</ul>

      <h3>実行</h3>
      <div class="run-wrap">
        <pre class="run"><code><span class="prompt">$ </span>${esc(sample.run)}</code></pre>
        <button class="act" type="button" id="copy-run">コピー</button>
      </div>
      ${notes}
      <p class="note">コマンドは公式リポジトリの <code>samples/</code> で実行します。</p>

      <h3>タグ</h3>
      <div class="tags">${sample.features.map((id) => `<span class="tag">${esc(featureLabel(id))}</span>`).join("")}</div>

      <section class="source">
        <div class="source-head">
          <h3>Source</h3>
          <span>${C.formatNumber(sample.lines)} 行 · ${esc(sample.upstream)}</span>
        </div>
        <div class="source-actions">
          ${sourceActions}
          <a class="act ghost" href="${esc(sample.upstreamUrl)}" target="_blank" rel="noopener">公式で見る ↗</a>
        </div>
        ${sourceBlock(sample, source)}
      </section>

      <nav class="pager" aria-label="前後のサンプル">
        ${around.prev
          ? `<a href="${urlFor(around.prev.id)}" data-id="${esc(around.prev.id)}">← ${around.prev.number}. ${esc(around.prev.title)}</a>`
          : `<span>← 最初のサンプル</span>`}
        ${around.next
          ? `<a class="next" href="${urlFor(around.next.id)}" data-id="${esc(around.next.id)}">${around.next.number}. ${esc(around.next.title)} →</a>`
          : `<span class="next">最後のサンプル →</span>`}
      </nav>
    </div>`;
  }

  function placeholderHtml() {
    return `<div class="detail-placeholder">
      <b>サンプルを選んでください</b>
      左の一覧からカードを選ぶと、解説とソースコードがここに表示されます。<code>/</code> で検索、<code>j</code> / <code>k</code> で前後に移動できます。
    </div>`;
  }

  function renderDetail(sample, source) {
    els.detail.innerHTML = detailHtml(sample, source);
    els.detail.scrollTop = 0;
  }

  function isNarrow() {
    return window.matchMedia(NARROW).matches;
  }

  function focusDetail() {
    if (!isNarrow()) return;
    els.detail.focus({ preventScroll: true });
  }

  function loadSource(sample) {
    if (state.sources.has(sample.id)) return Promise.resolve(state.sources.get(sample.id));
    return fetch(`data/${sample.file}`, { cache: "no-cache" }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text().then((text) => {
        state.sources.set(sample.id, text);
        return text;
      });
    });
  }

  function selectSample(id, options) {
    const settings = options || {};
    const sample = C.findSample(state.catalog, id);
    if (!sample) return;

    state.selected = id;
    state.lastFocus = document.activeElement;
    state.currentSource = null;
    renderCards();
    if (settings.updateUrl !== false) updateUrl();

    els.detail.classList.add("is-open");
    document.body.classList.add("detail-open");
    renderDetail(sample, null);
    focusDetail();

    const token = (state.sourceToken += 1);
    loadSource(sample)
      .then((text) => {
        if (state.selected !== id || token !== state.sourceToken) return;
        state.currentSource = text;
        renderDetail(sample, { text });
      })
      .catch((error) => {
        if (state.selected !== id || token !== state.sourceToken) return;
        renderDetail(sample, { error: error.message || String(error) });
      });
  }

  function closeDetail() {
    state.selected = null;
    state.currentSource = null;
    state.sourceToken += 1;
    els.detail.classList.remove("is-open");
    document.body.classList.remove("detail-open");
    els.detail.innerHTML = placeholderHtml();
    renderCards();
    updateUrl();
    if (state.lastFocus && typeof state.lastFocus.focus === "function") state.lastFocus.focus();
  }

  function toggleRead(id) {
    if (!id) return;
    if (state.read.has(id)) state.read.delete(id);
    else state.read.add(id);
    saveRead();

    const card = els.cards.querySelector(`.card[data-id="${id}"]`);
    if (card) {
      const isRead = state.read.has(id);
      card.classList.toggle("is-read", isRead);
      const badge = card.querySelector(".read");
      if (badge) badge.hidden = !isRead;
    }
    const button = els.detail.querySelector("#read-toggle");
    if (button) {
      const isRead = state.read.has(id);
      button.setAttribute("aria-pressed", String(isRead));
      button.textContent = isRead ? "✓ 読了" : "読了にする";
    }
    renderProgress();

    if (state.filters.unreadOnly && state.read.has(id)) render({ scrollTop: false });
  }

  /* ---------- clipboard / toast ---------- */

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-on");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => els.toast.classList.remove("is-on"), 1600);
  }

  function copyText(text, message) {
    const fallback = () => {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch (error) {
        /* ignore: the toast still reports the attempt */
      }
      area.remove();
      showToast(message);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => showToast(message), fallback);
    } else {
      fallback();
    }
  }

  /* ---------- query state ---------- */

  function applyQuery() {
    const query = C.parseQuery(window.location.search);
    state.filters = {
      category: state.catalog.categories.some((entry) => entry.id === query.category) ? query.category : "all",
      level: state.catalog.levels.some((entry) => entry.id === query.level) ? query.level : "all",
      requirement: state.catalog.requirements.some((entry) => entry.id === query.requirement) ? query.requirement : "all",
      query: query.query,
      sort: query.sort,
      unreadOnly: query.unreadOnly,
    };
    state.selected = query.sample && C.findSample(state.catalog, query.sample) ? query.sample : null;
  }

  /* ---------- events ---------- */

  function bindEvents() {
    els.filters.addEventListener("click", (event) => {
      const button = event.target.closest(".opt[data-filter]");
      if (!button) return;
      const name = button.dataset.filter;
      if (name === "unread") state.filters.unreadOnly = !state.filters.unreadOnly;
      else state.filters[name] = button.dataset.value;
      render();
    });

    els.reset.addEventListener("click", () => {
      state.filters = Object.assign({}, C.DEFAULT_FILTERS);
      render();
    });

    let searchTimer = 0;
    els.search.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.filters.query = els.search.value;
        render();
      }, 70);
    });

    els.sort.addEventListener("change", () => {
      state.filters.sort = els.sort.value;
      render();
    });

    els.cards.addEventListener("click", (event) => {
      const card = event.target.closest(".card[data-id]");
      if (!card) return;
      event.preventDefault();
      selectSample(card.dataset.id);
    });

    els.detail.addEventListener("click", (event) => {
      const pager = event.target.closest(".pager a[data-id]");
      if (pager) {
        event.preventDefault();
        selectSample(pager.dataset.id);
        return;
      }
      if (event.target.closest("#read-toggle")) {
        toggleRead(state.selected);
        return;
      }
      if (event.target.closest("#copy-run")) {
        const sample = C.findSample(state.catalog, state.selected);
        if (sample) copyText(sample.run, "実行コマンドをコピーしました");
        return;
      }
      if (event.target.closest("#copy-code")) {
        if (state.currentSource) copyText(state.currentSource, "ソースをコピーしました");
        return;
      }
      if (event.target.closest("#detail-close")) closeDetail();
    });

    els.filterToggle.addEventListener("click", () => {
      const open = els.filters.classList.toggle("is-open");
      els.filterToggle.setAttribute("aria-expanded", String(open));
    });

    document.addEventListener("keydown", (event) => {
      const tag = document.activeElement ? document.activeElement.tagName : "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (event.key === "/" && !typing) {
        event.preventDefault();
        els.search.focus();
        els.search.select();
        return;
      }
      if (event.key === "Escape") {
        if (typing) {
          document.activeElement.blur();
          return;
        }
        if (state.selected) closeDetail();
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "j" && event.key !== "k") return;

      if (!state.visible.length) return;
      const index = state.visible.findIndex((sample) => sample.id === state.selected);
      const nextIndex = event.key === "j"
        ? (index === -1 ? 0 : Math.min(state.visible.length - 1, index + 1))
        : (index === -1 ? state.visible.length - 1 : Math.max(0, index - 1));
      if (nextIndex !== index) {
        event.preventDefault();
        selectSample(state.visible[nextIndex].id);
      }
    });
  }

  /* ---------- boot ---------- */

  function renderFatal(error) {
    const app = document.querySelector(".app");
    if (!app) return;
    app.innerHTML = `<div class="fatal" role="alert">
      <h1>データを読み込めませんでした</h1>
      <p><code>explorer/data/samples.json</code> を取得できませんでした（${esc(error && error.message ? error.message : error)}）。</p>
      <p>このページは <code>fetch()</code> を使うため、<code>file://</code> で直接開くと動作しません。リポジトリのルートで静的サーバーを起動し、<code>http://localhost:8000/GooseSamples/explorer/</code> を開いてください。</p>
      <p><code>python3 -m http.server 8000</code></p>
      <p><a href="../">LP に戻る</a></p>
    </div>`;
  }

  function init() {
    state.read = loadRead();

    fetch(DATA_URL, { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((catalog) => {
        const validation = C.validateCatalog(catalog);
        if (!validation.ok) {
          const messages = validation.issues
            .filter((issue) => issue.level === "error")
            .map((issue) => `${issue.path}: ${issue.message}`);
          throw new Error(messages.join(" / "));
        }
        state.catalog = catalog;
        applyQuery();
        renderFilterLists();
        bindEvents();
        render();
        renderProgress();
        if (state.selected) selectSample(state.selected, { updateUrl: false });
      })
      .catch(renderFatal);
  }

  init();
})();
