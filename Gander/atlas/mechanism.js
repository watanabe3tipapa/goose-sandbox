/*
 * Gander — mechanism detail.
 *
 * Reads ?id= from the URL and renders the mechanism definition, why,
 * tradeoffs, signals, and every exhibit that uses it.
 */
(function () {
  "use strict";

  const A = window.GanderAtlas;
  const EXHIBITS_URL = "../data/exhibits.json";
  const MECHANISMS_URL = "../data/mechanisms.json";

  const $ = (id) => document.getElementById(id);

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

  function section(no, title, intro, content) {
    const node = el("section", "section");
    const head = el("div", "section-head");
    head.append(el("span", "section-no", no));
    head.append(el("h2", "", title));
    if (intro) head.append(el("p", "", intro));
    node.append(head);
    node.append(content);
    return node;
  }

  function fact(dl, label, value) {
    dl.append(el("dt", "", label));
    const dd = el("dd", "", value);
    dl.append(dd);
    return dd;
  }

  function render(mechanism, mechanisms, exhibits) {
    const article = el("article");
    const head = el("header", "exhibit-head");
    const main = el("div");

    main.append(el("span", "kicker", "MECHANISM / " + mechanism.id));
    main.append(el("h1", "", mechanism.name));
    main.append(el("p", "question", mechanism.ja));
    main.append(el("p", "summary", mechanism.definition));

    const tags = el("div", "tag-row");
    for (const signal of mechanism.signals || []) tags.append(el("span", "badge tag", signal));
    main.append(tags);
    head.append(main);

    const side = el("aside", "side-facts");
    const dl = el("dl");
    fact(dl, "ID", mechanism.id);
    fact(dl, "USED BY", String((mechanism.used_by || []).length) + " exhibits");
    fact(dl, "SIGNALS", String((mechanism.signals || []).length));
    side.append(dl);
    head.append(side);
    article.append(head);

    const why = el("div", "decision");
    why.append(el("b", "", "なぜ必要か"));
    why.append(el("p", "", mechanism.why));
    article.append(section("01 — WHY", "なぜ必要か", "この型がなかったとき、何が読みにくくなるか。", why));

    const tradeoffs = el("div", "limit-list");
    for (const item of mechanism.tradeoffs || []) {
      const row = el("div", "limit-item");
      row.append(el("span", "mark", "!"));
      const body = el("div");
      body.append(el("b", "", "トレードオフ"));
      body.append(el("p", "", item));
      row.append(body);
      tradeoffs.append(row);
    }
    article.append(section("02 — TRADEOFFS", "トレードオフ", "採用すると失うもの・注意すべきことを並べます。", tradeoffs));

    const signals = el("div", "tag-row");
    for (const signal of mechanism.signals || []) signals.append(el("span", "badge mint", signal));
    const filter = el("div", "card-links");
    const filterLink = el("a", "", "この仕組みを使う展示を Atlas で絞る");
    filterLink.href = "index.html?mechanism=" + encodeURIComponent(mechanism.id);
    filter.append(filterLink);
    const signalBlock = el("div");
    signalBlock.append(signals);
    signalBlock.append(filter);
    article.append(section("03 — SIGNALS", "観測するシグナル", "この仕組みを見分けるための手がかりです。", signalBlock));

    const grid = el("div", "grid-3");
    for (const id of mechanism.used_by || []) {
      const exhibit = A.byId(exhibits, id);
      if (!exhibit) continue;
      const card = el("article", "card click");
      card.append(el("span", "badge " + (exhibit.status === "Lab" ? "warn" : "mint"), exhibit.status));
      card.append(el("h3", "", exhibit.no + " " + exhibit.name));
      card.append(el("p", "question", exhibit.question));
      card.append(el("p", "summary", exhibit.summary));
      const links = el("div", "card-links");
      const open = el("a", "", "展示を読む");
      open.href = "exhibit.html?id=" + encodeURIComponent(exhibit.id);
      links.append(open);
      card.append(links);
      grid.append(card);
    }
    article.append(section("04 — USED BY", "使っている展示", "同じ型が、どの展示で、どんな問いに使われているか。", grid));

    const index = mechanisms.findIndex((item) => item.id === mechanism.id);
    const pager = el("nav", "pager");
    pager.setAttribute("aria-label", "仕組みの前後");
    if (index > 0) {
      const previous = el("a", "", "← " + mechanisms[index - 1].name);
      previous.href = "mechanism.html?id=" + encodeURIComponent(mechanisms[index - 1].id);
      pager.append(previous);
    }
    if (index !== -1 && index < mechanisms.length - 1) {
      const next = el("a", "next", mechanisms[index + 1].name + " →");
      next.href = "mechanism.html?id=" + encodeURIComponent(mechanisms[index + 1].id);
      pager.append(next);
    }
    article.append(pager);

    $("mechanism-detail").replaceChildren(article);

    const breadcrumb = $("breadcrumb");
    breadcrumb.replaceChildren();
    const home = el("a", "", "Atlas");
    home.href = "./";
    breadcrumb.append(home, el("span", "", "/"), el("span", "", mechanism.name));

    document.title = mechanism.name + " — Gander Atlas";
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute("content", mechanism.definition);
  }

  function showError(message) {
    $("mechanism-detail").replaceChildren();
    const error = $("detail-error");
    error.hidden = false;
    error.textContent = message;
  }

  async function load() {
    try {
      const [exhibitDoc, mechanismDoc] = await Promise.all([
        fetchJson(EXHIBITS_URL),
        fetchJson(MECHANISMS_URL)
      ]);
      const exhibits = exhibitDoc.exhibits;
      const mechanisms = mechanismDoc.mechanisms;
      const id = new URLSearchParams(location.search).get("id");
      if (!id) {
        showError("仕組みが指定されていません。Atlas から仕組みを選んでください。");
        return;
      }
      const mechanism = A.byId(mechanisms, id);
      if (!mechanism) {
        showError("仕組み " + id + " が見つかりません。Atlas から選び直してください。");
        return;
      }
      render(mechanism, mechanisms, exhibits);
    } catch (problem) {
      showError("仕組みを読み込めませんでした。" + problem.message +
        " ローカルでは python3 -m http.server で開いてください。");
    }
  }

  if (!A) {
    showError("atlas.js（データヘルパー）を読み込めませんでした。");
    return;
  }

  load();
})();
