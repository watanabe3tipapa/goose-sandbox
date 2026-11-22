/*
 * Gander — atlas index.
 *
 * Loads the exhibit and mechanism data, renders both lists, and keeps the
 * filters in the URL so a view can be shared. All filtering is delegated to
 * the pure helpers in ../lib/atlas.js.
 */
(function () {
  "use strict";

  const A = window.GanderAtlas;
  const EXHIBITS_URL = "../data/exhibits.json";
  const MECHANISMS_URL = "../data/mechanisms.json";
  const DEPTH = 2;

  const $ = (id) => document.getElementById(id);
  const state = {
    exhibits: [],
    mechanisms: [],
    q: "",
    mechanism: "",
    mq: "",
    exhibit: ""
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(url + " を読み込めませんでした（" + response.status + "）");
    return response.json();
  }

  function readUrl() {
    const params = new URLSearchParams(location.search);
    state.q = params.get("q") || "";
    state.mechanism = params.get("mechanism") || "";
    state.mq = params.get("mq") || "";
    state.exhibit = params.get("exhibit") || "";
  }

  function writeUrl() {
    const params = new URLSearchParams();
    if (state.q) params.set("q", state.q);
    if (state.mechanism) params.set("mechanism", state.mechanism);
    if (state.mq) params.set("mq", state.mq);
    if (state.exhibit) params.set("exhibit", state.exhibit);
    const query = params.toString();
    history.replaceState(null, "", query ? "?" + query : location.pathname);
  }

  function fillSelect(select, items, label) {
    for (const item of items) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = label(item);
      select.append(option);
    }
  }

  function primaryLink(exhibit) {
    const links = exhibit.links || [];
    return links.find((link) => link.label === "LP") || links[0] || null;
  }

  function exhibitCard(exhibit) {
    const card = el("article", "card click exhibit-card");
    card.append(el("span", "no", exhibit.no));
    card.append(el("span", "badge " + (exhibit.status === "Lab" ? "warn" : "mint"), exhibit.status));
    card.append(el("h3", "", exhibit.name));
    card.append(el("p", "question", exhibit.question));
    card.append(el("p", "summary", exhibit.summary));

    const tags = el("div", "tag-row");
    for (const id of exhibit.mechanisms || []) {
      const mechanism = A.byId(state.mechanisms, id);
      const link = el("a", "badge tag", mechanism ? mechanism.name : id);
      link.href = "mechanism.html?id=" + encodeURIComponent(id);
      tags.append(link);
    }
    card.append(tags);

    const links = el("div", "card-links");
    const detail = el("a", "", "構造を読む");
    detail.href = "exhibit.html?id=" + encodeURIComponent(exhibit.id);
    links.append(detail);
    const primary = primaryLink(exhibit);
    if (primary) {
      const open = el("a", "", primary.label);
      open.href = A.resolveHref(primary.href, DEPTH);
      links.append(open);
    }
    card.append(links);
    return card;
  }

  function mechanismCard(mechanism) {
    const card = el("article", "card click mechanism-card");
    card.append(el("span", "mid", "MECHANISM / " + String(state.mechanisms.indexOf(mechanism) + 1).padStart(2, "0")));
    card.append(el("h3", "", mechanism.name));

    const body = el("p");
    body.append(el("strong", "", mechanism.ja + "。 "));
    body.append(document.createTextNode(mechanism.definition));
    card.append(body);

    card.append(el("p", "used",
      (mechanism.used_by || []).length + " exhibits / " +
      (mechanism.signals || []).length + " signals"));

    const links = el("div", "card-links");
    const detail = el("a", "", "定義を読む");
    detail.href = "mechanism.html?id=" + encodeURIComponent(mechanism.id);
    links.append(detail);
    card.append(links);
    return card;
  }

  function render() {
    const visibleExhibits = A.filterExhibits(state.exhibits, {
      query: state.q,
      mechanism: state.mechanism
    });
    const visibleMechanisms = A.filterMechanisms(state.mechanisms, {
      query: state.mq,
      exhibit: state.exhibit
    });

    const exhibitGrid = $("exhibit-grid");
    exhibitGrid.replaceChildren();
    for (const exhibit of visibleExhibits) exhibitGrid.append(exhibitCard(exhibit));
    $("exhibit-empty").hidden = visibleExhibits.length > 0;
    $("exhibit-count").textContent = visibleExhibits.length + " / " + state.exhibits.length;

    const mechanismGrid = $("mechanism-grid");
    mechanismGrid.replaceChildren();
    for (const mechanism of visibleMechanisms) mechanismGrid.append(mechanismCard(mechanism));
    $("mechanism-empty").hidden = visibleMechanisms.length > 0;
    $("mechanism-count").textContent = visibleMechanisms.length + " / " + state.mechanisms.length;
  }

  function bind() {
    $("exhibit-search").addEventListener("input", (event) => {
      state.q = event.target.value;
      writeUrl();
      render();
    });
    $("exhibit-mechanism").addEventListener("change", (event) => {
      state.mechanism = event.target.value;
      writeUrl();
      render();
    });
    $("exhibit-reset").addEventListener("click", () => {
      state.q = "";
      state.mechanism = "";
      $("exhibit-search").value = "";
      $("exhibit-mechanism").value = "";
      writeUrl();
      render();
    });

    $("mechanism-search").addEventListener("input", (event) => {
      state.mq = event.target.value;
      writeUrl();
      render();
    });
    $("mechanism-exhibit").addEventListener("change", (event) => {
      state.exhibit = event.target.value;
      writeUrl();
      render();
    });
    $("mechanism-reset").addEventListener("click", () => {
      state.mq = "";
      state.exhibit = "";
      $("mechanism-search").value = "";
      $("mechanism-exhibit").value = "";
      writeUrl();
      render();
    });
  }

  async function load() {
    try {
      const [exhibitDoc, mechanismDoc] = await Promise.all([
        fetchJson(EXHIBITS_URL),
        fetchJson(MECHANISMS_URL)
      ]);
      state.exhibits = exhibitDoc.exhibits;
      state.mechanisms = mechanismDoc.mechanisms;

      const errors = A.validateData(state.exhibits, state.mechanisms);
      if (errors.length) {
        const banner = $("data-banner");
        banner.hidden = false;
        banner.textContent = "データ検証で問題が見つかりました: " + errors.join(" / ");
      }

      fillSelect($("exhibit-mechanism"), state.mechanisms,
        (mechanism) => mechanism.name + " — " + mechanism.ja);
      fillSelect($("mechanism-exhibit"), state.exhibits,
        (exhibit) => exhibit.no + " " + exhibit.name);

      readUrl();
      if (state.mechanism && A.byId(state.mechanisms, state.mechanism)) {
        $("exhibit-mechanism").value = state.mechanism;
      } else {
        state.mechanism = "";
      }
      if (state.exhibit && A.byId(state.exhibits, state.exhibit)) {
        $("mechanism-exhibit").value = state.exhibit;
      } else {
        state.exhibit = "";
      }
      $("exhibit-search").value = state.q;
      $("mechanism-search").value = state.mq;

      render();
    } catch (problem) {
      const banner = $("data-banner");
      banner.hidden = false;
      banner.textContent = "アトラスのデータを読み込めませんでした。" + problem.message +
        " ローカルでは python3 -m http.server で開いてください。";
      $("exhibit-grid").replaceChildren();
      $("mechanism-grid").replaceChildren();
    }
  }

  if (!A) {
    const banner = $("data-banner");
    banner.hidden = false;
    banner.textContent = "atlas.js（データヘルパー）を読み込めませんでした。";
    return;
  }

  bind();
  load();
})();
