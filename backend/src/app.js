"use strict";

const cors = require("cors");
const express = require("express");
const { config } = require("./config");
const { createApiRouter } = require("./routes");
const { createFrontendRouter } = require("./routes/frontend");
const { createServices } = require("./services");
const { errorHandler, notFoundHandler } = require("./middleware/error-handler");

function createApp(options = {}) {
  const services = options.services || createServices();
  const app = express();
  const allowedOrigins = options.corsOrigins || config.corsOrigins;

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  }));
  app.use(express.json({ limit: "256kb" }));
  app.use("/api", createApiRouter(services));
  app.use(createFrontendRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
