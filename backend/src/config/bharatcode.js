"use strict";

const DEFAULT_BHARATCODE_BASE_URL = "https://bharatcode.ai/api/model/v1";

function loadBharatCodeSettings(env = process.env) {
  const configuredBaseURL = typeof env.BHARATCODE_BASE_URL === "string"
    ? env.BHARATCODE_BASE_URL.trim()
    : "";
  const baseURL = configuredBaseURL || DEFAULT_BHARATCODE_BASE_URL;
  const configurationError = validateBaseURL(baseURL);

  return Object.freeze({
    apiKey: (env.BHARATCODE_API_KEY || "").trim(),
    baseURL,
    model: (env.BHARATCODE_MODEL || "").trim(),
    timeoutMs: 20000,
    configurationError
  });
}

function validateBaseURL(baseURL) {
  let parsedBaseURL;
  try {
    parsedBaseURL = new URL(baseURL);
  } catch {
    return "BHARATCODE_BASE_URL must be a valid HTTPS URL.";
  }

  if (parsedBaseURL.protocol !== "https:" || !parsedBaseURL.hostname ||
      parsedBaseURL.username || parsedBaseURL.password) {
    return "BHARATCODE_BASE_URL must be a valid HTTPS URL.";
  }
  return "";
}

module.exports = { DEFAULT_BHARATCODE_BASE_URL, loadBharatCodeSettings };
