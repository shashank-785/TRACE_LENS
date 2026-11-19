# TRACE LENS demonstration

**Website:** https://trace-lens-id9k.onrender.com/

## Live workflow

1. Start on the default **LIVE MODE** dashboard. Point out that the counts are blank until a real repository response arrives; no sample metrics appear in this view.
2. Enter `https://github.com/shashank-785/TRACE_LENS` and validate it.
3. Show the real open pull request titles, authors, and states returned by GitHub.
4. Select an open PR. Show the actual changed-file count and retrieved documentation paths.
5. Run analysis. Explain that a zero-finding result is a completed result, not a failure, and that findings must include verifiable source and documentation evidence.
6. Open **View evidence and findings** to show the same completed backend result.
7. Show the backend and AI configuration indicators. Explain that configuration is not connectivity; rule analysis remains available when AI is not configured.
8. Open Document Upload and explain it is unavailable. The live analyzer fetches documentation from the public repository instead.
9. Optionally select **Open demo preview** to show illustrative data. Point out the DEMO labels and return to live mode.

## Recorded verification example

A real rule-based run against `shashank-785/TRACE_LENS#17` retrieved four changed files and `README.md`, then completed with zero evidence-backed findings. Results can change as the pull request changes; run the workflow live rather than presenting this as a permanent fixture. No successful NVIDIA request was made in that check.

## Closing

TRACE LENS reduces manual review effort by comparing changed code with repository documentation. It is a bounded, evidence-oriented prototype: it supports public repositories, uses conservative rules, and does not claim complete semantic coverage or a CI gate.
