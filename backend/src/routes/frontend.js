"use strict";

const path = require("node:path");
const express = require("express");

const frontendRoot = path.resolve(__dirname, "../../../");
const frontendFiles = new Map([
  ["/index.html", "index.html"],
  ["/document-upload.html", "document-upload.html"],
  ["/analysis-results.html", "analysis-results.html"],
  ["/style.css", "style.css"],
  ["/script.js", "script.js"],
  ["/document-upload.js", "document-upload.js"],
  ["/analysis-results.js", "analysis-results.js"]
]);

function createFrontendRouter() {
  const router = express.Router();
  router.get("/", (req, res, next) => sendFile(res, "index.html", next));
  router.get([...frontendFiles.keys()], (req, res, next) => {
    const fileName = frontendFiles.get(req.path);
    if (!fileName) return next();
    return sendFile(res, fileName, next);
  });
  return router;
}

function sendFile(res, fileName, next) {
  res.sendFile(path.join(frontendRoot, fileName), (error) => {
    if (error) next(error);
  });
}

module.exports = { createFrontendRouter };
