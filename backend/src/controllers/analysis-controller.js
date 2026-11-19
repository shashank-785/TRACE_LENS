"use strict";

function createAnalysisController(analysisService) {
  return {
    getResult: (req, res) => {
      const data = analysisService.getResult(req.params.analysisId);
      res.json({ success: true, data });
    }
  };
}

module.exports = { createAnalysisController };
