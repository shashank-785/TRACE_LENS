"use strict";

const DEFAULT_BHARATCODE_BASE_URL = "https://bharatcode.ai/api/model/v1";
const DEFAULT_NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const SUPPORTED_NVIDIA_NIM_MODEL = "nvidia/llama-3.1-nemotron-70b-instruct";

const PROVIDERS = Object.freeze({
  "nvidia-nim": {
    name: "NVIDIA NIM",
    apiKey: "NVIDIA_NIM_API_KEY",
    baseURL: "NVIDIA_NIM_BASE_URL",
    model: "NVIDIA_NIM_MODEL",
    defaultBaseURL: DEFAULT_NVIDIA_NIM_BASE_URL
  },
  bharatcode: {
    name: "BharatCode",
    apiKey: "BHARATCODE_API_KEY",
    baseURL: "BHARATCODE_BASE_URL",
    model: "BHARATCODE_MODEL",
    defaultBaseURL: DEFAULT_BHARATCODE_BASE_URL
  },
  "openai-compatible": {
    name: "OpenAI-compatible provider",
    apiKey: "AI_API_KEY",
    baseURL: "AI_BASE_URL",
    model: "AI_MODEL",
    defaultBaseURL: ""
  }
});

function loadAIProviderSettings(env = process.env) {
  const providerId = resolveProvider(env);
  const provider = PROVIDERS[providerId];
  if (!provider) {
    return Object.freeze({
      apiKey: "",
      baseURL: "",
      model: "",
      providerName: "Unsupported AI provider",
      timeoutMs: 20000,
      configurationError: "AI_PROVIDER must be nvidia-nim, bharatcode, or openai-compatible.",
      missingSettings: Object.freeze([]),
      useLegacySettings: false
    });
  }

  const apiKey = readSetting(env, provider.apiKey);
  const model = readSetting(env, provider.model);
  const configuredBaseURL = readSetting(env, provider.baseURL);
  const baseURL = configuredBaseURL || provider.defaultBaseURL;
  const configurationError = baseURL ? validateBaseURL(baseURL, provider.baseURL) : "";
  const missingSettings = [];
  if (!apiKey) missingSettings.push(provider.apiKey);
  if (!baseURL) missingSettings.push(provider.baseURL);
  if (!model) missingSettings.push(provider.model);

  return Object.freeze({
    apiKey,
    baseURL,
    model,
    providerName: provider.name,
    timeoutMs: 20000,
    configurationError,
    missingSettings: Object.freeze(missingSettings),
    useLegacySettings: providerId === "bharatcode"
  });
}

function resolveProvider(env) {
  const selected = readSetting(env, "AI_PROVIDER").toLowerCase();
  if (selected) return selected;

  if (hasSettings(env, ["NVIDIA_NIM_API_KEY", "NVIDIA_NIM_BASE_URL", "NVIDIA_NIM_MODEL"])) {
    return "nvidia-nim";
  }
  if (hasSettings(env, ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL"])) {
    return "openai-compatible";
  }
  if (hasSettings(env, ["BHARATCODE_API_KEY", "BHARATCODE_BASE_URL", "BHARATCODE_MODEL"])) {
    return "bharatcode";
  }
  return "openai-compatible";
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

module.exports = {
  DEFAULT_BHARATCODE_BASE_URL,
  DEFAULT_NVIDIA_NIM_BASE_URL,
  SUPPORTED_NVIDIA_NIM_MODEL,
  loadAIProviderSettings
};
