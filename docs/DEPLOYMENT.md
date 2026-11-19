# Deployment

## Render service

Public website: https://trace-lens-id9k.onrender.com/
Health endpoint: https://trace-lens-id9k.onrender.com/api/health

The Render Web Service must use the repository root as its root directory because Express serves frontend files outside `backend/`.

- Build command: `npm --prefix backend ci`
- Start command: `npm --prefix backend start`
- Health check path: `/api/health`
- Deployment branch: `main`

These settings are also represented in `render.yaml`.

## Optional environment settings

Set values in the Render service's Environment settings, not in source files or `render.yaml`.

- `GITHUB_TOKEN` is optional and server-side only; it can increase GitHub API limits.
- For NVIDIA NIM, set `AI_PROVIDER=nvidia-nim`, `NVIDIA_NIM_API_KEY`, and `NVIDIA_NIM_MODEL`. `NVIDIA_NIM_BASE_URL` defaults to `https://integrate.api.nvidia.com/v1`.
- For BharatCode, select `AI_PROVIDER=bharatcode` and configure the BharatCode variables.
- For a generic OpenAI-compatible service, set `AI_PROVIDER=openai-compatible`, `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL`.
- AI is optional. If provider configuration is absent or a call fails, rule-based analysis continues.

Do not reveal, print, or copy secret values when checking settings. `/api/health` reports whether AI settings are complete but does not make a provider request.

## Verify a deployment

1. In Render, confirm the service deploys from `main` and the successful deployed commit matches GitHub `main`.
2. Inspect the deploy log for checkout, successful build, and the Express listening message.
3. Request `/api/health` and the public homepage.
4. Validate a public repository and run a representative PR analysis.
5. Report AI as connected only after a real provider request succeeds. If no provider call was made, report `not_checked`.

Render free instances may spin down. Analysis results are process-local and are lost after restarts.
