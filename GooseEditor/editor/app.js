/*
 * Goose Editor browser app
 *
 * Local-first Markdown workspace with two synchronized surfaces:
 *   - a contenteditable rich editor
 *   - a raw Markdown source view / editor
 *
 * Both surfaces write to the same document model. Data stays in localStorage;
 * exports are generated as local Blob downloads.
 *
 * The pure Markdown/document logic lives in lib/model.js so it can be tested
 * with node:test and later replaced by the Goose core.
 */
(function () {
  "use strict";

  const MODEL = window.GooseEditorModel;
  const STORAGE_KEY = "goose-editor.v1";
  const MAX_HISTORY = 150;
  const AUTOSAVE_MS = 1200;

  const DEFAULT_SETTINGS = {
    mode: "rich",
    theme: "dark",
    fontSize: 16,
    sidebar: true,
    seenIntro: false,
    caseSensitive: false,
    regex: false,
    normalizeWidth: false,
  };

  const EXPORT_TYPES = {
    markdown: { extension: "md", mime: "text/markdown;charset=utf-8" },
    html: { extension: "html", mime: "text/html;charset=utf-8" },
    json: { extension: "json", mime: "application/json;charset=utf-8" },
    quarto: { extension: "qmd", mime: "text/markdown;charset=utf-8" },
    text: { extension: "txt", mime: "text/plain;charset=utf-8" },
  };

  const SEED = [
    "# Goose Editor へようこそ",
    "",
    "Markdown を書き、その場で読む **ローカルファースト** エディタです。",
    "データはこのブラウザの `localStorage` にだけ保存され、外部へは送信しません。",
    "",
    "## まず試すこと",
    "",
    "1. この文章をそのまま編集する",
    "2. ツールバーで **Bold** や *Italic* を適用する",
    "3. `Ctrl / Cmd + S` で保存し、`Ctrl / Cmd + F` で検索する",
    "4. 書き出すメニューから Markdown / HTML / JSON / Quarto を出力する",
    "",
    "> 自動保存は編集が止まってから約 1.2 秒後。タブを閉じても内容は残ります。",
    "",
    "## ショートカット",
    "",
    "- `Ctrl / Cmd + B` — Bold",
    "- `Ctrl / Cmd + I` — Italic",
    "- `Ctrl / Cmd + K` — リンク",
    "- `Ctrl / Cmd + 1..3` — 見出し",
    "- `Ctrl / Cmd + Shift + 7` — 番号付きリスト",
    "- `Ctrl / Cmd + Shift + 8` — 箇条書き",
    "",
    "## コードブロック",
    "",
    "```js",
    "const message = \"hello, goose\";",
    "console.log(message);",
    "```",
    "",
    "---",
    "",
    "### メモ",
    "",
    "Rich と Source を切り替えると、同じ文書を別の面から編集できます。",
    "",
  ].join("\n");

  const state = {
    docs: [],
    activeId: null,
    settings: Object.assign({}, DEFAULT_SETTINGS),
    lastSaved: 0,
    dirty: false,
    find: { open: false, replace: false, query: "", replacement: "", matches: [], index: 0 },
    overlaySidebar: null,
  };

  const COMPACT_QUERY = "(max-width: 860px)";

  function isCompactScreen() {
    return window.matchMedia(COMPACT_QUERY).matches;
  }

  function sidebarVisible() {
    if (isCompactScreen()) return state.overlaySidebar === true;
    return state.settings.sidebar;
  }

  function toggleSidebar() {
    if (isCompactScreen()) {
      state.overlaySidebar = !sidebarVisible();
      applySettings();
      return;
    }
    state.settings.sidebar = !state.settings.sidebar;
    applySettings();
    persist({ silent: true });
  }

  const history = new Map();
  let autosaveTimer = null;
  let sourceSyncTimer = null;
  let toastTimer = null;

  const els = {};

  /* ---------------- utilities ---------------- */

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.from((scope || document).querySelectorAll(selector));
  }

  function uid() {
    return "doc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function now() {
    return Date.now();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function escapeHtml(value) {
    return MODEL.escapeHtml(value);
  }

  function activeDoc() {
    return state.docs.find((doc) => doc.id === state.activeId) || null;
  }

  function relativeTime(timestamp) {
    if (!timestamp) return "未保存";
    const seconds = Math.max(0, Math.round((now() - timestamp) / 1000));
    if (seconds < 10) return "たった今";
    if (seconds < 60) return seconds + " 秒前";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes + " 分前";
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours + " 時間前";
    return new Date(timestamp).toLocaleDateString("ja-JP");
  }

  function toast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
  }

  /* ---------------- persistence ---------------- */

  function seedDoc() {
    return { id: uid(), name: "welcome.md", source: SEED, createdAt: now(), updatedAt: now() };
  }

  function load() {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (error) {
      stored = null;
    }

    if (stored && Array.isArray(stored.docs) && stored.docs.length) {
      state.docs = stored.docs
        .filter((doc) => doc && typeof doc.id === "string" && typeof doc.source === "string")
        .map((doc) => ({
          id: doc.id,
          name: String(doc.name || "untitled.md"),
          source: doc.source,
          createdAt: Number(doc.createdAt) || now(),
          updatedAt: Number(doc.updatedAt) || now(),
        }));
    }
    if (!state.docs.length) state.docs = [seedDoc()];

    state.settings = Object.assign({}, DEFAULT_SETTINGS, stored && stored.settings);
    if (!MODEL.THEMES.includes(state.settings.theme)) state.settings.theme = "dark";
    state.settings.fontSize = clamp(Number(state.settings.fontSize) || 16, 12, 22);
    if (!["rich", "source"].includes(state.settings.mode)) state.settings.mode = "rich";
    state.settings.sidebar = state.settings.sidebar !== false;

    const wanted = stored && stored.activeId;
    state.activeId = state.docs.some((doc) => doc.id === wanted) ? wanted : state.docs[0].id;
    state.lastSaved = Number(stored && stored.lastSaved) || 0;
    state.docs.forEach((doc) => {
      history.set(doc.id, { undo: [], redo: [], previous: doc.source, lastPush: 0 });
    });
  }

  function persist(options) {
    const payload = {
      version: 1,
      docs: state.docs,
      activeId: state.activeId,
      settings: state.settings,
      lastSaved: state.lastSaved,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      state.lastSaved = now();
      state.dirty = false;
      if (!options || !options.silent) setSaveState("saved");
      updateSaveLabel();
      return true;
    } catch (error) {
      setSaveState("error");
      toast("保存できませんでした。ブラウザの空き容量を確認してください。");
      return false;
    }
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    setSaveState("dirty");
    autosaveTimer = setTimeout(() => persist(), AUTOSAVE_MS);
  }

  function saveNow(manual) {
    clearTimeout(autosaveTimer);
    const ok = persist();
    if (ok && manual) toast("保存しました");
    return ok;
  }

  function setSaveState(mode) {
    state.dirty = mode !== "saved";
    if (!els.saveState) return;
    els.saveState.dataset.state = mode;
    els.saveState.textContent =
      mode === "saved" ? "保存済み" : mode === "error" ? "保存エラー" : "未保存";
  }

  function updateSaveLabel() {
    if (!els.saveState || state.dirty) return;
    els.saveState.title = "最終保存: " + relativeTime(state.lastSaved);
    if (els.statusSave) els.statusSave.textContent = "保存済み · " + relativeTime(state.lastSaved);
  }

  /* ---------------- history (source mode) ---------------- */

  function historyFor(id) {
    if (!history.has(id)) {
      const doc = state.docs.find((item) => item.id === id);
      history.set(id, { undo: [], redo: [], previous: doc ? doc.source : "", lastPush: 0 });
    }
    return history.get(id);
  }

  function recordHistory(docId, nextSource) {
    const entry = historyFor(docId);
    const time = now();
    if (entry.previous !== nextSource) {
      if (time - entry.lastPush > 700) {
        entry.undo.push(entry.previous);
        if (entry.undo.length > MAX_HISTORY) entry.undo.shift();
        entry.redo = [];
        entry.lastPush = time;
      }
      entry.previous = nextSource;
    }
  }

  function undoSource() {
    const doc = activeDoc();
    if (!doc) return;
    const entry = historyFor(doc.id);
    if (!entry.undo.length) {
      toast("これ以上戻せません");
      return;
    }
    entry.redo.push(doc.source);
    const previous = entry.undo.pop();
    entry.previous = previous;
    doc.source = previous;
    doc.updatedAt = now();
    els.sourceEditor.value = previous;
    renderRich(previous);
    renderSourcePanel();
    updateStats();
    scheduleAutosave();
    toast("元に戻しました");
  }

  function redoSource() {
    const doc = activeDoc();
    if (!doc) return;
    const entry = historyFor(doc.id);
    if (!entry.redo.length) {
      toast("やり直す操作がありません");
      return;
    }
    entry.undo.push(doc.source);
    const next = entry.redo.pop();
    entry.previous = next;
    doc.source = next;
    doc.updatedAt = now();
    els.sourceEditor.value = next;
    renderRich(next);
    renderSourcePanel();
    updateStats();
    scheduleAutosave();
    toast("やり直しました");
  }

  /* ---------------- HTML -> Markdown ---------------- */

  function inlineMd(node) {
    if (node.nodeType === 3) return node.nodeValue.replace(/\u00a0/g, " ");
    if (node.nodeType !== 1) return "";
    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes).map(inlineMd).join("");
    switch (tag) {
      case "strong":
      case "b":
        return children.trim() ? "**" + children + "**" : children;
      case "em":
      case "i":
        return children.trim() ? "*" + children + "*" : children;
      case "del":
      case "s":
      case "strike":
        return children.trim() ? "~~" + children + "~~" : children;
      case "code":
        return "`" + children + "`";
      case "a":
        return "[" + children + "](" + (node.getAttribute("href") || "") + ")";
      case "img":
        return "![" + (node.getAttribute("alt") || "") + "](" + (node.getAttribute("src") || "") + ")";
      case "br":
        return "\n";
      default:
        return children;
    }
  }

  function listMd(list, depth) {
    const ordered = list.tagName.toLowerCase() === "ol";
    const indent = "  ".repeat(depth);
    let number = 1;
    const rows = [];
    Array.from(list.children).forEach((item) => {
      if (item.tagName.toLowerCase() !== "li") return;
      let text = "";
      let nested = "";
      Array.from(item.childNodes).forEach((child) => {
        if (child.nodeType === 1 && /^(UL|OL)$/i.test(child.tagName)) {
          nested += listMd(child, depth + 1);
        } else if (child.nodeType === 1 && /^(P|DIV)$/i.test(child.tagName)) {
          text += inlineMd(child);
        } else {
          text += inlineMd(child);
        }
      });
      const marker = ordered ? number++ + ". " : "- ";
      rows.push(indent + marker + text.trim().replace(/\n+/g, " ") + "\n" + nested);
    });
    return rows.join("");
  }

  function blockMd(node, depth) {
    if (node.nodeType === 3) {
      const text = node.nodeValue.replace(/\u00a0/g, " ");
      return text.trim() ? text.trim() + "\n\n" : "";
    }
    if (node.nodeType !== 1) return "";
    const tag = node.tagName.toLowerCase();
    switch (tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return "#".repeat(Number(tag[1])) + " " + inlineMd(node).trim() + "\n\n";
      case "p":
        return inlineMd(node).trim() + "\n\n";
      case "ul":
      case "ol":
        return listMd(node, depth) + "\n";
      case "blockquote": {
        const inner = Array.from(node.childNodes).map((child) => blockMd(child, depth)).join("");
        return inner
          .trim()
          .split("\n")
          .map((line) => (line ? "> " + line : ">"))
          .join("\n") + "\n\n";
      }
      case "pre": {
        const code = node.textContent.replace(/\n$/, "");
        const codeNode = node.querySelector("code");
        const className = (codeNode && codeNode.className) || "";
        const language = (className.match(/language-([\w+-]+)/) || [])[1] || "";
        return "```" + language + "\n" + code + "\n```\n\n";
      }
      case "hr":
        return "---\n\n";
      case "br":
        return "\n";
      case "div":
      case "section":
      case "article":
      case "main":
        return Array.from(node.childNodes).map((child) => blockMd(child, depth)).join("");
      default: {
        const text = inlineMd(node).trim();
        return text ? text + "\n\n" : "";
      }
    }
  }

  function htmlToMarkdown(root) {
    const raw = Array.from(root.childNodes).map((child) => blockMd(child, 0)).join("");
    return raw
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n+$/, "\n");
  }

  /* ---------------- rendering ---------------- */

  function renderDocList() {
    const docs = state.docs.slice().sort((a, b) => b.updatedAt - a.updatedAt);
    els.docList.innerHTML = docs
      .map((doc) => {
        const stats = MODEL.statistics(doc.source);
        const date = new Date(doc.updatedAt);
        const stamp = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(
          2,
          "0"
        )}:${String(date.getMinutes()).padStart(2, "0")}`;
        return (
          `<div class="doc-row${doc.id === state.activeId ? " active" : ""}" data-doc="${doc.id}">` +
          `<button type="button" class="doc-open" data-open="${doc.id}">` +
          `<span class="doc-icon" aria-hidden="true">▤</span>` +
          `<span class="doc-info"><span class="doc-name">${escapeHtml(doc.name)}</span>` +
          `<span class="doc-meta">${stamp} · ${stats.words} words</span></span>` +
          `</button>` +
          `<button type="button" class="doc-remove" data-remove="${doc.id}" aria-label="${escapeHtml(
            doc.name
          )} を削除" title="削除">⌫</button>` +
          `</div>`
        );
      })
      .join("");
    if (els.storageNote) {
      const total = state.docs.reduce((sum, doc) => sum + doc.source.length, 0);
      els.storageNote.textContent = `${state.docs.length} 文書 · ${new Intl.NumberFormat("ja-JP").format(
        total
      )} 文字`;
    }
  }

  function renderDocument() {
    const doc = activeDoc();
    if (!doc) return;
    els.documentTitle.textContent = doc.name;
    els.documentTitle.title = doc.name + " — ダブルクリックで名前を変更";
    els.sourceEditor.value = doc.source;
    document.title = doc.name + " — Goose Editor";
    renderDocList();
    renderRich(doc.source);
    renderSourcePanel();
    updateStats();
    updateSaveLabel();
    applySettings();
  }

  function renderRich(source) {
    const parsed = MODEL.parseMarkdown(source);
    els.rich.innerHTML = parsed.blocks.map(MODEL.blockToHtml).join("\n");
  }

  function highlightedSource(source) {
    if (!state.find.open || !state.find.query) return escapeHtml(source);
    const matches = state.find.matches;
    if (!matches.length) return escapeHtml(source);
    let out = "";
    let last = 0;
    matches.forEach((match, index) => {
      out += escapeHtml(source.slice(last, match.start));
      out += `<mark class="source-hit${index === state.find.index ? " active" : ""}" data-match="${index}">${escapeHtml(
        source.slice(match.start, match.end)
      )}</mark>`;
      last = match.end;
    });
    out += escapeHtml(source.slice(last));
    return out;
  }

  function renderSourcePanel() {
    const doc = activeDoc();
    if (!doc) return;
    const richMode = state.settings.mode === "rich";
    els.sourceView.hidden = !richMode;
    els.renderedView.hidden = richMode;
    els.sourceTitle.textContent = richMode ? "Source Preview" : "Rendered Preview";
    els.sourceHint.textContent = richMode
      ? "Markdown ソース · 読み取り専用"
      : "Markdown を描画した結果";

    if (richMode) {
      els.sourceView.innerHTML = highlightedSource(doc.source);
    } else {
      const parsed = MODEL.parseMarkdown(doc.source);
      els.renderedView.innerHTML =
        parsed.blocks.map(MODEL.blockToHtml).join("\n") ||
        '<p class="empty-note">まだ内容がありません。ソースを編集してください。</p>';
    }
    const stats = MODEL.statistics(doc.source);
    els.sourceStats.textContent = `${stats.characters} 文字 · ${stats.words} 語`;
    if (state.find.open && state.find.query) {
      requestAnimationFrame(() => {
        const active = els.sourceView.querySelector("mark.active");
        if (active && !active.hidden) active.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
  }

  function updateStats() {
    const doc = activeDoc();
    if (!doc) return;
    const stats = MODEL.statistics(doc.source);
    els.statusChars.textContent = `${stats.characters} 文字`;
    els.statusWords.textContent = `${stats.words} 語`;
    updateCaret();
  }

  function caretLineColumn(text) {
    const before = text || "";
    const line = before.split("\n").length;
    const column = before.length - before.lastIndexOf("\n");
    return [line, column];
  }

  function updateCaret() {
    if (!els.statusLine) return;
    const doc = activeDoc();
    if (!doc) return;
    if (state.settings.mode === "source") {
      const value = els.sourceEditor.value;
      const position = els.sourceEditor.selectionStart;
      const [line, col] = caretLineColumn(value.slice(0, position));
      els.statusLine.textContent = `Ln ${line}, Col ${col}`;
      return;
    }
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !els.rich.contains(selection.anchorNode)) {
      els.statusLine.textContent = "Ln 1, Col 1";
      return;
    }
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(els.rich);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    const [line, col] = caretLineColumn(range.toString());
    els.statusLine.textContent = `Ln ${line}, Col ${col}`;
  }

  function renderFindState() {
    if (!els.findCount) return;
    const total = state.find.matches.length;
    const current = total ? state.find.index + 1 : 0;
    els.findCount.textContent = `${current} / ${total}`;
    els.findPanel.classList.toggle("no-results", total === 0 && Boolean(state.find.query));
  }

  function applySettings() {
    const root = document.documentElement;
    root.dataset.theme = state.settings.theme;
    root.style.setProperty("--editor-size", state.settings.fontSize + "px");
    document.body.classList.toggle("mode-source", state.settings.mode === "source");
    document.body.classList.toggle("mode-rich", state.settings.mode === "rich");
    document.body.classList.toggle("sidebar-hidden", !sidebarVisible());
    document.body.classList.toggle("sidebar-overlay", isCompactScreen() && sidebarVisible());
    $$(".mode-btn").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.mode === state.settings.mode));
    });
    els.rich.setAttribute("contenteditable", state.settings.mode === "rich" ? "true" : "false");
    els.sourceEditor.hidden = state.settings.mode !== "source";
    els.rich.hidden = state.settings.mode !== "rich";
    if (els.statusTheme) els.statusTheme.textContent = state.settings.theme;
    if (els.themeLabel) {
      els.themeLabel.textContent =
        state.settings.theme === "dark" ? "Dark" : state.settings.theme === "light" ? "Light" : "Sepia";
    }
    renderSourcePanel();
  }

  /* ---------------- editing / sync ---------------- */

  function syncFromRich() {
    const doc = activeDoc();
    if (!doc) return;
    const markdown = htmlToMarkdown(els.rich);
    doc.source = markdown;
    doc.updatedAt = now();
    els.sourceEditor.value = markdown;
    renderSourcePanel();
    updateStats();
    scheduleAutosave();
    renderDocList();
  }

  function syncFromSource() {
    const doc = activeDoc();
    if (!doc) return;
    const markdown = els.sourceEditor.value;
    doc.source = markdown;
    doc.updatedAt = now();
    recordHistory(doc.id, markdown);
    renderRich(markdown);
    renderSourcePanel();
    updateStats();
    scheduleAutosave();
    renderDocList();
  }

  function scheduleSourceSync() {
    clearTimeout(sourceSyncTimer);
    sourceSyncTimer = setTimeout(() => syncFromSource(), 90);
  }

  /* ---------------- rich formatting ---------------- */

  function insertHtml(html) {
    els.rich.focus();
    document.execCommand("insertHTML", false, html);
    syncFromRich();
  }

  function wrapInline(tag, placeholder) {
    const selection = window.getSelection();
    const selected = selection && selection.toString();
    const text = selected || placeholder;
    insertHtml("<" + tag + ">" + escapeHtml(text) + "</" + tag + ">");
  }

  function applyRich(command, value) {
    els.rich.focus();
    switch (command) {
      case "bold":
        document.execCommand("bold");
        break;
      case "italic":
        document.execCommand("italic");
        break;
      case "strike":
        document.execCommand("strikeThrough");
        break;
      case "code":
        wrapInline("code", "code");
        break;
      case "link": {
        const url = window.prompt("リンク先 URL", "https://");
        if (url === null) break;
        if (window.getSelection().isCollapsed) {
          document.execCommand("insertHTML", false, `[link](${escapeHtml(url)})`);
        } else {
          document.execCommand("createLink", false, url.trim() || "https://");
        }
        break;
      }
      case "h1":
        document.execCommand("formatBlock", false, "H1");
        break;
      case "h2":
        document.execCommand("formatBlock", false, "H2");
        break;
      case "h3":
        document.execCommand("formatBlock", false, "H3");
        break;
      case "paragraph":
        document.execCommand("formatBlock", false, "P");
        break;
      case "ul":
        document.execCommand("insertUnorderedList");
        break;
      case "ol":
        document.execCommand("insertOrderedList");
        break;
      case "quote":
        document.execCommand("formatBlock", false, "BLOCKQUOTE");
        break;
      case "codeblock": {
        const selection = window.getSelection();
        const text = selection && selection.toString() ? selection.toString() : "code";
        insertHtml("<pre><code>" + escapeHtml(text) + "</code></pre><p><br></p>");
        break;
      }
      case "hr":
        document.execCommand("insertHorizontalRule");
        break;
      case "undo":
        document.execCommand("undo");
        break;
      case "redo":
        document.execCommand("redo");
        break;
      default:
        break;
    }
    if (command !== "code" && command !== "link" && command !== "codeblock") syncFromRich();
    updateCaret();
  }

  /* ---------------- source formatting ---------------- */

  function currentLine() {
    const value = els.sourceEditor.value;
    const start = value.lastIndexOf("\n", els.sourceEditor.selectionStart - 1) + 1;
    let end = value.indexOf("\n", els.sourceEditor.selectionStart);
    if (end === -1) end = value.length;
    return { start, end, text: value.slice(start, end) };
  }

  function replaceSelection(text, selectStart, selectEnd) {
    const start = els.sourceEditor.selectionStart;
    const end = els.sourceEditor.selectionEnd;
    els.sourceEditor.setRangeText(text, start, end, "end");
    if (selectStart != null) {
      els.sourceEditor.setSelectionRange(start + selectStart, start + selectEnd);
    }
    syncFromSource();
  }

  function wrapSource(before, after, placeholder) {
    const start = els.sourceEditor.selectionStart;
    const end = els.sourceEditor.selectionEnd;
    const selected = els.sourceEditor.value.slice(start, end);
    const body = selected || placeholder || "";
    replaceSelection(before + body + after, before.length, before.length + body.length);
  }

  function applySource(command) {
    switch (command) {
      case "bold":
        wrapSource("**", "**", "bold");
        return;
      case "italic":
        wrapSource("*", "*", "italic");
        return;
      case "strike":
        wrapSource("~~", "~~", "text");
        return;
      case "code":
        wrapSource("`", "`", "code");
        return;
      case "codeblock":
        wrapSource("```\n", "\n```", "code");
        return;
      case "link": {
        const start = els.sourceEditor.selectionStart;
        const end = els.sourceEditor.selectionEnd;
        const selected = els.sourceEditor.value.slice(start, end) || "link";
        const url = window.prompt("リンク先 URL", "https://");
        if (url === null) return;
        replaceSelection(`[${selected}](${url.trim() || "https://"})`, 0, 0);
        return;
      }
      case "h1":
      case "h2":
      case "h3": {
        const level = Number(command[1]);
        const line = currentLine();
        const next = "#".repeat(level) + " " + line.text.replace(/^#{1,6}\s+/, "");
        els.sourceEditor.setRangeText(next, line.start, line.end, "select");
        syncFromSource();
        return;
      }
      case "paragraph": {
        const line = currentLine();
        els.sourceEditor.setRangeText(line.text.replace(/^#{1,6}\s+/, ""), line.start, line.end, "select");
        syncFromSource();
        return;
      }
      case "ul":
      case "ol": {
        const marker = command === "ul" ? "- " : "1. ";
        const line = currentLine();
        const stripped = line.text.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");
        els.sourceEditor.setRangeText(marker + stripped, line.start, line.end, "select");
        syncFromSource();
        return;
      }
      case "quote": {
        const line = currentLine();
        const next = /^\s*>\s?/.test(line.text)
          ? line.text.replace(/^\s*>\s?/, "")
          : "> " + line.text;
        els.sourceEditor.setRangeText(next, line.start, line.end, "select");
        syncFromSource();
        return;
      }
      case "hr": {
        const line = currentLine();
        els.sourceEditor.setRangeText("\n\n---\n\n", line.end, line.end, "end");
        syncFromSource();
        return;
      }
      case "undo":
        undoSource();
        return;
      case "redo":
        redoSource();
        return;
      default:
        return;
    }
  }

  function handleCommand(command) {
    if (state.settings.mode === "rich") applyRich(command);
    else applySource(command);
  }

  /* ---------------- search and replace ---------------- */

  function findOptions() {
    return {
      caseSensitive: state.settings.caseSensitive,
      regex: state.settings.regex,
      normalizeWidth: state.settings.normalizeWidth,
    };
  }

  function computeMatches() {
    const doc = activeDoc();
    if (!doc) return;
    state.find.matches = MODEL.findMatches(doc.source, state.find.query, findOptions());
    state.find.index = clamp(state.find.index, 0, Math.max(0, state.find.matches.length - 1));
    if (!state.find.matches.length) state.find.index = 0;
    renderFindState();
    renderSourcePanel();
  }

  function selectMatch(index) {
    const matches = state.find.matches;
    if (!matches.length) return;
    state.find.index = (index + matches.length) % matches.length;
    const match = matches[state.find.index];
    if (state.settings.mode === "source") {
      els.sourceEditor.focus();
      els.sourceEditor.setSelectionRange(match.start, match.end);
    }
    renderSourcePanel();
    updateCaret();
    renderFindState();
  }

  function openFind(replace) {
    state.find.open = true;
    state.find.replace = Boolean(replace);
    els.findPanel.hidden = false;
    els.findPanel.classList.toggle("with-replace", Boolean(replace));
    if (state.settings.mode === "rich" && state.find.query) {
      state.settings.mode = "source";
      applySettings();
    }
    const selected =
      state.settings.mode === "source"
        ? els.sourceEditor.value.slice(els.sourceEditor.selectionStart, els.sourceEditor.selectionEnd)
        : "";
    if (selected && selected.length < 200) {
      state.find.query = selected;
      els.findInput.value = selected;
    }
    computeMatches();
    if (state.find.query) selectMatch(0);
    els.findInput.focus();
    els.findInput.select();
  }

  function closeFind() {
    state.find.open = false;
    els.findPanel.hidden = true;
    renderSourcePanel();
    if (state.settings.mode === "source") els.sourceEditor.focus();
    else els.rich.focus();
  }

  function replaceCurrent() {
    const doc = activeDoc();
    const match = state.find.matches[state.find.index];
    if (!doc || !match) return;
    let replacement = state.find.replacement;
    if (state.settings.regex) {
      try {
        replacement = doc.source
          .slice(match.start, match.end)
          .replace(
            new RegExp(state.find.query, state.settings.caseSensitive ? "" : "i"),
            replacement
          );
      } catch (error) {
        toast("正規表現を確認してください");
        return;
      }
    }
    doc.source = doc.source.slice(0, match.start) + replacement + doc.source.slice(match.end);
    doc.updatedAt = now();
    els.sourceEditor.value = doc.source;
    renderRich(doc.source);
    const next = clamp(state.find.index, 0, Math.max(0, state.find.matches.length - 2));
    computeMatches();
    selectMatch(next);
    scheduleAutosave();
  }

  function replaceAll() {
    const doc = activeDoc();
    if (!doc) return;
    if (!state.find.query) return;
    if (!window.confirm(state.find.matches.length + " 件を置換します。よろしいですか？")) return;
    const options = findOptions();
    let pattern;
    try {
      pattern = new RegExp(
        options.regex ? state.find.query : escapeRegExp(state.find.query),
        options.caseSensitive ? "g" : "gi"
      );
    } catch (error) {
      toast("正規表現を確認してください");
      return;
    }
    doc.source = doc.source.replace(pattern, state.find.replacement);
    doc.updatedAt = now();
    els.sourceEditor.value = doc.source;
    renderRich(doc.source);
    computeMatches();
    scheduleAutosave();
    toast("置換しました");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* ---------------- documents ---------------- */

  function markIntroSeen() {
    if (state.settings.seenIntro) return;
    state.settings.seenIntro = true;
    persist({ silent: true });
  }

  function switchDoc(id) {
    if (id === state.activeId) return;
    if (!state.docs.some((doc) => doc.id === id)) return;
    persist({ silent: true });
    state.activeId = id;
    state.find.matches = [];
    state.find.index = 0;
    if (isCompactScreen()) state.overlaySidebar = false;
    renderDocument();
    if (state.settings.mode === "rich") els.rich.focus();
    else els.sourceEditor.focus();
  }

  function createDoc() {
    const doc = { id: uid(), name: "untitled.md", source: "", createdAt: now(), updatedAt: now() };
    state.docs.unshift(doc);
    state.activeId = doc.id;
    history.set(doc.id, { undo: [], redo: [], previous: "", lastPush: 0 });
    markIntroSeen();
    hideIntro();
    if (isCompactScreen()) state.overlaySidebar = false;
    renderDocument();
    persist({ silent: true });
    if (state.settings.mode === "rich") els.rich.focus();
    else els.sourceEditor.focus();
    toast("新しい文書を作成しました");
  }

  function removeDoc(id) {
    if (state.docs.length === 1) {
      toast("最後の文書は削除できません");
      return;
    }
    const doc = state.docs.find((item) => item.id === id);
    if (!doc) return;
    if (!window.confirm(`「${doc.name}」を削除します。よろしいですか？`)) return;
    const index = state.docs.findIndex((item) => item.id === id);
    state.docs.splice(index, 1);
    history.delete(id);
    if (state.activeId === id) state.activeId = state.docs[Math.max(0, index - 1)].id;
    renderDocument();
    persist({ silent: true });
    toast("削除しました");
  }

  function renameDoc(id, name) {
    const doc = state.docs.find((item) => item.id === id);
    if (!doc) return;
    const next = (name || window.prompt("文書名", doc.name) || "").trim();
    if (!next) return;
    doc.name = /\.(md|txt|qmd)$/i.test(next) ? next : next + ".md";
    doc.updatedAt = now();
    renderDocument();
    persist({ silent: true });
  }

  function importText(text, fileName) {
    const name = fileName || "imported.md";
    const doc = { id: uid(), name, source: text, createdAt: now(), updatedAt: now() };
    state.docs.unshift(doc);
    state.activeId = doc.id;
    history.set(doc.id, { undo: [], redo: [], previous: text, lastPush: 0 });
    markIntroSeen();
    hideIntro();
    renderDocument();
    persist({ silent: true });
    toast(`${name} を開きました`);
  }

  /* ---------------- export ---------------- */

  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportAs(kind) {
    const doc = activeDoc();
    if (!doc) return;
    const type = EXPORT_TYPES[kind];
    if (!type) return;
    const parsed = MODEL.parseMarkdown(doc.source);
    const base = doc.name.replace(/\.[^.]+$/, "") || "untitled";
    const title = MODEL.titleOf(parsed, base);
    let content;
    switch (kind) {
      case "html":
        content = MODEL.documentToHtml(parsed, { title });
        break;
      case "json":
        content = JSON.stringify(MODEL.documentToJson(parsed), null, 2) + "\n";
        break;
      case "quarto":
        content = MODEL.documentToQuarto(parsed, { title, author: "Goose Editor" });
        break;
      case "text":
        content = MODEL.documentToPlain(parsed);
        break;
      default:
        content = doc.source.endsWith("\n") ? doc.source : doc.source + "\n";
        break;
    }
    download(MODEL.safeFileName(base, type.extension), content, type.mime);
    toast(`${kind} を書き出しました`);
  }

  async function copyMarkdown() {
    const doc = activeDoc();
    if (!doc) return;
    try {
      await navigator.clipboard.writeText(doc.source);
      toast("Markdown をコピーしました");
    } catch (error) {
      toast("クリップボードへコピーできませんでした");
    }
  }

  /* ---------------- intro ---------------- */

  function showIntroIfNeeded() {
    if (state.settings.seenIntro) {
      hideIntro();
      return;
    }
    els.intro.hidden = false;
    requestAnimationFrame(() => els.intro.classList.add("show"));
  }

  function hideIntro() {
    if (!els.intro) return;
    els.intro.classList.remove("show");
    setTimeout(() => {
      els.intro.hidden = true;
    }, 180);
  }

  /* ---------------- wiring ---------------- */

  function bind() {
    els.rich.addEventListener("input", () => {
      markIntroSeen();
      syncFromRich();
    });
    els.rich.addEventListener("keyup", updateCaret);
    els.rich.addEventListener("mouseup", updateCaret);
    els.rich.addEventListener("paste", (event) => {
      const text = event.clipboardData && event.clipboardData.getData("text/plain");
      if (!text) return;
      event.preventDefault();
      document.execCommand("insertText", false, text);
    });
    els.rich.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        event.preventDefault();
        document.execCommand("insertText", false, "  ");
      }
    });

    els.sourceEditor.addEventListener("input", () => {
      markIntroSeen();
      scheduleSourceSync();
    });
    els.sourceEditor.addEventListener("click", updateCaret);
    els.sourceEditor.addEventListener("keyup", updateCaret);
    els.sourceEditor.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        event.preventDefault();
        const start = els.sourceEditor.selectionStart;
        els.sourceEditor.setRangeText("  ", start, els.sourceEditor.selectionEnd, "end");
        syncFromSource();
      }
    });

    els.docList.addEventListener("click", (event) => {
      const open = event.target.closest("[data-open]");
      const remove = event.target.closest("[data-remove]");
      if (remove) removeDoc(remove.dataset.remove);
      else if (open) switchDoc(open.dataset.open);
    });
    els.docList.addEventListener("dblclick", (event) => {
      const row = event.target.closest(".doc-row");
      if (row) renameDoc(row.dataset.doc);
    });
    els.documentTitle.addEventListener("dblclick", () => renameDoc(state.activeId));

    document.addEventListener("keydown", handleShortcut);

    $$(".mode-btn").forEach((button) => {
      button.addEventListener("click", () => {
        state.settings.mode = button.dataset.mode;
        applySettings();
        persist({ silent: true });
        updateStats();
        renderSourcePanel();
      });
    });

    els.toolbar.addEventListener("mousedown", (event) => {
      if (event.target.closest("[data-command]")) event.preventDefault();
    });
    els.toolbar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-command]");
      if (button) handleCommand(button.dataset.command);
    });

    els.btnNew.addEventListener("click", createDoc);
    if (els.btnNewInline) els.btnNewInline.addEventListener("click", createDoc);
    els.btnOpen.addEventListener("click", () => els.fileInput.click());
    els.btnSave.addEventListener("click", () => saveNow(true));
    els.btnTheme.addEventListener("click", () => {
      const index = MODEL.THEMES.indexOf(state.settings.theme);
      state.settings.theme = MODEL.THEMES[(index + 1) % MODEL.THEMES.length];
      applySettings();
      persist({ silent: true });
    });
    els.btnSidebar.addEventListener("click", toggleSidebar);
    els.btnHelp.addEventListener("click", () => els.helpDialog.showModal());
    els.btnCloseHelp.addEventListener("click", () => els.helpDialog.close());

    $$("[data-export]").forEach((button) => {
      button.addEventListener("click", () => {
        exportAs(button.dataset.export);
        if (els.exportMenu) els.exportMenu.open = false;
      });
    });
    if (els.copyMarkdown) els.copyMarkdown.addEventListener("click", copyMarkdown);

    els.fontSmaller.addEventListener("click", () => {
      state.settings.fontSize = clamp(state.settings.fontSize - 1, 12, 22);
      applySettings();
      persist({ silent: true });
    });
    els.fontLarger.addEventListener("click", () => {
      state.settings.fontSize = clamp(state.settings.fontSize + 1, 12, 22);
      applySettings();
      persist({ silent: true });
    });

    els.fileInput.addEventListener("change", () => {
      const file = els.fileInput.files && els.fileInput.files[0];
      if (!file) return;
      file.text().then((text) => importText(text, file.name));
      els.fileInput.value = "";
    });

    window.addEventListener("dragover", (event) => {
      event.preventDefault();
      document.body.classList.add("dragging");
    });
    window.addEventListener("dragleave", (event) => {
      if (event.target === document.documentElement) document.body.classList.remove("dragging");
    });
    window.addEventListener("drop", (event) => {
      event.preventDefault();
      document.body.classList.remove("dragging");
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file) return;
      file.text().then((text) => importText(text, file.name));
    });

    els.findInput.addEventListener("input", () => {
      state.find.query = els.findInput.value;
      state.find.index = 0;
      computeMatches();
      if (state.find.matches.length) selectMatch(0);
    });
    els.replaceInput.addEventListener("input", () => {
      state.find.replacement = els.replaceInput.value;
    });
    els.findInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        selectMatch(state.find.index + (event.shiftKey ? -1 : 1));
      } else if (event.key === "Escape") {
        closeFind();
      }
    });
    els.findPrev.addEventListener("click", () => selectMatch(state.find.index - 1));
    els.findNext.addEventListener("click", () => selectMatch(state.find.index + 1));
    els.replaceOne.addEventListener("click", replaceCurrent);
    els.replaceAll.addEventListener("click", replaceAll);
    els.findClose.addEventListener("click", closeFind);
    $$("[data-find-option]").forEach((input) => {
      input.addEventListener("change", () => {
        state.settings[input.dataset.findOption] = input.checked;
        computeMatches();
      });
    });

    els.introStart.addEventListener("click", () => {
      markIntroSeen();
      hideIntro();
      renderDocument();
      if (state.settings.mode === "rich") els.rich.focus();
      else els.sourceEditor.focus();
    });
    els.introNew.addEventListener("click", createDoc);

    window.addEventListener("beforeunload", () => persist({ silent: true }));
    window.addEventListener("resize", applySettings);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") persist({ silent: true });
    });

    setInterval(() => {
      updateSaveLabel();
      if (state.find.open && state.find.query) computeMatches();
    }, 30000);
  }

  function handleShortcut(event) {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    const inRich = document.activeElement === els.rich;
    const inSource = document.activeElement === els.sourceEditor;

    if (event.key === "Escape" && state.find.open) {
      closeFind();
      return;
    }
    if (event.key === "Escape" && isCompactScreen() && sidebarVisible()) {
      state.overlaySidebar = false;
      applySettings();
      return;
    }

    if (mod && key === "s") {
      event.preventDefault();
      saveNow(true);
      return;
    }
    if (mod && key === "n") {
      event.preventDefault();
      createDoc();
      return;
    }
    if (mod && key === "o") {
      event.preventDefault();
      els.fileInput.click();
      return;
    }
    if (mod && key === "f") {
      event.preventDefault();
      openFind(false);
      return;
    }
    if (mod && key === "h") {
      event.preventDefault();
      openFind(true);
      return;
    }
    if (mod && key === "\\") {
      event.preventDefault();
      toggleSidebar();
      return;
    }

    if (inSource) {
      if (mod && !event.shiftKey && key === "z") {
        event.preventDefault();
        undoSource();
        return;
      }
      if (mod && (key === "y" || (event.shiftKey && key === "z"))) {
        event.preventDefault();
        redoSource();
        return;
      }
    }

    if (!inRich && !inSource) return;

    if (mod && key === "b") {
      event.preventDefault();
      handleCommand("bold");
      return;
    }
    if (mod && key === "i") {
      event.preventDefault();
      handleCommand("italic");
      return;
    }
    if (mod && key === "k") {
      event.preventDefault();
      handleCommand("link");
      return;
    }
    if (mod && key === "`") {
      event.preventDefault();
      handleCommand("code");
      return;
    }
    if (mod && /^[0-6]$/.test(event.key)) {
      event.preventDefault();
      if (inRich) {
        if (event.key === "0") applyRich("paragraph");
        else applyRich("h" + Math.min(3, Number(event.key)));
      } else {
        const command = event.key === "0" ? "paragraph" : "h" + Math.min(3, Number(event.key));
        applySource(command);
      }
      return;
    }
    if (mod && event.shiftKey && event.key === "7") {
      event.preventDefault();
      handleCommand("ol");
      return;
    }
    if (mod && event.shiftKey && event.key === "8") {
      event.preventDefault();
      handleCommand("ul");
      return;
    }
    if (mod && event.shiftKey && event.key === ">") {
      event.preventDefault();
      handleCommand("quote");
      return;
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    navigator.serviceWorker
      .register("sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              toast("新しいバージョンを準備しました。再読み込みで更新されます。");
            }
          });
        });
      })
      .catch(() => {
        /* offline cache is optional; the editor still works without it */
      });
  }

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: window-controls-overlay)").matches ||
      window.navigator.standalone === true
    );
  }

  function setupPwa() {
    registerServiceWorker();
    if (!els.btnInstall) return;
    if (isStandalone()) {
      els.btnInstall.hidden = true;
      document.body.classList.add("standalone");
      return;
    }

    let deferredPrompt = null;

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredPrompt = event;
      els.btnInstall.hidden = false;
    });

    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      els.btnInstall.hidden = true;
      toast("Goose Editor をインストールしました");
    });

    // iOS Safari has no beforeinstallprompt; offer the manual instructions.
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) els.btnInstall.hidden = false;

    els.btnInstall.addEventListener("click", async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try {
          await deferredPrompt.userChoice;
        } catch (error) {
          /* the prompt may already be resolved */
        }
        deferredPrompt = null;
        els.btnInstall.hidden = true;
        return;
      }
      toast(
        isIos
          ? "共有メニューの「ホーム画面に追加」からインストールできます"
          : "ブラウザのメニューから「インストール」または「ホーム画面に追加」を選んでください"
      );
    });
  }

  function assignEls() {
    const map = {
      rich: "rich",
      sourceEditor: "source-editor",
      sourceView: "source-view",
      renderedView: "rendered-view",
      sourceTitle: "source-title",
      sourceHint: "source-hint",
      sourceStats: "source-stats",
      docList: "doc-list",
      storageNote: "storage-note",
      saveState: "save-state",
      documentTitle: "document-title",
      toast: "toast",
      statusLine: "status-line",
      statusChars: "status-chars",
      statusWords: "status-words",
      statusTheme: "status-theme",
      statusSave: "status-save",
      findPanel: "find-panel",
      findInput: "find-input",
      replaceInput: "replace-input",
      findCount: "find-count",
      findPrev: "find-prev",
      findNext: "find-next",
      replaceOne: "replace-one",
      replaceAll: "replace-all",
      findClose: "find-close",
      toolbar: "toolbar",
      btnNew: "btn-new",
      btnNewInline: "btn-new-inline",
      btnOpen: "btn-open",
      btnSave: "btn-save",
      btnTheme: "btn-theme",
      btnSidebar: "btn-sidebar",
      btnHelp: "btn-help",
      btnInstall: "btn-install",
      btnCloseHelp: "btn-close-help",
      helpDialog: "help-dialog",
      exportMenu: "export-menu",
      copyMarkdown: "copy-markdown",
      fontSmaller: "font-smaller",
      fontLarger: "font-larger",
      fileInput: "file-input",
      themeLabel: "theme-label",
      intro: "intro",
      introStart: "intro-start",
      introNew: "intro-new",
    };
    Object.keys(map).forEach((key) => {
      els[key] = document.getElementById(map[key]);
    });
  }

  function init() {
    assignEls();
    load();
    renderDocument();
    bind();
    updateSaveLabel();
    showIntroIfNeeded();
    setupPwa();
    if (state.settings.mode === "rich") els.rich.focus();
    else els.sourceEditor.focus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
