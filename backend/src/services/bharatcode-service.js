"use strict";

const OpenAI = require("openai");
const { AppError } = require("../utils/app-error");

const MAX_CONTEXT_CHARACTERS = 50000;

class BharatCodeService {
  constructor(settings, client) {
    this.model = settings.model;
    this.configured = Boolean(settings.apiKey && settings.baseURL && settings.model);
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
      const message = error.name === "APIConnectionTimeoutError"
        ? "BharatCode AI timed out."
        : "BharatCode AI could not complete the request.";
      throw new AppError(502, "BHARATCODE_UNAVAILABLE", message);
    }

    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new AppError(502, "INVALID_BHARATCODE_RESPONSE", "BharatCode AI returned an empty response.");
    }
    return parseFindings(content);
  }
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

module.exports = { BharatCodeService, parseFindings, prepareContext };
