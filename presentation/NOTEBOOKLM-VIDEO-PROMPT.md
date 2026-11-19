# NotebookLM video prompt

Create a concise, factual explainer video for the TRACE LENS hackathon project.

Explain the problem: a code change can make README or setup instructions wrong even when the pull request tests pass. Present TRACE LENS as a reviewer aid that connects to a public GitHub repository, lists real open pull requests, retrieves changed code and supported documentation, and compares them with conservative rules. Explain that a finding is only retained when source and documentation evidence are present, and that a completed analysis can legitimately return zero findings.

Show the user journey on the live site: validate a public repository, select a pull request, inspect changed files and documentation, run analysis, and open the result. Distinguish the explicitly labeled demo preview from live API data. State that analysis results are temporary and that private repositories, server-side file upload, persistent history, and automatic CI checks are not implemented.

Describe the Express backend and GitHub REST API. Mention that optional OpenAI-compatible AI providers can be configured on the backend, but do not claim a live NVIDIA or BharatCode connection unless the operator supplies a separately verified successful request. Rule-based analysis works without AI.

Use the verified public website URL: https://trace-lens-id9k.onrender.com/. Do not invent findings, screenshots, deployment results, provider responses, statistics, or capabilities. Present the project as an evidence-oriented prototype with clear limitations.
