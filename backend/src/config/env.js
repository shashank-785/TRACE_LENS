"use strict";

const path = require("node:path");
const dotenv = require("dotenv");
const { loadAIProviderSettings } = require("./ai-provider");

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

function parsePort(value) {
  const port = Number(value || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:4175,http://127.0.0.1:4175")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

module.exports = Object.freeze({
  port: parsePort(process.env.PORT),
  githubToken: (process.env.GITHUB_TOKEN || "").trim(),
  corsOrigins,
  aiProvider: loadAIProviderSettings()
});
