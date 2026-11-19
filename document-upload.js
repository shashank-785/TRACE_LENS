"use strict";

const uploadDropzone = document.getElementById("uploadDropzone");
const documentInput = document.getElementById("documentInput");
const uploadFileCard = document.getElementById("uploadFileCard");
const uploadError = document.getElementById("uploadError");
const uploadButton = document.getElementById("uploadButton");
const uploadProgressTrack = document.getElementById("uploadProgressTrack");
const uploadProgressFill = document.getElementById("uploadProgressFill");
const uploadStatus = document.getElementById("uploadStatus");
const uploadToast = document.getElementById("uploadToast");
const maxDocumentSize = 20 * 1024 * 1024;
const allowedDocumentTypes = new Set(["pdf", "doc", "docx", "md", "txt"]);
let selectedDocument = null;
let uploadTimer;
let toastTimer;

function showToast(message) {
  document.getElementById("uploadToastMessage").textContent = message;
  uploadToast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => uploadToast.classList.remove("visible"), 2300);
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
  uploadButton.querySelector("span").textContent = "Prepare document";
  setUploadProgress(0, "Ready to prepare");
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
  uploadButton.querySelector("span").textContent = "Preparing…";
  let progress = 0;
  setUploadProgress(progress, "Preparing in this browser…");
  uploadTimer = window.setInterval(() => {
    progress = Math.min(progress + 5, 100);
    setUploadProgress(progress, progress === 100 ? "Demo preparation complete" : `Preparing… ${progress}%`);
    if (progress === 100) {
      window.clearInterval(uploadTimer);
      uploadTimer = null;
      uploadFileCard.classList.remove("is-uploading");
      uploadFileCard.classList.add("is-complete");
      uploadButton.classList.remove("loading");
      uploadButton.querySelector("span").textContent = "Prepared";
      showToast("Demo document is ready for analysis");
    }
  }, 50);
}

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
  showUploadError("");
});
uploadButton.addEventListener("click", startDemoUpload);

const mobileMenuButton = document.getElementById("mobileMenuBtn");
const mainNavigation = document.getElementById("mainNav");

mobileMenuButton.addEventListener("click", () => {
  const isOpen = mobileMenuButton.getAttribute("aria-expanded") !== "true";
  mobileMenuButton.setAttribute("aria-expanded", String(isOpen));
  mobileMenuButton.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  mainNavigation.classList.toggle("open", isOpen);
});
mainNavigation.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mobileMenuButton.setAttribute("aria-expanded", "false");
    mobileMenuButton.setAttribute("aria-label", "Open navigation");
    mainNavigation.classList.remove("open");
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    mobileMenuButton.setAttribute("aria-expanded", "false");
    mobileMenuButton.setAttribute("aria-label", "Open navigation");
    mainNavigation.classList.remove("open");
  }
});
window.addEventListener("beforeunload", () => window.clearInterval(uploadTimer));
