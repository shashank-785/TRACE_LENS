"use strict";

const { createApp } = require("./app");
const { config } = require("./config");

const server = createApp().listen(config.port, () => {
  console.log(`TRACE LENS server listening on port ${config.port}.`);
  if (config.aiProvider.configurationError) {
    console.warn(`${config.aiProvider.providerName} configuration is invalid: ${config.aiProvider.configurationError}`);
  } else if (config.aiProvider.apiKey && config.aiProvider.baseURL && config.aiProvider.model) {
    console.log(`${config.aiProvider.providerName} credentials are configured; provider connectivity has not been checked.`);
  } else {
    console.log(`${config.aiProvider.providerName} is unavailable; rule-based analysis remains enabled.`);
  }
});

server.on("error", (error) => {
  console.error("TRACE LENS server failed to start.", error);
  process.exitCode = 1;
});

module.exports = { server };
