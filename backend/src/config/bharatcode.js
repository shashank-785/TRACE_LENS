"use strict";

const DEFAULT_BHARATCODE_BASE_URL = "https://bharatcode.ai/api/model/v1";

function loadBharatCodeSettings(env = process.env) {
  const configuredBaseURL = typeof env.BHARATCODE_BASE_URL === "string"
    ? env.BHARATCODE_BASE_URL.trim()
    : "";
  const baseURL = configuredBaseURL || DEFAULT_BHARATCODE_BASE_URL;
  let parsedBaseURL;

  try {
    parsedBaseURL = new URL(baseURL);
  } catch {
    throw new Error("BHARATCODE_BASE_URL must be a valid HTTPS URL.");
  }

  if (parsedBaseURL.protocol !== "https:" || !parsedBaseURL.hostname ||
      parsedBaseURL.username || parsedBaseURL.password) {
    throw new Error("BHARATCODE_BASE_URL must be a valid HTTPS URL.");
  }

  return Object.freeze({
    apiKey: (env.BHARATCODE_API_KEY || "").trim(),
    baseURL,
    model: (env.BHARATCODE_MODEL || "").trim(),
    timeoutMs: 20000
  });
}

module.exports = { DEFAULT_BHARATCODE_BASE_URL, loadBharatCodeSettings };
