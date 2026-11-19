"use strict";

const OpenAI = require("openai");
const { AppError } = require("../utils/app-error");

const MAX_CONTEXT_CHARACTERS = 50000;

class OpenAICompatibleService {
  constructor(settings, client) {
    this.model = settings.model;
    this.providerName = settings.providerName || "OpenAI-compatible provider";
    this.configurationError = settings.configurationError || "";
    this.missingSettings = settings.missingSettings || [];
    this.configured = Boolean(settings.apiKey && settings.baseURL && settings.model && !this.configurationError);
    this.client = client || (this.configured
      ? new OpenAI({
        apiKey: settings.apiKey,
        baseURL: settings.baseURL,
        timeout: settings.timeoutMs,
        maxRetries: 0
      })
      : null);
  }

  async analyze({ pullRequest, changedFiles, documents }) {
    if (!this.configured || !this.client) {
      const code = this.configurationError ? "AI_PROVIDER_INVALID_CONFIGURATION" : "AI_PROVIDER_NOT_CONFIGURED";
      const message = this.configurationError || `${this.providerName} is not fully configured.`;
      throw new AppError(503, code, message);
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
      throw mapProviderError(error, this.providerName);
    }

    const choice = response?.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new AppError(502, "AI_PROVIDER_INCOMPLETE_RESPONSE", `${this.providerName} returned a truncated response.`);
    }

    const content = choice?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new AppError(502, "INVALID_AI_PROVIDER_RESPONSE", `${this.providerName} returned an empty response.`);
    }
    return parseFindings(content);
  }
}

function mapProviderError(error, providerName = "AI provider") {
  const name = typeof error?.name === "string" ? error.name : "";
  const errorType = typeof error?.constructor?.name === "string" ? error.constructor.name : "";
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const status = Number(error?.status);
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  const isErrorType = (type) => name === type || errorType === type;

  if (isErrorType("APIConnectionTimeoutError") || name === "TimeoutError" ||
      name === "AbortError" || code === "etimedout" || code === "err_timeout" ||
      status === 408) {
    return new AppError(504, "AI_PROVIDER_TIMEOUT", `${providerName} timed out.`);
  }
  if (status === 401 || status === 403 || isErrorType("AuthenticationError") ||
      isErrorType("PermissionDeniedError") || code === "invalid_api_key") {
    return new AppError(502, "AI_PROVIDER_AUTHENTICATION_FAILED", `${providerName} rejected the API key or permission.`);
  }
  if (code === "model_not_found" || code === "retired_model" || status === 410 ||
      (status === 400 && /model.*(not found|does not exist|unavailable)|unknown model/.test(message))) {
    return new AppError(502, "AI_PROVIDER_MODEL_UNAVAILABLE", `The configured ${providerName} model is unavailable.`);
  }
  if (status === 503) {
    return new AppError(503, "AI_PROVIDER_BUSY", `${providerName} is busy. Please retry shortly.`);
  }
  if (status === 429 || isErrorType("RateLimitError")) {
    return new AppError(502, "AI_PROVIDER_RATE_LIMITED", `${providerName} rate limit reached.`);
  }
  if (isErrorType("APIConnectionError")) {
    return new AppError(502, "AI_PROVIDER_CONNECTION_FAILED", `Could not connect to ${providerName}.`);
  }
  return new AppError(502, "AI_PROVIDER_API_ERROR", `${providerName} returned an API error.`);
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
    throw new AppError(502, "INVALID_AI_PROVIDER_RESPONSE", "AI provider returned invalid JSON.");
  }
  if (!parsed || !Array.isArray(parsed.findings)) {
    throw new AppError(502, "INVALID_AI_PROVIDER_RESPONSE", "AI provider returned an unexpected response shape.");
  }
  return parsed.findings;
}

module.exports = { OpenAICompatibleService, mapProviderError, parseFindings, prepareContext };
