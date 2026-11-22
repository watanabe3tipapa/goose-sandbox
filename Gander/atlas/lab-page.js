/*
 * Gander — KeyLint Lab page.
 *
 * Fills the form from the dummy sample catalog, runs the pure 7-stage
 * classifier on input, and renders each stage plus the masked finding.
 * The input never leaves the page and is never persisted.
 */
(function () {
  "use strict";

  const LAB = window.GanderLab;
  const SAMPLES_URL = "../data/lab-samples.json";

  const $ = (id) => document.getElementById(id);
  const state = {
    samples: [],
    timer: 0
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

  function applySample(sample) {
    $("secret").value = LAB.sampleValue(sample);
    $("key").value = sample.key || "";
    $("file").value = sample.file || "";
    $("tracked").checked = !!sample.tracked;
    $("world-readable").checked = !!sample.worldReadable;
    $("known").checked = !!sample.known;
  }

  function readForm() {
    return {
      value: $("secret").value,
      key: $("key").value,
      file: $("file").value,
      tracked: $("tracked").checked,
      worldReadable: $("world-readable").checked,
      known: $("known").checked
    };
  }

  function setBadge(node, className, text) {
    node.className = "badge " + className;
    node.textContent = text;
  }

  function renderStages(result) {
    const stages = $("stages");
    stages.replaceChildren();
    result.stages.forEach((stage, index) => {
      const row = el("div", "stage");
      row.dataset.status = stage.status;
      row.append(el("span", "sno", String(index + 1).padStart(2, "0")));

      const body = el("div");
      body.append(el("b", "", stage.label));
      body.append(el("p", "", stage.detail));
      row.append(body);
      row.append(el("span", "verdict", stage.verdict));
      stages.append(row);
    });
  }

  function renderFinding(result) {
    const body = $("finding-body");
    body.replaceChildren();

    if (!result.finding) {
      setBadge($("finding-level"), "muted", "—");
      setBadge($("finding-provider"), "tag", "—");
      const allowlisted = result.stages.some((stage) => stage.id === "allowlist" && stage.status === "stop");
      const message = allowlisted
        ? "Allowlist で停止しました。サンプル値・プレースホルダ・展開式は検出候補から外されます。"
        : "検出候補ではありません。形式・文脈・エントロピーの条件に届かなかったか、除外規則に該当しました。";
      body.append(el("p", "result-empty", message));
      return;
    }

    const finding = result.finding;
    setBadge($("finding-level"), finding.level === "critical" || finding.level === "high" ? "stop" : finding.level === "medium" ? "warn" : "mint",
      finding.level.toUpperCase());
    setBadge($("finding-provider"), "tag", finding.label);

    body.append(el("code", "masked", finding.masked));

    const risk = el("div", "risk-row");
    const meter = el("div", "risk-meter");
    const fill = el("span");
    fill.dataset.level = finding.level;
    fill.style.width = Math.min(100, Math.max(0, finding.score)) + "%";
    meter.append(fill);
    risk.append(meter);
    risk.append(el("span", "risk-score", String(finding.score)));
    body.append(risk);

    const reasons = el("ul", "reason-list");
    for (const reason of finding.reasons || []) reasons.append(el("li", "", reason));
    body.append(reasons);

    body.append(el("p", "hint",
      "provider: " + finding.provider +
      " / confidence: " + finding.confidence.toFixed(2) +
      " / baseline: " + (finding.status === "known" ? "KNOWN" : "NEW")));
  }

  function classifyNow() {
    try {
      const result = LAB.classify(readForm());
      renderStages(result);
      renderFinding(result);
      setBadge($("lab-verdict"), result.candidate ? "mint" : "muted", result.candidate ? "候補あり" : "候補なし");
    } catch (problem) {
      const error = $("lab-error");
      error.hidden = false;
      error.textContent = "判定中にエラーが発生しました。" + problem.message;
    }
  }

  function schedule() {
    clearTimeout(state.timer);
    state.timer = setTimeout(classifyNow, 120);
  }

  function bind() {
    $("lab-form").addEventListener("submit", (event) => {
      event.preventDefault();
      classifyNow();
    });
    for (const id of ["secret", "key", "file"]) {
      $(id).addEventListener("input", schedule);
    }
    for (const id of ["tracked", "world-readable", "known"]) {
      $(id).addEventListener("change", schedule);
    }
    $("lab-reset").addEventListener("click", () => {
      $("secret").value = "";
      $("key").value = "";
      $("file").value = "";
      $("tracked").checked = false;
      $("world-readable").checked = false;
      $("known").checked = false;
      classifyNow();
    });
  }

  function renderPresets() {
    const presets = $("presets");
    presets.replaceChildren();
    for (const sample of state.samples) {
      const button = el("button", "", sample.label);
      button.type = "button";
      button.title = sample.note || sample.label;
      button.addEventListener("click", () => {
        applySample(sample);
        classifyNow();
      });
      presets.append(button);
    }
  }

  async function load() {
    try {
      const doc = await fetchJson(SAMPLES_URL);
      state.samples = doc.samples || [];
      renderPresets();
      if (state.samples.length) {
        applySample(state.samples[0]);
      }
      classifyNow();
    } catch (problem) {
      const error = $("lab-error");
      error.hidden = false;
      error.textContent = "サンプルを読み込めませんでした。" + problem.message +
        " 手入力での判定はそのまま試せます。ローカルでは python3 -m http.server で開いてください。";
      classifyNow();
    }
  }

  if (!LAB) {
    const error = $("lab-error");
    error.hidden = false;
    error.textContent = "lab.js（判定ロジック）を読み込めませんでした。";
    return;
  }

  bind();
  classifyNow();
  load();
})();
