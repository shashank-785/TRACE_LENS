# TRACE LENS

TRACE LENS compares changes in a GitHub pull request with repository documentation and reports only findings that include evidence from the pull request diff and fetched documentation.

The frontend is served by the optional Express backend. Without GitHub or BharatCode credentials, the server still starts; public GitHub repositories can be checked without a token and analysis uses local rules.

## Run locally

Requirements: Node.js 20 or newer.

From the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
Set-Location backend
npm install
npm start
```

Open `http://localhost:3000/`. Check server health at `http://localhost:3000/api/health`. To run tests, use `npm test` from the `backend` directory.

The sample dashboard continues to work without the backend. To use GitHub analysis, open the Analysis Results page served by Express, enter a public GitHub repository URL, validate it, choose an open pull request, and select **Analyze pull request**. Sample findings are replaced only after the backend completes and a result can be retrieved.

The Document Upload page is currently a frontend-only demo: file selection and progress are simulated in the browser. Files are not sent to the backend or used in pull request analysis.

## Environment variables

Set these in the root `.env` for local development or in the Render service settings. Never put secrets in frontend files.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | HTTP port; defaults to `3000`. Render can supply this automatically. |
| `GITHUB_TOKEN` | No | Optional server-side token for GitHub REST API rate limits. Public repositories work without it. |
| `BHARATCODE_API_KEY` | No | BharatCode API credential. Leave empty to use rule-based analysis. |
| `BHARATCODE_BASE_URL` | No | OpenAI-compatible BharatCode API base URL. Must be set with the key and model to enable AI. |
| `BHARATCODE_MODEL` | No | Model name configured for the BharatCode endpoint. Must be set with the key and base URL. |
| `CORS_ORIGIN` | No | Comma-separated exact browser origins allowed to call the API; defaults to local frontend preview origins. |

Copy `.env.example` to `.env` and add credentials only to the local `.env` file. `.env` is ignored by Git. BharatCode analysis is opt-in in the UI because the selected public pull request diff and fetched documentation are sent to the configured AI endpoint when enabled.

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
- Pull request analysis is limited to 300 changed files, 12 documentation files, 64 KB per documentation file, and 240 KB of documentation total. Larger repositories or diffs may produce incomplete results.
- Analysis results are held in memory for up to 30 minutes and are lost when the process restarts.
- API endpoints do not require user authentication or implement rate limiting. Put the service behind appropriate access controls and request limits before exposing an AI-enabled deployment publicly.

## Deploy on Render

The backend serves the frontend pages and API from one origin, so deploy them as a single Render Web Service. The root directory must remain the repository root: the Express frontend routes serve files located outside `backend/`.

The included `render.yaml` configures the service. If setting it up manually, leave **Root Directory** blank and use:

1. **Build Command:** `npm --prefix backend ci`
2. **Start Command:** `npm --prefix backend start`
3. **Health Check Path:** `/api/health`

The service uses Render's `PORT` automatically and can start without API credentials. Public repository analysis uses GitHub's unauthenticated API by default; add an optional `GITHUB_TOKEN` only through Render's environment settings if needed for rate limits. Keep BharatCode credentials unset unless AI analysis is intentionally enabled. Because the frontend and API share an origin, a separate static site and production API URL are not needed.

Render's free web services may spin down after inactivity, causing a delay on the first request. Analysis results are in memory and disappear when the service restarts.
