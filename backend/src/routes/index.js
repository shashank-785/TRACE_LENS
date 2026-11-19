"use strict";

const express = require("express");
const { config } = require("../config");
const { createAnalysisRouter } = require("./analysis");
const { createRepositoryRouter } = require("./repositories");

function createApiRouter(services) {
  const router = express.Router();
  router.get("/health", (req, res) => {
    res.json({
      success: true,
      data: {
        status: "ok",
        github: { authenticationConfigured: Boolean(config.githubToken) },
        ai: {
          provider: services.aiService.providerName,
          configured: services.aiService.configured,
          connectivity: "not_checked",
          missingSettings: services.aiService.missingSettings || [],
          configurationError: services.aiService.configurationError || ""
        }
      }
    });
  });
  router.use("/repositories", createRepositoryRouter(services));
  router.use("/analysis", createAnalysisRouter(services.analysisService));
  return router;
}

module.exports = { createApiRouter };
