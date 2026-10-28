/*
 * Regenerate viewer/data/demo-report.json from scanner.DEMO_FACTS.
 * Run from the repository root:
 *   node MobileSafetyKit/tools/build-demo-report.js
 */
const fs = require("node:fs");
const path = require("node:path");
const scanner = require("../viewer/lib/scanner.js");

const report = scanner.buildReport(scanner.DEMO_FACTS);
const output = path.join(__dirname, "..", "viewer", "data", "demo-report.json");

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote ${path.relative(process.cwd(), output)} — score ${report.score}, level ${report.level}`);
