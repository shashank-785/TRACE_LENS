# Testing

## Automated checks

Run from the repository root in PowerShell:

```powershell
npm --prefix backend test
node --check script.js
node --check live-dashboard.js
node --check analysis-results.js
node --check document-upload.js
git diff --check
```

The backend tests use mocked GitHub and OpenAI-compatible requests. They cover repository URL validation, pull request and documentation routes, changed-file handling, empty PR lists, missing patches, GitHub not-found/rate-limit/network failures, rule analysis, provider errors, evidence validation, fallback, CORS, and frontend asset serving. Mocked provider tests do not establish live AI connectivity.

## Manual live smoke test

1. Start the server with `npm --prefix backend start`.
2. Request `http://localhost:3000/api/health`; confirm `status` is `ok`. `connectivity: "not_checked"` means the AI provider has not been called.
3. Open `http://localhost:3000/`; confirm live mode is the default and no sample metrics are displayed.
4. Enter a public GitHub URL, validate it, inspect real PR titles/authors/states, select a PR, and confirm the changed-file and documentation paths load.
5. Analyze once. Confirm a completed zero-finding result is distinct from an error. Open the results page and verify its evidence comes from the same saved result.
6. Try an invalid URL, nonexistent repository, and repository with no open PRs. Verify errors/empty states are explicit and retry is available.
7. Open Document Upload. It should report that upload is unavailable and should not open a file picker or claim success.
8. Select **Open demo preview** only when illustrative sample data is desired.

One recorded live public-repository check validated `shashank-785/TRACE_LENS`, retrieved open PRs #17, #16, and #15, retrieved PR #17's changed files and README, and completed a rule-based analysis with zero evidence-backed findings. This was a real GitHub workflow; it was not an AI-provider connectivity test.
