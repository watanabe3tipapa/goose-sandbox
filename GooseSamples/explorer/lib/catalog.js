/*
 * GooseSamples catalog
 *
 * Dependency-free helpers shared by the explorer and the Node tests:
 *   - catalog validation
 *   - search text normalization
 *   - filtering, sorting, counting
 *   - URL query <-> state conversion
 *
 * Loaded with a plain <script> tag and required from node:test.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GooseCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SORTS = ["number", "lines", "title"];
  const DEFAULT_FILTERS = Object.freeze({
    category: "all",
    level: "all",
    requirement: "all",
    unreadOnly: false,
    query: "",
    sort: "number",
  });

  function normalize(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function indexById(list) {
    const map = new Map();
    if (Array.isArray(list)) {
      list.forEach((item) => {
        if (item && typeof item.id === "string") map.set(item.id, item);
      });
    }
    return map;
  }

  function labelOf(map, id, fallback) {
    const item = map.get(id);
    return item ? item.label : fallback || id;
  }

  function validateCatalog(catalog) {
    const issues = [];
    const push = (level, path, message) => issues.push({ level, path, message });

    if (!catalog || typeof catalog !== "object") {
      push("error", "", "カタログがオブジェクトではありません");
      return { ok: false, issues };
    }
    ["categories", "levels", "requirements", "features", "samples"].forEach((key) => {
      if (!Array.isArray(catalog[key]) || catalog[key].length === 0) {
        push("error", key, `${key} が空か配列ではありません`);
      }
    });
    if (!catalog.meta || typeof catalog.meta !== "object") {
      push("error", "meta", "meta がありません");
    }

    const categories = indexById(catalog.categories);
    const levels = indexById(catalog.levels);
    const requirements = indexById(catalog.requirements);
    const features = indexById(catalog.features);
    const samples = Array.isArray(catalog.samples) ? catalog.samples : [];

    if (catalog.meta && catalog.meta.totalSamples !== samples.length) {
      push("error", "meta.totalSamples", `meta.totalSamples (${catalog.meta.totalSamples}) と samples.length (${samples.length}) が一致しません`);
    }

    const ids = new Set();
    const numbers = new Set();
    samples.forEach((sample, index) => {
      const path = `samples[${index}]`;
      if (!sample || typeof sample !== "object") {
        push("error", path, "サンプルがオブジェクトではありません");
        return;
      }
      if (typeof sample.id !== "string" || !/^\d{2}_[a-z0-9_]+$/.test(sample.id)) {
        push("error", `${path}.id`, "id は 01_tour 形式の文字列である必要があります");
      } else if (ids.has(sample.id)) {
        push("error", `${path}.id`, `id が重複しています: ${sample.id}`);
      } else {
        ids.add(sample.id);
      }
      if (!Number.isInteger(sample.number) || sample.number < 1) {
        push("error", `${path}.number`, "number は 1 以上の整数である必要があります");
      } else if (numbers.has(sample.number)) {
        push("error", `${path}.number`, `number が重複しています: ${sample.number}`);
      } else {
        numbers.add(sample.number);
      }
      ["title", "summary", "file", "run", "upstreamUrl"].forEach((key) => {
        if (typeof sample[key] !== "string" || sample[key].trim() === "") {
          push("error", `${path}.${key}`, `${key} が空です`);
        }
      });
      if (!categories.has(sample.category)) {
        push("error", `${path}.category`, `未定義のカテゴリです: ${sample.category}`);
      }
      if (!levels.has(sample.level)) {
        push("error", `${path}.level`, `未定義の難易度です: ${sample.level}`);
      }
      if (!Array.isArray(sample.features) || sample.features.length === 0) {
        push("error", `${path}.features`, "features が空です");
      } else {
        sample.features.forEach((id) => {
          if (!features.has(id)) push("error", `${path}.features`, `未定義の特徴です: ${id}`);
        });
      }
      if (!Array.isArray(sample.requirements) || sample.requirements.length === 0) {
        push("error", `${path}.requirements`, "requirements が空です");
      } else {
        sample.requirements.forEach((id) => {
          if (!requirements.has(id)) push("error", `${path}.requirements`, `未定義の要件です: ${id}`);
        });
      }
      if (!Array.isArray(sample.shows) || sample.shows.length === 0) {
        push("error", `${path}.shows`, "shows が空です");
      }
      if (!Number.isInteger(sample.lines) || sample.lines < 1) {
        push("error", `${path}.lines`, "lines は 1 以上の整数である必要があります");
      }
    });

    if (samples.length) {
      for (let n = 1; n <= samples.length; n += 1) {
        if (!numbers.has(n)) push("error", "samples[].number", `number ${n} が欠けています`);
      }
    }

    return { ok: issues.every((issue) => issue.level !== "error"), issues };
  }

  function searchText(sample, catalog) {
    const features = indexById(catalog.features);
    const categories = indexById(catalog.categories);
    const levels = indexById(catalog.levels);
    const requirements = indexById(catalog.requirements);
    return normalize(
      [
        sample.id,
        sample.number,
        sample.title,
        sample.originalTitle,
        sample.summary,
        sample.upstream,
        labelOf(categories, sample.category),
        labelOf(levels, sample.level),
        sample.shows.join(" "),
        sample.features.map((id) => labelOf(features, id)).join(" "),
        sample.requirements.map((id) => labelOf(requirements, id)).join(" "),
      ].join(" ")
    );
  }

  function filterSamples(catalog, filters, readIds) {
    const options = Object.assign({}, DEFAULT_FILTERS, filters || {});
    const query = normalize(options.query);
    const read = readIds instanceof Set ? readIds : new Set(readIds || []);
    return (catalog.samples || []).filter((sample) => {
      if (options.category && options.category !== "all" && sample.category !== options.category) return false;
      if (options.level && options.level !== "all" && sample.level !== options.level) return false;
      if (options.requirement && options.requirement !== "all" && !sample.requirements.includes(options.requirement)) return false;
      if (options.unreadOnly && read.has(sample.id)) return false;
      if (query && !searchText(sample, catalog).includes(query)) return false;
      return true;
    });
  }

  function titleCollator() {
    try {
      return new Intl.Collator("ja");
    } catch (error) {
      return { compare: (a, b) => String(a).localeCompare(String(b)) };
    }
  }

  function sortSamples(samples, sort) {
    const key = SORTS.includes(sort) ? sort : "number";
    const collator = titleCollator();
    const copy = samples.slice();
    copy.sort((a, b) => {
      if (key === "lines") return b.lines - a.lines || a.number - b.number;
      if (key === "title") return collator.compare(a.title, b.title) || a.number - b.number;
      return a.number - b.number;
    });
    return copy;
  }

  function countBy(samples, key) {
    const counts = Object.create(null);
    samples.forEach((sample) => {
      const value = sample[key];
      counts[value] = (counts[value] || 0) + 1;
    });
    return counts;
  }

  function summarize(catalog) {
    const samples = catalog.samples || [];
    return {
      total: samples.length,
      lines: samples.reduce((sum, sample) => sum + (sample.lines || 0), 0),
      byCategory: countBy(samples, "category"),
      byLevel: countBy(samples, "level"),
    };
  }

  function findSample(catalog, id) {
    return (catalog.samples || []).find((sample) => sample.id === id) || null;
  }

  function neighbors(catalog, id) {
    const samples = (catalog.samples || []).slice().sort((a, b) => a.number - b.number);
    const index = samples.findIndex((sample) => sample.id === id);
    if (index === -1) return { prev: null, next: null };
    return {
      prev: index > 0 ? samples[index - 1] : null,
      next: index < samples.length - 1 ? samples[index + 1] : null,
    };
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    try {
      return new Intl.NumberFormat("ja-JP").format(number);
    } catch (error) {
      return String(number);
    }
  }

  function parseQuery(search) {
    let params;
    try {
      params = new URLSearchParams(search || "");
    } catch (error) {
      params = new URLSearchParams("");
    }
    const sort = params.get("sort");
    return {
      sample: params.get("sample"),
      category: params.get("cat") || "all",
      level: params.get("level") || "all",
      requirement: params.get("req") || "all",
      query: params.get("q") || "",
      sort: SORTS.includes(sort) ? sort : "number",
      unreadOnly: params.get("unread") === "1",
    };
  }

  function buildQuery(state) {
    const params = new URLSearchParams();
    if (state.sample) params.set("sample", state.sample);
    if (state.category && state.category !== "all") params.set("cat", state.category);
    if (state.level && state.level !== "all") params.set("level", state.level);
    if (state.requirement && state.requirement !== "all") params.set("req", state.requirement);
    if (state.query) params.set("q", state.query);
    if (state.sort && state.sort !== "number") params.set("sort", state.sort);
    if (state.unreadOnly) params.set("unread", "1");
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  return {
    SORTS,
    DEFAULT_FILTERS,
    normalize,
    validateCatalog,
    searchText,
    filterSamples,
    sortSamples,
    countBy,
    summarize,
    findSample,
    neighbors,
    formatNumber,
    parseQuery,
    buildQuery,
  };
});
