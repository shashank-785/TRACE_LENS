"use strict";

const findings = [
  {
    id: "TL-104",
    severity: "Critical",
    status: "Open",
    title: "Refresh token lifetime no longer matches the guide",
    codeFile: "src/auth/session.ts",
    codeReference: "src/auth/session.ts:42",
    documentationFile: "docs/authentication.md",
    documentationReference: "Authentication > Refresh tokens",
    outdatedStatement: "Refresh tokens are optional and remain valid for 30 days.",
    currentCodeValue: "refreshToken: { required: true, expiresIn: '7d' }",
    suggestion: "Refresh tokens are required and remain valid for 7 days.",
    changeContext: "The authentication change makes refresh tokens mandatory and shortens their lifetime. Update both the setup steps and the token-lifetime description."
  },
  {
    id: "TL-103",
    severity: "High",
    status: "Open",
    title: "Default request timeout was reduced",
    codeFile: "src/config/http.ts",
    codeReference: "src/config/http.ts:18",
    documentationFile: "README.md",
    documentationReference: "Configuration > Network",
    outdatedStatement: "Requests time out after 60 seconds by default.",
    currentCodeValue: "requestTimeoutMs: 30_000",
    suggestion: "Requests time out after 30 seconds by default.",
    changeContext: "The default HTTP client timeout changed from 60 seconds to 30 seconds. Custom per-request timeouts are unaffected."
  },
  {
    id: "TL-102",
    severity: "High",
    status: "Reviewed",
    title: "CSV is no longer the only supported export format",
    codeFile: "src/reports/export.ts",
    codeReference: "src/reports/export.ts:67",
    documentationFile: "docs/reports.md",
    documentationReference: "Exporting reports",
    outdatedStatement: "Reports can only be downloaded as a CSV file.",
    currentCodeValue: "supportedFormats: ['csv', 'json']",
    suggestion: "Reports can be downloaded as CSV or JSON files.",
    changeContext: "The export handler now accepts JSON in addition to CSV. Confirm that the UI and command-line examples mention both formats."
  },
  {
    id: "TL-101",
    severity: "Medium",
    status: "Open",
    title: "The minimum Node.js version has changed",
    codeFile: "package.json",
    codeReference: "package.json:engines.node",
    documentationFile: "CONTRIBUTING.md",
    documentationReference: "Development setup > Prerequisites",
    outdatedStatement: "Install Node.js 18 or newer before contributing.",
    currentCodeValue: "\"node\": \">=20\"",
    suggestion: "Install Node.js 20 or newer before contributing.",
    changeContext: "The project now depends on runtime features available in Node.js 20. Update the contributor prerequisites and local setup instructions."
  },
  {
    id: "TL-100",
    severity: "Medium",
    status: "Resolved",
    title: "Retry attempts are limited to two",
    codeFile: "src/client/retry.ts",
    codeReference: "src/client/retry.ts:25",
    documentationFile: "docs/api-client.md",
    documentationReference: "Client options > Retries",
    outdatedStatement: "The client retries failed requests up to five times.",
    currentCodeValue: "maxRetries = 2",
    suggestion: "The client retries failed requests up to two times.",
    changeContext: "The retry policy was reduced to limit repeated requests. This finding is shown as resolved in the sample review state."
  },
  {
    id: "TL-099",
    severity: "Low",
    status: "Open",
    title: "The health endpoint now returns a version field",
    codeFile: "src/routes/health.ts",
    codeReference: "src/routes/health.ts:12",
    documentationFile: "docs/operations.md",
    documentationReference: "Health checks > Response",
    outdatedStatement: "The health endpoint returns only a status field.",
    currentCodeValue: "{ status: 'ok', version: appVersion }",
    suggestion: "The health endpoint returns status and version fields.",
    changeContext: "The health response now includes the deployed application version to help identify running builds."
  }
];

const findingsList = document.getElementById("findingsList");
const searchInput = document.getElementById("findingSearch");
const severityFilter = document.getElementById("severityFilter");
const statusFilter = document.getElementById("statusFilter");
const emptyState = document.getElementById("emptyState");
const resultsCount = document.getElementById("resultsCount");
const findingCount = document.getElementById("findingCount");
const modalBackdrop = document.getElementById("findingModalBackdrop");
const modal = modalBackdrop.querySelector('[role="dialog"]');
const toast = document.getElementById("resultsToast");
let toastTimer;
let modalOpener;

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function updateSummary() {
  document.getElementById("totalFindings").textContent = findings.length;
  document.getElementById("criticalHighFindings").textContent = findings.filter((finding) =>
    finding.severity === "Critical" || finding.severity === "High"
  ).length;
  const affectedFiles = new Set(findings.flatMap((finding) => [finding.codeFile, finding.documentationFile]));
  document.getElementById("affectedFiles").textContent = affectedFiles.size;
  document.getElementById("needsReview").textContent = findings.filter((finding) => finding.status === "Open").length;
}

function renderFindings() {
  const query = searchInput.value.trim().toLowerCase();
  const severity = severityFilter.value;
  const status = statusFilter.value;
  const visibleFindings = findings.filter((finding) => {
    const matchesText = `${finding.title} ${finding.codeFile} ${finding.documentationFile}`.toLowerCase().includes(query);
    return matchesText
      && (severity === "all" || finding.severity === severity)
      && (status === "all" || finding.status === status);
  });

  findingsList.innerHTML = visibleFindings.map((finding) => {
    const severityClass = finding.severity.toLowerCase();
    const statusClass = finding.status.toLowerCase();
    const reviewed = finding.status !== "Open";
    return `<article class="finding-card" data-finding-id="${escapeHtml(finding.id)}">
      <div class="finding-card-heading">
        <div class="finding-badges">
          <span class="finding-severity ${severityClass}"><i></i>${escapeHtml(finding.severity)}</span>
          <span class="finding-status ${statusClass}">${escapeHtml(finding.status)}</span>
        </div>
        <span class="finding-id">${escapeHtml(finding.id)}</span>
      </div>
      <h3 class="finding-title">${escapeHtml(finding.title)}</h3>
      <div class="finding-files">
        <div class="finding-file"><span>CODE CHANGE</span><code>${escapeHtml(finding.codeReference)}</code></div>
        <div class="finding-file"><span>RELATED DOCUMENTATION</span><code>${escapeHtml(finding.documentationFile)}</code></div>
      </div>
      <div class="finding-mismatch">
        <div><span class="finding-field-label">OUTDATED DOCUMENTATION</span><p>${escapeHtml(finding.outdatedStatement)}</p></div>
        <div><span class="finding-field-label">CURRENT CODE</span><code>${escapeHtml(finding.currentCodeValue)}</code></div>
      </div>
      <div class="finding-suggestion"><span class="finding-field-label">SUGGESTED DOCUMENTATION FIX</span><p>${escapeHtml(finding.suggestion)}</p></div>
      <div class="finding-actions">
        <button class="button button-secondary finding-detail-button" type="button" data-action="details" data-finding-id="${escapeHtml(finding.id)}">View details</button>
        <button class="button button-secondary" type="button" data-action="copy" data-finding-id="${escapeHtml(finding.id)}"><svg class="icon tiny" aria-hidden="true"><use href="#i-copy"/></svg>Copy suggestion</button>
        <button class="button button-primary finding-review-button" type="button" data-action="review" data-finding-id="${escapeHtml(finding.id)}"${reviewed ? " disabled" : ""}>${reviewed ? escapeHtml(finding.status) : "Mark reviewed"}</button>
      </div>
    </article>`;
  }).join("");

  findingCount.textContent = visibleFindings.length;
  resultsCount.textContent = `Showing ${visibleFindings.length} of ${findings.length} findings`;
  emptyState.hidden = visibleFindings.length > 0;
  findingsList.hidden = visibleFindings.length === 0;
  updateSummary();
}

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
      if (!copied) throw new Error("Clipboard copy was not available");
    }
    showToast("Suggested documentation fix copied");
  } catch (error) {
    showToast("Copy unavailable in this browser");
  }
}

function fieldMarkup(label, value, code) {
  const content = code
    ? `<code>${escapeHtml(value)}</code>`
    : `<p>${escapeHtml(value)}</p>`;
  return `<div class="finding-detail-field"><span class="finding-field-label">${escapeHtml(label)}</span>${content}</div>`;
}

function openFindingModal(finding, opener) {
  modalOpener = opener;
  document.getElementById("findingModalEyebrow").textContent = `${finding.id} · ${finding.severity.toUpperCase()} SEVERITY`;
  document.getElementById("findingModalTitle").textContent = finding.title;
  document.getElementById("findingModalContent").innerHTML = `
    <p class="analysis-modal-intro" id="findingModalIntro">${escapeHtml(finding.changeContext)}</p>
    <div class="analysis-modal-fields">
      ${fieldMarkup("STATUS", finding.status, false)}
      ${fieldMarkup("CODE FILE / LINE", finding.codeReference, true)}
      ${fieldMarkup("RELATED DOCUMENTATION", finding.documentationFile, true)}
      ${fieldMarkup("DOCUMENTATION SECTION", finding.documentationReference, false)}
      ${fieldMarkup("OUTDATED DOCUMENTATION STATEMENT", finding.outdatedStatement, false)}
      ${fieldMarkup("CURRENT CODE VALUE / CHANGE", finding.currentCodeValue, true)}
      ${fieldMarkup("SUGGESTED DOCUMENTATION FIX", finding.suggestion, false)}
    </div>`;
  modalBackdrop.hidden = false;
  document.getElementById("closeFindingModal").focus();
}

function closeFindingModal() {
  if (modalBackdrop.hidden) return;
  modalBackdrop.hidden = true;
  if (modalOpener) modalOpener.focus();
}

function markReviewed(finding) {
  if (finding.status !== "Open") return;
  finding.status = "Reviewed";
  renderFindings();
  const reviewButton = findingsList.querySelector(`[data-action="review"][data-finding-id="${finding.id}"]`);
  (reviewButton || searchInput).focus();
  showToast(`${finding.id} marked as reviewed`);
}

function clearFilters() {
  searchInput.value = "";
  severityFilter.value = "all";
  statusFilter.value = "all";
  renderFindings();
  searchInput.focus();
}

findingsList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const finding = findings.find((item) => item.id === button.dataset.findingId);
  if (!finding) return;

  if (button.dataset.action === "details") openFindingModal(finding, button);
  if (button.dataset.action === "copy") copySuggestion(finding);
  if (button.dataset.action === "review") markReviewed(finding);
});

searchInput.addEventListener("input", renderFindings);
severityFilter.addEventListener("change", renderFindings);
statusFilter.addEventListener("change", renderFindings);
document.getElementById("clearFilters").addEventListener("click", clearFilters);
document.getElementById("closeFindingModal").addEventListener("click", closeFindingModal);
document.getElementById("doneFindingModal").addEventListener("click", closeFindingModal);
modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) closeFindingModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeFindingModal();
    const menuButton = document.getElementById("resultsMenuButton");
    const navigation = document.getElementById("resultsNavigation");
    navigation.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
  }

  if (event.key === "Tab" && !modalBackdrop.hidden) {
    const focusable = Array.from(modal.querySelectorAll("button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

document.querySelectorAll("#resultsNavigation .nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.getElementById("resultsNavigation").classList.remove("open");
    document.getElementById("resultsMenuButton").setAttribute("aria-expanded", "false");
  });
});
document.getElementById("resultsMenuButton").addEventListener("click", (event) => {
  const navigation = document.getElementById("resultsNavigation");
  const open = !navigation.classList.contains("open");
  navigation.classList.toggle("open", open);
  event.currentTarget.setAttribute("aria-expanded", String(open));
});

renderFindings();
