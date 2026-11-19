"use strict";

const ASSIGNMENT_PATTERN = /^(?:export\s+)?(?:(?:const|let|var)\s+)?["'`]?([A-Za-z_$][\w$.-]*)["'`]?\s*(?::|=)\s*(.+)$/;
const EXPORTED_SYMBOL_PATTERN = /^\s*\+\s*export\s+(?:(?:default|async)\s+)*(?:function|class|const|let|var|interface|type)\s+([A-Za-z_$][\w$]*)/;
const NUMBER_PATTERN = "[-+]?\\d(?:_?\\d)*(?:\\.\\d+)?";
const RANGE_GUARD_PATTERN = new RegExp(`^([A-Za-z_$][\\w$.]*)\\s*([<>])\\s*(${NUMBER_PATTERN})$`);
const DOCUMENTED_RANGE_PATTERN = new RegExp(
  `\\bbetween\\s+(${NUMBER_PATTERN})\\s+and\\s+(${NUMBER_PATTERN})|\\bfrom\\s+(${NUMBER_PATTERN})\\s+(?:to|through)\\s+(${NUMBER_PATTERN})|(?<![\\w.+-])(${NUMBER_PATTERN})\\s*(?:to|through|[-–—])\\s*(${NUMBER_PATTERN})(?![\\w]|\\.\\d)`,
  "gi"
);

function analyzeWithRules(changedFiles, documents) {
  const findings = [];
  const seen = new Set();
  let nextId = 1;

  for (const file of changedFiles) {
    if (!file.patch) continue;
    for (const addedLine of file.patch.split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++"))) {
      const codeLine = addedLine.slice(1).trim();
      const codeRange = parseRangeGuard(codeLine);
      if (codeRange) {
        const keyTerms = keyWords(codeRange.key);
        for (const document of documents) {
          for (const docLine of document.content.split(/\r?\n/)) {
            const documentedRange = extractDocumentedRange(docLine, keyTerms, codeRange.key);
            if (!documentedRange ||
                documentedRange.min === codeRange.min && documentedRange.max === codeRange.max) continue;

            const fingerprint = `${file.filename}|${document.path}|${codeRange.key}|${docLine.trim()}`;
            if (seen.has(fingerprint)) continue;
            seen.add(fingerprint);
            findings.push({
              id: `RULE-${String(nextId++).padStart(3, "0")}`,
              title: `${humanize(codeRange.key)} range differs from the documentation`,
              severity: "Medium",
              confidence: "High",
              status: "Open",
              codeFile: file.filename,
              codeReference: file.filename,
              docsFile: document.path,
              docsReference: document.path,
              outdated: docLine.trim(),
              codeValue: codeLine,
              suggestion: `Update ${document.path} to document the supported ${codeRange.key} range from ${codeRange.min} to ${codeRange.max}.`,
              context: `The pull request changes the supported ${codeRange.key} range, but the documentation describes a different range.`,
              codeEvidence: codeLine,
              docsEvidence: docLine.trim(),
              source: "rules"
            });
          }
        }
      }

      const assignment = parseAssignment(codeLine);
      if (!assignment) continue;

      const keyTerms = keyWords(assignment.key);
      if (keyTerms.length === 0) continue;
      const codeValue = comparableValue(assignment.value, assignment.key);
      if (codeValue === null) continue;

      for (const document of documents) {
        const documentLines = document.content.split(/\r?\n/);
        for (const docLine of documentLines) {
          if (!lineMentionsKey(docLine, keyTerms, assignment.key)) continue;
          const documentationValues = extractComparableValues(docLine, assignment.key);
          if (documentationValues.length === 0 || documentationValues.some((value) => value === codeValue)) continue;

          const fingerprint = `${file.filename}|${document.path}|${assignment.key}|${docLine.trim()}`;
          if (seen.has(fingerprint)) continue;
          seen.add(fingerprint);
          findings.push({
            id: `RULE-${String(nextId++).padStart(3, "0")}`,
            title: `${humanize(assignment.key)} differs from the documentation`,
            severity: severityForKey(assignment.key),
            confidence: "High",
            status: "Open",
            codeFile: file.filename,
            codeReference: file.filename,
            docsFile: document.path,
            docsReference: document.path,
            outdated: docLine.trim(),
            codeValue: codeLine,
            suggestion: `Update ${document.path} to match this changed code: ${codeLine}`,
            context: `The pull request adds a ${assignment.key} value that conflicts with this documentation line.`,
            codeEvidence: codeLine,
            docsEvidence: docLine.trim(),
            source: "rules"
          });
        }
      }
    }

    for (const addedLine of file.patch.split(/\r?\n/)) {
      const match = addedLine.match(EXPORTED_SYMBOL_PATTERN);
      if (!match || !documents.length || /\.(?:test|spec)\.[^.]+$/i.test(file.filename)) continue;
      const symbol = match[1];
      if (documents.some((document) => new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "i").test(document.content))) continue;
      if (findings.some((finding) => finding.codeFile === file.filename && finding.codeEvidence === addedLine.slice(1).trim())) continue;

      const docsList = documents.map((document) => document.path).slice(0, 5);
      const docsEvidence = `No mention of "${symbol}" was found in the ${documents.length} fetched documentation file(s): ${docsList.join(", ")}.`;
      findings.push({
        id: `RULE-${String(nextId++).padStart(3, "0")}`,
        title: `New exported symbol ${symbol} is not mentioned in the fetched documentation`,
        severity: "Low",
        confidence: "Low",
        status: "Open",
        codeFile: file.filename,
        codeReference: file.filename,
        docsFile: docsList.join(", "),
        docsReference: "Repository documentation search",
        outdated: docsEvidence,
        codeValue: addedLine.slice(1).trim(),
        suggestion: `Add documentation for the exported symbol ${symbol}, or link it from the relevant guide.`,
        context: `The pull request adds an exported symbol, but its name was not found in the documentation files examined.`,
        codeEvidence: addedLine.slice(1).trim(),
        docsEvidence,
        source: "rules"
      });
    }
  }

  return findings;
}

function parseAssignment(line) {
  const match = line.match(ASSIGNMENT_PATTERN);
  if (!match) return null;
  const value = match[2].replace(/[,;]\s*(?:\/\/.*)?$/, "").replace(/\s+\/\/.*$/, "").trim();
  return value ? { key: match[1], value } : null;
}

function parseRangeGuard(line) {
  if (!/\bthrow\b/.test(line)) return null;
  const condition = line.match(/\bif\s*\(([^)]*)\)/)?.[1];
  if (!condition) return null;
  const comparisons = condition.split(/\s*\|\|\s*/).map((part) => {
    const match = part.trim().match(RANGE_GUARD_PATTERN);
    if (!match) return null;
    const value = Number(match[3].replace(/_/g, ""));
    return Number.isFinite(value) ? { key: match[1], operator: match[2], value } : null;
  });
  if (comparisons.length !== 2 || comparisons.some((comparison) => !comparison)) return null;
  const [first, second] = comparisons;
  if (first.key !== second.key || first.operator === second.operator) return null;

  const lower = first.operator === "<" ? first : second;
  const upper = first.operator === ">" ? first : second;
  if (lower.value > upper.value) return null;
  return { key: first.key, min: lower.value, max: upper.value };
}

function extractDocumentedRange(line, keyTerms, key) {
  const clauses = line.split(/;|\||(?<=[.!?])\s+|,\s+(?!(?:from|between|range)\b)/i);
  const matches = clauses
    .filter((clause) => lineMentionsKey(clause, keyTerms, key))
    .flatMap((clause) => {
      const clauseRanges = [...clause.matchAll(DOCUMENTED_RANGE_PATTERN)];
      return clauseRanges.length === 1 ? clauseRanges : [];
    });
  if (matches.length !== 1) return null;
  const match = matches[0];
  const min = Number((match[1] || match[3] || match[5]).replace(/_/g, ""));
  const max = Number((match[2] || match[4] || match[6]).replace(/_/g, ""));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return min <= max ? { min, max } : { min: max, max: min };
}

function keyWords(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !["millisecond", "milliseconds", "second", "seconds", "minute", "minutes", "hour", "hours"].includes(word));
}

function normalizeWord(word) {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  return word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word;
}

function lineMentionsKey(line, terms, key) {
  if (key && key.startsWith("this.")) {
    const propertyName = key.slice(key.lastIndexOf(".") + 1);
    const identifierPattern = new RegExp(`(^|[^\\w$])${escapeRegExp(propertyName)}(?=$|[^\\w$])`);
    return identifierPattern.test(line);
  }
  const lineWords = new Set((line.toLowerCase().match(/[a-z0-9]+/g) || []).map(normalizeWord));
  return terms.every((term) => lineWords.has(normalizeWord(term)));
}

function comparableValue(value, key) {
  const cleaned = value.trim().replace(/^['"`]|['"`]$/g, "").replace(/_/g, "");
  if (/^(true|false)$/i.test(cleaned)) return cleaned.toLowerCase();
  const scalar = cleaned.match(/^(?:[A-Za-z_$][\w$.]*\s*\?\?\s*)?([+-]?\d+(?:\.\d+)?\s*(?:milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)?)$/i);
  return scalar ? readNumber(scalar[1], key) : null;
}

function extractComparableValues(line, key) {
  const values = [];
  for (const match of line.matchAll(/\b(true|false)\b/gi)) {
    values.push(match[1].toLowerCase());
  }
  const pattern = /(-?\d[\d,_]*(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)?/gi;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const parsed = readNumber(`${match[1]}${match[2] || ""}`, key);
    if (parsed !== null) values.push(parsed);
  }
  return [...new Set(values)];
}

function readNumber(value, key) {
  const match = value.replace(/_/g, "").match(/(-?\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)?/i);
  if (!match) return null;
  const number = Number(match[1]);
  const unit = (match[2] || inferredUnit(key)).toLowerCase();
  const multipliers = {
    ms: 1, millisecond: 1, milliseconds: 1,
    s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
    m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000,
    h: 3600000, hr: 3600000, hrs: 3600000, hour: 3600000, hours: 3600000,
    d: 86400000, day: 86400000, days: 86400000,
    "": 1
  };
  if (!Object.hasOwn(multipliers, unit)) return null;
  return number * multipliers[unit];
}

function inferredUnit(key) {
  const normalized = key.toLowerCase();
  if (/milli?seconds?|ms$/.test(normalized)) return "ms";
  if (/minutes?|mins?$/.test(normalized)) return "minutes";
  if (/hours?|hrs?$/.test(normalized)) return "hours";
  if (/days?$/.test(normalized)) return "days";
  if (/seconds?|secs?$/.test(normalized)) return "seconds";
  return "";
}

function humanize(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\bms\b/i, "")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

function severityForKey(key) {
  return /(auth|token|password|secret|permission|access)/i.test(key) ? "High" : "Medium";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  analyzeWithRules,
  comparableValue,
  extractComparableValues,
  parseAssignment
};
