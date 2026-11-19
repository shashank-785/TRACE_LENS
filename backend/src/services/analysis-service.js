"use strict";

const { randomUUID } = require("node:crypto");
const { AppError } = require("../utils/app-error");
const { analyzeWithRules } = require("./rule-analysis");

const MAX_SAVED_RESULTS = 100;
const RESULT_LIFETIME_MS = 30 * 60 * 1000;
const VALID_SEVERITIES = new Set(["High", "Medium", "Low"]);

class AnalysisService {
  constructor({ githubService, bharatCodeService }) {
    this.githubService = githubService;
    this.bharatCodeService = bharatCodeService;
    this.results = new Map();
  }

  async analyzePullRequest({ owner, repo, pullNumber, useAi = false }) {
    const [{ pullRequest }, changedFileResponse] = await Promise.all([
      this.githubService.getPullRequest(owner, repo, pullNumber),
      this.githubService.getPullRequestFiles(owner, repo, pullNumber)
    ]);

    const documentationResponse = await this.githubService.getDocumentation(owner, repo, changedFileResponse.files);
    const changedFiles = changedFileResponse.files;
    const documents = documentationResponse.documents;
    const findings = analyzeWithRules(changedFiles, documents);
    const warnings = [];
    let aiUsed = false;

    if (documentationResponse.truncated) {
      warnings.push("The repository contains more documentation than the analysis limit; only the most relevant files were examined.");
    }
    if (documentationResponse.documents.length === 0) {
      warnings.push("No supported documentation files were retrieved from this repository.");
    }
    if (changedFileResponse.truncated) {
      warnings.push("The pull request has more changed files than the analysis limit; only the first 300 were examined.");
    }

    if (useAi && !this.bharatCodeService.configured) {
      warnings.push("BharatCode AI is not configured; evidence-based rule analysis was used.");
    } else if (useAi) {
      try {
        const aiCandidates = await this.bharatCodeService.analyze({
          pullRequest,
          changedFiles,
          documents
        });
        const verifiedFindings = aiCandidates
          .slice(0, 20)
          .map((candidate, index) => verifyAiFinding(candidate, index, changedFiles, documents))
          .filter(Boolean);
        const rejectedCount = Math.min(aiCandidates.length, 20) - verifiedFindings.length;
        if (rejectedCount > 0) {
          warnings.push(`${rejectedCount} AI finding(s) were discarded because their code or documentation evidence could not be verified.`);
        }
        for (const finding of verifiedFindings) {
          if (!findings.some((ruleFinding) => sameEvidence(ruleFinding, finding))) findings.push(finding);
        }
        aiUsed = true;
      } catch (error) {
        console.warn(`[analysis] BharatCode fallback (${error.code || error.name || "unknown error"}).`);
        warnings.push(`${error.message} Evidence-based rule analysis was used instead.`);
      }
    }

    const result = {
      analysisId: randomUUID(),
      repository: `${owner}/${repo}`,
      pullRequest,
      createdAt: new Date().toISOString(),
      provider: aiUsed ? "BharatCode + rules" : "rules",
      ai: {
        configured: this.bharatCodeService.configured,
        requested: Boolean(useAi),
        used: aiUsed
      },
      warnings,
      findings
    };

    this.saveResult(result);
    return result;
  }

  getResult(analysisId) {
    this.removeExpiredResults();
    const saved = this.results.get(analysisId);
    if (!saved) throw new AppError(404, "ANALYSIS_NOT_FOUND", "This analysis result was not found or has expired.");
    return saved.result;
  }

  saveResult(result) {
    this.removeExpiredResults();
    if (this.results.size >= MAX_SAVED_RESULTS) {
      const oldestId = this.results.keys().next().value;
      this.results.delete(oldestId);
    }
    this.results.set(result.analysisId, {
      result,
      expiresAt: Date.now() + RESULT_LIFETIME_MS
    });
  }

  removeExpiredResults() {
    for (const [analysisId, saved] of this.results) {
      if (saved.expiresAt <= Date.now()) this.results.delete(analysisId);
    }
  }
}

function verifyAiFinding(candidate, index, changedFiles, documents) {
  if (!candidate || typeof candidate !== "object") return null;
  const codeFile = changedFiles.find((file) => file.filename === candidate.codeFile);
  const documentation = documents.find((file) => file.path === candidate.docsFile);
  const codeEvidence = typeof candidate.codeEvidence === "string" ? candidate.codeEvidence.trim() : "";
  const docsEvidence = typeof candidate.docsEvidence === "string" ? candidate.docsEvidence.trim() : "";
  const title = safeText(candidate.title, 160);
  const context = safeText(candidate.description, 800);
  const suggestion = safeText(candidate.suggestion, 800);
  const severity = normalizeSeverity(candidate.severity);

  if (!codeFile || !documentation || codeEvidence.length < 5 || docsEvidence.length < 5 ||
      typeof codeFile.patch !== "string" || !hasChangedCodeEvidence(codeFile.patch, codeEvidence) ||
      !documentation.content.includes(docsEvidence) ||
      !title || !context || !suggestion || !severity) {
    return null;
  }

  return {
    id: `AI-${String(index + 1).padStart(3, "0")}`,
    title,
    severity,
    status: "Open",
    codeFile: codeFile.filename,
    codeReference: codeFile.filename,
    docsFile: documentation.path,
    docsReference: documentation.path,
    outdated: docsEvidence,
    codeValue: codeEvidence,
    suggestion,
    context,
    codeEvidence,
    docsEvidence,
    source: "bharatcode"
  };
}

function hasChangedCodeEvidence(patch, evidence) {
  return patch.split(/\r?\n/).some((line) => {
    const isAddedLine = line.startsWith("+") && !line.startsWith("+++");
    const isRemovedLine = line.startsWith("-") && !line.startsWith("---");
    return (isAddedLine || isRemovedLine) && line.slice(1).includes(evidence);
  });
}

function safeText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeSeverity(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return "";
}

function sameEvidence(left, right) {
  return left.codeFile === right.codeFile &&
    left.docsFile === right.docsFile &&
    left.codeEvidence === right.codeEvidence &&
    left.docsEvidence === right.docsEvidence;
}

module.exports = { AnalysisService, verifyAiFinding };
