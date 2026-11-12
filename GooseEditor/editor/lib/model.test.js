/*
 * Node tests for the Goose Editor model.
 * Run with: node --test GooseEditor/editor/lib/model.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("./model.js");

test("parseMarkdown recognizes the supported block types", () => {
  const doc = model.parseMarkdown(
    [
      "# Title",
      "",
      "A paragraph with **bold** and *italic*.",
      "",
      "- one",
      "- two",
      "",
      "1. first",
      "2. second",
      "",
      "> quoted",
      "> lines",
      "",
      "```js",
      "const x = 1;",
      "```",
      "",
      "---",
    ].join("\n")
  );

  assert.deepEqual(
    doc.blocks.map((block) => block.type),
    ["heading", "paragraph", "list", "list", "quote", "code", "hr"]
  );
  assert.equal(doc.blocks[0].level, 1);
  assert.equal(doc.blocks[2].ordered, false);
  assert.equal(doc.blocks[3].ordered, true);
  assert.equal(doc.blocks[4].text, "quoted\nlines");
  assert.equal(doc.blocks[5].lang, "js");
});

test("parseMarkdown keeps soft line breaks inside paragraphs", () => {
  const doc = model.parseMarkdown("line one\nline two\n\nnext");
  assert.equal(doc.blocks[0].text, "line one\nline two");
  assert.equal(doc.blocks[1].text, "next");
});

test("parseMarkdown handles nested list indentation and ordered starts", () => {
  const doc = model.parseMarkdown("3. three\n4. four\n  - nested\n    - deeper");
  const list = doc.blocks[0];
  assert.equal(list.ordered, true);
  assert.equal(list.start, 3);
  assert.deepEqual(
    list.items.map((item) => item.indent),
    [0, 0, 1, 2]
  );
});

test("parseMarkdown treats an unclosed fence as a code block", () => {
  const doc = model.parseMarkdown("```sh\necho hi");
  assert.equal(doc.blocks.length, 1);
  assert.equal(doc.blocks[0].type, "code");
  assert.equal(doc.blocks[0].code, "echo hi");
});

test("serializeMarkdown round-trips the normalized document", () => {
  const source = [
    "# Title",
    "",
    "Paragraph.",
    "",
    "- one",
    "  - nested",
    "",
    "1. first",
    "2. second",
    "",
    "> quote",
    "",
    "```js",
    "const x = 1;",
    "```",
    "",
    "---",
    "",
  ].join("\n");
  const once = model.serializeMarkdown(model.parseMarkdown(source));
  const twice = model.serializeMarkdown(model.parseMarkdown(once));
  assert.equal(once, twice);
  assert.match(once, /^# Title/);
  assert.match(once, /^1\. first$/m);
  assert.match(once, /^  - nested$/m);
});

test("parseInline handles bold, italic, code, strike and links", () => {
  const tokens = model.parseInline(
    "A **bold** *em* `code` ~~gone~~ [link](https://example.com) plain"
  );
  assert.deepEqual(
    tokens.map((token) => token.type),
    ["text", "strong", "text", "em", "text", "code", "text", "del", "text", "link", "text"]
  );
  assert.equal(tokens[9].url, "https://example.com");
});

test("inlineToHtml escapes HTML and rejects unsafe link targets", () => {
  assert.equal(model.inlineToHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(model.inlineToHtml("[x](javascript:bad)"), "x");
  assert.equal(
    model.inlineToHtml("[docs](https://example.com)"),
    '<a href="https://example.com" rel="noopener noreferrer">docs</a>'
  );
});

test("listToHtml nests deeper items and keeps the ordered start", () => {
  const html = model.blockToHtml({
    type: "list",
    ordered: true,
    start: 3,
    items: [
      { text: "one", indent: 0 },
      { text: "nested", indent: 1 },
      { text: "two", indent: 0 },
    ],
  });
  assert.equal(
    html,
    '<ol start="3"><li>one<ol><li>nested</li></ol></li><li>two</li></ol>'
  );
});

test("blockToHtml renders headings, paragraphs, quotes, code and rules", () => {
  assert.equal(model.blockToHtml({ type: "heading", level: 2, text: "Hi" }), "<h2>Hi</h2>");
  assert.equal(model.blockToHtml({ type: "paragraph", text: "a\nb" }), "<p>a<br>b</p>");
  assert.equal(model.blockToHtml({ type: "quote", text: "a\nb" }), "<blockquote><p>a</p><p>b</p></blockquote>");
  assert.equal(
    model.blockToHtml({ type: "code", lang: "js", code: "a < b" }),
    '<pre><code class="language-js">a &lt; b</code></pre>'
  );
  assert.equal(model.blockToHtml({ type: "hr" }), "<hr>");
});

test("documentToHtml embeds a complete standalone document", () => {
  const doc = model.parseMarkdown("# My doc\n\nHello **world**.");
  const html = model.documentToHtml(doc);
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<title>My doc<\/title>/);
  assert.match(html, /<h1>My doc<\/h1>/);
  assert.match(html, /Hello <strong>world<\/strong>\./);
});

test("documentToPlain removes markers and indents nested list items", () => {
  const doc = model.parseMarkdown("# T\n\n- a\n  - b\n\n> q\n\n---\n\n```\ncode\n```");
  const text = model.documentToPlain(doc);
  assert.equal(text, "T\n\na\n  b\n\nq\n\ncode\n");
});

test("documentToJson exposes typed blocks and inline tokens", () => {
  const json = model.documentToJson(model.parseMarkdown("# T\n\nA **b**.\n\n- x"));
  assert.equal(json.version, "1.0");
  assert.equal(json.title, "T");
  assert.equal(json.blocks[0].type, "heading");
  assert.equal(json.blocks[1].inlines[1].type, "strong");
  assert.equal(json.blocks[2].type, "list");
});

test("documentToQuarto prefixes YAML front matter", () => {
  const doc = model.parseMarkdown("# Report\n\nBody");
  const quarto = model.documentToQuarto(doc, { author: "Goose", date: "2026-11-13" });
  assert.match(quarto, /^---\ntitle: "Report"\nauthor: "Goose"\ndate: "2026-11-13"\nformat: "html"\n---\n\n/);
  assert.match(quarto, /# Report/);
});

test("titleOf prefers the first heading, then paragraph, then fallback", () => {
  assert.equal(model.titleOf(model.parseMarkdown("\n\n## Heading\n\ntext")), "Heading");
  assert.equal(model.titleOf(model.parseMarkdown("Some paragraph text")), "Some paragraph text");
  assert.equal(model.titleOf({ blocks: [] }, "Untitled"), "Untitled");
  assert.equal(
    model.titleOf(model.parseMarkdown("x".repeat(80))).length,
    49
  );
});

test("findMatches supports literal, case and regex search", () => {
  const literal = model.findMatches("Goose goose GOOSE", "goose");
  assert.equal(literal.length, 3);
  assert.deepEqual(literal[0], { start: 0, end: 5, text: "Goose" });

  const sensitive = model.findMatches("Goose goose", "goose", { caseSensitive: true });
  assert.equal(sensitive.length, 1);

  const regex = model.findMatches("a1 b2 c3", "\\d", { regex: true });
  assert.equal(regex.length, 3);

  assert.deepEqual(model.findMatches("abc", "("), []);
  assert.deepEqual(model.findMatches("abc", "("), model.findMatches("abc", "(", { regex: true }));
});

test("findMatches normalizes full-width characters while keeping source offsets", () => {
  const source = "ＡＢＣ abc";
  const matches = model.findMatches(source, "ABC", { normalizeWidth: true, caseSensitive: true });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].start, 0);
  assert.equal(source.slice(matches[0].start, matches[0].end), "ＡＢＣ");
});

test("statistics counts Japanese and Latin words", () => {
  const stats = model.statistics("Goose エディタ\nsecond line");
  assert.equal(stats.lines, 2);
  assert.equal(stats.characters, 22);
  assert.equal(stats.words, 7);
});

test("outline lists headings with stable ids", () => {
  const doc = model.parseMarkdown("# A\n\n## B\n\nbody");
  assert.deepEqual(
    model.outline(doc).map((item) => [item.id, item.level, item.text]),
    [
      ["h-0", 1, "A"],
      ["h-1", 2, "B"],
    ]
  );
});

test("safeFileName strips reserved characters and keeps the extension", () => {
  assert.equal(model.safeFileName("a/b:c*?", "md"), "a-b-c-.md");
  assert.equal(model.safeFileName("   ", "txt"), "untitled.txt");
  assert.equal(model.safeFileName("notes.md", "md"), "notes.md.md");
});

test("parseMarkdown and serializeMarkdown handle empty input", () => {
  assert.deepEqual(model.parseMarkdown("").blocks, []);
  assert.equal(model.serializeMarkdown({ blocks: [] }), "");
  assert.equal(model.documentToPlain({ blocks: [] }), "\n");
});
