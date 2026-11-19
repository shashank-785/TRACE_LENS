"use strict";

const { parsePullNumber, parseRepositoryParams, parseRepositoryUrl } = require("../utils/repository-url");
const { AppError } = require("../utils/app-error");

function createRepositoryController(services) {
  return {
    validateRepository: async (req, res) => {
      const { owner, repo } = parseRepositoryUrl(req.body?.repositoryUrl);
      const repository = await services.githubService.getPublicRepository(owner, repo);
      res.json({ success: true, data: { repository } });
    },

    listPullRequests: async (req, res) => {
      const { owner, repo } = parseRepositoryParams(req.params.owner, req.params.repo);
      const state = typeof req.query.state === "string" ? req.query.state : "open";
      const data = await services.githubService.listPullRequests(owner, repo, state);
      res.json({ success: true, data });
    },

    getPullRequest: async (req, res) => {
      const { owner, repo } = parseRepositoryParams(req.params.owner, req.params.repo);
      const pullNumber = parsePullNumber(req.params.pullNumber);
      const data = await services.githubService.getPullRequest(owner, repo, pullNumber);
      res.json({ success: true, data });
    },

    getPullRequestFiles: async (req, res) => {
      const { owner, repo } = parseRepositoryParams(req.params.owner, req.params.repo);
      const pullNumber = parsePullNumber(req.params.pullNumber);
      const data = await services.githubService.getPullRequestFiles(owner, repo, pullNumber);
      res.json({ success: true, data });
    },

    getDocumentation: async (req, res) => {
      const { owner, repo } = parseRepositoryParams(req.params.owner, req.params.repo);
      const changedFiles = [];
      if (req.query.pullNumber !== undefined) {
        const pullNumber = parsePullNumber(req.query.pullNumber);
        const changedFileResponse = await services.githubService.getPullRequestFiles(owner, repo, pullNumber);
        changedFiles.push(...changedFileResponse.files);
      }
      const data = await services.githubService.getDocumentation(owner, repo, changedFiles);
      res.json({ success: true, data });
    },

    analyzePullRequest: async (req, res) => {
      const { owner, repo } = parseRepositoryParams(req.params.owner, req.params.repo);
      const pullNumber = parsePullNumber(req.params.pullNumber);
      const useAi = req.body?.useAi === true;
      if (req.body?.useAi !== undefined && typeof req.body.useAi !== "boolean") {
        throw new AppError(400, "INVALID_AI_OPTION", "useAi must be true or false.");
      }
      const data = await services.analysisService.analyzePullRequest({ owner, repo, pullNumber, useAi });
      res.status(201).json({ success: true, data });
    }
  };
}

module.exports = { createRepositoryController };
