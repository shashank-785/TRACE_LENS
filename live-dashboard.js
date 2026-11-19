"use strict";

(() => {
const API_BASE_URL = `${window.location.origin}/api`;
const liveDashboard = document.getElementById("overview");
const demoDashboard = document.getElementById("demoDashboard");
const repositoryForm = document.getElementById("liveRepositoryForm");
const repositoryInput = document.getElementById("liveRepositoryUrl");
const connectButton = document.getElementById("liveConnectButton");
const workflowStatus = document.getElementById("liveWorkflowStatus");
const retryButton = document.getElementById("liveRetryButton");
const pullRequestRows = document.getElementById("livePullRequestRows");
const pullRequestEmpty = document.getElementById("livePullRequestEmpty");
const analyzeButton = document.getElementById("liveAnalyzeButton");
const analysisResult = document.getElementById("liveAnalysisResult");
const resultMessage = document.getElementById("liveResultMessage");
const viewResultsLink = document.getElementById("liveViewResults");
const repoPickerWrap = document.getElementById("repoPickerWrap");
const currentRepo = document.getElementById("currentRepo");
const headerGitHubStatus = document.getElementById("headerGitHubStatus");
const mainNavigation = document.getElementById("mainNav");
let repository = null;
let pullRequests = [];
let selectedPullRequest = null;
let changedFiles = [];
let documents = [];
let requestSequence = 0;
let retryAction = null;

function setWorkflowStatus(message, type = "", retry = null) {
  workflowStatus.textContent = message;
  workflowStatus.classList.toggle("error", type === "error");
  workflowStatus.classList.toggle("success", type === "success");
  retryAction = retry;
  retryButton.hidden = typeof retry !== "function";
  retryButton.textContent = selectedPullRequest ? "Retry selected request" : "Retry repository request";
}

function setHeaderStatus() {
  headerGitHubStatus.textContent = repository ? "connected" : "not connected";
  currentRepo.textContent = repository ? repository.fullName : "No repository selected";
}

function resetPullRequestState(message = "Validate a public repository to load its real open pull requests.") {
  pullRequests = [];
  selectedPullRequest = null;
  changedFiles = [];
  documents = [];
  pullRequestRows.replaceChildren();
  pullRequestEmpty.textContent = message;
  pullRequestEmpty.hidden = false;
  document.getElementById("liveOpenPullRequestCount").textContent = "—";
  document.getElementById("livePullRequestCount").textContent = "—";
  document.getElementById("liveChangedFileCount").textContent = "—";
  document.getElementById("liveChangedFileNote").textContent = "Select an open pull request";
  document.getElementById("liveFindingCount").textContent = "—";
  document.getElementById("liveFindingNote").textContent = "Run an analysis to see results";
  document.getElementById("liveRepositoryName").textContent = repository?.fullName || "No repository selected";
  document.getElementById("liveSelectionStatus").textContent = "Choose a pull request to retrieve its changed files and related documentation.";
  document.getElementById("liveSelectedFileCount").textContent = "—";
  document.getElementById("liveDocumentCount").textContent = "—";
  document.getElementById("liveDocumentList").textContent = "Documentation paths will appear after a pull request is selected.";
  document.getElementById("livePullRequestLink").hidden = true;
  analyzeButton.disabled = true;
  analysisResult.hidden = true;
  viewResultsLink.hidden = true;
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) }
    });
  } catch {
    throw new Error("The backend could not be reached. Check the connection, then retry.");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.success !== true) {
    throw new Error(payload?.error?.message || `The backend returned an unexpected response (${response.status}).`);
  }
  return payload.data;
}

function renderPullRequests() {
  pullRequestRows.replaceChildren();
  document.getElementById("livePullRequestCount").textContent = String(pullRequests.length);
  document.getElementById("liveOpenPullRequestCount").textContent = String(pullRequests.length);
  pullRequestEmpty.hidden = pullRequests.length !== 0;
  if (pullRequests.length === 0) {
    pullRequestEmpty.textContent = "This public repository has no open pull requests.";
    return;
  }

  for (const pullRequest of pullRequests) {
    const row = document.createElement("tr");
    const titleCell = document.createElement("td");
    const titleLink = document.createElement("a");
    titleLink.href = pullRequest.htmlUrl;
    titleLink.target = "_blank";
    titleLink.rel = "noopener noreferrer";
    titleLink.textContent = `#${pullRequest.number} · ${pullRequest.title}`;
    titleLink.className = "live-pr-title";
    titleCell.append(titleLink);

    const authorCell = document.createElement("td");
    authorCell.textContent = pullRequest.author || "Unknown";
    const statusCell = document.createElement("td");
    statusCell.textContent = pullRequest.draft ? "Draft" : pullRequest.state;
    const actionCell = document.createElement("td");
    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "button button-secondary live-select-pr";
    selectButton.textContent = "Select";
    selectButton.addEventListener("click", () => selectPullRequest(pullRequest));
    actionCell.append(selectButton);
    row.append(titleCell, authorCell, statusCell, actionCell);
    pullRequestRows.append(row);
  }
}

async function connectRepository() {
  const repositoryUrl = repositoryInput.value.trim();
  if (!repositoryUrl) {
    setWorkflowStatus("Enter a public GitHub repository URL before validating.", "error");
    return;
  }

  const sequence = ++requestSequence;
  repository = null;
  setHeaderStatus();
  resetPullRequestState("Loading pull requests from GitHub…");
  connectButton.disabled = true;
  connectButton.textContent = "Validating…";
  setWorkflowStatus("Validating the repository and loading its real open pull requests.");

  try {
    const validation = await apiRequest("/repositories/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryUrl })
    });
    if (sequence !== requestSequence) return;
    repository = validation.repository;
    document.getElementById("liveRepositoryName").textContent = repository.fullName;
    currentRepo.textContent = repository.fullName;
    const path = `/repositories/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/pulls`;
    const response = await apiRequest(path);
    if (sequence !== requestSequence) return;
    pullRequests = Array.isArray(response.pullRequests) ? response.pullRequests : [];
    renderPullRequests();
    setHeaderStatus();
    setWorkflowStatus(
      pullRequests.length
        ? `Connected to ${repository.fullName}. Select one of ${pullRequests.length} open pull requests to inspect its actual changes.`
        : `${repository.fullName} is valid, but it has no open pull requests.`
    );
    if (pullRequests.length === 0) pullRequestEmpty.textContent = "This public repository has no open pull requests.";
  } catch (error) {
    if (sequence !== requestSequence) return;
    repository = null;
    setHeaderStatus();
    resetPullRequestState("No pull request data is available until the repository request succeeds.");
    setWorkflowStatus(`Repository request failed: ${error.message}`, "error", connectRepository);
  } finally {
    if (sequence === requestSequence) {
      connectButton.disabled = false;
      connectButton.textContent = "Validate repository";
    }
  }
}

function clearCurrentAnalysis() {
  analysisResult.hidden = true;
  viewResultsLink.hidden = true;
  document.getElementById("liveFindingCount").textContent = "—";
  document.getElementById("liveFindingNote").textContent = "Run an analysis to see results";
}

async function selectPullRequest(pullRequest) {
  if (!repository) return;
  const sequence = ++requestSequence;
  selectedPullRequest = pullRequest;
  changedFiles = [];
  documents = [];
  clearCurrentAnalysis();
  analyzeButton.disabled = true;
  document.getElementById("liveChangedFileCount").textContent = "…";
  document.getElementById("liveChangedFileNote").textContent = "Retrieving pull request files";
  document.getElementById("liveSelectedFileCount").textContent = "…";
  document.getElementById("liveDocumentCount").textContent = "…";
  document.getElementById("liveDocumentList").textContent = "Retrieving relevant repository documentation…";
  document.getElementById("liveSelectionStatus").textContent = `Retrieving changes and documentation for #${pullRequest.number}…`;
  const link = document.getElementById("livePullRequestLink");
  link.href = pullRequest.htmlUrl;
  link.textContent = `#${pullRequest.number} · ${pullRequest.title}`;
  link.hidden = false;

  const prefix = `/repositories/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
  try {
    const [fileResponse, documentationResponse] = await Promise.all([
      apiRequest(`${prefix}/pulls/${pullRequest.number}/files`),
      apiRequest(`${prefix}/documentation?pullNumber=${pullRequest.number}`)
    ]);
    if (sequence !== requestSequence) return;
    changedFiles = Array.isArray(fileResponse.files) ? fileResponse.files : [];
    documents = Array.isArray(documentationResponse.documents) ? documentationResponse.documents : [];
    document.getElementById("liveChangedFileCount").textContent = String(changedFiles.length);
    document.getElementById("liveChangedFileNote").textContent = "Actual changed files returned by GitHub";
    document.getElementById("liveSelectedFileCount").textContent = String(changedFiles.length);
    document.getElementById("liveDocumentCount").textContent = String(documents.length);
    document.getElementById("liveDocumentList").textContent = documents.length
      ? documents.map((item) => item.path).join(" · ")
      : "No supported README or documentation files were retrieved.";
    document.getElementById("liveSelectionStatus").textContent = `Retrieved changes and documentation for #${pullRequest.number}.`;
    analyzeButton.disabled = false;
    setWorkflowStatus(`Ready to analyze ${repository.fullName}#${pullRequest.number}. The results will be based on these retrieved changes and documents.`);
  } catch (error) {
    if (sequence !== requestSequence) return;
    document.getElementById("liveChangedFileCount").textContent = "Unavailable";
    document.getElementById("liveSelectedFileCount").textContent = "Unavailable";
    document.getElementById("liveDocumentCount").textContent = "Unavailable";
    document.getElementById("liveDocumentList").textContent = "Documentation retrieval did not complete.";
    document.getElementById("liveSelectionStatus").textContent = "Could not retrieve pull request data.";
    setWorkflowStatus(`Pull request request failed: ${error.message} Select the pull request again to retry.`, "error", () => selectPullRequest(pullRequest));
  }
}

async function analyzeSelectedPullRequest() {
  if (!repository || !selectedPullRequest) return;
  const sequence = ++requestSequence;
  clearCurrentAnalysis();
  analyzeButton.disabled = true;
  analyzeButton.textContent = "Analyzing…";
  setWorkflowStatus(`Comparing changed code and retrieved documentation for ${repository.fullName}#${selectedPullRequest.number}.`);

  try {
    const prefix = `/repositories/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
    const started = await apiRequest(`${prefix}/pulls/${selectedPullRequest.number}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useAi: false })
    });
    if (!started.analysisId) throw new Error("The backend did not return an analysis ID.");
    const result = await apiRequest(`/analysis/${encodeURIComponent(started.analysisId)}`);
    if (sequence !== requestSequence) return;
    if (!Array.isArray(result.findings)) throw new Error("The completed analysis did not include a findings list.");

    const findingCount = result.findings.length;
    document.getElementById("liveFindingCount").textContent = String(findingCount);
    document.getElementById("liveFindingNote").textContent = "Evidence-validated backend findings";
    document.getElementById("liveResultSummary").textContent = `${result.repository} · Pull request #${selectedPullRequest.number} · ${new Date(result.createdAt).toLocaleString()}`;
    const findingText = findingCount === 0
      ? "Analysis completed successfully. No evidence-backed documentation mismatches were found."
      : `Analysis completed successfully with ${findingCount} evidence-validated finding${findingCount === 1 ? "" : "s"}.`;
    const aiText = result.ai?.used
      ? ` ${result.ai.provider || "AI provider"} responded successfully and its evidence passed backend validation.`
      : " Rule-based analysis was used.";
    const warningText = Array.isArray(result.warnings) && result.warnings.length
      ? ` ${result.warnings.join(" ")}`
      : "";
    resultMessage.textContent = `${findingText}${aiText}${warningText}`;
    analysisResult.hidden = false;
    const params = new URLSearchParams({
      owner: repository.owner,
      repo: repository.name,
      pull: String(selectedPullRequest.number),
      analysisId: started.analysisId
    });
    viewResultsLink.href = `analysis-results.html?${params.toString()}`;
    viewResultsLink.hidden = false;
    document.getElementById("lastScanTime").textContent = new Date(result.createdAt).toLocaleString();
    setWorkflowStatus(`Live analysis completed for ${result.repository}#${selectedPullRequest.number}.`);
  } catch (error) {
    if (sequence !== requestSequence) return;
    clearCurrentAnalysis();
    setWorkflowStatus(`Analysis failed: ${error.message} Select Analyze again to retry.`, "error", analyzeSelectedPullRequest);
  } finally {
    if (sequence === requestSequence) {
      analyzeButton.disabled = false;
      analyzeButton.textContent = "Analyze selected pull request";
    }
  }
}

async function checkBackendHealth() {
  const backendStatus = document.getElementById("liveBackendStatus");
  const aiStatus = document.getElementById("liveAiStatus");
  try {
    const health = await apiRequest("/health");
    backendStatus.textContent = "Backend online";
    backendStatus.classList.remove("offline");
    backendStatus.classList.add("online");
    const ai = health.ai || {};
    aiStatus.textContent = ai.configured
      ? `${ai.provider || "AI provider"} configured · connectivity not tested`
      : "AI not configured · rule-based analysis available";
  } catch (error) {
    backendStatus.textContent = "Backend unavailable";
    backendStatus.classList.remove("online");
    backendStatus.classList.add("offline");
    aiStatus.textContent = "AI status unavailable";
    setWorkflowStatus(`${error.message} Check the backend health endpoint and retry.`, "error", checkBackendHealth);
  }
}

function updateNavigation(demoMode) {
  const links = mainNavigation.querySelectorAll(".nav-link");
  links[0].href = demoMode ? "#demoDashboard" : "#overview";
  links[1].href = demoMode ? "#pull-requests" : "#livePullRequests";
  links[2].href = demoMode ? "#drift-details" : "#liveDocumentation";
  links[5].href = demoMode ? "#history" : "#demoPreview";
}

repositoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  connectRepository();
});
repositoryInput.addEventListener("input", () => {
  requestSequence += 1;
  connectButton.disabled = false;
  connectButton.textContent = "Validate repository";
  repository = null;
  setHeaderStatus();
  resetPullRequestState("Validate the updated repository URL to load its pull requests.");
  setWorkflowStatus("Validate the updated repository URL before continuing.");
});
retryButton.addEventListener("click", () => {
  if (retryAction) retryAction();
});
analyzeButton.addEventListener("click", analyzeSelectedPullRequest);

function showDemo() {
  liveDashboard.hidden = true;
  demoDashboard.hidden = false;
  repoPickerWrap.hidden = false;
  headerGitHubStatus.textContent = "demo";
  updateNavigation(true);
  window.scrollTo(0, 0);
}

function showLive() {
  demoDashboard.hidden = true;
  liveDashboard.hidden = false;
  repoPickerWrap.hidden = true;
  updateNavigation(false);
  setHeaderStatus();
  window.scrollTo(0, 0);
}

document.getElementById("showDemoMode").addEventListener("click", showDemo);
document.getElementById("showDemoModeFooter").addEventListener("click", showDemo);
document.getElementById("showLiveMode").addEventListener("click", showLive);

resetPullRequestState();
setHeaderStatus();
checkBackendHealth();
})();
