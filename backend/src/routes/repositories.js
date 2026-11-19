"use strict";

const express = require("express");
const { createRepositoryController } = require("../controllers/repository-controller");
const { asyncHandler } = require("../utils/async-handler");

function createRepositoryRouter(services) {
  const router = express.Router();
  const controller = createRepositoryController(services);

  router.post("/validate", asyncHandler(controller.validateRepository));
  router.get("/:owner/:repo/pulls", asyncHandler(controller.listPullRequests));
  router.get("/:owner/:repo/pulls/:pullNumber/files", asyncHandler(controller.getPullRequestFiles));
  router.get("/:owner/:repo/pulls/:pullNumber", asyncHandler(controller.getPullRequest));
  router.post("/:owner/:repo/pulls/:pullNumber/analyze", asyncHandler(controller.analyzePullRequest));
  router.get("/:owner/:repo/documentation", asyncHandler(controller.getDocumentation));

  return router;
}

module.exports = { createRepositoryRouter };
