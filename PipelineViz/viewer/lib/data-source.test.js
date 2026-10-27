"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PipelineData = require("./data-source.js");

const metaPath = path.join(__dirname, "..", "..", ".omm", "data-pipeline", "meta.yaml");
const metricsPath = path.join(__dirname, "..", "data", "metrics.json");
const reportingPath = path.join(__dirname, "..", "data", "etl-reporting.json");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

test("parseYaml reads the project meta file", () => {
  const meta = PipelineData.parseYaml(fs.readFileSync(metaPath, "utf8"));

  assert.equal(meta.git_commit, "a1b2c3d");
  assert.equal(meta.poll_interval_ms, 2500);
  assert.equal(meta.default_pipeline, "etl-main");
  assert.equal(meta.pipelines.length, 2);
  assert.equal(meta.pipelines[1].id, "etl-reporting");
  assert.match(meta.status_map.Warning, /^classDef warning /);
  assert.match(meta.prev_diagram, /^graph LR/);
});

test("parseYaml supports sequences, nested maps and block scalars", () => {
  const parsed = PipelineData.parseYaml([
    "title: sample",
    "items:",
    "  - id: one",
    "    label: \"first # value\"",
    "  - id: two",
    "plain:",
    "  child: 42",
    "notes: |-",
    "  line 1",
    "  line 2"
  ].join("\n"));

  assert.equal(parsed.title, "sample");
  assert.deepEqual(parsed.items, [
    { id: "one", label: "first # value" },
    { id: "two" }
  ]);
  assert.deepEqual(parsed.plain, { child: 42 });
  assert.equal(parsed.notes, "line 1\nline 2");
});

test("normalizeConfig resolves URLs relative to meta.yaml", () => {
  const metaUrl = "http://localhost/PipelineViz/.omm/data-pipeline/meta.yaml";
  const meta = PipelineData.parseYaml(fs.readFileSync(metaPath, "utf8"));
  const config = PipelineData.normalizeConfig(meta, metaUrl, "http://localhost/PipelineViz/viewer/");

  assert.equal(config.pollIntervalMs, 2500);
  assert.equal(config.defaultPipeline, "etl-main");
  assert.equal(config.pipelines.length, 2);
  assert.equal(
    config.pipelines[0].metricsUrl,
    "http://localhost/PipelineViz/viewer/data/metrics.json"
  );
  assert.equal(
    config.pipelines[1].prevUrl,
    "http://localhost/PipelineViz/viewer/data/etl-reporting-prev.json"
  );
});

test("normalizeConfig resolves pipelines without live_metrics_url from meta", () => {
  const metaUrl = "http://localhost/PipelineViz/.omm/data-pipeline/meta.yaml";
  const config = PipelineData.normalizeConfig({
    pipelines: [{ id: "a", label: "A", metrics_url: "../../viewer/data/metrics.json" }]
  }, metaUrl, "http://localhost/PipelineViz/viewer/");

  assert.equal(config.pipelines[0].metricsUrl, "http://localhost/PipelineViz/viewer/data/metrics.json");
  assert.equal(config.pipelines[0].prevUrl, "http://localhost/PipelineViz/viewer/data/metrics-prev.json");
});

test("normalizeConfig falls back to built-in defaults", () => {
  const config = PipelineData.normalizeConfig(null, "http://localhost/meta.yaml", "http://localhost/viewer/");

  assert.equal(config.pollIntervalMs, 2500);
  assert.equal(config.pipelines.length, 1);
  assert.equal(config.pipelines[0].metricsUrl, "http://localhost/viewer/data/metrics.json");
  assert.match(config.statusMap.Healthy, /^classDef healthy /);
});

test("sample snapshots pass schema validation", () => {
  for (const file of [metricsPath, reportingPath]) {
    const result = PipelineData.validateSnapshot(readJson(file));
    assert.deepEqual(result.issues, [], `${path.basename(file)} should be clean`);
    assert.equal(result.summary.ok, true);
    assert.ok(result.snapshot.steps.length >= 3);
    assert.equal(result.snapshot.quarantine.status, "External");
  }
});

test("validateSnapshot reports and repairs invalid data", () => {
  const result = PipelineData.validateSnapshot({
    timestamp: "not-a-date",
    pipeline: "",
    steps: [
      { step_id: "A", records_in: 100, records_out: 80, elapsed_ms: 10, status: "Healthy" },
      { step_id: "A", records_in: 90, records_out: -5, elapsed_ms: 1200, status: "Broken" }
    ],
    quarantine: { records_in: 5 },
    errors: [{ step_id: "Z", count: "many" }]
  });

  assert.ok(result.summary.errors > 0);
  assert.ok(result.summary.warnings > 0);
  assert.equal(result.snapshot.steps[1].records_out, 0);
  assert.equal(result.snapshot.steps[1].status, "Warning");
  assert.ok(result.issues.some((issue) => issue.message.includes("重複")));
  assert.ok(result.issues.some((issue) => issue.message.includes("負の値")));
  assert.ok(result.issues.some((issue) => issue.path === "quarantine.records_in"));
});

test("hashText is stable and changes with content", () => {
  assert.equal(PipelineData.hashText("metrics"), PipelineData.hashText("metrics"));
  assert.notEqual(PipelineData.hashText("metrics"), PipelineData.hashText("metrics "));
});
