# TRACE LENS

TRACE LENS checks whether a pull request changed behavior that repository documentation still describes differently. It retrieves a public GitHub pull request diff and related documentation, compares them with conservative rules, and reports only findings with source evidence.

**Live website:** https://trace-lens-id9k.onrender.com/

## What is implemented

- Live validation of public GitHub repository URLs and retrieval of actual open pull requests.
- Retrieval of pull request metadata, changed files and available patches, plus relevant README/documentation files.
- Rule-based comparisons for documented defaults, ranges, and newly exported symbols.
- Optional OpenAI-compatible AI providers, including NVIDIA NIM and BharatCode. AI suggestions are accepted only when evidence matches both a changed diff line and retrieved documentation; rule analysis remains available as fallback.
- Analysis results with source/documentation paths, evidence excerpts, suggested corrections, severity, confidence, and warnings.
- An explicit demo preview that is separate from the live workflow. Live mode is the default and does not display sample repository metrics or findings.
- Light/dark theme selection.

Document upload is **unavailable**. The upload page does not select, transmit, store, or analyze files. Live analysis uses supported documents fetched from the selected public GitHub repository.

## Architecture

The Express application in `backend/src` is the production server. It serves the frontend and JSON API from one origin, retrieves public GitHub data, runs rule-based analysis, optionally calls a configured AI provider, and keeps analysis results in memory. The separate FastAPI app in `backend/app` is a health-only scaffold and is not part of the production flow.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/FEATURES.md](docs/FEATURES.md), and [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Run locally

Requirements: Node.js 20 or newer.

From the repository root in PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm --prefix backend ci
npm --prefix backend start
```

Open `http://localhost:3000/`. The dashboard starts in live mode. Enter a public GitHub repository URL, validate it, select an open pull request, inspect the retrieved changed files and documentation, then analyze it. The **Open demo preview** control is the only way to show illustrative sample data.

Run backend tests:

```powershell
npm --prefix backend test
```

More checks are listed in [docs/TESTING.md](docs/TESTING.md).

## Environment variables

Put local settings in the root `.env`; configure deployment values in the Render service's Environment settings. Do not commit `.env` or paste secret values into source code, frontend files, documentation, or chat.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | HTTP port; defaults to `3000`. Render supplies its own port. |
| `GITHUB_TOKEN` | No | Optional server-side GitHub token to increase API rate limits. Public repositories can be read without it. |
| `AI_PROVIDER` | No | Select `nvidia-nim`, `bharatcode`, or `openai-compatible`. |
| `NVIDIA_NIM_API_KEY` | For NVIDIA NIM | NVIDIA key, read only by the backend. |
| `NVIDIA_NIM_BASE_URL` | No | Defaults to `https://integrate.api.nvidia.com/v1`. |
| `NVIDIA_NIM_MODEL` | For NVIDIA NIM | Model identifier; `.env.example` contains a documented example. Confirm account/model availability with NVIDIA. |
| `AI_API_KEY` | For generic provider | Server-side key for an OpenAI-compatible API. |
| `AI_BASE_URL` | For generic provider | HTTPS API base URL. |
| `AI_MODEL` | For generic provider | Model identifier supported by that endpoint. |
| `BHARATCODE_API_KEY` | For BharatCode | Legacy provider key, read only by the backend. |
| `BHARATCODE_BASE_URL` | No | BharatCode endpoint override. |
| `BHARATCODE_MODEL` | For BharatCode | BharatCode model identifier. |
| `CORS_ORIGIN` | No | Comma-separated browser origins permitted to call the API. |

AI analysis is optional. The health endpoint reports whether configuration is complete but does not check connectivity. A provider is reported as used only after a successful response, valid parsing, and evidence verification. Missing or failing AI configuration falls back to rules. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Render configuration steps.

## API

All endpoints are under `/api`. Successful responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": { "code": "...", "message": "..." } }`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Backend health and non-secret AI configuration status. |
| `POST` | `/api/repositories/validate` | Validate `{ "repositoryUrl": "https://github.com/owner/repository" }`. |
| `GET` | `/api/repositories/:owner/:repo/pulls` | List pull requests; optional `state=open`, `closed`, or `all`. |
| `GET` | `/api/repositories/:owner/:repo/pulls/:pullNumber` | Pull request metadata. |
| `GET` | `/api/repositories/:owner/:repo/pulls/:pullNumber/files` | Changed file list and available patches. |
| `GET` | `/api/repositories/:owner/:repo/documentation?pullNumber=:number` | Fetch and rank supported repository documentation for a PR. |
| `POST` | `/api/repositories/:owner/:repo/pulls/:pullNumber/analyze` | Run rule analysis; optional body `{ "useAi": true }`. |
| `GET` | `/api/analysis/:analysisId` | Retrieve an in-memory completed result. |

See [docs/API.md](docs/API.md) for request, response, and error details.

## Analysis limitations

- Only public repositories are supported; user-specific GitHub authorization and private repository access are not implemented.
- Supported documentation is limited to root README/CONTRIBUTING files and `.md`, `.mdx`, `.rst`, `.adoc`, or `.txt` files under `docs/`, `doc/`, or `documentation/`.
- Analysis is bounded to 300 changed files, 12 documentation files, 64 KB per document, and 240 KB total documentation. GitHub may omit patches for some files.
- Rules do not understand every semantic code/documentation relationship. A zero-finding result means no mismatch was verified by the implemented checks, not proof that documentation is complete.
- AI output is optional and evidence-gated. Production NVIDIA connectivity is not claimed unless a real provider request succeeds.
- Results are stored in memory for up to 30 minutes and disappear on restart. There is no persistent analysis history.
- Uploads are not implemented; documents are fetched from GitHub instead.
- Analysis requests are limited to five per IP per minute using an in-memory limiter. This is not authentication or a durable cross-instance quota.

## Render deployment

The production service is `trace-lens` at https://trace-lens-id9k.onrender.com/. Keep the repository root as the Render root directory so Express can serve frontend assets. Use:

- Build command: `npm --prefix backend ci`
- Start command: `npm --prefix backend start`
- Health check path: `/api/health`

The checked-in [render.yaml](render.yaml) contains these settings. Configure optional provider variables as Render environment secrets; never put credentials in the Blueprint or frontend. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Project guides

- [API reference](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Implemented features](docs/FEATURES.md)
- [Known limitations](docs/LIMITATIONS.md)
- [Testing](docs/TESTING.md)
- [Demonstration script](presentation/DEMONSTRATION-SCRIPT.md)
- [NotebookLM video prompt](presentation/NOTEBOOKLM-VIDEO-PROMPT.md)
