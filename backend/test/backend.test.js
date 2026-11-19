"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const OpenAI = require("openai");
const { createApp } = require("../src/app");
const {
  DEFAULT_BHARATCODE_BASE_URL,
  DEFAULT_NVIDIA_NIM_BASE_URL,
  SUPPORTED_NVIDIA_NIM_MODEL,
  loadAIProviderSettings
} = require("../src/config/ai-provider");
const { AnalysisService, verifyAiFinding } = require("../src/services/analysis-service");
const { OpenAICompatibleService } = require("../src/services/openai-compatible-service");
const { GitHubService } = require("../src/services/github-service");
const { analyzeWithRules } = require("../src/services/rule-analysis");
const { AppError } = require("../src/utils/app-error");
const { parseRepositoryUrl } = require("../src/utils/repository-url");

const changedFiles = [{
  filename: "src/config/http.js",
  status: "modified",
  patch: "@@ -1 +1 @@\n-requestTimeoutMs: 60000\n+requestTimeoutMs: 30000"
}];
const documents = [{
  path: "README.md",
  content: "## Network configuration\nThe request timeout is 60 seconds by default."
}];

test("repository URL parser only accepts normal GitHub repository URLs", () => {
  assert.deepEqual(parseRepositoryUrl("https://github.com/acme/payments.git"), {
    owner: "acme",
    repo: "payments"
  });
  assert.throws(() => parseRepositoryUrl("https://github.com.evil.test/acme/payments"), AppError);
  assert.throws(() => parseRepositoryUrl("https://github.com/acme/payments/tree/main"), AppError);
  assert.throws(() => parseRepositoryUrl("http://github.com/acme/payments"), AppError);
});

test("rule analysis reports only a code value that conflicts with an actual documentation line", () => {
  const findings = analyzeWithRules(changedFiles, documents);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "Medium");
  assert.equal(findings[0].confidence, "High");
  assert.equal(findings[0].codeFile, "src/config/http.js");
  assert.equal(findings[0].docsFile, "README.md");
  assert.equal(findings[0].codeEvidence, "requestTimeoutMs: 30000");
  assert.equal(findings[0].docsEvidence, "The request timeout is 60 seconds by default.");

  const currentDocs = [{ path: "README.md", content: "The request timeout is 30 seconds by default." }];
  assert.deepEqual(analyzeWithRules(changedFiles, currentDocs), []);
});

test("rule analysis detects zero-valued defaults and compares boolean values", () => {
  const zeroChangedFiles = [{
    filename: "src/config/retries.js",
    patch: "@@ -1 +1 @@\n-retryCount = 3\n+retryCount = 0"
  }];
  const zeroDocs = [{ path: "README.md", content: "The retry count defaults to 3." }];
  const zeroFindings = analyzeWithRules(zeroChangedFiles, zeroDocs);
  assert.equal(zeroFindings.length, 1);
  assert.equal(zeroFindings[0].codeValue, "retryCount = 0");
  assert.equal(zeroFindings[0].docsEvidence, zeroDocs[0].content);
  assert.deepEqual(
    analyzeWithRules(zeroChangedFiles, [{ path: "README.md", content: "The retry count defaults to 0." }]),
    []
  );

  const booleanChangedFiles = [{
    filename: "src/config/features.js",
    patch: "@@ -1 +1 @@\n-featureEnabled = true\n+featureEnabled = false"
  }];
  const booleanFindings = analyzeWithRules(booleanChangedFiles, [{
    path: "README.md",
    content: "The feature enabled flag defaults to true."
  }]);
  assert.equal(booleanFindings.length, 1);
  assert.equal(booleanFindings[0].codeValue, "featureEnabled = false");
  assert.deepEqual(
    analyzeWithRules(booleanChangedFiles, [{
      path: "README.md",
      content: "The feature enabled flag defaults to false."
    }]),
    []
  );
});

test("rule analysis matches instance-qualified timeout changes to documentation", () => {
  const timeoutChange = [{
    filename: "src/client.ts",
    patch: "@@ -13,7 +13,7 @@\n-    this.timeoutMs = options.timeoutMs ?? 10_000;\n+    this.timeoutMs = options.timeoutMs ?? 12_000;"
  }];
  const timeoutDocs = [{
    path: "docs/configuration.md",
    content: "| `timeoutMs` | number | `10000` | Request timeout in milliseconds. |"
  }];
  const findings = analyzeWithRules(timeoutChange, timeoutDocs);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].codeEvidence, "this.timeoutMs = options.timeoutMs ?? 12_000;");
  assert.equal(findings[0].docsEvidence, timeoutDocs[0].content);
  assert.deepEqual(
    analyzeWithRules(timeoutChange, [{
      path: "docs/configuration.md",
      content: "Connection timeout is 5000 ms; upload timeout is 6000 ms."
    }]),
    []
  );
  assert.deepEqual(
    analyzeWithRules(timeoutChange, [{
      path: "docs/configuration.md",
      content: "| `timeoutMs` | number | `12000` | Request timeout in milliseconds. |"
    }]),
    []
  );
});

test("rule analysis detects changed supported ranges against documented ranges", () => {
  const rangeChange = [{
    filename: "src/client.ts",
    patch: "@@ -18,7 +18,7 @@\n-    if (days < 1 || days > 7) throw new RangeError(\"days must be between 1 and 7\");\n+    if (days < 1 || days > 14) throw new RangeError(\"days must be between 1 and 14\");"
  }];
  const rangeDocs = [{
    path: "docs/forecasts.md",
    content: "- `days`: number of days, from 1 to 7. Defaults to 3."
  }];
  const findings = analyzeWithRules(rangeChange, rangeDocs);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].confidence, "High");
  assert.equal(findings[0].codeEvidence, "if (days < 1 || days > 14) throw new RangeError(\"days must be between 1 and 14\");");
  assert.equal(findings[0].docsEvidence, rangeDocs[0].content);
  assert.deepEqual(
    analyzeWithRules(rangeChange, [{
      path: "docs/forecasts.md",
      content: "- `days`: number of days, from 1 to 14. Defaults to 3."
    }]),
    []
  );
  assert.deepEqual(
    analyzeWithRules([{
      filename: "src/client.ts",
      patch: "@@ -18 +18 @@\n+    if (days < 1 || days > 14) console.warn(\"unsupported range\");"
    }], rangeDocs),
    []
  );
  assert.deepEqual(
    analyzeWithRules(rangeChange, [{
      path: "docs/forecasts.md",
      content: "Forecast days default to 3; retries range from 2 to 3."
    }]),
    []
  );
  assert.deepEqual(
    analyzeWithRules(rangeChange, [{
      path: "docs/forecasts.md",
      content: "Forecast days default to 3, retries range from 2 to 3."
    }]),
    []
  );
  assert.equal(analyzeWithRules([{
    filename: "src/client.ts",
    patch: "@@ -18 +18 @@\n+    if (days > 14 || days < 1) throw new RangeError(\"out of range\");"
  }], rangeDocs).length, 1);
  assert.deepEqual(
    analyzeWithRules(rangeChange, [{
      path: "docs/forecasts.md",
      content: "Forecast days range from 1 to 7; retries range from 2 to 3."
    }]).map((finding) => finding.docsEvidence),
    ["Forecast days range from 1 to 7; retries range from 2 to 3."]
  );
  assert.deepEqual(
    analyzeWithRules(rangeChange, [{
      path: "docs/forecasts.md",
      content: "Forecast days range from 1 to 7 and retries range from 2 to 3."
    }]),
    []
  );
});

test("rule analysis matches negative and decimal documentation ranges", () => {
  const negativeChange = [{
    filename: "src/client.ts",
    patch: "@@ -1 +1 @@\n-    if (temperature < -10 || temperature > -2) throw new RangeError(\"out of range\");\n+    if (temperature < -10 || temperature > -1) throw new RangeError(\"out of range\");"
  }];
  assert.deepEqual(
    analyzeWithRules(negativeChange, [{
      path: "docs/temperature.md",
      content: "Temperature range: -10 to -1."
    }]),
    []
  );
  const negativeMismatch = analyzeWithRules(negativeChange, [{
    path: "docs/temperature.md",
    content: "Temperature range: -10 to -2."
  }]);
  assert.equal(negativeMismatch.length, 1);
  assert.equal(negativeMismatch[0].docsEvidence, "Temperature range: -10 to -2.");

  const decimalChange = [{
    filename: "src/client.ts",
    patch: "@@ -1 +1 @@\n-    if (days < 0.5 || days > 1.5) throw new RangeError(\"out of range\");\n+    if (days < 0.5 || days > 2.5) throw new RangeError(\"out of range\");"
  }];
  assert.deepEqual(
    analyzeWithRules(decimalChange, [{
      path: "docs/forecasts.md",
      content: "Days range from 0.5 to 2.5."
    }]),
    []
  );
  const decimalMismatch = analyzeWithRules(decimalChange, [{
    path: "docs/forecasts.md",
    content: "Days range from 0.5 to 3.5."
  }]);
  assert.equal(decimalMismatch.length, 1);
  assert.equal(decimalMismatch[0].docsEvidence, "Days range from 0.5 to 3.5.");
});

test("rule analysis notes a newly exported symbol absent from the fetched docs", () => {
  const findings = analyzeWithRules(
    [{ filename: "src/api/invoices.js", patch: "@@ -0,0 +1 @@\n+export function createInvoice(input) {" }],
    [{ path: "README.md", content: "Invoice API overview." }]
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "Low");
  assert.equal(findings[0].confidence, "Low");
  assert.match(findings[0].docsEvidence, /createInvoice/);
  assert.match(findings[0].codeEvidence, /export function createInvoice/);
});

test("OpenAI-compatible provider uses configured endpoint, credentials, and model", async () => {
  let request;
  const baseURL = "https://bharatcode.example.test/api/model/v1";
  const mockClient = createMockOpenAIClient(async (url, options) => {
    request = {
      url: String(url),
      authorization: new Headers(options.headers).get("authorization"),
      body: JSON.parse(options.body)
    };
    return mockChatCompletionResponse("{\"findings\":[]}");
  }, { baseURL });
  const ai = new OpenAICompatibleService({
    apiKey: "test-key-not-sent",
    baseURL,
    model: "configured-test-model",
    timeoutMs: 50
  }, mockClient);

  const findings = await ai.analyze({
    pullRequest: { number: 2, title: "Test change", body: "" },
    changedFiles,
    documents
  });
  const context = JSON.parse(request.body.messages[1].content);
  assert.deepEqual(findings, []);
  assert.equal(request.url, `${baseURL}/chat/completions`);
  assert.equal(request.authorization, "Bearer test-key-not-sent");
  assert.equal(request.body.model, "configured-test-model");
  assert.equal(request.body.messages[1].role, "user");
  assert.equal(context.changedFiles[0].patch, changedFiles[0].patch);
  assert.equal(context.documentation[0].content, documents[0].content);
  assert.match(request.body.messages[0].content, /changed diff line/);
  assert.equal(JSON.stringify(request.body).includes("test-key-not-sent"), false);
});

test("OpenAI-compatible provider rejects malformed and truncated model responses", async () => {
  const responses = [
    { content: "not json", expected: "INVALID_AI_PROVIDER_RESPONSE" },
    { content: "{\"unexpected\":[]}", expected: "INVALID_AI_PROVIDER_RESPONSE" },
    { content: "{\"findings\":[]}", finishReason: "length", expected: "AI_PROVIDER_INCOMPLETE_RESPONSE" }
  ];

  for (const response of responses) {
    const settings = loadAIProviderSettings({
      AI_PROVIDER: "nvidia-nim",
      NVIDIA_NIM_API_KEY: "test-key-not-sent",
      NVIDIA_NIM_MODEL: SUPPORTED_NVIDIA_NIM_MODEL
    });
    const ai = new OpenAICompatibleService(settings, createMockOpenAIClient(
      async () => mockChatCompletionResponse(response.content, response.finishReason),
      { baseURL: settings.baseURL }
    ));

    await assert.rejects(ai.analyze({
      pullRequest: { number: 2, title: "Test change", body: "" },
      changedFiles,
      documents
    }), (error) => error.code === response.expected);
  }
});

test("NVIDIA NIM sends mocked Chat Completions to the documented model endpoint", async () => {
  const settings = loadAIProviderSettings({
    AI_PROVIDER: "nvidia-nim",
    NVIDIA_NIM_API_KEY: "test-key-not-sent",
    NVIDIA_NIM_BASE_URL: DEFAULT_NVIDIA_NIM_BASE_URL,
    NVIDIA_NIM_MODEL: SUPPORTED_NVIDIA_NIM_MODEL
  });
  let request;
  const service = new OpenAICompatibleService(settings, createMockOpenAIClient(async (url, options) => {
    request = {
      url: String(url),
      authorization: new Headers(options.headers).get("authorization"),
      body: JSON.parse(options.body)
    };
    return mockChatCompletionResponse("{\"findings\":[]}");
  }, { baseURL: settings.baseURL }));

  assert.equal(settings.providerName, "NVIDIA NIM");
  assert.equal(service.configured, true);
  assert.deepEqual(await service.analyze({
    pullRequest: { number: 8, title: "Update timeout", body: "" },
    changedFiles,
    documents
  }), []);
  assert.equal(request.url, `${DEFAULT_NVIDIA_NIM_BASE_URL}/chat/completions`);
  assert.equal(request.authorization, "Bearer test-key-not-sent");
  assert.equal(request.body.model, SUPPORTED_NVIDIA_NIM_MODEL);
  assert.equal(JSON.stringify(request.body).includes("test-key-not-sent"), false);
});

test("NVIDIA NIM reports a missing key or model without making a request", async () => {
  const missingKey = loadAIProviderSettings({
    AI_PROVIDER: "nvidia-nim",
    NVIDIA_NIM_MODEL: SUPPORTED_NVIDIA_NIM_MODEL
  });
  assert.equal(missingKey.providerName, "NVIDIA NIM");
  assert.equal(missingKey.baseURL, DEFAULT_NVIDIA_NIM_BASE_URL);
  assert.deepEqual(missingKey.missingSettings, ["NVIDIA_NIM_API_KEY"]);
  const missingKeyService = new OpenAICompatibleService(missingKey);
  assert.equal(missingKeyService.configured, false);
  await assert.rejects(missingKeyService.analyze({
    pullRequest: { number: 8, title: "Update timeout", body: "" },
    changedFiles,
    documents
  }), (error) => error.code === "AI_PROVIDER_NOT_CONFIGURED");

  const missingModel = loadAIProviderSettings({
    AI_PROVIDER: "nvidia-nim",
    NVIDIA_NIM_API_KEY: "test-key-not-sent"
  });
  assert.deepEqual(missingModel.missingSettings, ["NVIDIA_NIM_MODEL"]);
  assert.equal(new OpenAICompatibleService(missingModel).configured, false);

  const autoSelected = loadAIProviderSettings({
    NVIDIA_NIM_API_KEY: "test-key-not-sent",
    NVIDIA_NIM_MODEL: SUPPORTED_NVIDIA_NIM_MODEL,
    BHARATCODE_API_KEY: "legacy-test-key",
    BHARATCODE_MODEL: "legacy-model"
  });
  assert.equal(autoSelected.providerName, "NVIDIA NIM");
  const explicitlyLegacy = loadAIProviderSettings({
    AI_PROVIDER: "bharatcode",
    NVIDIA_NIM_API_KEY: "test-key-not-sent",
    BHARATCODE_API_KEY: "legacy-test-key",
    BHARATCODE_MODEL: "legacy-model"
  });
  assert.equal(explicitlyLegacy.providerName, "BharatCode");
});

test("BharatCode remains selectable and sends mocked requests to its existing endpoint", async () => {
  const settings = loadAIProviderSettings({
    AI_PROVIDER: "bharatcode",
    BHARATCODE_API_KEY: "test-key-not-sent",
    BHARATCODE_MODEL: "legacy-test-model"
  });
  let requestURL;
  const service = new OpenAICompatibleService(settings, createMockOpenAIClient(async (url) => {
    requestURL = String(url);
    return mockChatCompletionResponse("{\"findings\":[]}");
  }, { baseURL: settings.baseURL }));

  assert.equal(settings.providerName, "BharatCode");
  assert.equal(service.model, "legacy-test-model");
  assert.deepEqual(await service.analyze({
    pullRequest: { number: 8, title: "Update timeout", body: "" },
    changedFiles,
    documents
  }), []);
  assert.equal(requestURL, `${DEFAULT_BHARATCODE_BASE_URL}/chat/completions`);
});

test("generic AI settings validate all required provider values and preserve BharatCode aliases", async () => {
  const missingCredentials = loadAIProviderSettings({});
  assert.equal(missingCredentials.providerName, "OpenAI-compatible provider");
  assert.equal(missingCredentials.baseURL, "");
  const missingService = new OpenAICompatibleService(missingCredentials);
  assert.equal(missingService.configured, false);
  assert.deepEqual(missingService.missingSettings, ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL"]);
  await assert.rejects(missingService.analyze({
    pullRequest: { number: 2, title: "Test change", body: "" },
    changedFiles,
    documents
  }), (error) => error.code === "AI_PROVIDER_NOT_CONFIGURED");

  assert.equal(new OpenAICompatibleService(loadAIProviderSettings({
    AI_MODEL: "configured-test-model"
  })).configured, false);
  assert.equal(new OpenAICompatibleService(loadAIProviderSettings({
    AI_API_KEY: "test-key-not-sent"
  })).configured, false);

  const configured = loadAIProviderSettings({
    AI_PROVIDER: "openai-compatible",
    AI_API_KEY: "test-key-not-sent",
    AI_BASE_URL: "https://provider.example.test/v1",
    AI_MODEL: "configured-test-model"
  });
  assert.equal(configured.providerName, "OpenAI-compatible provider");
  assert.equal(new OpenAICompatibleService(configured).configured, true);
  assert.equal(new OpenAICompatibleService(configured).client.baseURL, "https://provider.example.test/v1");

  const legacy = loadAIProviderSettings({
    BHARATCODE_API_KEY: "test-key-not-sent",
    BHARATCODE_MODEL: "legacy-test-model"
  });
  assert.equal(legacy.providerName, "BharatCode");
  assert.equal(legacy.baseURL, DEFAULT_BHARATCODE_BASE_URL);
  assert.equal(new OpenAICompatibleService(legacy).client.baseURL, DEFAULT_BHARATCODE_BASE_URL);
  assert.equal(loadAIProviderSettings({
    BHARATCODE_API_KEY: "legacy-key",
    BHARATCODE_MODEL: "legacy-model",
    AI_API_KEY: "generic-key",
    AI_BASE_URL: "https://provider.example.test/v1",
    AI_MODEL: "generic-model"
  }).providerName, "OpenAI-compatible provider");

  const invalid = loadAIProviderSettings({
    AI_API_KEY: "test-key-not-sent",
    AI_MODEL: "configured-test-model",
    AI_BASE_URL: "http://example.test/v1"
  });
  const invalidService = new OpenAICompatibleService(invalid);
  assert.equal(invalid.configurationError, "AI_BASE_URL must be a valid HTTPS URL.");
  assert.equal(invalidService.configured, false);
  assert.equal(invalidService.client, null);
  await assert.rejects(invalidService.analyze({
    pullRequest: { number: 2, title: "Test change", body: "" },
    changedFiles,
    documents
  }), (error) => error.code === "AI_PROVIDER_INVALID_CONFIGURATION");

  assert.match(loadAIProviderSettings({ AI_BASE_URL: "not a URL" }).configurationError, /valid HTTPS URL/);
  assert.match(loadAIProviderSettings({ AI_PROVIDER: "not-supported" }).configurationError, /AI_PROVIDER must be/);
});

test("OpenAI-compatible provider maps authentication, model, rate-limit, busy, and timeout errors", async () => {
  const failures = [
    { status: 401, code: "invalid_api_key", expected: "AI_PROVIDER_AUTHENTICATION_FAILED" },
    { status: 429, code: "rate_limit_exceeded", expected: "AI_PROVIDER_RATE_LIMITED" },
    { status: 410, code: "retired_model", expected: "AI_PROVIDER_MODEL_UNAVAILABLE" },
    { status: 503, code: "server_busy", expected: "AI_PROVIDER_BUSY" },
    { status: 500, code: "provider_error", expected: "AI_PROVIDER_API_ERROR" }
  ];

  for (const failure of failures) {
    const settings = loadAIProviderSettings({
      AI_PROVIDER: "nvidia-nim",
      NVIDIA_NIM_API_KEY: "test-key-not-sent",
      NVIDIA_NIM_MODEL: SUPPORTED_NVIDIA_NIM_MODEL
    });
    const ai = new OpenAICompatibleService(settings, createMockOpenAIClient(async () => new Response(JSON.stringify({
      error: {
        message: "provider detail must not be surfaced",
        type: "provider_error",
        code: failure.code
      }
    }), { status: failure.status, headers: { "content-type": "application/json" } }), {
      baseURL: settings.baseURL
    }));

    await assert.rejects(ai.analyze({
      pullRequest: { number: 2, title: "Test change", body: "" },
      changedFiles,
      documents
    }), (error) => {
      assert.equal(error.code, failure.expected);
      assert.equal(error.message.includes("provider detail"), false);
      return true;
    });
  }

  const timeoutSettings = loadAIProviderSettings({
    AI_PROVIDER: "nvidia-nim",
    NVIDIA_NIM_API_KEY: "test-key-not-sent",
    NVIDIA_NIM_MODEL: SUPPORTED_NVIDIA_NIM_MODEL
  });
  const timeoutService = new OpenAICompatibleService({
    ...timeoutSettings,
    timeoutMs: 5
  }, createMockOpenAIClient((_url, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }), { timeout: 5, baseURL: timeoutSettings.baseURL }));

  await assert.rejects(timeoutService.analyze({
    pullRequest: { number: 2, title: "Test change", body: "" },
    changedFiles,
    documents
  }), (error) => error.code === "AI_PROVIDER_TIMEOUT");
});

test("AI evidence is retained only when both excerpts exist in fetched sources", () => {
  const valid = {
    title: "Timeout guide may be outdated",
    severity: "High",
    codeFile: "src/config/http.js",
    docsFile: "README.md",
    codeEvidence: "requestTimeoutMs: 30000",
    docsEvidence: "The request timeout is 60 seconds by default.",
    description: "The code and guide specify different timeout values.",
    suggestion: "Update the guide to say 30 seconds."
  };
  assert.ok(verifyAiFinding(valid, 0, changedFiles, documents));
  assert.equal(verifyAiFinding({ ...valid, docsEvidence: "The guide says 5 seconds." }, 0, changedFiles, documents), null);

  const contextOnlyChange = [{
    filename: "src/config/http.js",
    patch: "@@ -1,3 +1,3 @@\n requestTimeoutMs: 30000\n-oldOption = true\n+newOption = true"
  }];
  assert.equal(verifyAiFinding(valid, 0, contextOnlyChange, documents), null);

  const removedLineFinding = { ...valid, codeEvidence: "requestTimeoutMs: 60000" };
  assert.ok(verifyAiFinding(removedLineFinding, 0, changedFiles, documents));
});

test("AI evidence accepts changed lines starting with doubled signs but rejects file headers", () => {
  const valid = {
    title: "Changed option may need documentation",
    severity: "Medium",
    codeFile: "src/config/http.js",
    docsFile: "README.md",
    codeEvidence: "++counter = true",
    docsEvidence: "The request timeout is 60 seconds by default.",
    description: "A changed option needs review against the guide.",
    suggestion: "Update the documentation."
  };
  const addedOperatorLine = [{
    filename: "src/config/http.js",
    patch: "+++counter = true"
  }];
  assert.ok(verifyAiFinding(valid, 0, addedOperatorLine, documents));

  const removedOperatorLine = [{
    filename: "src/config/http.js",
    patch: "---counter = true"
  }];
  assert.ok(verifyAiFinding({
    ...valid,
    codeEvidence: "--counter = true"
  }, 0, removedOperatorLine, documents));

  const addedFileHeader = [{
    filename: "src/config/http.js",
    patch: "+++ b/src/config/http.js"
  }];
  assert.equal(verifyAiFinding({
    ...valid,
    codeEvidence: "b/src/config/http.js"
  }, 0, addedFileHeader, documents), null);

  const removedFileHeader = [{
    filename: "src/config/http.js",
    patch: "--- a/src/config/http.js"
  }];
  assert.equal(verifyAiFinding({
    ...valid,
    codeEvidence: "a/src/config/http.js"
  }, 0, removedFileHeader, documents), null);
});

test("analysis uses rule fallback when AI is not configured and stores retrievable results", async () => {
  const githubService = createMockGitHubService();
  let documentationRankedWith;
  githubService.getDocumentation = async (owner, repo, files) => {
    documentationRankedWith = files;
    return { documents, truncated: false };
  };
  const analysis = new AnalysisService({
    githubService,
    aiService: {
      configured: false,
      providerName: "Example Provider",
      missingSettings: ["AI_API_KEY"],
      analyze: async () => assert.fail("AI should not be called")
    }
  });
  const result = await analysis.analyzePullRequest({ owner: "acme", repo: "payments", pullNumber: 8, useAi: true });

  assert.equal(result.provider, "rules");
  assert.equal(result.ai.used, false);
  assert.match(result.warnings.join(" "), /not fully configured/);
  assert.equal(result.findings.length, 1);
  assert.deepEqual(documentationRankedWith, changedFiles);
  assert.deepEqual(analysis.getResult(result.analysisId), result);
  assert.throws(() => analysis.getResult("missing-id"), (error) => error.status === 404);
});

test("analysis discards unverified AI findings and keeps verified results", async () => {
  const validAiFinding = {
    title: "New API needs a guide mention",
    severity: "Low",
    codeFile: "src/api/invoices.js",
    docsFile: "README.md",
    codeEvidence: "export function createInvoice(input) {",
    docsEvidence: "Invoice API overview.",
    description: "The new exported function is not described in the guide.",
    suggestion: "Document the createInvoice entry point."
  };
  const githubService = createMockGitHubService({
    changed: [
      ...changedFiles,
      { filename: "src/api/invoices.js", patch: "@@ -0,0 +1 @@\n+export function createInvoice(input) {" }
    ],
    docs: [{ path: "README.md", content: `${documents[0].content}\nInvoice API overview.` }]
  });
  const analysis = new AnalysisService({
    githubService,
    aiService: {
      configured: true,
      providerName: "NVIDIA NIM",
      analyze: async () => [validAiFinding, { ...validAiFinding, codeEvidence: "invented code" }]
    }
  });
  const result = await analysis.analyzePullRequest({ owner: "acme", repo: "payments", pullNumber: 8, useAi: true });

  assert.equal(result.provider, "NVIDIA NIM + rules");
  assert.ok(result.findings.some((finding) => finding.source === "ai"));
  assert.equal(result.findings.find((finding) => finding.source === "ai").confidence, "Medium");
  assert.ok(result.warnings.some((warning) => warning.includes("discarded")));
  assert.equal(result.findings.filter((finding) => finding.codeEvidence === "invented code").length, 0);
});

test("analysis falls back to rules after a provider request failure", async () => {
  const settings = loadAIProviderSettings({
    AI_PROVIDER: "nvidia-nim",
    NVIDIA_NIM_API_KEY: "test-key-not-sent",
    NVIDIA_NIM_MODEL: SUPPORTED_NVIDIA_NIM_MODEL
  });
  const aiService = new OpenAICompatibleService(settings, createMockOpenAIClient(async () => new Response(JSON.stringify({
    error: {
      message: "provider response must not be exposed",
      type: "server_error",
      code: "provider_error"
      }
  }), { status: 500, headers: { "content-type": "application/json" } }), {
    baseURL: settings.baseURL
  }));
  const analysis = new AnalysisService({
    githubService: createMockGitHubService(),
    aiService
  });
  const result = await analysis.analyzePullRequest({ owner: "acme", repo: "payments", pullNumber: 8, useAi: true });

  assert.equal(result.provider, "rules");
  assert.equal(result.ai.used, false);
  assert.equal(result.findings.length, 1);
  assert.match(result.warnings.join(" "), /rule analysis was used instead/);
});

test("GitHub service uses REST headers, blocks private repositories, and retrieves documentation", async () => {
  const requests = [];
  const fetchFn = async (url, options) => {
    requests.push({ url: String(url), headers: options.headers });
    const parsedUrl = new URL(url);
    let data;
    if (parsedUrl.pathname === "/repos/acme/payments") {
      data = {
        owner: { login: "acme" },
        name: "payments",
        full_name: "acme/payments",
        description: "Payments API",
        default_branch: "main",
        private: false,
        html_url: "https://github.com/acme/payments"
      };
    } else if (parsedUrl.pathname === "/repos/acme/payments/pulls") {
      data = [{
        number: 8,
        title: "Update timeout",
        state: "open",
        draft: false,
        user: { login: "developer" },
        updated_at: "2025-01-01T00:00:00Z",
        html_url: "https://github.com/acme/payments/pull/8",
        head: { ref: "shorter-timeout" },
        base: { ref: "main" }
      }];
    } else if (parsedUrl.pathname === "/repos/acme/payments/pulls/8") {
      data = {
        number: 8,
        title: "Update timeout",
        body: "Shorten the default timeout.",
        state: "open",
        draft: false,
        user: { login: "developer" },
        html_url: "https://github.com/acme/payments/pull/8",
        head: { sha: "abc123", ref: "shorter-timeout" },
        base: { ref: "main" },
        changed_files: 1,
        additions: 1,
        deletions: 1
      };
    } else if (parsedUrl.pathname === "/repos/acme/payments/pulls/8/files") {
      data = [{ filename: "src/config/http.js", status: "modified", additions: 1, deletions: 1, changes: 2, patch: changedFiles[0].patch }];
    } else if (parsedUrl.pathname.endsWith("/git/trees/main")) {
      data = {
        truncated: false,
        tree: [
          { path: "README.md", type: "blob", size: 25 },
          { path: "docs/http.md", type: "blob", size: 30 },
          { path: "src/http.js", type: "blob", size: 80 }
        ]
      };
    } else if (parsedUrl.pathname.endsWith("/contents/README.md")) {
      data = { encoding: "base64", content: Buffer.from("# Payments\n").toString("base64") };
    } else if (parsedUrl.pathname.endsWith("/contents/docs/http.md")) {
      data = { encoding: "base64", content: Buffer.from("Request timeout docs.\n").toString("base64") };
    } else {
      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  };

  const service = new GitHubService({ token: "server-only-test-token", fetchFn });
  const pullRequests = await service.listPullRequests("acme", "payments");
  const pullRequest = await service.getPullRequest("acme", "payments", 8);
  const pullRequestFiles = await service.getPullRequestFiles("acme", "payments", 8);
  const response = await service.getDocumentation("acme", "payments", [{ filename: "src/http.js" }]);
  assert.equal(pullRequests.pullRequests[0].number, 8);
  assert.equal(pullRequest.pullRequest.headSha, "abc123");
  assert.equal(pullRequestFiles.files[0].filename, "src/config/http.js");
  assert.equal(response.documents.length, 2);
  assert.equal(response.documents[0].path, "README.md");
  assert.match(response.documents[1].content, /timeout/);
  assert.ok(requests.every((request) => request.headers.Authorization === "Bearer server-only-test-token"));

  const privateRepo = new GitHubService({
    fetchFn: async () => new Response(JSON.stringify({
      private: true,
      owner: { login: "acme" },
      name: "private",
      full_name: "acme/private",
      default_branch: "main",
      html_url: "https://github.com/acme/private"
    }), { status: 200 })
  });
  await assert.rejects(privateRepo.getPublicRepository("acme", "private"), (error) => error.status === 403);

  const timedOutGitHub = new GitHubService({
    fetchFn: async () => { const error = new Error("timeout"); error.name = "TimeoutError"; throw error; }
  });
  await assert.rejects(timedOutGitHub.getPublicRepository("acme", "payments"), (error) => error.code === "GITHUB_TIMEOUT");
});

test("API routes return consistent JSON, validate inputs, and serve the frontend", async () => {
  const mockResults = {
    analysisId: "test-analysis",
    repository: "acme/payments",
    findings: []
  };
  let analysisRequestCount = 0;
  const services = {
    githubService: {
      getPublicRepository: async (owner, repo) => ({ owner, name: repo, fullName: `${owner}/${repo}`, private: false }),
      listPullRequests: async () => ({ pullRequests: [{ number: 8, title: "Update timeout" }] }),
      getPullRequest: async () => ({ pullRequest: { number: 8, title: "Update timeout" } }),
      getPullRequestFiles: async () => ({ files: changedFiles, truncated: false }),
      getDocumentation: async () => ({ documents, truncated: false })
    },
    aiService: { providerName: "Example Provider", configured: false, missingSettings: [] },
    analysisService: {
      analyzePullRequest: async ({ useAi }) => {
        analysisRequestCount += 1;
        return { ...mockResults, ai: { requested: useAi } };
      },
      getResult: (analysisId) => {
        if (analysisId !== mockResults.analysisId) throw new AppError(404, "ANALYSIS_NOT_FOUND", "Missing.");
        return mockResults;
      }
    }
  };
  const app = createApp({ services, corsOrigins: ["https://frontend.example"] });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = `http://127.0.0.1:${server.address().port}`;

  try {
    const health = await fetch(`${address}/api/health`).then((response) => response.json());
    assert.equal(health.success, true);
    assert.equal(health.data.status, "ok");
    assert.equal(health.data.ai.connectivity, "not_checked");
    assert.equal(health.data.ai.configured, false);
    assert.equal(health.data.ai.provider, "Example Provider");
    assert.equal(JSON.stringify(health).includes("apiKey"), false);

    const allowedOrigin = await fetch(`${address}/api/health`, {
      headers: { Origin: "https://frontend.example" }
    });
    assert.equal(allowedOrigin.headers.get("access-control-allow-origin"), "https://frontend.example");
    const deniedOrigin = await fetch(`${address}/api/health`, {
      headers: { Origin: "https://untrusted.example" }
    });
    assert.equal(deniedOrigin.headers.get("access-control-allow-origin"), null);

    const invalid = await fetch(`${address}/api/repositories/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repositoryUrl: "https://example.com/acme/payments" })
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).success, false);

    const validation = await fetch(`${address}/api/repositories/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repositoryUrl: "https://github.com/acme/payments" })
    }).then((response) => response.json());
    assert.equal(validation.data.repository.fullName, "acme/payments");

    const pullRequests = await fetch(`${address}/api/repositories/acme/payments/pulls`).then((response) => response.json());
    assert.equal(pullRequests.data.pullRequests[0].number, 8);

    const started = await fetch(`${address}/api/repositories/acme/payments/pulls/8/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ useAi: true })
    }).then((response) => response.json());
    assert.equal(started.data.ai.requested, true);

    for (let request = 1; request < 5; request += 1) {
      const allowed = await fetch(`${address}/api/repositories/acme/payments/pulls/8/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ useAi: true })
      });
      assert.equal(allowed.status, 201);
    }

    const limited = await fetch(`${address}/api/repositories/acme/payments/pulls/8/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ useAi: true })
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.deepEqual((await limited.json()).error, {
      code: "RATE_LIMITED",
      message: "Too many analysis requests. Please try again later."
    });
    assert.equal(analysisRequestCount, 5);

    const saved = await fetch(`${address}/api/analysis/test-analysis`).then((response) => response.json());
    assert.equal(saved.data.analysisId, "test-analysis");

    const frontend = await fetch(`${address}/analysis-results.html`);
    assert.equal(frontend.status, 200);
    assert.match(await frontend.text(), /Analyze a GitHub pull request/);

    const frontendScript = await fetch(`${address}/analysis-results.js`);
    assert.equal(frontendScript.status, 200);
    const frontendSource = await frontendScript.text();
    assert.match(frontendSource, /health\.ai\.provider/);
    assert.match(frontendSource, /analysis was used/);
    assert.match(frontendSource, /rule-based fallback/);

    const themeScript = await fetch(`${address}/theme.js`);
    assert.equal(themeScript.status, 200);
    assert.match(await themeScript.text(), /data-theme-toggle/);

    const missingPage = await fetch(`${address}/backend/src/config/env.js`);
    assert.equal(missingPage.status, 404);

    const invalidJson = await fetch(`${address}/api/repositories/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    });
    assert.equal(invalidJson.status, 400);
    assert.equal((await invalidJson.json()).error.code, "INVALID_JSON");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

function createMockGitHubService(overrides = {}) {
  const values = {
    changed: overrides.changed || changedFiles,
    docs: overrides.docs || documents
  };
  return {
    getPullRequest: async () => ({
      pullRequest: { number: 8, title: "Update timeout", body: "" }
    }),
    getPullRequestFiles: async () => ({ files: values.changed, truncated: false }),
    getDocumentation: async () => ({ documents: values.docs, truncated: false })
  };
}

function createMockOpenAIClient(fetchFn, options = {}) {
  return new OpenAI({
    apiKey: "test-key-not-sent",
    baseURL: options.baseURL || DEFAULT_BHARATCODE_BASE_URL,
    timeout: options.timeout || 1000,
    maxRetries: 0,
    fetch: fetchFn
  });
}

function mockChatCompletionResponse(content, finishReason = "stop") {
  return new Response(JSON.stringify({
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model: "configured-test-model",
    choices: [{
      index: 0,
      message: { role: "assistant", content },
      finish_reason: finishReason
    }]
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
