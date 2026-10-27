"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Highlight = require("./highlight.js");

const sourcePath = path.join(__dirname, "..", "data", "sources", "18_json.goose");

test("escapes HTML instead of injecting it", () => {
  const html = Highlight.highlight('let x = a < b && c > "d";');
  assert.ok(html.includes("&lt;"));
  assert.ok(html.includes("&amp;"));
  assert.ok(!html.includes("< b"));
  assert.ok(!html.includes('"d"'));
});

test("marks comments, keywords, types and numbers", () => {
  const html = Highlight.highlight("let n: i32 = 42; // answer");
  assert.match(html, /<span class="tok-keyword">let<\/span>/);
  assert.match(html, /<span class="tok-type">i32<\/span>/);
  assert.match(html, /<span class="tok-number">42<\/span>/);
  assert.match(html, /<span class="tok-comment">\/\/ answer<\/span>/);
});

test("a // inside a string is not a comment", () => {
  const html = Highlight.highlight('let url = "https://example.com"; // note');
  assert.match(html, /<span class="tok-string">&quot;https:\/\/example\.com&quot;<\/span>/);
  assert.equal((html.match(/tok-comment/g) || []).length, 1);
});

test("triple-quoted strings may span lines", () => {
  const source = 'let s = """\nline one\nline two\n""";\nlet n = 1;';
  const lines = Highlight.highlightLines(source);
  assert.equal(lines.length, 5);
  assert.match(lines[1], /tok-string/);
  assert.match(lines[2], /tok-string/);
  assert.match(lines[4], /tok-number/);
});

test("line count matches the real sample file", () => {
  const source = fs.readFileSync(sourcePath, "utf8");
  const expected = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
  assert.equal(Highlight.highlightLines(source).length, expected);
  assert.equal(expected, 313);
});

test("empty input yields one empty line", () => {
  assert.deepEqual(Highlight.highlightLines(""), [""]);
});
