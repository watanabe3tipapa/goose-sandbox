/*
 * A small, conservative Goose syntax highlighter.
 *
 * It only knows four token classes -- comment, string, number, keyword/type --
 * which keeps the viewer honest: the source is shown verbatim and this is a
 * reading aid, not a parser. The tokenizer is a single left-to-right scan, so
 * a `//` inside a string is not mistaken for a comment.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GooseHighlight = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const KEYWORDS = new Set(
    (
      "import namespace struct enum type fn thread_fn export simd recursive let var extern " +
      "const pad reusable if else while for in loop block guard defer match return break " +
      "continue as true false null self"
    ).split(" ")
  );

  const TYPES = new Set(
    "bool varint i8 i16 i32 i64 u8 u16 u32 u64 f32 f64".split(" ")
  );

  const CONTEXTUAL = new Set(["from", "upto", "inline", "checkfree", "fields", "types"]);

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isDigit(ch) {
    return ch >= "0" && ch <= "9";
  }

  function isWordStart(ch) {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
  }

  function isWordPart(ch) {
    return isWordStart(ch) || isDigit(ch);
  }

  function tokenize(source) {
    const text = String(source).replace(/\r\n?/g, "\n");
    const tokens = [];
    let i = 0;

    while (i < text.length) {
      const ch = text[i];

      if (ch === "/" && text[i + 1] === "/") {
        let end = text.indexOf("\n", i);
        if (end === -1) end = text.length;
        tokens.push({ type: "comment", text: text.slice(i, end) });
        i = end;
        continue;
      }

      if (ch === '"' && text.startsWith('"""', i)) {
        const close = text.indexOf('"""', i + 3);
        const end = close === -1 ? text.length : close + 3;
        tokens.push({ type: "string", text: text.slice(i, end) });
        i = end;
        continue;
      }

      if (ch === '"') {
        let j = i + 1;
        let closed = false;
        while (j < text.length) {
          if (text[j] === "\\") {
            j += 2;
            continue;
          }
          if (text[j] === '"') {
            j += 1;
            closed = true;
            break;
          }
          if (text[j] === "\n") break;
          j += 1;
        }
        const end = closed ? j : Math.min(j, text.length);
        tokens.push({ type: "string", text: text.slice(i, end) });
        i = end;
        continue;
      }

      if (isDigit(ch)) {
        let j = i + 1;
        while (j < text.length && (isWordPart(text[j]) || text[j] === ".")) j += 1;
        tokens.push({ type: "number", text: text.slice(i, j) });
        i = j;
        continue;
      }

      if (isWordStart(ch)) {
        let j = i + 1;
        while (j < text.length && isWordPart(text[j])) j += 1;
        const word = text.slice(i, j);
        const type = KEYWORDS.has(word) || CONTEXTUAL.has(word)
          ? "keyword"
          : TYPES.has(word)
            ? "type"
            : "plain";
        tokens.push({ type, text: word });
        i = j;
        continue;
      }

      tokens.push({ type: "plain", text: ch });
      i += 1;
    }

    return tokens;
  }

  function highlightLines(source) {
    const tokens = tokenize(source);
    const lines = [];
    let current = "";

    tokens.forEach((token) => {
      const parts = token.text.split("\n");
      parts.forEach((part, index) => {
        if (index > 0) {
          lines.push(current);
          current = "";
        }
        if (!part) return;
        current += token.type === "plain"
          ? escapeHtml(part)
          : `<span class="tok-${token.type}">${escapeHtml(part)}</span>`;
      });
    });
    lines.push(current);

    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    return lines;
  }

  function highlight(source) {
    return highlightLines(source).join("\n");
  }

  return { escapeHtml, tokenize, highlightLines, highlight, KEYWORDS, TYPES };
});
