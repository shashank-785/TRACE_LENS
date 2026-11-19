"use strict";

const { config } = require("../config");
const { AnalysisService } = require("./analysis-service");
const { BharatCodeService } = require("./bharatcode-service");
const { GitHubService } = require("./github-service");

function createServices() {
  const githubService = new GitHubService({ token: config.githubToken });
  const bharatCodeService = new BharatCodeService(config.bharatCode);
  const analysisService = new AnalysisService({ githubService, bharatCodeService });
  return { githubService, bharatCodeService, analysisService };
}

module.exports = { createServices };
