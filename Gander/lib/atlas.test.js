const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const atlas = require("./atlas.js");

const root = path.join(__dirname, "..");
const exhibits = JSON.parse(fs.readFileSync(path.join(root, "data/exhibits.json"), "utf8")).exhibits;
const mechanisms = JSON.parse(fs.readFileSync(path.join(root, "data/mechanisms.json"), "utf8")).mechanisms;

test("data has 7 exhibits and 7 mechanisms", () => {
  assert.equal(exhibits.length, 7);
  assert.equal(mechanisms.length, 7);
});

test("data integrity has no errors", () => {
  assert.deepEqual(atlas.validateData(exhibits, mechanisms), []);
});

test("every exhibit link resolves on disk except lab routes", () => {
  const missing = [];
  for (const exhibit of exhibits) {
    for (const link of exhibit.links) {
      if (/^Gander\/atlas\//.test(link.href)) continue;
      const target = path.join(root, "..", link.href.split(/[?#]/)[0]);
      if (!fs.existsSync(target)) missing.push(link.href);
    }
  }
  assert.deepEqual(missing, []);
});

test("filterExhibits searches names, mechanisms and pipeline text", () => {
  assert.equal(atlas.filterExhibits(exhibits, { query: "launchd" }).length, 1);
  assert.equal(atlas.filterExhibits(exhibits, { query: "署名" }).length >= 1, true);
  assert.equal(atlas.filterExhibits(exhibits, { mechanism: "baseline-diff" }).length, 3);
  assert.equal(atlas.filterExhibits(exhibits, { query: "" }).length, exhibits.length);
});

test("filterMechanisms filters by exhibit and text", () => {
  assert.equal(atlas.filterMechanisms(mechanisms, { exhibit: "goose-editor" }).length, 3);
  assert.equal(atlas.filterMechanisms(mechanisms, { query: "localStorage" }).length, 1);
  assert.equal(atlas.filterMechanisms(mechanisms, {}).length, mechanisms.length);
});

test("mechanismUsage is reciprocal", () => {
  const usage = atlas.mechanismUsage(exhibits, mechanisms);
  for (const mechanism of mechanisms) {
    assert.equal(usage[mechanism.id].length, mechanism.used_by.length);
    for (const id of mechanism.used_by) {
      const exhibit = atlas.byId(exhibits, id);
      assert.ok(exhibit.mechanisms.includes(mechanism.id));
    }
  }
});

test("neighbors walks the exhibit order", () => {
  const first = atlas.neighbors(exhibits, "pipeline-viz");
  assert.equal(first.previous, null);
  assert.equal(first.next.id, "goose-samples");
  const last = atlas.neighbors(exhibits, "keylint-lab");
  assert.equal(last.next, null);
  assert.equal(last.previous.id, "goose-editor");
});

test("resolveHref adds the right prefix", () => {
  assert.equal(atlas.resolveHref("PipelineViz/", 0), "PipelineViz/");
  assert.equal(atlas.resolveHref("PipelineViz/", 1), "../PipelineViz/");
  assert.equal(atlas.resolveHref("PipelineViz/", 2), "../../PipelineViz/");
});
