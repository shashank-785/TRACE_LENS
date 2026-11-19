"use strict";

const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { createRepositoryController } = require("../controllers/repository-controller");
const { asyncHandler } = require("../utils/async-handler");

function createRepositoryRouter(services) {
  const router = express.Router();
  const controller = createRepositoryController(services);
  const analysisRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({
      success: false,
      error: { code: "RATE_LIMITED", message: "Too many analysis requests. Please try again later." }
    })
  });

  router.post("/validate", asyncHandler(controller.validateRepository));
  router.get("/:owner/:repo/pulls", asyncHandler(controller.listPullRequests));
  router.get("/:owner/:repo/pulls/:pullNumber/files", asyncHandler(controller.getPullRequestFiles));
  router.get("/:owner/:repo/pulls/:pullNumber", asyncHandler(controller.getPullRequest));
  router.post("/:owner/:repo/pulls/:pullNumber/analyze", analysisRateLimit, asyncHandler(controller.analyzePullRequest));
  router.get("/:owner/:repo/documentation", asyncHandler(controller.getDocumentation));

  return router;
}

module.exports = { createRepositoryRouter };
