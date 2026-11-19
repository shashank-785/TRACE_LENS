"use strict";

const { AppError } = require("./app-error");

function parseRepositoryUrl(repositoryUrl) {
  if (typeof repositoryUrl !== "string" || !repositoryUrl.trim()) {
    throw new AppError(400, "INVALID_REPOSITORY_URL", "Enter a GitHub repository URL.");
  }

  let url;
  try {
    url = new URL(repositoryUrl.trim());
  } catch {
    throw new AppError(400, "INVALID_REPOSITORY_URL", "Enter a valid GitHub repository URL.");
  }

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" ||
      url.username || url.password || url.port || url.search || url.hash) {
    throw new AppError(400, "INVALID_REPOSITORY_URL", "Use a public HTTPS URL from github.com.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new AppError(400, "INVALID_REPOSITORY_URL", "Use a repository URL in the form https://github.com/owner/repository.");
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!isValidSlug(owner) || !isValidSlug(repo)) {
    throw new AppError(400, "INVALID_REPOSITORY_URL", "The repository URL contains an invalid owner or repository name.");
  }

  return { owner, repo };
}

function isValidSlug(value) {
  return /^[A-Za-z0-9_.-]{1,100}$/.test(value) && value !== "." && value !== "..";
}

function parseRepositoryParams(owner, repo) {
  if (!isValidSlug(owner) || !isValidSlug(repo)) {
    throw new AppError(400, "INVALID_REPOSITORY", "The repository owner or name is invalid.");
  }
  return { owner, repo };
}

function parsePullNumber(value) {
  const pullNumber = Number(value);
  if (!Number.isSafeInteger(pullNumber) || pullNumber < 1) {
    throw new AppError(400, "INVALID_PULL_REQUEST", "Pull request number must be a positive integer.");
  }
  return pullNumber;
}

module.exports = { parsePullNumber, parseRepositoryParams, parseRepositoryUrl };
