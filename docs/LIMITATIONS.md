# Limitations

- **Public repositories only:** no per-user GitHub OAuth or private repository support.
- **Bounded retrieval:** at most 300 changed files, 12 documents, 64 KB per document, and 240 KB total documentation. GitHub may omit some diff patches.
- **Limited rules:** the rule engine handles a small set of configuration defaults/ranges and exported-symbol cases. It cannot establish that all documentation is correct.
- **Test sources are excluded:** test/spec files are not treated as runtime configuration, avoiding findings based on fixture values.
- **AI is optional:** configured-provider status is not a successful connection test. AI suggestions are rejected unless code and documentation excerpts match fetched evidence. Rule-based analysis remains the fallback.
- **No upload:** the upload page is explicitly unavailable. Local files are not selected, uploaded, stored, or analyzed.
- **Ephemeral results:** analysis records are in memory for up to 30 minutes and disappear on restart; there is no durable history.
- **Basic rate limit:** analysis is capped at five requests per client IP per minute in an in-memory limiter. There is no user authentication or cross-instance quota.
- **No CI gate:** this version is a web workflow, not an automatic pull-request status check.
- **Separate scaffold:** `backend/app` is a health-only FastAPI scaffold and is not part of the production Express deployment.
