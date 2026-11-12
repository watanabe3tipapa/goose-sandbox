/*
 * Goose Editor model
 *
 * Dependency-free Markdown document helpers shared by the editor and the
 * Node tests. The browser prototype keeps the same boundaries as the Goose
 * core described in the implementation plan:
 *
 *   - parse Markdown into a block document
 *   - serialize the document back to Markdown
 *   - render HTML, plain text, JSON and Quarto exports
 *   - search, statistics and title extraction
 *
 * Loaded with a plain <script> tag and required from node:test.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GooseEditorModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0";

  const THEMES = ["light", "dark", "sepia"];

  const EMBEDDED_CSS = [
    "body{margin:0;background:#fff;color:#161616;font-family:Inter,'Noto Sans JP',system-ui,sans-serif;line-height:1.8}",
    ".goose-document{max-width:72ch;margin:48px auto;padding:0 24px}",
    ".goose-document h1,.goose-document h2,.goose-document h3{line-height:1.3;margin:1.6em 0 .6em}",
    ".goose-document h1{font-size:2rem;border-bottom:3px solid #0b0b0b;padding-bottom:.25em}",
    ".goose-document h2{font-size:1.45rem}",
    ".goose-document p{margin:.8em 0}",
    ".goose-document ul,.goose-document ol{padding-left:1.4em}",
    ".goose-document blockquote{margin:1em 0;padding:.4em 1em;border-left:4px solid #00e5a8;background:#f7f7f7}",
    ".goose-document pre{padding:14px 16px;border:2px solid #0b0b0b;background:#f7f7f7;overflow:auto}",
    ".goose-document code{font-family:'Roboto Mono',ui-monospace,monospace;font-size:.9em}",
    ".goose-document :not(pre)>code{padding:1px 5px;border:1px dashed #0b0b0b;background:#fff}",
    ".goose-document hr{border:0;border-top:3px solid #0b0b0b;margin:2em 0}",
    ".goose-document a{color:#007a5a;text-decoration-thickness:2px}",
    ".goose-document del{color:#6b6b6b}",
  ].join("");

  const BLOCK_START = /^\s{0,3}(?:#{1,6}\s|```|~~~|>\s?|[-*+]\s|\d+[.)]\s|(?:[-*_]\s*){3,}$)/;

  const INLINE_PATTERN =
    /`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\[([^\]\n]+)\]\(([^)\s]+)\)|\*([^*\n]+)\*|_([^_\n]+)_/g;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/\n/g, " ");
  }

  /* ---------------- inline parsing ---------------- */

  function parseInline(text) {
    const source = String(text == null ? "" : text);
    const tokens = [];
    let last = 0;
    let match;

    INLINE_PATTERN.lastIndex = 0;
    while ((match = INLINE_PATTERN.exec(source))) {
      if (match.index > last) {
        tokens.push({ type: "text", text: source.slice(last, match.index) });
      }
      if (match[1] !== undefined) {
        tokens.push({ type: "code", text: match[1] });
      } else if (match[2] !== undefined || match[3] !== undefined) {
        tokens.push({ type: "strong", text: match[2] !== undefined ? match[2] : match[3] });
      } else if (match[4] !== undefined) {
        tokens.push({ type: "del", text: match[4] });
      } else if (match[5] !== undefined) {
        tokens.push({ type: "link", text: match[5], url: match[6] });
      } else if (match[7] !== undefined || match[8] !== undefined) {
        tokens.push({ type: "em", text: match[7] !== undefined ? match[7] : match[8] });
      }
      last = match.index + match[0].length;
    }

    if (last < source.length) {
      tokens.push({ type: "text", text: source.slice(last) });
    }
    if (!tokens.length) tokens.push({ type: "text", text: source });
    return tokens;
  }

  function inlineToHtml(text) {
    return parseInline(text)
      .map((token) => {
        const body = escapeHtml(token.text);
        switch (token.type) {
          case "strong":
            return `<strong>${body}</strong>`;
          case "em":
            return `<em>${body}</em>`;
          case "del":
            return `<del>${body}</del>`;
          case "code":
            return `<code>${body}</code>`;
          case "link": {
            const url = String(token.url || "");
            const safe = /^(?:https?:|mailto:|#|\/|\.{0,2}\/)/i.test(url) ? url : "";
            return safe
              ? `<a href="${escapeAttribute(safe)}" rel="noopener noreferrer">${body}</a>`
              : body;
          }
          default:
            return body;
        }
      })
      .join("");
  }

  function inlineToPlain(text) {
    return parseInline(text)
      .map((token) => token.text)
      .join("");
  }

  /* ---------------- block parsing ---------------- */

  function isBlank(line) {
    return !String(line).trim();
  }

  function headingMatch(line) {
    return /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
  }

  function fenceMatch(line) {
    return /^\s*(```+|~~~+)\s*([A-Za-z0-9_+.-]*)\s*$/.exec(line);
  }

  function hrMatch(line) {
    return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
  }

  function quoteMatch(line) {
    return /^\s{0,3}>\s?(.*)$/.exec(line);
  }

  function listMatch(line) {
    return /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
  }

  function startsBlock(line) {
    return Boolean(
      headingMatch(line) || fenceMatch(line) || hrMatch(line) || quoteMatch(line) || listMatch(line)
    );
  }

  function parseMarkdown(source) {
    const lines = String(source == null ? "" : source).replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];

      if (isBlank(line)) {
        index += 1;
        continue;
      }

      const fence = fenceMatch(line);
      if (fence) {
        const marker = fence[1][0];
        const size = fence[1].length;
        const close = new RegExp("^\\s*" + (marker === "`" ? "`" : "~") + "{" + size + ",}\\s*$");
        const code = [];
        index += 1;
        while (index < lines.length && !close.test(lines[index])) {
          code.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        blocks.push({ type: "code", lang: fence[2] || "", code: code.join("\n") });
        continue;
      }

      const heading = headingMatch(line);
      if (heading) {
        blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
        index += 1;
        continue;
      }

      if (hrMatch(line)) {
        blocks.push({ type: "hr" });
        index += 1;
        continue;
      }

      const quote = quoteMatch(line);
      if (quote) {
        const body = [];
        while (index < lines.length) {
          const next = quoteMatch(lines[index]);
          if (!next) break;
          body.push(next[1]);
          index += 1;
        }
        blocks.push({ type: "quote", text: body.join("\n") });
        continue;
      }

      const list = listMatch(line);
      if (list) {
        const ordered = /\d/.test(list[2]);
        const items = [];
        let start = ordered ? parseInt(list[2], 10) : 1;
        while (index < lines.length) {
          const item = listMatch(lines[index]);
          if (!item) break;
          items.push({
            text: item[3],
            indent: Math.floor(item[1].replace(/\t/g, "  ").length / 2),
          });
          index += 1;
        }
        blocks.push({ type: "list", ordered, start, items });
        continue;
      }

      const paragraph = [line.trim()];
      index += 1;
      while (index < lines.length && !isBlank(lines[index]) && !startsBlock(lines[index])) {
        paragraph.push(lines[index].trim());
        index += 1;
      }
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    }

    return { version: VERSION, blocks };
  }

  /* ---------------- serialization ---------------- */

  function serializeMarkdown(doc) {
    const blocks = doc && Array.isArray(doc.blocks) ? doc.blocks : [];
    const out = blocks.map((block) => {
      switch (block.type) {
        case "heading":
          return "#".repeat(Math.max(1, Math.min(6, block.level || 1))) + " " + block.text;
        case "paragraph":
          return block.text;
        case "code":
          return "```" + (block.lang || "") + "\n" + block.code + "\n```";
        case "quote":
          return String(block.text)
            .split("\n")
            .map((line) => (line ? "> " + line : ">"))
            .join("\n");
        case "hr":
          return "---";
        case "list": {
          let number = Number.isFinite(block.start) ? block.start : 1;
          return block.items
            .map((item) => {
              const marker = block.ordered ? `${number++}.` : "-";
              const indent = "  ".repeat(Math.max(0, item.indent || 0));
              return indent + marker + " " + item.text;
            })
            .join("\n");
        }
        default:
          return "";
      }
    });
    return out.filter(Boolean).join("\n\n") + (out.length ? "\n" : "");
  }

  function listToHtml(block) {
    const tag = block.ordered ? "ol" : "ul";
    const startAttribute =
      block.ordered && Number(block.start) > 1 ? ` start="${Number(block.start)}"` : "";
    let html = `<${tag}${startAttribute}>`;
    let depth = 0;
    let opened = false;

    for (const item of block.items) {
      const level = Math.max(0, Math.min(6, item.indent || 0));
      if (!opened) {
        while (depth < level) {
          html += `<${tag}>`;
          depth += 1;
        }
        html += "<li>";
        opened = true;
      } else if (level > depth) {
        while (depth < level) {
          html += `<${tag}>`;
          depth += 1;
        }
        html += "<li>";
      } else if (level === depth) {
        html += "</li><li>";
      } else {
        while (depth > level) {
          html += `</li></${tag}>`;
          depth -= 1;
        }
        html += "</li><li>";
      }
      html += inlineToHtml(item.text);
    }

    if (opened) {
      html += "</li>";
      for (let level = depth; level > 0; level -= 1) {
        html += `</${tag}></li>`;
      }
    }
    html += `</${tag}>`;
    return html;
  }

  function blockToHtml(block) {
    switch (block.type) {
      case "heading": {
        const level = Math.max(1, Math.min(6, block.level || 1));
        return `<h${level}>${inlineToHtml(block.text)}</h${level}>`;
      }
      case "paragraph":
        return `<p>${inlineToHtml(block.text).replace(/\n/g, "<br>")}</p>`;
      case "code":
        return `<pre><code${block.lang ? ` class="language-${escapeAttribute(block.lang)}"` : ""}>${escapeHtml(
          block.code
        )}</code></pre>`;
      case "quote":
        return `<blockquote>${String(block.text)
          .split("\n")
          .map((line) => `<p>${inlineToHtml(line)}</p>`)
          .join("")}</blockquote>`;
      case "hr":
        return "<hr>";
      case "list":
        return listToHtml(block);
      default:
        return "";
    }
  }

  function documentToHtml(doc, options) {
    const settings = options || {};
    const title = settings.title || titleOf(doc) || "Untitled";
    const body = (doc.blocks || []).map(blockToHtml).join("\n");
    return [
      "<!DOCTYPE html>",
      '<html lang="ja">',
      "<head>",
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      `<title>${escapeHtml(title)}</title>`,
      `<style>${EMBEDDED_CSS}</style>`,
      "</head>",
      "<body>",
      '<article class="goose-document">',
      body,
      "</article>",
      "</body>",
      "</html>",
      "",
    ].join("\n");
  }

  function blockToPlain(block) {
    switch (block.type) {
      case "heading":
      case "paragraph":
      case "quote":
        return inlineToPlain(block.text);
      case "code":
        return block.code;
      case "hr":
        return "";
      case "list":
        return block.items
          .map((item) => "  ".repeat(Math.max(0, item.indent || 0)) + inlineToPlain(item.text))
          .join("\n");
      default:
        return "";
    }
  }

  function documentToPlain(doc) {
    return (doc.blocks || [])
      .map(blockToPlain)
      .filter((part) => part !== "")
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n") + "\n";
  }

  function documentToJson(doc) {
    return {
      version: VERSION,
      title: titleOf(doc) || "Untitled",
      blocks: (doc.blocks || []).map((block) => {
        if (block.type === "heading" || block.type === "paragraph") {
          return {
            type: block.type,
            ...(block.type === "heading" ? { level: block.level } : {}),
            text: block.text,
            inlines: parseInline(block.text),
          };
        }
        if (block.type === "list") {
          return {
            type: "list",
            ordered: Boolean(block.ordered),
            start: block.ordered ? block.start : 1,
            items: block.items.map((item) => ({
              indent: item.indent || 0,
              text: item.text,
              inlines: parseInline(item.text),
            })),
          };
        }
        if (block.type === "code") {
          return { type: "code", lang: block.lang || "", code: block.code };
        }
        if (block.type === "quote") {
          return { type: "quote", text: block.text, inlines: parseInline(block.text) };
        }
        return { type: "hr" };
      }),
    };
  }

  function yamlString(value) {
    return JSON.stringify(String(value == null ? "" : value));
  }

  function documentToQuarto(doc, options) {
    const settings = options || {};
    const now = new Date();
    const title = settings.title || titleOf(doc) || "Untitled";
    const author = settings.author || "";
    const date = settings.date || now.toISOString().slice(0, 10);
    const lines = ["---", `title: ${yamlString(title)}`];
    if (author) lines.push(`author: ${yamlString(author)}`);
    lines.push(`date: ${yamlString(date)}`);
    lines.push(`format: ${yamlString(settings.format || "html")}`);
    lines.push("---", "");
    return lines.join("\n") + "\n" + serializeMarkdown(doc);
  }

  /* ---------------- search ---------------- */

  function normalizeWidth(text) {
    let normalized = "";
    const map = [];
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const folded = char.normalize("NFKC");
      for (let offset = 0; offset < folded.length; offset += 1) {
        map.push(index);
        normalized += folded[offset];
      }
    }
    return { text: normalized, map };
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findMatches(source, query, options) {
    const text = String(source == null ? "" : source);
    const needle = String(query == null ? "" : query);
    if (!needle) return [];
    const settings = options || {};
    const haystack = settings.normalizeWidth ? normalizeWidth(text) : { text, map: null };
    const target = settings.normalizeWidth ? normalizeWidth(needle).text : needle;
    const pattern = settings.regex ? target : escapeRegExp(target);
    let regex;
    try {
      regex = new RegExp(pattern, settings.caseSensitive ? "g" : "gi");
    } catch (error) {
      return [];
    }
    const matches = [];
    let match;
    let guard = 0;
    while ((match = regex.exec(haystack.text)) && guard < 5000) {
      guard += 1;
      if (match[0] === "") {
        regex.lastIndex += 1;
        continue;
      }
      const start = haystack.map ? haystack.map[match.index] : match.index;
      const endIndex = match.index + match[0].length - 1;
      const end = haystack.map ? haystack.map[endIndex] + 1 : match.index + match[0].length;
      matches.push({ start, end, text: text.slice(start, end) });
    }
    return matches;
  }

  /* ---------------- statistics ---------------- */

  function countWords(source) {
    const text = String(source == null ? "" : source);
    const latin = text.match(/[A-Za-z0-9_'-]+/g) || [];
    const cjk = text.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) || [];
    return latin.length + cjk.length;
  }

  function statistics(source) {
    const text = String(source == null ? "" : source);
    return {
      characters: Array.from(text).length,
      charactersNoSpaces: Array.from(text.replace(/\s/g, "")).length,
      words: countWords(text),
      lines: text ? text.split("\n").length : 0,
    };
  }

  /* ---------------- misc helpers ---------------- */

  function titleOf(doc, fallback) {
    const blocks = (doc && doc.blocks) || [];
    const heading = blocks.find((block) => block.type === "heading" && block.text.trim());
    if (heading) return inlineToPlain(heading.text).trim();
    const paragraph = blocks.find((block) => block.type === "paragraph" && block.text.trim());
    if (paragraph) {
      const text = inlineToPlain(paragraph.text).replace(/\s+/g, " ").trim();
      return text.length > 48 ? text.slice(0, 48) + "…" : text;
    }
    return fallback || "";
  }

  function outline(doc) {
    return ((doc && doc.blocks) || [])
      .map((block, index) => ({ block, index }))
      .filter((entry) => entry.block.type === "heading")
      .map((entry) => ({
        index: entry.index,
        level: entry.block.level,
        text: inlineToPlain(entry.block.text),
        id: "h-" + entry.index,
      }));
  }

  function slugify(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  function safeFileName(name, extension) {
    const base = String(name == null ? "" : name)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    return (base || "untitled") + (extension ? "." + String(extension).replace(/^\./, "") : "");
  }

  return {
    VERSION,
    THEMES,
    parseInline,
    inlineToHtml,
    inlineToPlain,
    parseMarkdown,
    serializeMarkdown,
    blockToHtml,
    documentToHtml,
    documentToPlain,
    documentToJson,
    documentToQuarto,
    findMatches,
    normalizeWidth,
    statistics,
    countWords,
    titleOf,
    outline,
    slugify,
    safeFileName,
    escapeHtml,
  };
});
