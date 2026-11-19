# Implemented features

## Live mode (default)

- Validates normal public GitHub repository URLs through the backend.
- Lists open pull requests using current GitHub API data, including number, title, author, status, and link.
- Retrieves changed paths and available diff patches for a selected PR.
- Retrieves relevant README and supported documentation from the repository.
- Runs rule-based code/documentation comparison and returns the completed result by ID.
- Shows actual counts for open PRs, retrieved changed files, documents, and verified findings.
- Clearly separates request errors, unavailable data, completed zero-finding results, and analysis failures.
- Clears stale results when a repository or PR selection changes and supports retries.
- Analysis Results displays actual backend findings with source/documentation files, evidence, suggestion, severity, and confidence.

## Optional AI

NVIDIA NIM, BharatCode, and generic OpenAI-compatible providers can be configured through backend environment settings. AI results are optional and pass an evidence-verification gate. The rule engine remains the fallback. Configuration status alone is not proof of provider connectivity.

## Demo and appearance

The dashboard's demo preview is explicitly labeled and available only after choosing **Open demo preview**. Its sample numbers/findings are illustrative, not live API data. Light and dark themes are available and the selected theme persists in the browser.

## Not implemented

Server-side document upload, persistent analysis history, private-repository authorization, and a production CI check are not implemented. See [LIMITATIONS.md](LIMITATIONS.md).
