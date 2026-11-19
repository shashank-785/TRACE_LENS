# Architecture

## Production path

Render runs the Express application from `backend/src`. Express serves the HTML, CSS, and JavaScript from the repository root and exposes JSON endpoints under `/api`. The frontend calls the same origin, so production does not need a separate API hostname or browser-visible credentials.

```text
Browser
  -> Express frontend routes
  -> /api/repositories/* and /api/analysis/*
  -> GitHub REST API
  -> rule-analysis.js
  -> optional OpenAI-compatible provider
  -> evidence validation
  -> in-memory analysis result
```

## Request flow

1. The dashboard validates a public GitHub repository URL.
2. The GitHub service confirms that it is public and lists current open pull requests.
3. Selecting a PR retrieves its metadata, changed files and available patches, then ranks and fetches supported repository documentation.
4. The rule engine compares changed code lines with retrieved documentation. It does not emit a finding merely because a file changed.
5. If explicitly requested and configured, an AI provider may propose additional findings. The analysis service retains a proposal only if its code excerpt matches a changed diff line and its documentation excerpt occurs in a fetched document.
6. Results include evidence, severity, qualitative confidence, provider status, and warnings. The frontend distinguishes completed zero-finding results from request failures.

## Components

- `backend/src/routes/repositories.js` defines repository and rate-limited analysis routes.
- `backend/src/controllers/repository-controller.js` validates route input and connects routes to services.
- `backend/src/services/github-service.js` calls GitHub's public REST API, limits retrieved content, and reports upstream failures.
- `backend/src/services/rule-analysis.js` detects a limited set of documented defaults, ranges, and exported symbols.
- `backend/src/services/analysis-service.js` combines rules with optional AI suggestions, validates evidence, and stores results temporarily.
- `backend/src/services/openai-compatible-service.js` handles optional provider requests without exposing keys to the browser.
- `live-dashboard.js` drives the default live repository workflow. `analysis-results.js` displays a retrieved result or runs an analysis.
- `script.js` powers an explicit demo preview only.

The FastAPI application under `backend/app` is a separate health-only scaffold; it is not used by the production dashboard.

## Data and trust boundaries

GitHub and provider credentials are read from backend environment variables. Provider connectivity is not inferred from configuration alone. AI output is untrusted until evidence verification passes. The API supports public repositories only; it is not an authenticated multi-user service. Analysis results are held in process memory for up to 30 minutes.
