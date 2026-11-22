const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const lab = require("./lab.js");

const samples = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/lab-samples.json"), "utf8")).samples;
const byId = (id) => samples.find((sample) => sample.id === id);

test("shannon entropy handles empty, uniform and varied input", () => {
  assert.equal(lab.shannonEntropy(""), 0);
  assert.equal(lab.shannonEntropy("aaaaaaaa"), 0);
  assert.equal(lab.shannonEntropy("abcd"), 2);
  assert.ok(lab.shannonEntropy("Zx9Qm2Lp7Rt4Vb8Nc1Kd6Ws3Hf5Jg0Ya") > 3.3);
});

test("maskSecret keeps only a short prefix and suffix", () => {
  assert.equal(lab.maskSecret("ghp_9fQ2xLm4Tz8Vb1Nc6Rs3Kd7Yp0Wa5He2Jt8x").indexOf("9fQ2"), -1);
  assert.ok(lab.maskSecret("ghp_9fQ2xLm4Tz8Vb1Nc6Rs3Kd7Yp0Wa5He2Jt8x").startsWith("ghp_"));
  assert.equal(lab.maskSecret("-----BEGIN OPENSSH PRIVATE KEY-----"), "-----BEGIN PRIVATE KEY----- [redacted]");
  assert.equal(lab.maskSecret("short"), "••••••••");
});

test("fragmented samples are joined before classification", () => {
  const sample = byId("stripe-test");
  assert.ok(Array.isArray(sample.valueParts));
  assert.equal(sample.value, undefined);
  assert.equal(lab.sampleValue(sample), sample.valueParts.join(""));
  assert.equal(lab.sampleValue({ value: "plain" }), "plain");
  assert.equal(lab.sampleValue(null), "");
});

test("provider detection covers the documented formats", () => {
  const expected = {
    "github-pat": "github",
    "aws-key": "aws",
    "stripe-test": "stripe",
    "private-key": "private_key",
    jwt: "jwt",
    "world-readable": "stripe"
  };
  for (const [id, provider] of Object.entries(expected)) {
    const result = lab.classify(byId(id));
    assert.equal(result.finding.provider, provider, id);
  }
});

test("allowlisted placeholder stops before masking and risk", () => {
  const result = lab.classify(byId("placeholder"));
  assert.equal(result.candidate, false);
  assert.equal(result.finding, null);
  assert.equal(result.stages.find((stage) => stage.id === "allowlist").status, "stop");
  assert.equal(result.stages.find((stage) => stage.id === "risk").status, "skip");
});

test("GitHub token in a tracked file becomes high risk", () => {
  const result = lab.classify(byId("github-pat"));
  assert.equal(result.finding.level, "high");
  assert.equal(result.finding.score, 58);
  assert.equal(result.finding.status, "new");
  assert.ok(result.finding.reasons.some((reason) => reason.includes("Git 管理下")));
});

test("private key in .ssh with world-readable permission is critical", () => {
  const result = lab.classify(byId("private-key"));
  assert.equal(result.finding.level, "critical");
  assert.ok(result.finding.score >= 72);
  assert.ok(result.finding.reasons.some((reason) => reason.includes("資格情報ディレクトリ")));
  assert.ok(result.finding.reasons.some((reason) => reason.includes("誰でも読める")));
});

test("known findings are marked as known", () => {
  const result = lab.classify(byId("aws-key"));
  assert.equal(result.finding.status, "known");
  assert.equal(result.stages.find((stage) => stage.id === "baseline").verdict, "KNOWN");
});

test("test-mode Stripe keys score lower than live keys", () => {
  const testKey = lab.classify(byId("stripe-test")).finding;
  const liveKey = lab.classify(byId("world-readable")).finding;
  assert.ok(testKey.score < liveKey.score);
  assert.equal(testKey.level, "medium");
  assert.equal(liveKey.level, "high");
});

test("generic context plus entropy is detected without a provider", () => {
  const result = lab.classify(byId("generic-token"));
  assert.equal(result.finding.provider, "generic");
  assert.ok(result.finding.confidence >= 0.8);
  assert.equal(result.finding.level, "medium");
});

test("every sample produces the documented stage count", () => {
  for (const sample of samples) {
    const result = lab.classify(sample);
    assert.equal(result.stages.length, 7, sample.id);
    assert.deepEqual(result.stages.map((stage) => stage.id), [
      "pattern", "context", "entropy", "allowlist", "mask", "risk", "baseline"
    ]);
  }
});
