"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Catalog = require("./catalog.js");

const dataDir = path.join(__dirname, "..", "data");
const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, "samples.json"), "utf8"));

test("the shipped catalog validates without issues", () => {
  const result = Catalog.validateCatalog(catalog);
  assert.deepEqual(result.issues, []);
  assert.equal(result.ok, true);
});

test("the catalog holds 31 samples numbered 1..31", () => {
  assert.equal(catalog.samples.length, 31);
  const numbers = catalog.samples.map((sample) => sample.number).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 31 }, (_, index) => index + 1));
  assert.equal(new Set(catalog.samples.map((sample) => sample.id)).size, 31);
});

test("every source file exists and matches its recorded line count", () => {
  catalog.samples.forEach((sample) => {
    const file = path.join(dataDir, sample.file);
    assert.ok(fs.existsSync(file), `${sample.id}: missing ${sample.file}`);
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    assert.equal(lines, sample.lines, `${sample.id}: line count mismatch`);
  });
});

test("summarize adds up the samples and lines", () => {
  const summary = Catalog.summarize(catalog);
  assert.equal(summary.total, 31);
  assert.equal(summary.lines, catalog.meta.totalLines);
  assert.equal(summary.lines, 7420);
  assert.equal(summary.byCategory.foundations, 6);
  assert.equal(summary.byLevel.advanced, 11);
});

test("search finds a sample by title, id and feature label", () => {
  const byTitle = Catalog.filterSamples(catalog, { query: "JSON" }, []);
  assert.deepEqual(byTitle.map((sample) => sample.id), ["18_json"]);

  const byId = Catalog.filterSamples(catalog, { query: "mini_doom" }, []);
  assert.deepEqual(byId.map((sample) => sample.id), ["31_mini_doom"]);

  const byFeature = Catalog.filterSamples(catalog, { query: "ハフマン" }, []);
  assert.deepEqual(byFeature.map((sample) => sample.id), ["12_huffman"]);
});

test("search normalizes full-width input", () => {
  assert.equal(Catalog.normalize("　ＪＳＯＮ　パーサー "), "json パーサー");
  const found = Catalog.filterSamples(catalog, { query: "ｊｓｏｎ" }, []);
  assert.deepEqual(found.map((sample) => sample.id), ["18_json"]);
});

test("filters combine category, level and requirement", () => {
  const language = Catalog.filterSamples(catalog, { category: "language" }, []);
  assert.deepEqual(language.map((sample) => sample.id), ["17_calc", "18_json", "19_vm"]);

  const advanced = Catalog.filterSamples(catalog, { level: "advanced" }, []);
  assert.equal(advanced.length, 11);

  const gfx = Catalog.filterSamples(catalog, { requirement: "gfx" }, []);
  assert.deepEqual(gfx.map((sample) => sample.id), [
    "27_gfx_cube", "28_physics_boxes", "29_ui_todo", "30_mini_minecraft", "31_mini_doom",
  ]);

  const combined = Catalog.filterSamples(catalog, { category: "games", requirement: "wad" }, []);
  assert.deepEqual(combined.map((sample) => sample.id), ["31_mini_doom"]);
});

test("the unread filter excludes read samples", () => {
  const unread = Catalog.filterSamples(catalog, { unreadOnly: true }, new Set(["01_tour", "02_memory"]));
  assert.equal(unread.length, 29);
  assert.ok(!unread.some((sample) => sample.id === "01_tour"));
});

test("sorting is stable and deterministic", () => {
  const byLines = Catalog.sortSamples(catalog.samples, "lines");
  assert.deepEqual(byLines.slice(0, 2).map((sample) => sample.id), ["30_mini_minecraft", "31_mini_doom"]);
  assert.equal(byLines[byLines.length - 1].id, "24_call_c");

  const byNumber = Catalog.sortSamples(catalog.samples.slice().reverse(), "number");
  assert.equal(byNumber[0].id, "01_tour");
  assert.equal(byNumber[30].id, "31_mini_doom");
});

test("neighbors walks the reading order", () => {
  const middle = Catalog.neighbors(catalog, "18_json");
  assert.equal(middle.prev.id, "17_calc");
  assert.equal(middle.next.id, "19_vm");

  const first = Catalog.neighbors(catalog, "01_tour");
  assert.equal(first.prev, null);
  assert.equal(first.next.id, "02_memory");

  const last = Catalog.neighbors(catalog, "31_mini_doom");
  assert.equal(last.next, null);
});

test("query strings round-trip", () => {
  const search = "?sample=18_json&cat=language&level=intermediate&req=stdlib&q=json&sort=lines&unread=1";
  const parsed = Catalog.parseQuery(search);
  assert.deepEqual(parsed, {
    sample: "18_json",
    category: "language",
    level: "intermediate",
    requirement: "stdlib",
    query: "json",
    sort: "lines",
    unreadOnly: true,
  });
  assert.equal(Catalog.buildQuery(parsed), search);
});

test("unknown query values fall back to defaults", () => {
  const parsed = Catalog.parseQuery("?cat=nope&sort=nope&level=nope");
  assert.equal(parsed.category, "nope");
  assert.equal(parsed.sort, "number");
  const built = Catalog.buildQuery({ category: "all", level: "all", requirement: "all", query: "", sort: "number" });
  assert.equal(built, "");
});

test("validation reports structural errors", () => {
  const broken = JSON.parse(JSON.stringify(catalog));
  broken.samples[0].category = "missing";
  broken.samples[1].id = broken.samples[0].id;
  broken.meta.totalSamples = 30;
  const result = Catalog.validateCatalog(broken);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path.endsWith(".category")));
  assert.ok(result.issues.some((issue) => issue.path.endsWith(".id")));
  assert.ok(result.issues.some((issue) => issue.path === "meta.totalSamples"));
});
