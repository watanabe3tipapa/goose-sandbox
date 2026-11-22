/*
 * Gander — Goose language corner.
 *
 * Loads the language features and the GooseSamples catalog, renders the
 * feature cards, and drives a tiny data-stack model. The model is explanatory
 * only; it is not a Goose interpreter and it never touches storage.
 */
(function () {
  "use strict";

  const G = window.GanderGoose;
  const FEATURES_URL = "../data/goose-features.json";
  const SAMPLES_URL = "../../GooseSamples/explorer/data/samples.json";

  const $ = (id) => document.getElementById(id);
  const state = {
    stack: G ? G.enterScope(G.createStack(), "main") : null,
    log: "main スコープから開始します。"
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function sampleUrl(id) {
    return "../../GooseSamples/explorer/?sample=" + encodeURIComponent(id);
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(url + " を読み込めませんでした（" + response.status + "）");
    return response.json();
  }

  function renderFeatures(doc, catalog) {
    const grid = $("feature-grid");
    const samples = new Map(catalog.samples.map((sample) => [sample.id, sample]));
    grid.replaceChildren();

    for (const feature of doc.features) {
      const card = el("article", "card feature-card");

      const top = el("div", "feature-top");
      top.append(el("span", "feature-no", "FEATURE / " + feature.no));
      top.append(el("span", "badge tag", feature.id));
      card.append(top);

      card.append(el("h3", "", feature.name));
      card.append(el("p", "tagline", feature.ja + " — " + feature.tagline));
      card.append(el("p", "summary", feature.summary));

      const points = el("ul", "feature-points");
      for (const point of feature.points) points.append(el("li", "", point));
      card.append(points);

      const pre = el("pre", "code-block");
      pre.append(el("code", "", feature.code));
      card.append(pre);

      const sampleRow = el("div", "feature-samples");
      for (const id of feature.samples) {
        const sample = samples.get(id);
        const link = el("a", "", sample ? sample.number + ". " + sample.title : id);
        link.href = sampleUrl(id);
        link.title = "Goose サンプル探訪で " + id + " を開く";
        sampleRow.append(link);
      }
      card.append(sampleRow);
      grid.append(card);
    }
  }

  function renderReading(doc, catalog) {
    const grid = $("sample-grid");
    const samples = new Map(catalog.samples.map((sample) => [sample.id, sample]));
    const categories = new Map(catalog.categories.map((item) => [item.id, item]));
    const levels = new Map(catalog.levels.map((item) => [item.id, item]));
    grid.replaceChildren();

    for (const entry of doc.meta.reading || []) {
      const sample = samples.get(entry.id);
      if (!sample) continue;

      const card = el("article", "card click");
      card.append(el("span", "badge mint", sample.id));
      card.append(el("h3", "", sample.number + ". " + sample.title));
      card.append(el("p", "", entry.why));

      const category = categories.get(sample.category);
      const level = levels.get(sample.level);
      card.append(el("p", "card-meta",
        (category ? category.label : sample.category) + " / " +
        (level ? level.label : sample.level) + " / " +
        sample.lines + " lines"));

      const links = el("div", "card-links");
      const open = el("a", "", "サンプルを開く");
      open.href = sampleUrl(sample.id);
      links.append(open);
      card.append(links);
      grid.append(card);
    }
  }

  function currentFrame() {
    if (!state.stack || !state.stack.frames.length) return null;
    return state.stack.frames[state.stack.frames.length - 1];
  }

  function renderStack() {
    if (!state.stack) return;
    const frame = currentFrame();
    $("stack-state").textContent = frame ? frame.name : "no frame";

    const frames = $("stack-frames");
    frames.replaceChildren();
    if (!state.stack.frames.length) {
      frames.append(el("span", "hint", "スコープは開いていません。push すると main を開きます。"));
    } else {
      state.stack.frames.forEach((item, index) => {
        const chip = el("span", "stack-frame" + (index === state.stack.frames.length - 1 ? " active" : ""),
          item.name + " @ " + G.formatBytes(item.mark));
        frames.append(chip);
      });
    }

    const high = state.stack.highWater;
    const percent = high > 0 ? Math.min(100, (state.stack.used / high) * 100) : 0;
    $("stack-bar").style.width = percent + "%";
    $("stack-used").textContent = G.formatBytes(state.stack.used);
    $("stack-high").textContent = G.formatBytes(state.stack.highWater);
    $("stack-released").textContent = G.formatBytes(state.stack.released);
    $("stack-releases").textContent = String(state.stack.releases);
    $("stack-log").textContent = state.log;
  }

  function push(size) {
    if (!state.stack.frames.length) {
      state.stack = G.enterScope(state.stack, "main");
    }
    state.stack = G.pushBytes(state.stack, size);
    const frame = currentFrame();
    state.log = G.formatBytes(size) + " を " + frame.name + " に積みました。使用量は " +
      G.formatBytes(state.stack.used) + "、最高水位は " + G.formatBytes(state.stack.highWater) + " です。";
    renderStack();
  }

  function enterScope() {
    state.stack = G.enterScope(state.stack, "loop");
    state.log = "loop スコープに入りました。ここから積むバイトは、抜けるときにまとめて解放されます。";
    renderStack();
  }

  function leaveScope() {
    const result = G.leaveScope(state.stack);
    if (!result.frame) {
      state.log = "これ以上抜けるスコープがありません。";
      renderStack();
      return;
    }
    state.stack = result.stack;
    state.log = result.frame.name + " を抜け、" + G.formatBytes(result.released) +
      " を 1 回のポインタ巻き戻しで解放しました。";
    renderStack();
  }

  function resetStack() {
    state.stack = G.enterScope(G.createStack(), "main");
    state.log = "main スコープから開始します。";
    renderStack();
  }

  function bindStack() {
    if (!G) return;
    $("push-small").addEventListener("click", () => push(1000));
    $("push-large").addEventListener("click", () => push(100000));
    $("enter-scope").addEventListener("click", enterScope);
    $("leave-scope").addEventListener("click", leaveScope);
    $("reset-stack").addEventListener("click", resetStack);
  }

  async function load() {
    const error = $("feature-error");
    try {
      const [doc, catalog] = await Promise.all([
        fetchJson(FEATURES_URL),
        fetchJson(SAMPLES_URL)
      ]);
      renderFeatures(doc, catalog);
      renderReading(doc, catalog);
    } catch (problem) {
      $("feature-grid").replaceChildren();
      error.hidden = false;
      error.textContent = "特色を読み込めませんでした。" + problem.message +
        " ローカルでは python3 -m http.server で開いてください。";
    }
  }

  if (!G) {
    const error = $("feature-error");
    error.hidden = false;
    error.textContent = "goose.js（データスタックモデル）を読み込めませんでした。";
    return;
  }

  bindStack();
  renderStack();
  load();
})();
