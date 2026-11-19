"use strict";

const express = require("express");
const { createAnalysisController } = require("../controllers/analysis-controller");
const { asyncHandler } = require("../utils/async-handler");

function createAnalysisRouter(analysisService) {
  const router = express.Router();
  const controller = createAnalysisController(analysisService);
  router.get("/:analysisId", asyncHandler(controller.getResult));
  return router;
}

module.exports = { createAnalysisRouter };
