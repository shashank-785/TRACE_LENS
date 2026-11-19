"use strict";

const pullRequests = [
  { id: 248, title: "feat: Add recurring payments support", author: "Maya Chen", initials: "MC", avatar: "a1", status: "passed", issues: 0, source: "src/config.js", docs: "README.md", outdated: "Default request timeout is 60 seconds.", newValue: "timeout = 30", oldValue: "60 seconds", suggestion: "Default request timeout is 30 seconds.", severity: "HIGH" },
  { id: 246, title: "refactor: Update authentication flow", author: "Leon Park", initials: "LP", avatar: "a2", status: "warning", issues: 2, source: "src/auth/session.ts", docs: "docs/authentication.md", outdated: "Access tokens expire after 24 hours.", newValue: "expiresIn: '12h'", oldValue: "24 hours", suggestion: "Access tokens expire after 12 hours.", severity: "MEDIUM" },
  { id: 244, title: "fix: Change database timeout", author: "Ava Morgan", initials: "AM", avatar: "a3", status: "failed", issues: 3, source: "config.js", docs: "README.md", outdated: "Default timeout is 60 seconds.", newValue: "timeout = 30", oldValue: "60 seconds", suggestion: "Default timeout is 30 seconds.", severity: "HIGH" },
  { id: 241, title: "chore: Update dependencies", author: "Noah Kim", initials: "NK", avatar: "a4", status: "passed", issues: 0, source: "package.json", docs: "CONTRIBUTING.md", outdated: "Requires Node.js 18 or later.", newValue: "node: '>=20'", oldValue: "Node.js 18", suggestion: "Requires Node.js 20 or later.", severity: "LOW" },
  { id: 239, title: "feat: Add reporting dashboard", author: "Rina Patel", initials: "RP", avatar: "a5", status: "warning", issues: 2, source: "src/reports/export.ts", docs: "docs/reports.md", outdated: "Reports can be exported as CSV.", newValue: "formats: ['csv', 'json']", oldValue: "CSV only", suggestion: "Reports can be exported as CSV or JSON.", severity: "MEDIUM" }
];

const statusNames = { passed: "Passed", warning: "Warning", failed: "Failed" };
let activeFilter = "all";
let selectedPrId = 244;
let toastTimer;
let scanTimer;

const tableBody = document.getElementById("prTableBody");
const searchInput = document.getElementById("prSearch");
const emptyState = document.getElementById("emptyState");
const resultCount = document.getElementById("resultCount");
const toast = document.getElementById("toast");
const modalBackdrop = document.getElementById("modalBackdrop");
const uploadDropzone = document.getElementById("uploadDropzone");
const documentInput = document.getElementById("documentInput");
const uploadFileCard = document.getElementById("uploadFileCard");
const uploadError = document.getElementById("uploadError");
const uploadButton = document.getElementById("uploadButton");
const uploadProgressTrack = document.getElementById("uploadProgressTrack");
const uploadProgressFill = document.getElementById("uploadProgressFill");
const uploadStatus = document.getElementById("uploadStatus");
const maxDocumentSize = 20 * 1024 * 1024;
const allowedDocumentTypes = new Set(["pdf", "doc", "docx", "md", "txt"]);
let selectedDocument = null;
let uploadTimer;

function renderRows() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = pullRequests.filter((pr) => {
    const matchesText = `${pr.title} ${pr.author} #${pr.id}`.toLowerCase().includes(query);
    const matchesStatus = activeFilter === "all" || pr.status === activeFilter;
    return matchesText && matchesStatus;
  });

  tableBody.innerHTML = filtered.map((pr) => {
    const issueClass = pr.status === "failed" ? "blocked" : pr.issues ? "has-issues" : "";
    const issueLabel = pr.issues === 1 ? "issue" : "issues";
    return `<tr data-pr-id="${pr.id}" class="${pr.id === selectedPrId ? "selected" : ""}" tabindex="0" aria-label="Open analysis for pull request ${pr.id}: ${escapeHtml(pr.title)}">
      <td><div class="pr-cell-title"><span class="pr-number">#${pr.id}</span><span class="pr-title">${escapeHtml(pr.title)}</span></div></td>
      <td><div class="author-cell"><span class="author-avatar ${pr.avatar}">${pr.initials}</span>${escapeHtml(pr.author)}</div></td>
      <td><span class="status-badge ${pr.status}"><i></i>${statusNames[pr.status]}</span></td>
      <td><span class="issue-count ${issueClass}">${pr.issues === 0 ? "—" : String(pr.issues).padStart(2, "0")} ${pr.issues ? issueLabel : "none"}</span></td>
      <td><button class="row-action" aria-label="Open pull request ${pr.id} details"><svg class="icon"><use href="#i-chevron-right"/></svg></button></td>
    </tr>`;
  }).join("");

  emptyState.hidden = filtered.length !== 0;
  resultCount.textContent = filtered.length;
  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.filter === activeFilter);
    chip.setAttribute("aria-pressed", String(chip.dataset.filter === activeFilter));
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function selectPullRequest(id) {
  const pr = pullRequests.find((item) => item.id === Number(id));
  if (!pr) return;
  selectedPrId = pr.id;
  document.getElementById("selectedPrLabel").textContent = `Selected finding from #${pr.id}`;
  document.getElementById("sourceFile").textContent = pr.source;
  document.getElementById("docFile").textContent = pr.docs;
  document.getElementById("outdatedStatement").textContent = `“${pr.outdated}”`;
  document.getElementById("newValue").textContent = pr.newValue;
  document.getElementById("oldValue").textContent = pr.oldValue;
  document.getElementById("suggestedCorrection").textContent = `“${pr.suggestion}”`;
  document.getElementById("severityText").textContent = `${pr.severity} SEVERITY`;
  const severity = document.querySelector(".severity-pill");
  severity.className = `severity-pill ${pr.severity.toLowerCase()}`;
  renderRows();
}

function showToast(message) {
  document.getElementById("toastMessage").textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2300);
}

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function documentValidationError(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (!allowedDocumentTypes.has(extension)) return "Unsupported file type. Choose a PDF, DOC, DOCX, Markdown, or TXT document.";
  if (file.size === 0) return "This file is empty. Choose a document with content.";
  if (file.size > maxDocumentSize) return "This file is larger than 20 MB. Choose a smaller document.";
  return "";
}

function setUploadProgress(progress, message) {
  uploadProgressFill.style.width = `${progress}%`;
  uploadProgressTrack.setAttribute("aria-valuenow", String(progress));
  uploadProgressTrack.setAttribute("aria-valuetext", message);
  uploadStatus.textContent = message;
}

function cancelUpload() {
  window.clearInterval(uploadTimer);
  uploadTimer = null;
  uploadFileCard.classList.remove("is-uploading", "is-complete");
  uploadButton.classList.remove("loading");
  uploadButton.disabled = !selectedDocument;
  uploadButton.querySelector("span").textContent = "Upload document";
  setUploadProgress(0, "Ready to upload");
}

function clearSelectedDocument() {
  selectedDocument = null;
  documentInput.value = "";
  cancelUpload();
  uploadFileCard.hidden = true;
  document.getElementById("uploadFileName").textContent = "";
  document.getElementById("uploadFileMeta").textContent = "";
  document.getElementById("uploadFileIcon").textContent = "";
}

function showUploadError(message) {
  uploadError.textContent = message;
  uploadError.hidden = !message;
}

function rejectDocument(message) {
  const hadSelection = Boolean(selectedDocument);
  clearSelectedDocument();
  showUploadError(hadSelection ? `${message} The previous selection was cleared.` : message);
}

function selectDocument(file) {
  const validationError = documentValidationError(file);
  if (validationError) {
    rejectDocument(validationError);
    return;
  }

  cancelUpload();
  selectedDocument = file;
  const extension = file.name.split(".").pop().toLowerCase();
  document.getElementById("uploadFileName").textContent = file.name;
  document.getElementById("uploadFileMeta").textContent = `${formatFileSize(file.size)} · ${extension.toUpperCase()} document`;
  document.getElementById("uploadFileIcon").textContent = extension.toUpperCase();
  uploadFileCard.hidden = false;
  uploadButton.disabled = false;
  showUploadError("");
}

function handleDocumentSelection(files) {
  if (files.length > 1) {
    rejectDocument("Choose one document at a time.");
    return;
  }
  if (files.length === 1) selectDocument(files[0]);
}

function startDemoUpload() {
  if (!selectedDocument || uploadButton.disabled) return;

  cancelUpload();
  uploadFileCard.classList.add("is-uploading");
  uploadButton.disabled = true;
  uploadButton.classList.add("loading");
  uploadButton.querySelector("span").textContent = "Uploading…";
  let progress = 0;
  setUploadProgress(progress, "Uploading…");
  uploadTimer = window.setInterval(() => {
    progress = Math.min(progress + 5, 100);
    setUploadProgress(progress, progress === 100 ? "Demo upload complete · ready for analysis" : `Uploading… ${progress}%`);
    if (progress === 100) {
      window.clearInterval(uploadTimer);
      uploadTimer = null;
      uploadFileCard.classList.remove("is-uploading");
      uploadFileCard.classList.add("is-complete");
      uploadButton.classList.remove("loading");
      uploadButton.querySelector("span").textContent = "Upload complete";
      showToast("Demo upload complete · ready for analysis");
    }
  }, 50);
}

async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const field = document.createElement("textarea");
      field.value = text;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (!copied) throw new Error("Clipboard copy was not available");
    }
    showToast(successMessage);
  } catch (error) {
    showToast("Copy unavailable in this browser");
  }
}

function currentPullRequest() {
  return pullRequests.find((pr) => pr.id === selectedPrId);
}

function openModal(type) {
  const pr = currentPullRequest();
  const codeMode = type === "code";
  document.getElementById("modalEyebrow").textContent = `PULL REQUEST #${pr.id} · ${pr.source}`;
  document.getElementById("modalTitle").textContent = codeMode ? "Code change preview" : "Documentation evidence";
  const content = document.getElementById("modalContent");
  if (codeMode) {
    content.innerHTML = `<div class="modal-code-label">DIFF PREVIEW · ${escapeHtml(pr.source)}</div>
      <pre class="code-block"><span class="code-line dim">@@ ${escapeHtml(pr.source)} @@</span>
<span class="code-line dim">  // Documentation value compared with the current source change</span>
<span class="code-line minus">- ${escapeHtml(pr.oldValue)}</span>
<span class="code-line plus">+ ${escapeHtml(pr.newValue)}</span></pre>
      <div class="evidence-meta"><div><span>CHANGE SOURCE</span><strong>${escapeHtml(pr.source)}</strong></div><div><span>RELATED DOC</span><strong>${escapeHtml(pr.docs)}</strong></div></div>`;
  } else {
    content.innerHTML = `<div class="modal-code-label">MATCHED DOCUMENTATION · ${escapeHtml(pr.docs)}</div>
      <div class="evidence-quote">“${escapeHtml(pr.outdated)}”</div>
      <div class="evidence-meta"><div><span>PREVIOUS VALUE</span><strong>${escapeHtml(pr.oldValue)}</strong></div><div><span>CODE VALUE</span><strong>${escapeHtml(pr.newValue)}</strong></div></div>
      <div class="modal-code-label" style="margin-top:16px">SUGGESTED REPLACEMENT</div><div class="evidence-quote">${escapeHtml(pr.suggestion)}</div>`;
  }
  modalBackdrop.hidden = false;
  document.getElementById("modalClose").focus();
}

function closeModal() {
  modalBackdrop.hidden = true;
}

function setupChart() {
  const canvas = document.getElementById("driftChart");
  const context = canvas.getContext("2d");
  const values = [2, 4, 3, 6, 4, 7, 5];
  const labels = ["Nov 12", "Nov 13", "Nov 14", "Nov 15", "Nov 16", "Nov 17", "Nov 18"];
  const tooltip = document.getElementById("chartTooltip");
  let points = [];
  let frame;

  function draw() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const width = rect.width;
    const height = rect.height;
    const inset = { top: 10, right: 7, bottom: 10, left: 2 };
    const plotWidth = width - inset.left - inset.right;
    const plotHeight = height - inset.top - inset.bottom;
    points = values.map((value, index) => ({
      x: inset.left + (plotWidth * index) / (values.length - 1),
      y: inset.top + plotHeight - (value / 8) * plotHeight,
      value,
      label: labels[index]
    }));

    context.clearRect(0, 0, width, height);
    const fill = context.createLinearGradient(0, inset.top, 0, height);
    fill.addColorStop(0, "rgba(181, 99, 238, .25)");
    fill.addColorStop(.68, "rgba(172, 82, 214, .09)");
    fill.addColorStop(1, "rgba(172, 82, 214, 0)");
    context.beginPath();
    context.moveTo(points[0].x, height - inset.bottom);
    points.forEach((point) => context.lineTo(point.x, point.y));
    context.lineTo(points[points.length - 1].x, height - inset.bottom);
    context.closePath();
    context.fillStyle = fill;
    context.fill();

    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else {
        const previous = points[index - 1];
        const midpoint = (previous.x + point.x) / 2;
        context.bezierCurveTo(midpoint, previous.y, midpoint, point.y, point.x, point.y);
      }
    });
    const stroke = context.createLinearGradient(0, 0, width, 0);
    stroke.addColorStop(0, "#9d64f0");
    stroke.addColorStop(.6, "#be68ed");
    stroke.addColorStop(1, "#e67ec4");
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.stroke();

    points.forEach((point, index) => {
      context.beginPath();
      context.arc(point.x, point.y, index === 4 ? 3.3 : 2.3, 0, Math.PI * 2);
      context.fillStyle = "#1c1425";
      context.fill();
      context.strokeStyle = index === 4 ? "#f0a3dd" : "#c47ee9";
      context.lineWidth = index === 4 ? 2 : 1.5;
      context.stroke();
    });
  }

  canvas.addEventListener("pointermove", (event) => {
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const nearest = points.reduce((best, point) => Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best, points[0]);
    if (Math.abs(nearest.x - x) > 24) {
      tooltip.hidden = true;
      return;
    }
    tooltip.textContent = `${nearest.label}  ·  ${nearest.value} findings`;
    tooltip.style.left = `${nearest.x}px`;
    tooltip.style.top = `${Math.max(14, nearest.y)}px`;
    tooltip.hidden = false;
  });
  canvas.addEventListener("pointerleave", () => { tooltip.hidden = true; });
  const observer = new ResizeObserver(() => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(draw);
  });
  observer.observe(canvas);
  draw();
}

tableBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-pr-id]");
  if (row) selectPullRequest(row.dataset.prId);
});
tableBody.addEventListener("keydown", (event) => {
  const row = event.target.closest("tr[data-pr-id]");
  if (row && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    selectPullRequest(row.dataset.prId);
  }
});
searchInput.addEventListener("input", renderRows);
document.querySelectorAll(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    activeFilter = chip.dataset.filter;
    renderRows();
  });
});

document.getElementById("repoPicker").addEventListener("click", () => {
  const button = document.getElementById("repoPicker");
  const menu = document.getElementById("repoMenu");
  const isOpen = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!isOpen));
  menu.hidden = isOpen;
});
document.querySelectorAll("#repoMenu [role='option']").forEach((option) => {
  option.addEventListener("click", () => {
    const repo = option.dataset.repo;
    const parts = repo.split("/");
    document.getElementById("currentRepo").innerHTML = `${escapeHtml(parts[0])}/<strong>${escapeHtml(parts[1])}</strong>`;
    document.getElementById("activityRepo").textContent = parts[1];
    document.querySelectorAll("#repoMenu [role='option']").forEach((item) => {
      item.setAttribute("aria-selected", String(item === option));
      item.querySelector(".selected-mark")?.remove();
    });
    const mark = document.createElement("span");
    mark.className = "selected-mark";
    mark.textContent = "✓";
    option.appendChild(mark);
    document.getElementById("repoMenu").hidden = true;
    document.getElementById("repoPicker").setAttribute("aria-expanded", "false");
    showToast(`Showing sample data for ${repo}`);
  });
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".repo-picker-wrap")) {
    document.getElementById("repoMenu").hidden = true;
    document.getElementById("repoPicker").setAttribute("aria-expanded", "false");
  }
});

document.getElementById("scanButton").addEventListener("click", (event) => {
  const button = event.currentTarget;
  if (button.disabled) return;
  button.disabled = true;
  button.classList.add("loading");
  button.querySelector("span").textContent = "Scanning demo…";
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    button.disabled = false;
    button.classList.remove("loading");
    button.querySelector("span").textContent = "Try a sample scan";
    document.getElementById("lastScanTime").textContent = "Just now";
    document.getElementById("activityScanTime").textContent = "just now";
    showToast("Sample scan complete · 7 example findings to review");
  }, 1450);
});

document.querySelectorAll("[data-modal]").forEach((button) => {
  button.addEventListener("click", () => openModal(button.dataset.modal));
});
document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("modalDone").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
    document.getElementById("repoMenu").hidden = true;
    document.getElementById("repoPicker").setAttribute("aria-expanded", "false");
    document.getElementById("mainNav").classList.remove("open");
    document.getElementById("mobileMenuBtn").setAttribute("aria-expanded", "false");
    document.getElementById("mobileMenuBtn").setAttribute("aria-label", "Open navigation");
  }
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
});
document.getElementById("copyStatement").addEventListener("click", () => copyText(currentPullRequest().outdated, "Documentation statement copied"));
document.getElementById("copySuggestion").addEventListener("click", () => copyText(currentPullRequest().suggestion, "Suggested correction copied"));
document.getElementById("viewAllButton").addEventListener("click", () => {
  activeFilter = "all";
  searchInput.value = "";
  renderRows();
  searchInput.focus();
});
document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach((navLink) => {
      const isActive = navLink === link;
      navLink.classList.toggle("active", isActive);
      if (isActive) navLink.setAttribute("aria-current", "page");
      else navLink.removeAttribute("aria-current");
    });
    document.getElementById("mainNav").classList.remove("open");
    document.getElementById("mobileMenuBtn").setAttribute("aria-expanded", "false");
    document.getElementById("mobileMenuBtn").setAttribute("aria-label", "Open navigation");
  });
});
function syncNavigationToHash() {
  const activeLink = [...document.querySelectorAll(".nav-link")].find((link) => link.getAttribute("href") === window.location.hash);
  if (activeLink) {
    document.querySelectorAll(".nav-link").forEach((link) => {
      const isActive = link === activeLink;
      link.classList.toggle("active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }
}
window.addEventListener("hashchange", syncNavigationToHash);
syncNavigationToHash();
document.getElementById("mobileMenuBtn").addEventListener("click", (event) => {
  const menu = document.getElementById("mainNav");
  const open = !menu.classList.contains("open");
  menu.classList.toggle("open", open);
  event.currentTarget.setAttribute("aria-expanded", String(open));
  event.currentTarget.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
});

uploadDropzone.addEventListener("click", () => documentInput.click());
uploadDropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  uploadDropzone.classList.add("drag-active");
});
uploadDropzone.addEventListener("dragleave", (event) => {
  if (!uploadDropzone.contains(event.relatedTarget)) uploadDropzone.classList.remove("drag-active");
});
uploadDropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  uploadDropzone.classList.remove("drag-active");
  handleDocumentSelection(event.dataTransfer.files);
});
documentInput.addEventListener("change", (event) => {
  handleDocumentSelection(Array.from(event.currentTarget.files));
  event.currentTarget.value = "";
});
document.getElementById("replaceDocument").addEventListener("click", () => {
  cancelUpload();
  documentInput.click();
});
document.getElementById("removeDocument").addEventListener("click", () => {
  clearSelectedDocument();
  uploadButton.disabled = true;
  showUploadError("");
});
uploadButton.addEventListener("click", startDemoUpload);

renderRows();
setupChart();
