#!/usr/bin/env bash
# Verify a metrics snapshot against the schema PipelineViz/viewer/lib/data-source.js
# expects. Exits 0 and prints a summary on success, 1 with the first problem on
# failure.
#
# Usage: scripts/verify.sh [metrics.json]
set -euo pipefail

FILE="${1:-PipelineViz/out/metrics.json}"
if [ ! -f "$FILE" ]; then
  echo "error: snapshot not found: $FILE" >&2
  exit 1
fi

node - "$FILE" <<'JS'
const fs = require("node:fs");

const file = process.argv[2];
let doc;
try {
  doc = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  console.error(`error: ${file} is not valid JSON: ${error.message}`);
  process.exit(1);
}

const problems = [];
const warnings = [];
const STATUSES = new Set(["Healthy", "Warning", "Error", "External"]);

function fail(message) {
  problems.push(message);
}
function isText(value) {
  return typeof value === "string" && value.length > 0;
}
function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
  fail("root must be an object");
} else {
  if (!isText(doc.timestamp) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(doc.timestamp)) {
    fail("timestamp must be an ISO 8601 UTC string");
  }
  if (!isText(doc.pipeline)) {
    fail("pipeline must be a non-empty string");
  }
  if (doc.source !== undefined && !["goose", "sample"].includes(doc.source)) {
    fail('source must be "goose" or "sample" when present');
  } else if (doc.source === undefined) {
    warnings.push("source is missing; the viewer will treat this snapshot as a sample");
  }

  const steps = doc.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    fail("steps must be a non-empty array");
  } else {
    const seen = new Set();
    steps.forEach((step, index) => {
      const at = `steps[${index}]`;
      if (step === null || typeof step !== "object") {
        fail(`${at} must be an object`);
        return;
      }
      if (!isText(step.step_id)) {
        fail(`${at}.step_id must be a non-empty string`);
      } else if (seen.has(step.step_id)) {
        fail(`${at}.step_id is duplicated: ${step.step_id}`);
      } else {
        seen.add(step.step_id);
      }
      if (typeof step.label !== "string") fail(`${at}.label must be a string`);
      if (!isCount(step.records_in)) fail(`${at}.records_in must be a non-negative integer`);
      if (!isCount(step.records_out)) fail(`${at}.records_out must be a non-negative integer`);
      if (typeof step.elapsed_ms !== "number" || !Number.isFinite(step.elapsed_ms) || step.elapsed_ms < 0) {
        fail(`${at}.elapsed_ms must be a non-negative number`);
      } else if (step.elapsed_ms > 1000) {
        warnings.push(`${at}.elapsed_ms is over 1000 ms`);
      }
      if (!STATUSES.has(step.status)) fail(`${at}.status must be one of ${[...STATUSES].join(", ")}`);
      if (step.status === "External") warnings.push(`${at} uses External in the main flow`);
      if (typeof step.message !== "string") fail(`${at}.message must be a string`);
      if (isCount(step.records_in) && isCount(step.records_out) && step.records_out > step.records_in) {
        fail(`${at}.records_out (${step.records_out}) exceeds records_in (${step.records_in})`);
      }
    });

    for (let i = 1; i < steps.length; i += 1) {
      if (steps[i - 1].records_out !== steps[i].records_in) {
        fail(`steps[${i - 1}].records_out (${steps[i - 1].records_out}) does not match steps[${i}].records_in (${steps[i].records_in})`);
      }
    }
  }

  const q = doc.quarantine;
  if (q === null || typeof q !== "object" || Array.isArray(q)) {
    fail("quarantine must be an object");
  } else {
    if (!isText(q.step_id)) fail("quarantine.step_id must be a non-empty string");
    if (typeof q.label !== "string") fail("quarantine.label must be a string");
    if (!isCount(q.records_in)) fail("quarantine.records_in must be a non-negative integer");
    if (!isCount(q.records_out)) fail("quarantine.records_out must be a non-negative integer");
    if (q.status !== "External") fail('quarantine.status must be "External"');
    if (typeof q.elapsed_ms !== "number" || !Number.isFinite(q.elapsed_ms) || q.elapsed_ms < 0) {
      fail("quarantine.elapsed_ms must be a non-negative number");
    }
    if (typeof q.message !== "string") fail("quarantine.message must be a string");
    if (Array.isArray(steps) && steps.length > 0) {
      const dropped = steps[0].records_in - steps[steps.length - 1].records_out;
      if (isCount(dropped) && q.records_in !== dropped) {
        fail(`quarantine.records_in (${q.records_in}) does not match the records dropped (${dropped})`);
      }
    }
  }

  const errors = doc.errors;
  if (!Array.isArray(errors)) {
    fail("errors must be an array");
  } else {
    const stepIds = new Set(Array.isArray(steps) ? steps.map((step) => step.step_id) : []);
    if (q && isText(q.step_id)) stepIds.add(q.step_id);
    errors.forEach((error, index) => {
      const at = `errors[${index}]`;
      if (error === null || typeof error !== "object") {
        fail(`${at} must be an object`);
        return;
      }
      if (typeof error.at !== "string") fail(`${at}.at must be a string`);
      if (!isText(error.step_id) || !stepIds.has(error.step_id)) {
        fail(`${at}.step_id must reference a step or quarantine node`);
      }
      if (typeof error.kind !== "string") fail(`${at}.kind must be a string`);
      if (typeof error.message !== "string") fail(`${at}.message must be a string`);
      if (!isCount(error.count)) fail(`${at}.count must be a non-negative integer`);
    });
  }
}

if (problems.length > 0) {
  console.error(`error: ${file} does not match the snapshot schema`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

for (const warning of warnings) console.warn(`warning: ${warning}`);
const stepSummary = doc.steps.map((step) => `${step.step_id} ${step.records_in}->${step.records_out}`).join(", ");
console.log(`OK: ${doc.pipeline} at ${doc.timestamp} (${doc.source || "sample"})`);
console.log(`    steps: ${stepSummary}`);
console.log(`    quarantine: ${doc.quarantine.records_in}, errors: ${doc.errors.length}`);
JS
