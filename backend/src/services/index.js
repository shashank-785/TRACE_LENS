"use strict";

const { config } = require("../config");
const { AnalysisService } = require("./analysis-service");
const { OpenAICompatibleService } = require("./openai-compatible-service");
const { GitHubService } = require("./github-service");

function createServices() {
  const githubService = new GitHubService({ token: config.githubToken });
  const aiService = new OpenAICompatibleService(config.aiProvider);
  const analysisService = new AnalysisService({ githubService, aiService });
  return { githubService, aiService, analysisService };
}

module.exports = { createServices };
