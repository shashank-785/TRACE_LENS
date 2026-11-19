# TRACE LENS

TRACE LENS compares changes in a GitHub pull request with repository documentation and reports only findings that include evidence from the pull request diff and fetched documentation.

The frontend is served by the Express backend. Without GitHub or AI-provider credentials, the server still starts; public GitHub repositories can be checked without a token and analysis uses local rules.

## Run locally

Requirements: Node.js 20 or newer.

From the repository root in PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm --prefix backend ci
npm --prefix backend start
```

Open `http://localhost:3000/`. Check server health at `http://localhost:3000/api/health`. To run tests from the repository root, use `npm --prefix backend test`.

The sample dashboard continues to work without the backend. To use GitHub analysis, open the Analysis Results page served by Express, enter a public GitHub repository URL, validate it, choose an open pull request, and select **Analyze pull request**. Sample findings are replaced only after the backend completes and a result can be retrieved.

The Document Upload page is currently a frontend-only demo: file selection and progress are simulated in the browser. Files are not sent to the backend or used in pull request analysis.

## Environment variables

Set these in the root `.env` for local development or in the Render service settings. Never put secrets in frontend files.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | HTTP port; defaults to `3000`. Render can supply this automatically. |
| `GITHUB_TOKEN` | No | Optional server-side token for GitHub REST API rate limits. Public repositories work without it. |
| `AI_PROVIDER` | No | Select `nvidia-nim`, `bharatcode`, or `openai-compatible`. If unset, configured NVIDIA NIM values take precedence, followed by generic settings and then legacy BharatCode. |
| `NVIDIA_NIM_API_KEY` | For NVIDIA NIM | NVIDIA API key, read only by the backend. |
| `NVIDIA_NIM_BASE_URL` | No | NVIDIA NIM OpenAI-compatible base URL; defaults to `https://integrate.api.nvidia.com/v1`. |
| `NVIDIA_NIM_MODEL` | For NVIDIA NIM | NVIDIA-served model ID. The official NVIDIA catalog's Chat Completions example uses `nvidia/llama-3.1-nemotron-70b-instruct` ([model page](https://build.nvidia.com/nvidia/llama-3_1-nemotron-70b-instruct)). Availability may depend on the NVIDIA endpoint/account. |
| `AI_API_KEY` | No | Server-side API key. Required with `AI_BASE_URL` and `AI_MODEL`; otherwise rule-based analysis is used. |
| `AI_BASE_URL` | No | HTTPS base URL for an OpenAI-compatible Chat Completions API. The provider endpoint is never called unless the key, base URL, and model are all configured. |
| `AI_MODEL` | No | Model identifier supported by the configured provider. Required with `AI_API_KEY` and `AI_BASE_URL`. |
| `CORS_ORIGIN` | No | Comma-separated exact browser origins allowed to call the API; defaults to local frontend preview origins. |

Copy `.env.example` to `.env` if it does not already exist. For NVIDIA, set `AI_PROVIDER=nvidia-nim`, `NVIDIA_NIM_API_KEY`, and `NVIDIA_NIM_MODEL`; the base URL defaults to NVIDIA's documented `https://integrate.api.nvidia.com/v1` and can be overridden. NVIDIA NIM uses the OpenAI-compatible `POST /chat/completions` request format. To select the legacy integration, set `AI_PROVIDER=bharatcode`; for another compatible service, set `AI_PROVIDER=openai-compatible` and configure the `AI_*` values. If the provider is not configured or a request fails, TRACE LENS continues with rule-based analysis. `.env` is ignored by Git. Never place credentials in frontend files or commit `.env`.

AI analysis is opt-in in the UI. When enabled, the selected public pull request diff and fetched documentation are sent to the configured provider. `/api/health` reports whether settings are complete; it does not test provider connectivity. An AI result is reported as used only after a successful, complete response has been parsed and its evidence verified.

On Render, set `AI_PROVIDER=nvidia-nim`, `NVIDIA_NIM_API_KEY`, and `NVIDIA_NIM_MODEL` in the web service's **Environment** settings to use NVIDIA NIM. `NVIDIA_NIM_BASE_URL` is optional and defaults to NVIDIA's API URL. Keep the API key only in Render's secret environment setting; do not add it to `render.yaml`. AI is optional and does not block rule-based analysis or deployment.

## API

All responses use `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code": "...", "message": "..." } }`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Server and AI configuration status; never returns credentials. |
| `POST` | `/api/repositories/validate` | Validate `{ "repositoryUrl": "https://github.com/owner/repository" }`. |
| `GET` | `/api/repositories/:owner/:repo/pulls` | List pull requests; optional `state=open`, `closed`, or `all`. |
| `GET` | `/api/repositories/:owner/:repo/pulls/:pullNumber` | Pull request metadata. |
| `GET` | `/api/repositories/:owner/:repo/pulls/:pullNumber/files` | Changed file paths and available patches. |
| `GET` | `/api/repositories/:owner/:repo/documentation` | Relevant README and documentation files. |
| `POST` | `/api/repositories/:owner/:repo/pulls/:pullNumber/analyze` | Analyze a pull request; optional body `{ "useAi": true }`. |
| `GET` | `/api/analysis/:analysisId` | Retrieve the completed analysis result. |

## Analysis limits and safety

- Only public GitHub repositories are supported. Private repositories are rejected even if `GITHUB_TOKEN` can access them; per-user GitHub authorization is not implemented.
- GitHub credentials stay on the backend. `GITHUB_TOKEN` is never sent to the browser.
- The analyzer checks changed lines against retrieved documentation. AI findings are kept only when both evidence excerpts exactly match the supplied diff and documentation. The rule-based fallback checks changed configuration values and newly exported symbols absent from the fetched docs; it does not claim to understand every kind of documentation drift.
- Findings include qualitative evidence confidence, not a probability: exact value/range comparisons are high, evidence-verified AI findings are medium, and symbols absent from the limited fetched documentation set are low.
- Pull request analysis is limited to 300 changed files, 12 documentation files, 64 KB per documentation file, and 240 KB of documentation total. Larger repositories or diffs may produce incomplete results.
- Analysis results are held in memory for up to 30 minutes and are lost when the process restarts.
- The pull request analysis endpoint does not require user authentication and is limited to five requests per client IP per minute. This uses an in-memory limiter, so counts reset when the process restarts and are not shared across service instances; treat it as basic abuse mitigation, not authentication or a durable global quota.

## Backend architecture

The Express application in `backend/src` is the production backend deployed on Render. It serves the frontend and API, including the health check and rate-limited pull request analysis. PR #15 extends this Express backend.

The FastAPI application in `backend/app` is a separate, health-only scaffold retained temporarily for reference. It is not used by the dashboard or the current production deployment, and PR #15 does not depend on it.

## Deploy on Render

The backend serves the frontend pages and API from one origin, so deploy them as a single Render Web Service. The root directory must remain the repository root: the Express frontend routes serve files located outside `backend/`.

The included `render.yaml` configures the service. If setting it up manually, leave **Root Directory** blank and use:

1. **Build Command:** `npm --prefix backend ci`
2. **Start Command:** `npm --prefix backend start`
3. **Health Check Path:** `/api/health`

The service uses Render's `PORT` automatically and can start without API credentials. Public repository analysis uses GitHub's unauthenticated API by default; add an optional `GITHUB_TOKEN` only through Render's environment settings if needed for rate limits. Configure one AI provider only if AI analysis is intentionally enabled. Because the frontend and API share an origin, a separate static site and production API URL are not needed.

Render's free web services may spin down after inactivity, causing a delay on the first request. Analysis results are in memory and disappear when the service restarts.
