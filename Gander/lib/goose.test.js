const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const goose = require("./goose.js");

const root = path.join(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "data/goose-features.json"), "utf8"));
const samples = JSON.parse(
  fs.readFileSync(path.join(root, "../GooseSamples/explorer/data/samples.json"), "utf8")
).samples;
const sampleIds = new Set(samples.map((sample) => sample.id));

test("Goose corner has 8 documented features", () => {
  assert.equal(data.schema, 1);
  assert.equal(data.features.length, 8);
  assert.equal(new Set(data.features.map((feature) => feature.id)).size, 8);
});

test("every feature has a name, summary, code and samples", () => {
  for (const feature of data.features) {
    assert.ok(feature.id, "id");
    assert.ok(feature.no, feature.id + " no");
    assert.ok(feature.name, feature.id + " name");
    assert.ok(feature.ja, feature.id + " ja");
    assert.ok(feature.summary.length >= 30, feature.id + " summary");
    assert.ok(feature.code.includes("\n"), feature.id + " code");
    assert.ok(feature.points.length >= 2, feature.id + " points");
    assert.ok(feature.samples.length >= 1, feature.id + " samples");
  }
});

test("every referenced Goose sample exists in the explorer catalog", () => {
  for (const feature of data.features) {
    for (const id of feature.samples) {
      assert.ok(sampleIds.has(id), feature.id + " -> " + id);
    }
  }
  for (const entry of data.meta.reading) {
    assert.ok(sampleIds.has(entry.id), "reading -> " + entry.id);
  }
});

test("guide and explorer paths resolve from the repository root", () => {
  assert.ok(fs.existsSync(path.join(root, "..", data.meta.guide)));
  assert.ok(fs.existsSync(path.join(root, "..", data.meta.samples)));
});

test("formatBytes switches units at 1024", () => {
  assert.equal(goose.formatBytes(0), "0 B");
  assert.equal(goose.formatBytes(512), "512 B");
  assert.equal(goose.formatBytes(1024), "1.0 KB");
  assert.equal(goose.formatBytes(1024 * 1024), "1.0 MB");
});

test("data stack grows, tracks a high-water mark and releases on scope exit", () => {
  let stack = goose.createStack();
  stack = goose.enterScope(stack, "main");
  stack = goose.pushBytes(stack, 1000);
  stack = goose.enterScope(stack, "loop");
  stack = goose.pushBytes(stack, 100000);
  assert.equal(stack.used, 101000);
  assert.equal(stack.highWater, 101000);
  assert.equal(stack.frames.length, 2);

  const left = goose.leaveScope(stack);
  assert.equal(left.released, 100000);
  assert.equal(left.frame.name, "loop");
  assert.equal(left.stack.used, 1000);
  assert.equal(left.stack.highWater, 101000);
  assert.equal(left.stack.released, 100000);
  assert.equal(left.stack.releases, 1);
  assert.equal(left.stack.frames.length, 1);
});

test("leaving an empty stack is a no-op", () => {
  const stack = goose.createStack();
  const left = goose.leaveScope(stack);
  assert.equal(left.frame, null);
  assert.equal(left.released, 0);
  assert.equal(left.stack, stack);
});
