"use strict";

const { AppError } = require("../utils/app-error");

const GITHUB_API = "https://api.github.com";
const MAX_PULL_FILES = 300;
const MAX_DOCUMENT_FILES = 12;
const MAX_DOCUMENT_BYTES = 64 * 1024;
const MAX_DOCUMENT_TOTAL_BYTES = 240 * 1024;
const DOCUMENT_EXTENSIONS = new Set([".md", ".mdx", ".rst", ".adoc", ".txt"]);

class GitHubService {
  constructor({ token = "", fetchFn = globalThis.fetch } = {}) {
    this.token = token;
    this.fetchFn = fetchFn;
  }

  async request(apiPath) {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "TRACE-LENS"
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    let response;
    try {
      response = await this.fetchFn(`${GITHUB_API}${apiPath}`, {
        headers,
        signal: AbortSignal.timeout(15000)
      });
    } catch (error) {
      const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
      throw new AppError(
        502,
        timedOut ? "GITHUB_TIMEOUT" : "GITHUB_UNAVAILABLE",
        timedOut ? "GitHub did not respond in time. Try again." : "GitHub could not be reached. Check the connection and try again."
      );
    }

    const responseText = await response.text();
    let data = null;
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new AppError(502, "INVALID_GITHUB_RESPONSE", "GitHub returned an unreadable response.");
      }
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new AppError(404, "GITHUB_NOT_FOUND", "The repository or pull request was not found or is not accessible.");
      }
      if (response.status === 401 || response.status === 403) {
        throw new AppError(502, "GITHUB_AUTH_OR_RATE_LIMIT", "GitHub rejected the request. Check GITHUB_TOKEN or the API rate limit.");
      }
      throw new AppError(502, "GITHUB_API_ERROR", `GitHub API request failed with status ${response.status}.`);
    }

    return { data, headers: response.headers };
  }

  async getPublicRepository(owner, repo) {
    const { data } = await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
    if (data.private) {
      throw new AppError(403, "PRIVATE_REPOSITORY_UNSUPPORTED", "Only public repositories are supported until per-user GitHub authorization is added.");
    }
    return {
      owner: data.owner.login,
      name: data.name,
      fullName: data.full_name,
      description: data.description || "",
      defaultBranch: data.default_branch,
      private: false,
      htmlUrl: data.html_url
    };
  }

  async listPullRequests(owner, repo, state = "open") {
    if (!["open", "closed", "all"].includes(state)) {
      throw new AppError(400, "INVALID_PULL_REQUEST_STATE", "State must be open, closed, or all.");
    }
    const repository = await this.getPublicRepository(owner, repo);
    const { data } = await this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${state}&per_page=50&page=1`
    );
    return {
      repository,
      pullRequests: data.map((pullRequest) => ({
        number: pullRequest.number,
        title: pullRequest.title,
        state: pullRequest.state,
        draft: Boolean(pullRequest.draft),
        author: pullRequest.user?.login || "unknown",
        updatedAt: pullRequest.updated_at,
        htmlUrl: pullRequest.html_url,
        head: pullRequest.head?.ref || "",
        base: pullRequest.base?.ref || ""
      }))
    };
  }

  async getPullRequest(owner, repo, pullNumber) {
    const repository = await this.getPublicRepository(owner, repo);
    const { data } = await this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}`
    );
    return {
      repository,
      pullRequest: {
        number: data.number,
        title: data.title,
        body: data.body || "",
        state: data.state,
        draft: Boolean(data.draft),
        author: data.user?.login || "unknown",
        htmlUrl: data.html_url,
        headSha: data.head?.sha || "",
        headRef: data.head?.ref || "",
        baseRef: data.base?.ref || "",
        changedFiles: data.changed_files || 0,
        additions: data.additions || 0,
        deletions: data.deletions || 0
      }
    };
  }

  async getPullRequestFiles(owner, repo, pullNumber) {
    await this.getPublicRepository(owner, repo);
    const files = [];
    let page = 1;
    while (files.length < MAX_PULL_FILES) {
      const { data } = await this.request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/files?per_page=100&page=${page}`
      );
      if (!Array.isArray(data)) {
        throw new AppError(502, "INVALID_GITHUB_RESPONSE", "GitHub returned an invalid pull request file list.");
      }
      files.push(...data.map((file) => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: typeof file.patch === "string" ? file.patch.slice(0, 30000) : ""
      })));
      if (data.length < 100) break;
      page += 1;
    }
    return { files: files.slice(0, MAX_PULL_FILES), truncated: files.length >= MAX_PULL_FILES };
  }

  async getDocumentation(owner, repo, changedFiles = []) {
    const repository = await this.getPublicRepository(owner, repo);
    if (!repository.defaultBranch) {
      throw new AppError(422, "EMPTY_REPOSITORY", "This repository does not have a default branch yet.");
    }
    const { data: treeResponse } = await this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(repository.defaultBranch)}?recursive=1`
    );
    const entries = Array.isArray(treeResponse.tree) ? treeResponse.tree : [];
    const documentationFiles = entries
      .filter((entry) => entry.type === "blob" && isDocumentationPath(entry.path))
      .filter((entry) => typeof entry.size === "number" && entry.size <= MAX_DOCUMENT_BYTES)
      .sort((left, right) => scoreDocument(right.path, changedFiles) - scoreDocument(left.path, changedFiles));
    const candidates = documentationFiles.slice(0, MAX_DOCUMENT_FILES);

    const documents = await mapWithLimit(candidates, 3, async (entry) => {
      const contentPath = entry.path.split("/").map(encodeURIComponent).join("/");
      const { data } = await this.request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${contentPath}?ref=${encodeURIComponent(repository.defaultBranch)}`
      );
      if (data.encoding !== "base64" || typeof data.content !== "string") return null;
      const content = Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf8");
      return { path: entry.path, size: Buffer.byteLength(content, "utf8"), content };
    });

    const selected = [];
    let totalBytes = 0;
    for (const document of documents.filter(Boolean)) {
      if (totalBytes + document.size > MAX_DOCUMENT_TOTAL_BYTES) continue;
      selected.push(document);
      totalBytes += document.size;
    }

    return {
      repository,
      documents: selected,
      totalAvailable: documentationFiles.length,
      truncated: Boolean(treeResponse.truncated) || documentationFiles.length > MAX_DOCUMENT_FILES
    };
  }
}

function isDocumentationPath(filePath) {
  const baseName = filePath.split("/").pop();
  const extension = baseName.slice(baseName.lastIndexOf(".")).toLowerCase();
  return /^readme(?:\..*)?$/i.test(baseName) ||
    /^contributing(?:\..*)?$/i.test(baseName) ||
    DOCUMENT_EXTENSIONS.has(extension) && /^(docs?|documentation)\//i.test(filePath);
}

function scoreDocument(filePath, changedFiles) {
  const normalizedPath = filePath.toLowerCase();
  let score = /^readme(?:\..*)?$/i.test(filePath) ? 4 : 0;
  if (/^(docs?|documentation)\//i.test(filePath)) score += 2;
  const terms = new Set(
    changedFiles.flatMap((file) => pathTerms(file.filename))
      .filter((term) => term.length > 2 && !["src", "lib", "test", "tests", "index", "utils"].includes(term))
  );
  for (const term of terms) {
    if (normalizedPath.includes(term)) score += 2;
  }
  return score;
}

function pathTerms(filePath) {
  return filePath.toLowerCase().replace(/\.[^.]+$/, "").split(/[^a-z0-9]+/).filter(Boolean);
}

async function mapWithLimit(items, limit, handler) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await handler(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

module.exports = { GitHubService, isDocumentationPath, scoreDocument };
