/*
 * Pipeline Viz data source
 *
 * Small, dependency-free helpers shared by the dashboard and Node tests:
 *   - a YAML subset parser for .omm/data-pipeline/meta.yaml
 *   - config normalization (URL resolution, poll interval, status map)
 *   - snapshot normalization and schema validation
 *
 * The file is deliberately written as a UMD-style script so it can be loaded
 * with a plain <script> tag (no build step) and required from node:test.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PipelineData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STATUSES = ["Healthy", "Warning", "Error", "External"];
  const MAIN_STATUSES = ["Healthy", "Warning", "Error"];

  const DEFAULT_STATUS_MAP = {
    Healthy: "classDef healthy fill:#8ef0cf,stroke:#0b0b0b,color:#0b0b0b",
    Warning: "classDef warning fill:#ffc857,stroke:#0b0b0b,color:#0b0b0b",
    Error: "classDef error fill:#ff6b6b,stroke:#0b0b0b,color:#0b0b0b",
    External: "classDef external fill:#b8dcff,stroke:#0b0b0b,color:#0b0b0b"
  };

  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

  function stripComment(line) {
    let quote = null;
    for (let index = 0; index < line.length; index += 1) {
      const ch = line[index];
      if (quote) {
        if (ch === "\\" && quote === "\"") {
          index += 1;
          continue;
        }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === "\"" || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === "#" && (index === 0 || /\s/.test(line[index - 1]))) {
        return line.slice(0, index);
      }
    }
    return line;
  }

  function unquote(value) {
    const text = String(value).trim();
    if (text.length >= 2 && text[0] === "\"" && text[text.length - 1] === "\"") {
      try {
        return JSON.parse(text);
      } catch (error) {
        return text.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
      }
    }
    if (text.length >= 2 && text[0] === "'" && text[text.length - 1] === "'") {
      return text.slice(1, -1).replace(/''/g, "'");
    }
    return text;
  }

  function coerce(value) {
    const text = String(value).trim();
    if (text === "" || text === "~" || text === "null") return null;
    if (text === "true") return true;
    if (text === "false") return false;
    if (/^-?\d+$/.test(text)) {
      const integer = Number(text);
      if (Number.isSafeInteger(integer)) return integer;
    }
    if (/^-?\d*\.\d+$/.test(text)) return Number(text);
    return text;
  }

  /**
   * Parse the small YAML subset used by .omm meta files:
   * nested mappings, sequences of mappings, block scalars (| and >), quotes.
   * Unsupported YAML (anchors, flow collections, multi-document) is rejected
   * instead of being guessed at.
   */
  function parseYaml(source) {
    const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
    let index = 0;

    const indentOf = (line) => (line.match(/^ */) || [""])[0].length;

    function skipBlank() {
      while (index < lines.length) {
        const line = lines[index];
        if (!line.trim() || /^\s*#/.test(line)) {
          index += 1;
          continue;
        }
        break;
      }
    }

    function fail(message) {
      throw new Error(`${message} (line ${index + 1})`);
    }

    function parseBlockScalar(parentIndent, indicator) {
      const content = [];
      let contentIndent = null;
      while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) {
          content.push("");
          index += 1;
          continue;
        }
        const indent = indentOf(line);
        if (indent <= parentIndent) break;
        if (contentIndent === null) contentIndent = indent;
        content.push(line.slice(Math.min(contentIndent, indent)));
        index += 1;
      }
      while (content.length && content[content.length - 1] === "") content.pop();
      if (indicator.startsWith(">")) {
        return content.join(" ").replace(/\s+/g, " ").trim();
      }
      const text = content.join("\n");
      return indicator.endsWith("-") ? text : `${text}\n`;
    }

    function parseSequence(indent) {
      const result = [];
      while (true) {
        skipBlank();
        if (index >= lines.length) break;
        const line = lines[index];
        const lineIndent = indentOf(line);
        if (lineIndent < indent) break;
        if (lineIndent > indent) fail("Unexpected indentation in sequence");
        const trimmed = line.slice(lineIndent);
        if (!/^-(?:\s|$)/.test(trimmed)) break;

        const rest = stripComment(trimmed.slice(1)).trim();
        index += 1;

        if (!rest) {
          skipBlank();
          if (index < lines.length && indentOf(lines[index]) > indent) {
            result.push(parseMapping(indentOf(lines[index])));
          } else {
            result.push(null);
          }
          continue;
        }

        if (/^[^:]+:(\s|$)/.test(rest) && !/^["'].*["']$/.test(rest)) {
          const match = rest.match(/^([^:]+):(.*)$/);
          const item = {};
          const key = unquote(match[1]);
          const rawValue = stripComment(match[2]).trim();
          if (/^[|>][+-]?$/.test(rawValue)) {
            item[key] = parseBlockScalar(indent, rawValue);
          } else {
            item[key] = rawValue ? coerce(unquote(rawValue)) : null;
          }
          skipBlank();
          if (index < lines.length && indentOf(lines[index]) > indent) {
            Object.assign(item, parseMapping(indentOf(lines[index])));
          }
          result.push(item);
          continue;
        }

        result.push(coerce(unquote(rest)));
      }
      return result;
    }

    function parseMapping(indent) {
      const result = {};
      while (true) {
        skipBlank();
        if (index >= lines.length) break;
        const line = lines[index];
        const lineIndent = indentOf(line);
        if (lineIndent < indent) break;
        if (lineIndent > indent) fail("Unexpected indentation in mapping");
        const trimmed = line.slice(lineIndent);
        if (/^-(?:\s|$)/.test(trimmed)) break;

        const match = trimmed.match(/^([^:]+):(.*)$/);
        if (!match) fail("Expected a key: value pair");
        const key = unquote(match[1]);
        const rawValue = stripComment(match[2]).trim();
        index += 1;

        if (!rawValue) {
          skipBlank();
          if (index < lines.length) {
            const nextIndent = indentOf(lines[index]);
            const nextTrimmed = lines[index].slice(nextIndent);
            if (/^-(?:\s|$)/.test(nextTrimmed)) {
              result[key] = parseSequence(nextIndent);
              continue;
            }
            if (nextIndent > indent) {
              result[key] = parseMapping(nextIndent);
              continue;
            }
          }
          result[key] = null;
          continue;
        }

        if (/^[|>][+-]?$/.test(rawValue)) {
          result[key] = parseBlockScalar(indent, rawValue);
          continue;
        }

        result[key] = coerce(unquote(rawValue));
      }
      return result;
    }

    skipBlank();
    if (index >= lines.length) return {};
    let parsed;
    if (lines[index].slice(indentOf(lines[index])).startsWith("-")) {
      parsed = parseSequence(indentOf(lines[index]));
    } else {
      parsed = parseMapping(indentOf(lines[index]));
    }
    skipBlank();
    if (index < lines.length) fail("Unexpected content after document");
    return parsed;
  }

  function resolveUrl(value, baseUrl) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      return new URL(value.trim(), baseUrl || undefined).href;
    } catch (error) {
      return value.trim();
    }
  }

  function derivePreviousPath(metricsPath) {
    if (typeof metricsPath !== "string") return null;
    return metricsPath.replace(/([^/]+)\.json(\?.*)?$/, "$1-prev.json$2");
  }

  function readInteger(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function normalizeConfig(meta, metaUrl, fallbackBaseUrl) {
    const source = isObject(meta) ? meta : {};
    const fallbackBase = fallbackBaseUrl || metaUrl || "http://localhost/";
    const hasLiveUrl = typeof source.live_metrics_url === "string" && source.live_metrics_url.trim();
    const livePath = hasLiveUrl ? source.live_metrics_url.trim() : "./data/metrics.json";
    const liveBase = hasLiveUrl ? metaUrl : fallbackBase;

    const statusMap = { ...DEFAULT_STATUS_MAP };
    if (isObject(source.status_map)) {
      Object.entries(source.status_map).forEach(([key, value]) => {
        if (typeof value === "string" && value.trim()) statusMap[key] = value.trim();
      });
    }

    const pipelines = [];
    if (Array.isArray(source.pipelines)) {
      source.pipelines.forEach((entry, index) => {
        if (!isObject(entry)) return;
        const hasEntryMetrics = typeof entry.metrics_url === "string" && entry.metrics_url.trim();
        const hasEntryPrevious = typeof entry.prev_url === "string" && entry.prev_url.trim();
        const metricsPath = hasEntryMetrics ? entry.metrics_url.trim() : livePath;
        const prevPath = hasEntryPrevious ? entry.prev_url.trim() : derivePreviousPath(metricsPath);
        const metricsBase = hasEntryMetrics || hasLiveUrl ? metaUrl : fallbackBase;
        pipelines.push({
          id: String(entry.id || `pipeline-${index + 1}`),
          label: String(entry.label || entry.id || `Pipeline ${index + 1}`),
          metricsPath,
          metricsUrl: resolveUrl(metricsPath, metricsBase),
          prevUrl: resolveUrl(prevPath, hasEntryPrevious ? metaUrl : metricsBase)
        });
      });
    }

    if (!pipelines.length) {
      pipelines.push({
        id: String(source.default_pipeline || "etl-main"),
        label: String(source.default_pipeline_label || "ETL 本流"),
        metricsPath: livePath,
        metricsUrl: resolveUrl(livePath, liveBase),
        prevUrl: resolveUrl(derivePreviousPath(livePath), liveBase)
      });
    }

    const defaultPipeline = pipelines.some((pipeline) => pipeline.id === source.default_pipeline)
      ? String(source.default_pipeline)
      : pipelines[0].id;

    return {
      loaded: isObject(meta),
      updated: typeof source.updated === "string" ? source.updated : null,
      gitCommit: typeof source.git_commit === "string" ? source.git_commit : "unknown",
      pollIntervalMs: readInteger(source.poll_interval_ms, 2500, 500, 60000),
      statusMap,
      pipelines,
      defaultPipeline,
      prevDiagram: typeof source.prev_diagram === "string" ? source.prev_diagram : null
    };
  }

  function addIssue(issues, level, path, message) {
    issues.push({ level, path, message });
  }

  function readNumber(value, fallback, path, issues) {
    if (value === undefined || value === null || value === "") {
      addIssue(issues, "warn", path, "値がありません。0 として扱います。");
      return fallback;
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
      addIssue(issues, "error", path, `数値ではありません (${String(value)})。0 として扱います。`);
      return fallback;
    }
    if (number < 0) {
      addIssue(issues, "error", path, `負の値です (${number})。0 として扱います。`);
      return 0;
    }
    return number;
  }

  function validateSnapshot(data) {
    const issues = [];
    const empty = {
      timestamp: new Date().toISOString(),
      pipeline: "unknown",
      steps: [],
      quarantine: {
        step_id: "error-handler",
        label: "@error-handler",
        records_in: 0,
        records_out: 0,
        elapsed_ms: 0,
        status: "External",
        message: ""
      },
      errors: []
    };

    if (!isObject(data)) {
      addIssue(issues, "error", "$", "スナップショットがオブジェクトではありません。");
      return { snapshot: empty, issues, summary: { errors: 1, warnings: 0, ok: false } };
    }

    const snapshot = {
      timestamp: "",
      pipeline: "",
      steps: [],
      quarantine: { ...empty.quarantine },
      errors: []
    };

    if (typeof data.timestamp === "string" && data.timestamp.trim()) {
      snapshot.timestamp = data.timestamp.trim();
      if (Number.isNaN(Date.parse(snapshot.timestamp))) {
        addIssue(issues, "warn", "timestamp", "ISO 8601 として解釈できません。");
      }
    } else {
      snapshot.timestamp = new Date().toISOString();
      addIssue(issues, "warn", "timestamp", "timestamp がありません。現在時刻を使用します。");
    }

    if (typeof data.pipeline === "string" && data.pipeline.trim()) {
      snapshot.pipeline = data.pipeline.trim();
    } else {
      snapshot.pipeline = "unknown";
      addIssue(issues, "warn", "pipeline", "pipeline 識別子がありません。");
    }

    const seen = new Set();
    const rawSteps = Array.isArray(data.steps) ? data.steps : [];
    if (!Array.isArray(data.steps)) {
      addIssue(issues, "error", "steps", "steps が配列ではありません。");
    } else if (!rawSteps.length) {
      addIssue(issues, "error", "steps", "steps が空です。");
    }

    rawSteps.forEach((raw, index) => {
      const path = `steps[${index}]`;
      if (!isObject(raw)) {
        addIssue(issues, "error", path, "ステップがオブジェクトではありません。");
        return;
      }

      let stepId = typeof raw.step_id === "string" ? raw.step_id.trim() : "";
      if (!stepId) {
        stepId = `step-${index + 1}`;
        addIssue(issues, "warn", `${path}.step_id`, "step_id がありません。連番を使用します。");
      }
      if (seen.has(stepId)) {
        addIssue(issues, "error", `${path}.step_id`, `step_id が重複しています (${stepId})。`);
      }
      seen.add(stepId);

      const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : stepId;
      if (typeof raw.label !== "string" || !raw.label.trim()) {
        addIssue(issues, "warn", `${path}.label`, "label がありません。step_id を使用します。");
      }

      const recordsIn = readNumber(raw.records_in, 0, `${path}.records_in`, issues);
      const recordsOut = readNumber(raw.records_out, 0, `${path}.records_out`, issues);
      const elapsed = readNumber(raw.elapsed_ms, 0, `${path}.elapsed_ms`, issues);

      let status = typeof raw.status === "string" ? raw.status.trim() : "Healthy";
      if (!STATUSES.includes(status)) {
        addIssue(issues, "warn", `${path}.status`, `未知のステータスです (${status})。Warning として扱います。`);
        status = "Warning";
      } else if (!MAIN_STATUSES.includes(status)) {
        addIssue(issues, "warn", `${path}.status`, "本流ステップに External が指定されています。");
      }

      if (recordsOut > recordsIn) {
        addIssue(issues, "warn", `${path}.records_out`, `出力 (${recordsOut}) が入力 (${recordsIn}) を上回っています。`);
      }
      if (elapsed > 1000) {
        addIssue(issues, "warn", `${path}.elapsed_ms`, `処理時間が 1,000 ms を超えています (${elapsed} ms)。`);
      }

      snapshot.steps.push({
        step_id: stepId,
        label,
        records_in: recordsIn,
        records_out: recordsOut,
        elapsed_ms: elapsed,
        status,
        message: typeof raw.message === "string" ? raw.message : ""
      });
    });

    const rawQuarantine = isObject(data.quarantine) ? data.quarantine : null;
    if (!rawQuarantine) {
      addIssue(issues, "warn", "quarantine", "quarantine がありません。空のエラーハンドラを補います。");
    }
    const quarantine = snapshot.quarantine;
    quarantine.step_id = rawQuarantine && typeof rawQuarantine.step_id === "string" && rawQuarantine.step_id.trim()
      ? rawQuarantine.step_id.trim()
      : "error-handler";
    quarantine.label = rawQuarantine && typeof rawQuarantine.label === "string" && rawQuarantine.label.trim()
      ? rawQuarantine.label.trim()
      : "@error-handler";
    quarantine.records_in = readNumber(rawQuarantine && rawQuarantine.records_in, 0, "quarantine.records_in", issues);
    quarantine.records_out = readNumber(rawQuarantine && rawQuarantine.records_out, 0, "quarantine.records_out", issues);
    quarantine.elapsed_ms = readNumber(rawQuarantine && rawQuarantine.elapsed_ms, 0, "quarantine.elapsed_ms", issues);
    quarantine.status = "External";
    quarantine.message = rawQuarantine && typeof rawQuarantine.message === "string" ? rawQuarantine.message : "";

    const rawErrors = Array.isArray(data.errors) ? data.errors : [];
    if (!Array.isArray(data.errors)) {
      addIssue(issues, "warn", "errors", "errors が配列ではありません。空として扱います。");
    }
    rawErrors.forEach((raw, index) => {
      const path = `errors[${index}]`;
      if (!isObject(raw)) {
        addIssue(issues, "error", path, "エラーイベントがオブジェクトではありません。");
        return;
      }
      const stepId = typeof raw.step_id === "string" ? raw.step_id.trim() : "";
      if (stepId && !seen.has(stepId)) {
        addIssue(issues, "warn", `${path}.step_id`, `未知のステップを参照しています (${stepId})。`);
      }
      snapshot.errors.push({
        at: typeof raw.at === "string" && raw.at.trim() ? raw.at.trim() : "--:--:--",
        step_id: stepId || "Transform",
        kind: typeof raw.kind === "string" && raw.kind.trim() ? raw.kind.trim() : "error",
        message: typeof raw.message === "string" ? raw.message : "",
        count: readNumber(raw.count, 0, `${path}.count`, issues)
      });
    });

    for (let index = 1; index < snapshot.steps.length; index += 1) {
      const previous = snapshot.steps[index - 1];
      const current = snapshot.steps[index];
      if (previous.records_out !== current.records_in) {
        addIssue(
          issues,
          "warn",
          `steps[${index}].records_in`,
          `前段の出力 (${previous.records_out}) と入力 (${current.records_in}) が一致しません。`
        );
      }
    }

    if (snapshot.steps.length >= 2) {
      const first = snapshot.steps[0];
      const last = snapshot.steps[snapshot.steps.length - 1];
      const dropped = Math.max(0, first.records_out - last.records_out);
      if (quarantine.records_in !== dropped) {
        addIssue(
          issues,
          "warn",
          "quarantine.records_in",
          `隔離件数 (${quarantine.records_in}) と本流の減少 (${dropped}) が一致しません。`
        );
      }
    }

    const errorCount = issues.filter((issue) => issue.level === "error").length;
    return {
      snapshot,
      issues,
      summary: { errors: errorCount, warnings: issues.length - errorCount, ok: errorCount === 0 }
    };
  }

  function hashText(text) {
    let hash = 0x811c9dc5;
    const source = String(text);
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  return {
    STATUSES,
    DEFAULT_STATUS_MAP,
    parseYaml,
    resolveUrl,
    derivePreviousPath,
    normalizeConfig,
    validateSnapshot,
    hashText
  };
});
