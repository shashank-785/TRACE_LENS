# API reference

Production base URL: `https://trace-lens-id9k.onrender.com/api`. Local base URL: `http://localhost:3000/api`.

All responses use one of these envelopes:

```json
{ "success": true, "data": {} }
```

```json
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Actionable message." } }
```

## Endpoints

| Method | Path | Request | Result |
| --- | --- | --- | --- |
| `GET` | `/health` | None | Backend status, AI provider name/configuration, and `connectivity: "not_checked"`. Never returns keys. |
| `POST` | `/repositories/validate` | `{ "repositoryUrl": "https://github.com/owner/repository" }` | Validated public repository metadata. |
| `GET` | `/repositories/:owner/:repo/pulls` | Optional `?state=open`, `closed`, or `all` | Repository metadata and actual GitHub PR numbers, titles, authors, states, and URLs. |
| `GET` | `/repositories/:owner/:repo/pulls/:pullNumber` | None | PR metadata, including GitHub's changed-file count. |
| `GET` | `/repositories/:owner/:repo/pulls/:pullNumber/files` | None | Changed file metadata and a patch when GitHub provides one. Missing patches are represented as empty strings. |
| `GET` | `/repositories/:owner/:repo/documentation?pullNumber=:number` | Optional PR number to rank docs against changed paths | Retrieved supported documents and truncation metadata. |
| `POST` | `/repositories/:owner/:repo/pulls/:pullNumber/analyze` | Optional `{ "useAi": true }` | `201` with an `analysisId`, provider/AI status, warnings, and evidence-checked findings. |
| `GET` | `/analysis/:analysisId` | None | Previously completed result while it remains in process memory. |

Example:

```powershell
$body = @{ repositoryUrl = "https://github.com/owner/repository" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/repositories/validate" -Method Post -ContentType "application/json" -Body $body
```

## Errors and limits

Invalid URLs and input return `400`; private repositories return `403`; missing repositories or pull requests return `404`; GitHub timeouts, rate limits, and upstream errors return safe messages without credentials. Analysis requests are limited to five per IP per minute. GitHub results may be incomplete when patches are unavailable or the repository exceeds the document/file limits described in [LIMITATIONS.md](LIMITATIONS.md).

Document upload is not an API feature. The browser does not send local files to the server.
