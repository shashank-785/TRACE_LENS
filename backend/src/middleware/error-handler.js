"use strict";

const { AppError } = require("../utils/app-error");

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "The requested endpoint was not found." }
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof AppError) {
    return res.status(error.status).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {})
      }
    });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: { code: "REQUEST_TOO_LARGE", message: "The request body is too large." }
    });
  }
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_JSON", message: "The request body must be valid JSON." }
    });
  }

  console.error(`[api] ${req.method} ${req.path}`, error);
  return res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." }
  });
}

module.exports = { errorHandler, notFoundHandler };
