"use strict";

const { createApp } = require("./app");
const { config } = require("./config");

const server = createApp().listen(config.port, () => {
  console.log(`TRACE LENS server listening on port ${config.port}.`);
  console.log(config.bharatCode.apiKey && config.bharatCode.model
    ? "BharatCode AI is configured."
    : "BharatCode AI is unavailable; rule-based analysis remains enabled.");
});

server.on("error", (error) => {
  console.error("TRACE LENS server failed to start.", error);
  process.exitCode = 1;
});

module.exports = { server };
