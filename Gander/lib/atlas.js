/* Gander — atlas data helpers.
   Pure functions shared by the browser UI and Node tests. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GanderAtlas = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function matches(text, query) {
    return String(text || "").toLowerCase().indexOf(String(query || "").toLowerCase()) !== -1;
  }

  function filterExhibits(exhibits, options) {
    var query = String(options && options.query || "").trim();
    var mechanism = String(options && options.mechanism || "").trim();
    return exhibits.filter(function (item) {
      if (mechanism && (item.mechanisms || []).indexOf(mechanism) === -1) return false;
      if (!query) return true;
      var haystack = [
        item.name, item.kicker, item.question, item.summary,
        (item.mechanisms || []).join(" "),
        (item.pipeline || []).map(function (step) { return step.label + " " + step.detail; }).join(" ")
      ].join(" ");
      return matches(haystack, query);
    });
  }

  function filterMechanisms(mechanisms, options) {
    var query = String(options && options.query || "").trim();
    var exhibit = String(options && options.exhibit || "").trim();
    return mechanisms.filter(function (item) {
      if (exhibit && (item.used_by || []).indexOf(exhibit) === -1) return false;
      if (!query) return true;
      var haystack = [item.name, item.ja, item.definition, item.why, (item.signals || []).join(" ")].join(" ");
      return matches(haystack, query);
    });
  }

  function mechanismUsage(exhibits, mechanisms) {
    var usage = {};
    mechanisms.forEach(function (mechanism) { usage[mechanism.id] = []; });
    exhibits.forEach(function (exhibit) {
      (exhibit.mechanisms || []).forEach(function (id) {
        if (usage[id]) usage[id].push(exhibit.id);
      });
    });
    return usage;
  }

  function neighbors(exhibits, id) {
    var index = -1;
    for (var i = 0; i < exhibits.length; i++) {
      if (exhibits[i].id === id) { index = i; break; }
    }
    if (index === -1) return { previous: null, next: null, index: -1 };
    return {
      previous: index > 0 ? exhibits[index - 1] : null,
      next: index < exhibits.length - 1 ? exhibits[index + 1] : null,
      index: index
    };
  }

  function resolveHref(href, depth) {
    var prefix = depth === 2 ? "../../" : depth === 1 ? "../" : "";
    return prefix + String(href || "");
  }

  function validateData(exhibits, mechanisms) {
    var errors = [];
    var ids = {};
    var mechanismIds = {};

    mechanisms.forEach(function (mechanism) {
      if (mechanismIds[mechanism.id]) errors.push("duplicate mechanism id: " + mechanism.id);
      mechanismIds[mechanism.id] = true;
      if (!mechanism.name || !mechanism.ja) errors.push("mechanism missing name: " + mechanism.id);
      if (!Array.isArray(mechanism.used_by) || !mechanism.used_by.length) {
        errors.push("mechanism has no exhibits: " + mechanism.id);
      }
    });

    exhibits.forEach(function (exhibit) {
      if (ids[exhibit.id]) errors.push("duplicate exhibit id: " + exhibit.id);
      ids[exhibit.id] = true;
      if (!exhibit.name || !exhibit.question) errors.push("exhibit missing name/question: " + exhibit.id);
      if (!Array.isArray(exhibit.pipeline) || exhibit.pipeline.length < 3) {
        errors.push("exhibit pipeline too short: " + exhibit.id);
      }
      if (!Array.isArray(exhibit.mechanisms) || !exhibit.mechanisms.length) {
        errors.push("exhibit has no mechanisms: " + exhibit.id);
      }
      (exhibit.mechanisms || []).forEach(function (id) {
        if (!mechanismIds[id]) errors.push("unknown mechanism " + id + " in " + exhibit.id);
      });
      if (!Array.isArray(exhibit.links) || !exhibit.links.length) {
        errors.push("exhibit has no links: " + exhibit.id);
      }
    });

    mechanisms.forEach(function (mechanism) {
      (mechanism.used_by || []).forEach(function (id) {
        if (!ids[id]) errors.push("unknown exhibit " + id + " in mechanism " + mechanism.id);
        var exhibit = byId(exhibits, id);
        if (exhibit && (exhibit.mechanisms || []).indexOf(mechanism.id) === -1) {
          errors.push("backlink missing: " + mechanism.id + " -> " + id);
        }
      });
    });

    exhibits.forEach(function (exhibit) {
      (exhibit.mechanisms || []).forEach(function (id) {
        var mechanism = byId(mechanisms, id);
        if (mechanism && (mechanism.used_by || []).indexOf(exhibit.id) === -1) {
          errors.push("backlink missing: " + exhibit.id + " -> " + id);
        }
      });
    });

    return errors;
  }

  return {
    byId: byId,
    matches: matches,
    filterExhibits: filterExhibits,
    filterMechanisms: filterMechanisms,
    mechanismUsage: mechanismUsage,
    neighbors: neighbors,
    resolveHref: resolveHref,
    validateData: validateData
  };
});
