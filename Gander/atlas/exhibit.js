/*
 * Gander — exhibit detail.
 *
 * Reads ?id= from the URL, resolves the exhibit and its mechanisms, and
 * renders the question, pipeline, inputs/outputs, limits, decisions, links
 * and pager. All repository-relative links are rebased from Gander/atlas/.
 */
(function () {
  "use strict";

  const A = window.GanderAtlas;
  const EXHIBITS_URL = "../data/exhibits.json";
  const MECHANISMS_URL = "../data/mechanisms.json";
  const DEPTH = 2;

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

  function linkList(container, links) {
    links.forEach((link, index) => {
      if (index) container.append(document.createTextNode(" / "));
      const anchor = el("a", "", link.label);
      anchor.href = A.resolveHref(link.href, DEPTH);
      container.append(anchor);
    });
  }

  function render(exhibit, mechanisms, exhibits) {
    const article = el("article");
    const head = el("header", "exhibit-head");
    const main = el("div");

    main.append(el("span", "kicker", "EXHIBIT " + exhibit.no + " / " + exhibit.status));
    main.append(el("h1", "", exhibit.name));
    main.append(el("p", "question", exhibit.question));
    main.append(el("p", "summary", exhibit.summary));

    const tags = el("div", "tag-row");
    for (const id of exhibit.mechanisms || []) {
      const mechanism = A.byId(mechanisms, id);
      const link = el("a", "badge tag", mechanism ? mechanism.name : id);
      link.href = "mechanism.html?id=" + encodeURIComponent(id);
      tags.append(link);
    }
    main.append(tags);
    head.append(main);

    const side = el("aside", "side-facts");
    const dl = el("dl");
    fact(dl, "NO", exhibit.no);
    fact(dl, "STATUS", exhibit.status);
    fact(dl, "REVIEWED", exhibit.reviewed || "—");

    const mechanismFacts = fact(dl, "MECHANISMS", "");
    (exhibit.mechanisms || []).forEach((id, index) => {
      if (index) mechanismFacts.append(document.createTextNode(" / "));
      const mechanism = A.byId(mechanisms, id);
      const link = el("a", "", mechanism ? mechanism.name : id);
      link.href = "mechanism.html?id=" + encodeURIComponent(id);
      mechanismFacts.append(link);
    });

    const linkFacts = fact(dl, "LINKS", "");
    linkList(linkFacts, exhibit.links || []);
    side.append(dl);
    head.append(side);
    article.append(head);

    if (exhibit.pipeline && exhibit.pipeline.length) {
      const pipeline = el("div", "pipeline");
      pipeline.style.setProperty("--steps", String(exhibit.pipeline.length));
      exhibit.pipeline.forEach((step, index) => {
        const node = el("div", "pipe-step");
        node.append(el("span", "pno", String(index + 1).padStart(2, "0")));
        node.append(el("b", "", step.label));
        node.append(el("p", "", step.detail));
        pipeline.append(node);
      });
      article.append(section("01 — PIPELINE", "流れ", "どこで採取し、どこで正規化し、どこで判定するかを順に読みます。", pipeline));
    }

    if (exhibit.inputs || exhibit.outputs) {
      const io = el("div", "io-grid");
      const inputBox = el("div", "io-box io-in");
      inputBox.append(el("h3", "", "Inputs"));
      const inputList = el("ul");
      for (const item of exhibit.inputs || []) inputList.append(el("li", "", item));
      inputBox.append(inputList);
      io.append(inputBox);

      const outputBox = el("div", "io-box io-out");
      outputBox.append(el("h3", "", "Outputs"));
      const outputList = el("ul");
      for (const item of exhibit.outputs || []) outputList.append(el("li", "", item));
      outputBox.append(outputList);
      io.append(outputBox);
      article.append(section("02 — I/O", "入力と出力", "何を受け取り、何を読める形にするかを対で確認します。", io));
    }

    if (exhibit.core && exhibit.core.length) {
      const grid = el("div", "grid-3");
      for (const item of exhibit.core) {
        const card = el("article", "card");
        card.append(el("h3", "", item.title));
        card.append(el("p", "", item.body));
        grid.append(card);
      }
      article.append(section("03 — CORE", "核になる判断", "この展示を成立させている中心の考え方です。", grid));
    }

    if (exhibit.limits && exhibit.limits.length) {
      const list = el("div", "limit-list");
      for (const item of exhibit.limits) {
        const row = el("div", "limit-item");
        row.append(el("span", "mark", "!"));
        const body = el("div");
        body.append(el("b", "", item.title));
        body.append(el("p", "", item.body));
        row.append(body);
        list.append(row);
      }
      article.append(section("04 — LIMITS", "限界", "できないこと・保証しないことを先に置きます。", list));
    }

    if (exhibit.decisions && exhibit.decisions.length) {
      const list = el("div", "decision-list");
      for (const item of exhibit.decisions) {
        const row = el("div", "decision");
        row.append(el("b", "", item.title));
        row.append(el("p", "", item.body));
        list.append(row);
      }
      article.append(section("05 — DECISIONS", "設計判断", "なぜその形にしたのかを、代替案との違いで読みます。", list));
    }

    const mechanismLinks = el("div", "mech-links");
    for (const id of exhibit.mechanisms || []) {
      const mechanism = A.byId(mechanisms, id);
      const link = el("a", "btn ghost small", mechanism ? mechanism.name : id);
      link.href = "mechanism.html?id=" + encodeURIComponent(id);
      mechanismLinks.append(link);
    }
    article.append(section("06 — MECHANISMS", "使われている仕組み", "定義とトレードオフへ移動します。", mechanismLinks));

    const neighbors = A.neighbors(exhibits, exhibit.id);
    const pager = el("nav", "pager");
    pager.setAttribute("aria-label", "展示の前後");
    if (neighbors.previous) {
      const previous = el("a", "", "← " + neighbors.previous.no + " " + neighbors.previous.name);
      previous.href = "exhibit.html?id=" + encodeURIComponent(neighbors.previous.id);
      pager.append(previous);
    }
    if (neighbors.next) {
      const next = el("a", "next", neighbors.next.no + " " + neighbors.next.name + " →");
      next.href = "exhibit.html?id=" + encodeURIComponent(neighbors.next.id);
      pager.append(next);
    }
    article.append(pager);

    $("exhibit-detail").replaceChildren(article);

    const breadcrumb = $("breadcrumb");
    breadcrumb.replaceChildren();
    const home = el("a", "", "Atlas");
    home.href = "./";
    breadcrumb.append(home, el("span", "", "/"), el("span", "", exhibit.no + " " + exhibit.name));

    document.title = exhibit.name + " — Gander Atlas";
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute("content", exhibit.summary);
  }

  function showError(message) {
    const detail = $("exhibit-detail");
    detail.replaceChildren();
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
        showError("展示が指定されていません。Atlas から展示を選んでください。");
        return;
      }
      const exhibit = A.byId(exhibits, id);
      if (!exhibit) {
        showError("展示 " + id + " が見つかりません。Atlas から選び直してください。");
        return;
      }
      render(exhibit, mechanisms, exhibits);
    } catch (problem) {
      showError("展示を読み込めませんでした。" + problem.message +
        " ローカルでは python3 -m http.server で開いてください。");
    }
  }

  if (!A) {
    showError("atlas.js（データヘルパー）を読み込めませんでした。");
    return;
  }

  load();
})();
