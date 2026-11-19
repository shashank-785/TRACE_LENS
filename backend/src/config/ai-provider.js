"use strict";

const DEFAULT_BHARATCODE_BASE_URL = "https://bharatcode.ai/api/model/v1";

function loadAIProviderSettings(env = process.env) {
  const genericKeys = ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL"];
  const legacyKeys = ["BHARATCODE_API_KEY", "BHARATCODE_BASE_URL", "BHARATCODE_MODEL"];
  const genericConfigured = hasSettings(env, genericKeys);
  const useLegacySettings = !genericConfigured && hasSettings(env, legacyKeys);
  const keyNames = useLegacySettings
    ? { apiKey: "BHARATCODE_API_KEY", baseURL: "BHARATCODE_BASE_URL", model: "BHARATCODE_MODEL" }
    : { apiKey: "AI_API_KEY", baseURL: "AI_BASE_URL", model: "AI_MODEL" };
  const apiKey = readSetting(env, keyNames.apiKey);
  const model = readSetting(env, keyNames.model);
  const configuredBaseURL = readSetting(env, keyNames.baseURL);
  const baseURL = configuredBaseURL || (useLegacySettings ? DEFAULT_BHARATCODE_BASE_URL : "");
  const configurationError = baseURL ? validateBaseURL(baseURL, keyNames.baseURL) : "";
  const missingSettings = [];
  if (!apiKey) missingSettings.push(keyNames.apiKey);
  if (!baseURL) missingSettings.push(keyNames.baseURL);
  if (!model) missingSettings.push(keyNames.model);

  return Object.freeze({
    apiKey,
    baseURL,
    model,
    providerName: useLegacySettings ? "BharatCode" : "OpenAI-compatible provider",
    timeoutMs: 20000,
    configurationError,
    missingSettings: Object.freeze(missingSettings),
    useLegacySettings
  });
}

function hasSettings(env, keys) {
  return keys.some((key) => readSetting(env, key));
}

function readSetting(env, key) {
  return typeof env[key] === "string" ? env[key].trim() : "";
}

function validateBaseURL(baseURL, settingName) {
  let parsedBaseURL;
  try {
    parsedBaseURL = new URL(baseURL);
  } catch {
    return `${settingName} must be a valid HTTPS URL.`;
  }

  if (parsedBaseURL.protocol !== "https:" || !parsedBaseURL.hostname ||
      parsedBaseURL.username || parsedBaseURL.password) {
    return `${settingName} must be a valid HTTPS URL.`;
  }
  return "";
}

module.exports = { DEFAULT_BHARATCODE_BASE_URL, loadAIProviderSettings };
