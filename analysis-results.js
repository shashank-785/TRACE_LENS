"use strict";

let findings = [];

const findingsList = document.getElementById("findingsList");
const searchInput = document.getElementById("findingSearch");
const severityFilter = document.getElementById("severityFilter");
const statusFilter = document.getElementById("statusFilter");
const emptyState = document.getElementById("emptyState");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const analysisErrorMessage = document.getElementById("analysisErrorMessage");
const retryAnalysisButton = document.getElementById("retryAnalysis");
const resultsCount = document.getElementById("resultsCount");
const toast = document.getElementById("resultsToast");
const repositoryForm = document.getElementById("repositoryForm");
const repositoryInput = document.getElementById("repositoryUrl");
const validateRepositoryButton = document.getElementById("validateRepositoryButton");
const pullRequestSelect = document.getElementById("pullRequestSelect");
const analyzePullRequestButton = document.getElementById("analyzePullRequestButton");
const useAIProviderCheckbox = document.getElementById("useAi");
const backendStatus = document.getElementById("backendStatus");
const workflowStatus = document.getElementById("workflowStatus");
const API_BASE_URL = `${window.location.origin}/api`;
let toastTimer;
let loaded = false;
let liveAnalysis = false;
let validatedRepository = null;
let analysisRequestSequence = 0;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function setAnalysisDataState(pillText, labelText, footerText) {
  document.getElementById("analysisDataPill").lastChild.textContent = ` ${pillText}`;
  document.getElementById("analysisDataLabel").lastChild.textContent = labelText;
  document.getElementById("analysisFooterStatus").textContent = footerText;
}

function clearDisplayedResults() {
  liveAnalysis = false;
  findings = [];
  loaded = false;
  findingsList.replaceChildren();
  findingsList.hidden = true;
  emptyState.hidden = true;
  resultsCount.hidden = true;
  document.getElementById("findingCount").textContent = "0";
  updateSummary();
}

function updateSummary() {
  if (!liveAnalysis) {
    document.getElementById("totalFindings").textContent = "—";
    document.getElementById("priorityFindings").textContent = "—";
    document.getElementById("affectedFiles").textContent = "—";
    document.getElementById("needsReview").textContent = "—";
    return;
  }
  document.getElementById("totalFindings").textContent = findings.length;
  document.getElementById("priorityFindings").textContent = findings.filter((finding) => finding.severity === "High").length;
  const affectedFiles = new Set(findings.flatMap((finding) => [finding.codeFile, finding.docsFile]));
  document.getElementById("affectedFiles").textContent = affectedFiles.size;
  document.getElementById("needsReview").textContent = findings.filter((finding) => finding.status === "Open").length;
}

function renderFindings() {
  if (!loaded) return;
  const query = searchInput.value.trim().toLowerCase();
  const severity = severityFilter.value;
  const status = statusFilter.value;
  const visible = findings.filter((finding) => {
    const matchesText = `${finding.title} ${finding.codeFile} ${finding.docsFile}`.toLowerCase().includes(query);
    return matchesText && (severity === "all" || finding.severity === severity) && (status === "all" || finding.status === status);
  });

  findingsList.innerHTML = visible.map((finding) => {
    const reviewed = finding.status !== "Open";
    const confidence = ["High", "Medium", "Low"].includes(finding.confidence) ? finding.confidence : "";
    return `<article class="finding-card">
      <div class="finding-card-heading">
        <div class="finding-badges"><span class="finding-severity ${finding.severity.toLowerCase()}"><i></i>${escapeHtml(finding.severity)}</span><span class="finding-status ${finding.status.toLowerCase()}">${escapeHtml(finding.status)}</span>${confidence ? `<span class="finding-confidence" aria-label="Evidence confidence">${escapeHtml(confidence)} evidence confidence</span>` : ""}</div>
        <span class="finding-id">${escapeHtml(finding.id)}</span>
      </div>
      <h3 class="finding-title">${escapeHtml(finding.title)}</h3>
      <div class="finding-files"><div class="finding-file"><span>CODE CHANGE</span><code>${escapeHtml(finding.codeReference)}</code></div><div class="finding-file"><span>RELATED DOCUMENTATION</span><code>${escapeHtml(finding.docsFile)}</code></div></div>
      <div class="finding-mismatch"><div><span class="finding-field-label">OUTDATED DOCUMENTATION</span><p>${escapeHtml(finding.outdated)}</p></div><div><span class="finding-field-label">CURRENT CODE</span><code>${escapeHtml(finding.codeValue)}</code></div></div>
      <div class="finding-suggestion"><span class="finding-field-label">SUGGESTED DOCUMENTATION FIX</span><p>${escapeHtml(finding.suggestion)}</p></div>
      <details class="finding-details"><summary>View finding details</summary><div class="finding-detail-grid"><div><span class="finding-field-label">CHANGE CONTEXT</span><p>${escapeHtml(finding.context)}</p></div><div><span class="finding-field-label">DOCUMENTATION SECTION</span><p>${escapeHtml(finding.docsReference)}</p></div></div></details>
      <div class="finding-actions"><button class="button button-secondary" type="button" data-action="copy" data-finding-id="${escapeHtml(finding.id)}"><svg class="icon tiny" aria-hidden="true"><use href="#i-copy"/></svg>Copy suggestion</button><button class="button button-primary finding-review-button" type="button" data-action="review" data-finding-id="${escapeHtml(finding.id)}"${reviewed ? " disabled" : ""}>${reviewed ? escapeHtml(finding.status) : "Mark reviewed"}</button></div>
    </article>`;
  }).join("");

  document.getElementById("findingCount").textContent = visible.length;
  resultsCount.textContent = `Showing ${visible.length} of ${findings.length} findings`;
  resultsCount.hidden = false;
  findingsList.hidden = visible.length === 0;
  emptyState.hidden = visible.length !== 0;
  const noFindings = liveAnalysis && findings.length === 0;
  const noAnalysis = !liveAnalysis && findings.length === 0;
  document.getElementById("emptyStateTitle").textContent = noFindings
    ? "No evidence-backed mismatches found"
    : noAnalysis
      ? "No live analysis yet"
      : "No findings match your filters";
  document.getElementById("emptyStateDescription").textContent = noFindings
    ? "The analyzed pull request contained no documentation mismatches that could be verified."
    : noAnalysis
      ? "Connect a public repository and analyze an open pull request. Sample findings are not shown here."
      : "Try a different search, severity, or status.";
  document.getElementById("clearFilters").hidden = noFindings || noAnalysis;
  updateSummary();
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) }
    });
  } catch {
    throw new Error("The backend could not be reached. Start it and try again.");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.success !== true) {
    throw new Error(payload?.error?.message || `The backend returned an unexpected response (${response.status}).`);
  }
  return payload.data;
}

function setWorkflowStatus(message, kind = "") {
  workflowStatus.textContent = message;
  workflowStatus.classList.toggle("error", kind === "error");
  workflowStatus.classList.toggle("success", kind === "success");
}

function setPullRequestOptions(pullRequests) {
  pullRequestSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = pullRequests.length ? "Select an open pull request" : "No open pull requests found";
  pullRequestSelect.append(placeholder);

  for (const pullRequest of pullRequests) {
    const option = document.createElement("option");
    option.value = String(pullRequest.number);
    option.textContent = `#${pullRequest.number} · ${pullRequest.title}`;
    pullRequestSelect.append(option);
  }
  pullRequestSelect.disabled = pullRequests.length === 0;
  analyzePullRequestButton.disabled = true;
}

async function checkBackendHealth() {
  try {
    const health = await apiRequest("/health");
    backendStatus.textContent = "Backend online";
    backendStatus.classList.remove("offline");
    backendStatus.classList.add("online");
    useAIProviderCheckbox.disabled = !health.ai.configured;
    const provider = health.ai.provider || "AI provider";
    useAIProviderCheckbox.nextElementSibling.textContent = `Use ${provider} (optional)`;
    if (health.ai.configurationError) {
      setWorkflowStatus(`${provider} configuration issue: ${health.ai.configurationError} Rule-based analysis will be used.`);
    } else if (health.ai.configured) {
      setWorkflowStatus(`Backend ready. ${provider} credentials are configured; provider connectivity is confirmed only when an AI request succeeds. Rule-based analysis remains available.`);
    } else {
      const missing = Array.isArray(health.ai.missingSettings) && health.ai.missingSettings.length
        ? ` Missing settings: ${health.ai.missingSettings.join(", ")}.`
        : "";
      setWorkflowStatus(`Backend ready. ${provider} is not configured; rule-based analysis will be used.${missing}`);
    }
    return true;
  } catch (error) {
    backendStatus.textContent = "Backend offline";
    backendStatus.classList.remove("online");
    backendStatus.classList.add("offline");
    useAIProviderCheckbox.disabled = true;
    setWorkflowStatus(`${error.message} No analysis results are available until the backend responds.`, "error");
    return false;
  }
}

repositoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const requestSequence = ++analysisRequestSequence;
  clearDisplayedResults();
  loadingState.hidden = true;
  errorState.hidden = true;
  validatedRepository = null;
  setPullRequestOptions([]);
  setAnalysisDataState("LIVE MODE", "No live analysis result", "LIVE MODE · READY");
  document.getElementById("resultsRepositoryName").textContent = "No repository selected";
  validateRepositoryButton.disabled = true;
  validateRepositoryButton.textContent = "Validating…";
  setWorkflowStatus("Validating the repository and loading open pull requests.");

  try {
    const validation = await apiRequest("/repositories/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryUrl: repositoryInput.value.trim() })
    });
    if (requestSequence !== analysisRequestSequence) return;
    const repository = validation.repository;
    const pullRequestData = await apiRequest(
      `/repositories/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/pulls`
    );
    if (requestSequence !== analysisRequestSequence) return;
    validatedRepository = repository;
    setPullRequestOptions(pullRequestData.pullRequests);
    if (pullRequestData.pullRequests.length) {
      setWorkflowStatus(`Validated ${repository.fullName}. Choose an open pull request to analyze.`, "success");
    } else {
      setWorkflowStatus(`Validated ${repository.fullName}, but it has no open pull requests.`);
    }
  } catch (error) {
    if (requestSequence === analysisRequestSequence) {
      setWorkflowStatus(`Repository validation failed: ${error.message}`, "error");
    }
  } finally {
    if (requestSequence === analysisRequestSequence) {
      validateRepositoryButton.disabled = false;
      validateRepositoryButton.textContent = "Validate repository";
    }
  }
});

repositoryInput.addEventListener("input", () => {
  analysisRequestSequence += 1;
  clearDisplayedResults();
  loadingState.hidden = true;
  errorState.hidden = true;
  validateRepositoryButton.disabled = false;
  validateRepositoryButton.textContent = "Validate repository";
  validatedRepository = null;
  setPullRequestOptions([]);
  setAnalysisDataState("LIVE MODE", "No live analysis result", "LIVE MODE · READY");
  document.getElementById("resultsRepositoryName").textContent = "No repository selected";
  setWorkflowStatus("Validate the updated repository URL before selecting a pull request.");
});

pullRequestSelect.addEventListener("change", () => {
  analysisRequestSequence += 1;
  clearDisplayedResults();
  loadingState.hidden = true;
  errorState.hidden = true;
  setAnalysisDataState("LIVE MODE", "Pull request not analyzed", "LIVE MODE · READY");
  analyzePullRequestButton.disabled = !validatedRepository || !pullRequestSelect.value;
  if (pullRequestSelect.value) {
    setWorkflowStatus(`Pull request #${pullRequestSelect.value} selected. Run analysis to load current results.`);
  } else {
    setWorkflowStatus("Choose an open pull request to analyze.");
  }
});

function normalizeBackendFindings(items) {
  if (!Array.isArray(items)) throw new Error("The analysis response did not contain a findings list.");
  return items.map((finding, index) => {
    if (!finding || typeof finding !== "object" ||
        !["High", "Medium", "Low"].includes(finding.severity) ||
        !finding.title || !finding.codeFile || !finding.docsFile || !finding.suggestion) {
      throw new Error(`Finding ${index + 1} was missing required, verifiable fields.`);
    }
    return {
      ...finding,
      id: finding.id || `F-${index + 1}`,
      status: finding.status || "Open",
      codeReference: finding.codeReference || finding.codeFile,
      docsReference: finding.docsReference || finding.docsFile,
      outdated: finding.outdated || finding.docsEvidence || "",
      codeValue: finding.codeValue || finding.codeEvidence || "",
      context: finding.context || finding.description || ""
    };
  });
}

function getSelectedAnalysisRequest() {
  if (!validatedRepository || !pullRequestSelect.value) return null;
  return {
    owner: validatedRepository.owner,
    repo: validatedRepository.name,
    pullNumber: Number(pullRequestSelect.value),
    useAi: useAIProviderCheckbox.checked
  };
}

async function analyzePullRequest(request) {
  const requestSequence = ++analysisRequestSequence;
  clearDisplayedResults();
  loadingState.querySelector("strong").textContent = "Fetching changed files and documentation...";
  loadingState.hidden = false;
  errorState.hidden = true;
  setAnalysisDataState("ANALYSIS IN PROGRESS", "Live analysis in progress", "LIVE ANALYSIS IN PROGRESS");
  setWorkflowStatus("Fetching changed files and documentation for evidence-based analysis.");
  analyzePullRequestButton.disabled = true;
  analyzePullRequestButton.textContent = "Analyzing…";

  try {
    const path = `/repositories/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/pulls/${request.pullNumber}/analyze`;
    const started = await apiRequest(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useAi: request.useAi })
    });
    if (!started.analysisId) throw new Error("The backend did not return an analysis ID.");
    const result = await apiRequest(`/analysis/${encodeURIComponent(started.analysisId)}`);
    if (requestSequence !== analysisRequestSequence) return;
    displayAnalysisResult(result, request);
  } catch (error) {
    if (requestSequence !== analysisRequestSequence) return;
    clearDisplayedResults();
    loadingState.hidden = true;
    analysisErrorMessage.textContent = error.message || "The selected pull request could not be analyzed.";
    errorState.hidden = false;
    setAnalysisDataState("ANALYSIS FAILED", "No current analysis results", "LIVE ANALYSIS FAILED");
    setWorkflowStatus(`Analysis failed: ${analysisErrorMessage.textContent}`, "error");
  } finally {
    if (requestSequence === analysisRequestSequence) {
      analyzePullRequestButton.disabled = !pullRequestSelect.value;
      analyzePullRequestButton.textContent = "Analyze pull request";
    }
  }
}

function displayAnalysisResult(result, request) {
  findings = normalizeBackendFindings(result.findings);
  liveAnalysis = true;
  searchInput.value = "";
  severityFilter.value = "all";
  statusFilter.value = "all";
  loaded = true;
  loadingState.hidden = true;
  errorState.hidden = true;
  document.getElementById("resultsRepositoryName").textContent = result.repository;
  setAnalysisDataState("LIVE ANALYSIS", "Evidence-backed results", "LIVE REPOSITORY ANALYSIS");
  renderFindings();

  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const provider = result.provider || "rules";
  const summary = `Analysis complete for ${result.repository}#${request.pullNumber}: ${findings.length} verified finding(s) using ${provider}.`;
  const aiStatus = result.ai?.used
    ? `${result.ai.provider || "AI provider"} analysis was used; returned findings passed evidence verification.`
    : request.useAi
      ? "AI was not used; this result came from rule-based fallback."
      : "AI was not requested; this result is rule-based.";
  setWorkflowStatus([summary, aiStatus, ...warnings].join(" "), "success");
}

analyzePullRequestButton.addEventListener("click", async () => {
  const request = getSelectedAnalysisRequest();
  if (!request) {
    setWorkflowStatus("Validate a repository and select a pull request first.", "error");
    return;
  }
  await analyzePullRequest(request);
});

function showToast(message) {
  document.getElementById("resultsToastMessage").textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2300);
}

async function copySuggestion(finding) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(finding.suggestion);
    } else {
      const field = document.createElement("textarea");
      field.value = finding.suggestion;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (!copied) throw new Error("Clipboard unavailable");
    }
    showToast("Suggested documentation fix copied");
  } catch (error) {
    showToast("Copy unavailable in this browser");
  }
}

searchInput.addEventListener("input", renderFindings);
severityFilter.addEventListener("change", renderFindings);
statusFilter.addEventListener("change", renderFindings);
document.getElementById("clearFilters").addEventListener("click", () => {
  searchInput.value = "";
  severityFilter.value = "all";
  statusFilter.value = "all";
  renderFindings();
  searchInput.focus();
});
retryAnalysisButton.addEventListener("click", async () => {
  const request = getSelectedAnalysisRequest();
  if (!request) {
    setWorkflowStatus("Validate a repository and select a pull request before retrying.", "error");
    return;
  }
  await analyzePullRequest(request);
});
findingsList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const finding = findings.find((item) => item.id === button.dataset.findingId);
  if (!finding) return;
  if (button.dataset.action === "copy") copySuggestion(finding);
  if (button.dataset.action === "review" && finding.status === "Open") {
    finding.status = "Reviewed";
    renderFindings();
    showToast(`${finding.id} marked as reviewed`);
  }
});
const resultsMenuButton = document.getElementById("resultsMenuButton");
const resultsNavigation = document.getElementById("resultsNavigation");

resultsMenuButton.addEventListener("click", () => {
  const open = !resultsNavigation.classList.contains("open");
  resultsNavigation.classList.toggle("open", open);
  resultsMenuButton.setAttribute("aria-expanded", String(open));
  resultsMenuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
});
resultsNavigation.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    resultsNavigation.classList.remove("open");
    resultsMenuButton.setAttribute("aria-expanded", "false");
    resultsMenuButton.setAttribute("aria-label", "Open navigation");
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    resultsNavigation.classList.remove("open");
    resultsMenuButton.setAttribute("aria-expanded", "false");
    resultsMenuButton.setAttribute("aria-label", "Open navigation");
  }
});

async function loadSharedAnalysis() {
  const parameters = new URLSearchParams(window.location.search);
  const analysisId = parameters.get("analysisId");
  if (!analysisId) return false;

  const owner = parameters.get("owner") || "";
  const repo = parameters.get("repo") || "";
  const pullNumber = Number(parameters.get("pull"));
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo) ||
      !Number.isSafeInteger(pullNumber) || pullNumber < 1) {
    throw new Error("The shared analysis link is invalid. Validate the repository and select the pull request again.");
  }

  const requestSequence = ++analysisRequestSequence;
  validatedRepository = { owner, name: repo, fullName: `${owner}/${repo}` };
  repositoryInput.value = `https://github.com/${owner}/${repo}`;
  setPullRequestOptions([{ number: pullNumber, title: `Pull request #${pullNumber}` }]);
  pullRequestSelect.value = String(pullNumber);
  analyzePullRequestButton.disabled = false;
  let result;
  try {
    result = await apiRequest(`/analysis/${encodeURIComponent(analysisId)}`);
  } catch (error) {
    if (requestSequence !== analysisRequestSequence) return true;
    throw error;
  }
  if (requestSequence !== analysisRequestSequence) return true;
  const fullName = `${owner}/${repo}`;
  if (result.repository !== fullName || result.pullRequest?.number !== pullNumber) {
    throw new Error("The saved analysis does not match the repository and pull request in this link.");
  }

  setPullRequestOptions([{ number: pullNumber, title: result.pullRequest.title }]);
  pullRequestSelect.value = String(pullNumber);
  analyzePullRequestButton.disabled = false;
  displayAnalysisResult(result, { owner, repo, pullNumber, useAi: Boolean(result.ai?.requested) });
  return true;
}

async function initializeResultsPage() {
  const backendReady = await checkBackendHealth();
  try {
    const sharedResultLoaded = await loadSharedAnalysis();
    if (!sharedResultLoaded && backendReady) {
      loaded = true;
      renderFindings();
      setWorkflowStatus("Connect a public repository and analyze an open pull request. No sample findings are shown in this live workflow.");
    }
  } catch (error) {
    clearDisplayedResults();
    loadingState.hidden = true;
    analysisErrorMessage.textContent = error.message;
    errorState.hidden = false;
    setAnalysisDataState("ANALYSIS UNAVAILABLE", "No current analysis result", "LIVE ANALYSIS · UNAVAILABLE");
    setWorkflowStatus(`Could not load the saved analysis: ${error.message}`, "error");
  }
}

setAnalysisDataState("LIVE MODE", "No live analysis result", "LIVE MODE · READY");
initializeResultsPage();
