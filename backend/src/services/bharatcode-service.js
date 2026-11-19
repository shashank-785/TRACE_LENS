"use strict";

const OpenAI = require("openai");
const { DEFAULT_BHARATCODE_BASE_URL } = require("../config/bharatcode");
const { AppError } = require("../utils/app-error");

const MAX_CONTEXT_CHARACTERS = 50000;

class BharatCodeService {
  constructor(settings, client) {
    this.model = settings.model;
    this.configured = Boolean(settings.apiKey && settings.model);
    this.client = client || (this.configured
      ? new OpenAI({
        apiKey: settings.apiKey,
        baseURL: settings.baseURL || DEFAULT_BHARATCODE_BASE_URL,
        timeout: settings.timeoutMs,
        maxRetries: 0
      })
      : null);
  }

  async analyze({ pullRequest, changedFiles, documents }) {
    if (!this.configured || !this.client) {
      throw new AppError(503, "BHARATCODE_NOT_CONFIGURED", "BharatCode AI is not configured.");
    }

    const context = prepareContext(changedFiles, documents);
    let response;
    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: [
              "You compare GitHub pull request code diffs with repository documentation.",
              "Only report a mismatch when the supplied diff and documentation provide direct evidence.",
              "Never invent paths, code, documentation, values, or findings.",
              "Use codeEvidence copied from a changed diff line beginning with + or -; do not cite diff headers or unchanged context.",
              "Return only JSON with this shape: {\"findings\":[{\"title\":\"...\",\"severity\":\"High|Medium|Low\",\"codeFile\":\"exact path\",\"docsFile\":\"exact path\",\"codeEvidence\":\"exact substring from supplied diff\",\"docsEvidence\":\"exact substring from supplied documentation\",\"description\":\"...\",\"suggestion\":\"...\"}]}.",
              "Every codeEvidence and docsEvidence value must be copied verbatim from the supplied data."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({
              pullRequest: {
                title: pullRequest.title,
                number: pullRequest.number,
                body: pullRequest.body
              },
              changedFiles: context.changedFiles,
              documentation: context.documents
            })
          }
        ]
      });
    } catch (error) {
      throw mapProviderError(error);
    }

    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new AppError(502, "INVALID_BHARATCODE_RESPONSE", "BharatCode AI returned an empty response.");
    }
    return parseFindings(content);
  }
}

function mapProviderError(error) {
  const name = typeof error?.name === "string" ? error.name : "";
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const status = Number(error?.status);
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";

  if (name === "APIConnectionTimeoutError" || name === "TimeoutError" ||
      name === "AbortError" || code === "etimedout" || code === "err_timeout") {
    return new AppError(504, "BHARATCODE_TIMEOUT", "BharatCode AI timed out.");
  }
  if (status === 401 || status === 403 || name === "AuthenticationError" ||
      name === "PermissionDeniedError" || code === "invalid_api_key") {
    return new AppError(502, "BHARATCODE_AUTHENTICATION_FAILED", "The BharatCode API key was rejected or lacks permission.");
  }
  if (code === "model_not_found" ||
      (status === 400 && /model.*(not found|does not exist|unavailable)|unknown model/.test(message))) {
    return new AppError(502, "BHARATCODE_MODEL_UNAVAILABLE", "The configured BharatCode model is unavailable.");
  }
  if (status === 429 || name === "RateLimitError") {
    return new AppError(502, "BHARATCODE_RATE_LIMITED", "BharatCode rate limit reached.");
  }
  if (name === "APIConnectionError") {
    return new AppError(502, "BHARATCODE_CONNECTION_FAILED", "Could not connect to BharatCode.");
  }
  return new AppError(502, "BHARATCODE_API_ERROR", "BharatCode AI returned an API error.");
}

function prepareContext(changedFiles, documents) {
  let remaining = MAX_CONTEXT_CHARACTERS;
  const limitedChanges = [];
  for (const file of changedFiles) {
    if (!file.patch || remaining <= 0) continue;
    const patch = file.patch.slice(0, remaining);
    limitedChanges.push({ filename: file.filename, patch });
    remaining -= patch.length;
  }
  const limitedDocuments = [];
  for (const document of documents) {
    if (remaining <= 0) break;
    const content = document.content.slice(0, remaining);
    limitedDocuments.push({ path: document.path, content });
    remaining -= content.length;
  }
  return { changedFiles: limitedChanges, documents: limitedDocuments };
}

function parseFindings(content) {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new AppError(502, "INVALID_BHARATCODE_RESPONSE", "BharatCode AI returned invalid JSON.");
  }
  if (!parsed || !Array.isArray(parsed.findings)) {
    throw new AppError(502, "INVALID_BHARATCODE_RESPONSE", "BharatCode AI returned an unexpected response shape.");
  }
  return parsed.findings;
}

module.exports = { BharatCodeService, mapProviderError, parseFindings, prepareContext };
