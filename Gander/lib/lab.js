/* Gander — KeyLint Lab pipeline.
   Pure logic, no DOM, no network, no storage. Usable from the browser and Node. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GanderLab = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PROVIDERS = [
    {
      id: "private_key",
      label: "Private key",
      severity: 58,
      pattern: /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/,
      mask: function () { return "-----BEGIN PRIVATE KEY----- [redacted]"; }
    },
    {
      id: "stripe",
      label: "Stripe key",
      severity: 38,
      pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/,
      mask: function (value) {
        var head = value.indexOf("_", value.indexOf("_") + 1) + 1;
        return maskTail(value.slice(0, head), value);
      }
    },
    {
      id: "anthropic",
      label: "Anthropic key",
      severity: 30,
      pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
      mask: function (value) { return maskHead(value, "sk-ant-"); }
    },
    {
      id: "openai",
      label: "OpenAI key",
      severity: 30,
      pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
      mask: function (value) { return maskHead(value, "sk-"); }
    },
    {
      id: "github",
      label: "GitHub token",
      severity: 36,
      pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{30,})\b/,
      mask: function (value) {
        var head = value.indexOf("_") + 1;
        return maskTail(value.slice(0, head), value);
      }
    },
    {
      id: "aws",
      label: "AWS access key",
      severity: 38,
      pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
      mask: function (value) { return value.slice(0, 4) + "••••••••" + value.slice(-4); }
    },
    {
      id: "slack",
      label: "Slack token",
      severity: 30,
      pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
      mask: function (value) { return maskHead(value, "xox"); }
    },
    {
      id: "google",
      label: "Google API key",
      severity: 28,
      pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
      mask: function (value) { return value.slice(0, 4) + "••••••••" + value.slice(-4); }
    },
    {
      id: "jwt",
      label: "JWT",
      severity: 20,
      pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
      mask: function (value) { return value.slice(0, 3) + "••••••••" + value.slice(-4); }
    }
  ];

  var CONTEXT_RE = /(api[_-]?key|secret|token|passwd|password|credential|private[_-]?key|access[_-]?key)/i;
  var SENSITIVE_PATH_RE = /(^|\/)(\.ssh|\.aws|\.gnupg)(\/|$)/;
  var ENV_FILE_RE = /(^|\/)(\.env(\.[^/]*)?|\.npmrc|\.pypirc|credentials|id_rsa|id_ed25519)$/i;
  var ALLOWLIST_RE = /(example|sample|dummy|placeholder|changeme|change_me|your[_-]|replace[_-]?me|xxxx|0{8,}|\$\{[^}]+\}|\{\{[^}]+\}\}|<[^>]+>)/i;

  function shannonEntropy(value) {
    var text = String(value || "");
    if (!text.length) return 0;
    var counts = {};
    for (var i = 0; i < text.length; i++) {
      counts[text[i]] = (counts[text[i]] || 0) + 1;
    }
    var entropy = 0;
    for (var key in counts) {
      var p = counts[key] / text.length;
      entropy -= p * Math.log2(p);
    }
    return Math.round(entropy * 100) / 100;
  }

  function maskTail(head, value) {
    var tail = value.slice(-4);
    return head + "••••••••" + tail;
  }

  function maskHead(value) {
    return value.slice(0, 3) + "••••••••" + value.slice(-4);
  }

  function maskSecret(value) {
    var text = String(value || "");
    if (!text) return "";
    for (var i = 0; i < PROVIDERS.length; i++) {
      if (PROVIDERS[i].pattern.test(text)) return PROVIDERS[i].mask(text);
    }
    if (text.length <= 8) return "••••••••";
    return text.slice(0, 2) + "••••••••" + text.slice(-4);
  }

  function detectProvider(value) {
    for (var i = 0; i < PROVIDERS.length; i++) {
      if (PROVIDERS[i].pattern.test(value)) return PROVIDERS[i];
    }
    return null;
  }

  function riskLevel(score) {
    if (score >= 72) return "critical";
    if (score >= 52) return "high";
    if (score >= 34) return "medium";
    return "low";
  }

  /* Samples keep Stripe-shaped dummies as fragments so the repository itself
     does not contain a string that secret scanners flag. Join them here. */
  function sampleValue(sample) {
    if (!sample) return "";
    if (typeof sample.value === "string") return sample.value;
    if (Array.isArray(sample.valueParts)) return sample.valueParts.join("");
    return "";
  }

  function classify(input) {
    var value = sampleValue(input);
    var keyName = String(input && input.key || "");
    var file = String(input && input.file || "");
    var tracked = !!(input && input.tracked);
    var worldReadable = !!(input && input.worldReadable);
    var known = !!(input && input.known);

    var stages = [];
    var reasons = [];
    var provider = detectProvider(value);
    var patternHit = !!provider;
    var contextKey = CONTEXT_RE.test(keyName);
    var contextFile = ENV_FILE_RE.test(file) || /(^|\/)(config|secrets?)(\.|\/|$)/i.test(file);
    var contextHit = contextKey || contextFile;
    var entropy = shannonEntropy(value);
    var entropyHit = value.length >= 20 && entropy >= 3.3;
    var allowlisted = ALLOWLIST_RE.test(value);

    if (patternHit) {
      stages.push({
        id: "pattern",
        label: "Pattern",
        status: "hit",
        verdict: "MATCH",
        detail: provider.label + " の形式に一致しました。",
        meta: provider.id
      });
    } else {
      stages.push({
        id: "pattern",
        label: "Pattern",
        status: "info",
        verdict: "NO MATCH",
        detail: "既知プロバイダの形式には一致しませんでした。文脈とエントロピーで続行します。"
      });
    }

    if (contextHit) {
      var contextParts = [];
      if (contextKey) contextParts.push("変数名 " + keyName);
      if (contextFile) contextParts.push("ファイル " + file);
      stages.push({
        id: "context",
        label: "Context",
        status: "hit",
        verdict: "BOOST",
        detail: contextParts.join(" / ") + " が秘密らしい文脈を示しています。"
      });
    } else {
      stages.push({
        id: "context",
        label: "Context",
        status: "info",
        verdict: "NEUTRAL",
        detail: "変数名・ファイル名からは秘密の文脈を検出しませんでした。"
      });
    }

    if (entropyHit) {
      stages.push({
        id: "entropy",
        label: "Entropy",
        status: "hit",
        verdict: entropy.toFixed(2) + " bits",
        detail: "長さ " + value.length + "、エントロピー " + entropy.toFixed(2) + " で、ランダム文字列の閾値を超えています。"
      });
    } else {
      stages.push({
        id: "entropy",
        label: "Entropy",
        status: "info",
        verdict: entropy.toFixed(2) + " bits",
        detail: "エントロピーは閾値未満、または長さが不足しています。"
      });
    }

    if (allowlisted) {
      stages.push({
        id: "allowlist",
        label: "Allowlist",
        status: "stop",
        verdict: "STOP",
        detail: "サンプル値・プレースホルダ・展開式のいずれかに該当したため、検出から除外しました。"
      });
    } else {
      stages.push({
        id: "allowlist",
        label: "Allowlist",
        status: "info",
        verdict: "PASS",
        detail: "除外規則には該当しませんでした。"
      });
    }

    var candidate = patternHit || (contextHit && value.length >= 8) || entropyHit;
    var finding = null;

    if (allowlisted) {
      candidate = false;
    }

    if (candidate) {
      var isGeneric = !provider;
      var severity = provider ? provider.severity : 18;
      if (provider && provider.id === "stripe" && /_test_/.test(value)) {
        severity = 24;
        reasons.push("test キーのため live より低い基礎点");
      }
      if (isGeneric) {
        reasons.push("既知形式ではなく、文脈とエントロピーからの推定");
      }

      var score = severity;
      reasons.push("基礎点 " + severity);

      if (tracked) {
        score += 22;
        reasons.push("Git 管理下 (+22)");
      }
      if (worldReadable) {
        score += 14;
        reasons.push("誰でも読める権限 (+14)");
      }
      if (SENSITIVE_PATH_RE.test(file)) {
        score += 14;
        reasons.push("資格情報ディレクトリ (+14)");
      }
      score = Math.min(100, score);

      var confidence = patternHit ? 0.98 : 0.58;
      if (patternHit && contextHit) confidence = 0.99;
      if (!patternHit && contextHit && entropyHit) confidence = 0.82;
      if (!patternHit && contextHit && !entropyHit) confidence = 0.62;

      stages.push({
        id: "mask",
        label: "Mask",
        status: "hit",
        verdict: "MASKED",
        detail: "値は保存せず、マスク済みの表示だけを生成しました。"
      });
      stages.push({
        id: "risk",
        label: "Risk",
        status: "hit",
        verdict: score + " / " + riskLevel(score),
        detail: "秘密の強さと露出度を合算し、優先度を決めました。"
      });
      stages.push({
        id: "baseline",
        label: "Baseline",
        status: "info",
        verdict: known ? "KNOWN" : "NEW",
        detail: known
          ? "前回レポートに存在するため、新規ではありません。"
          : "前回レポートに存在しないため、新規として扱います。"
      });

      finding = {
        provider: provider ? provider.id : "generic",
        label: provider ? provider.label : "Generic secret",
        severity: severity,
        confidence: confidence,
        score: score,
        level: riskLevel(score),
        status: known ? "known" : "new",
        masked: maskSecret(value),
        reasons: reasons,
        entropy: entropy
      };
    } else {
      stages.push({
        id: "mask",
        label: "Mask",
        status: "skip",
        verdict: "SKIP",
        detail: "検出候補ではないため、マスク処理を行いません。"
      });
      stages.push({
        id: "risk",
        label: "Risk",
        status: "skip",
        verdict: "SKIP",
        detail: "リスク評価は行いません。"
      });
      stages.push({
        id: "baseline",
        label: "Baseline",
        status: "skip",
        verdict: "SKIP",
        detail: "差分比較は行いません。"
      });
    }

    return {
      input: {
        value: value,
        key: keyName,
        file: file,
        tracked: tracked,
        worldReadable: worldReadable,
        known: known
      },
      entropy: entropy,
      candidate: candidate,
      finding: finding,
      stages: stages
    };
  }

  return {
    PROVIDERS: PROVIDERS,
    shannonEntropy: shannonEntropy,
    maskSecret: maskSecret,
    detectProvider: detectProvider,
    riskLevel: riskLevel,
    sampleValue: sampleValue,
    classify: classify
  };
});
