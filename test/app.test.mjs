import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {loadConfig, publicConfig} from "../lib/config.mjs";
import {CodexProvider, DemoProvider} from "../lib/provider.mjs";
import {escapeHtml, renderReport} from "../lib/report-renderer.mjs";
import {FileStore} from "../lib/storage.mjs";
import {createJobRecord, normalizeRequest, runResearchJob} from "../lib/workflow.mjs";
import {createMarketingServer, startMarketingServer} from "../server.mjs";
import {createServer as createHttpServer} from "node:http";
import {resolveCodexBin} from "../lib/codex-bin.mjs";

async function tempRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "marketing-team-"));
  t.after(() => rm(root, {recursive: true, force: true}));
  return root;
}

function demoConfig(root) {
  return loadConfig({rootDir: root, env: {MARKETING_RUNTIME: "demo", PORT: "8787", HOST: "127.0.0.1", DATA_DIR: ".data"}});
}

function request(overrides = {}) {
  return normalizeRequest({
    product: "토들러 낮잠 베개",
    stage: "토들러 24~47개월",
    taskId: "voc",
    taskLabel: "VOC 기반 상품 개발",
    decision: "샘플 제작 여부",
    context: "어린이집 낮잠용",
    evidence: ["고객 VOC", "경쟁 제품"],
    vocText: "세탁이 편해요\n높이가 조금 높아요",
    sourceUrls: [],
    depth: "quick",
    ...overrides
  });
}

test("configuration defaults to the user's Codex without API secrets", async (t) => {
  const root = await tempRoot(t);
  const config = loadConfig({rootDir: root, env: {CODEX_MODEL: "test-model"}});
  const visible = publicConfig(config, {connected: true});
  assert.equal(config.mode, "codex");
  assert.equal(visible.ready, true);
  assert.equal(visible.mode, "codex");
  assert.equal(visible.model, "test-model");
  assert.equal("apiKey" in visible, false);
  assert.equal("baseUrl" in config, false);
  assert.equal(typeof resolveCodexBin(), "string");
});

test("request normalization rejects missing business scope", () => {
  assert.throws(() => normalizeRequest({product: "", stage: "토들러", decision: "진행"}), /필수 입력/);
  assert.equal(request({sourceUrls: ["javascript:alert(1)", "https://example.com"]}).sourceUrls.length, 1);
});

test("report renderer escapes user and model content", () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  const malicious = '<script>alert("x")</script>';
  const job = {mode: "demo", updatedAt: new Date().toISOString(), request: request({product: malicious})};
  const report = {
    title: malicious,
    decision: {recommendation: "진행", requestedApproval: "샘플", confidence: "low"},
    executiveSummary: [malicious], marketSignals: [], competitors: [],
    voc: {sampleNote: "데모", satisfaction: [], dissatisfaction: [], repeatedKeywords: []},
    successCauses: [], personas: [],
    productProposal: {concept: "개념", targetUser: "고객", requiredSpecs: [], optionalSpecs: [], blockedClaims: [], pricePositioning: "검토", launchTests: []},
    commercialEstimate: {basis: "데모", formula: "A×B", low: "-", base: "-", high: "-", assumptions: [], limitations: []},
    risks: [], nextActions: []
  };
  const html = renderReport({job, report, sources: [], quality: {warnings: [], checks: []}});
  assert.equal(html.includes(malicious), false);
  assert.equal(html.includes("&lt;script&gt;"), true);
});

test("demo workflow persists a complete report", async (t) => {
  const root = await tempRoot(t);
  const config = demoConfig(root);
  const store = new FileStore({dataDir: config.dataDir, reportDir: config.reportDir});
  await store.init();
  const job = createJobRecord(request(), config);
  await store.createJob(job);
  await runResearchJob({jobId: job.id, store, provider: new DemoProvider(), signal: new AbortController().signal});
  const completed = await store.getJob(job.id);
  assert.equal(completed.status, "completed_with_warnings");
  assert.match(completed.reportUrl, /\/report$/);
  assert.equal(completed.agents.every((agent) => ["completed", "warning"].includes(agent.status)), true);
  const html = await store.readReport(job.id);
  assert.match(html, /데모 분석/);
  assert.match(html, /고객 반응/);
  const data = JSON.parse(await readFile(path.join(config.reportDir, job.id + ".json"), "utf8"));
  assert.equal(data.mode, "demo");
});

test("Codex provider requests web evidence and structured output from the account runtime", async () => {
  const demoReport = await new DemoProvider().synthesize({request: request(), sources: []});
  const calls = [];
  const runtime = {runStructured: async (input) => {
    calls.push(input);
    if (calls.length === 1) return {data: {text: "source-backed research", sources: [{url: "https://example.com/source", title: "Example", checkedAt: "2026-07-11"}]}};
    if (calls.length === 2) return {data: demoReport};
    return {data: {sources: [{url: "https://example.com/source", title: "Example", checkedAt: "2026-07-11"}], report: demoReport}};
  }};
  const provider = new CodexProvider({model: "test-model", rootDir: process.cwd()}, runtime);
  const research = await provider.webResearch({kind: "market", request: request(), depth: "quick", signal: new AbortController().signal});
  assert.equal(research.text, "source-backed research");
  assert.deepEqual(research.sources.map((source) => source.url), ["https://example.com/source"]);
  assert.match(calls[0].prompt, /최신 웹 검색/);
  assert.equal(calls[0].outputSchema.required.includes("sources"), true);
  const report = await provider.synthesize({request: request(), research: {market: "m", competitor: "c", voc: "v"}, sources: research.sources, signal: new AbortController().signal});
  assert.equal(report.title, demoReport.title);
  assert.equal(calls[1].outputSchema.required.includes("commercialEstimate"), true);
  const full = await provider.fullResearch({request: request(), signal: new AbortController().signal});
  assert.equal(full.report.title, demoReport.title);
  assert.match(calls[2].prompt, /제품군을 조사 경계로 고정/);
  assert.equal(calls[2].outputSchema.required.includes("sources"), true);
});

test("HTTP onboarding reports and starts the user's ChatGPT OAuth flow", async (t) => {
  const root = await tempRoot(t);
  const config = loadConfig({rootDir: root, env: {MARKETING_RUNTIME: "codex", DATA_DIR: ".data"}});
  const runtime = {
    status: async () => ({installed: true, connected: false, accountType: null, reason: "ChatGPT 계정을 연결해 주세요."}),
    startChatGptLogin: async () => ({type: "chatgpt", loginId: "login-1", authUrl: "https://auth.openai.com/example"}),
    logout: async () => {}, close: async () => {}
  };
  const {server} = await createMarketingServer({config, runtime, provider: new DemoProvider()});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const visible = await fetch(base + "/api/config").then((response) => response.json());
  assert.equal(visible.mode, "codex");
  assert.equal(visible.ready, false);
  const login = await fetch(base + "/api/auth/chatgpt", {method: "POST"}).then((response) => response.json());
  assert.equal(login.loginId, "login-1");
  assert.match(login.authUrl, /^https:/);
});

test("HTTP onboarding rejects an unsafe login URL", async (t) => {
  const root = await tempRoot(t);
  const config = loadConfig({rootDir: root, env: {MARKETING_RUNTIME: "codex", DATA_DIR: ".data"}});
  const runtime = {
    status: async () => ({installed: true, connected: false, accountType: null}),
    startChatGptLogin: async () => ({type: "chatgpt", loginId: "login-unsafe", authUrl: "javascript:alert(1)"}),
    close: async () => {}
  };
  const {server} = await createMarketingServer({config, runtime, provider: new DemoProvider()});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + "/api/auth/chatgpt", {method: "POST"});
  assert.equal(response.status, 502);
});

test("HTTP API runs, persists, opens, retries, and deletes research", async (t) => {
  const root = await tempRoot(t);
  const config = demoConfig(root);
  const {server} = await createMarketingServer({config, provider: new DemoProvider()});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const health = await fetch(base + "/api/health").then((response) => response.json());
  assert.deepEqual({ok: health.ok, mode: health.mode, ready: health.ready}, {ok: true, mode: "demo", ready: true});

  const stateResponse = await fetch(base + "/api/ui-state", {
    method: "PUT", headers: {"content-type": "application/json"},
    body: JSON.stringify({orders: [{id: "order-1"}], chartPreferences: {voc: "bar"}})
  });
  assert.equal(stateResponse.status, 200);
  const state = await fetch(base + "/api/ui-state").then((response) => response.json());
  assert.equal(state.orders[0].id, "order-1");
  assert.equal(state.chartPreferences.voc, "bar");
  const rejectedOrigin = await fetch(base + "/api/ui-state", {method: "PUT", headers: {origin: "https://example.com", "content-type": "application/json"}, body: "{}"});
  assert.equal(rejectedOrigin.status, 403);

  const createdResponse = await fetch(base + "/api/research", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(request())
  });
  assert.equal(createdResponse.status, 202);
  const created = await createdResponse.json();
  let job;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    job = await fetch(base + `/api/jobs/${created.job.id}`).then((response) => response.json()).then((payload) => payload.job);
    if (["completed", "completed_with_warnings", "failed"].includes(job.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(job.status, "completed_with_warnings");
  const reportResponse = await fetch(base + job.reportUrl);
  assert.equal(reportResponse.status, 200);
  assert.match(await reportResponse.text(), /대표 보고/);

  const retryResponse = await fetch(base + `/api/jobs/${job.id}/retry`, {method: "POST"});
  assert.equal(retryResponse.status, 202);
  const retry = await retryResponse.json();
  assert.notEqual(retry.job.id, job.id);
  let retriedJob;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    retriedJob = await fetch(base + `/api/jobs/${retry.job.id}`).then((response) => response.json()).then((payload) => payload.job);
    if (["completed", "completed_with_warnings", "failed"].includes(retriedJob.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(retriedJob.status, "completed_with_warnings");

  const deleteResponse = await fetch(base + `/api/jobs/${job.id}`, {method: "DELETE"});
  assert.equal(deleteResponse.status, 200);
  assert.equal((await fetch(base + `/api/jobs/${job.id}`)).status, 404);
});

test("server selects and reports the next port when the preferred port is occupied", async (t) => {
  const blocker = createHttpServer((_, response) => response.end("occupied"));
  await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => blocker.close(resolve)));
  const root = await tempRoot(t);
  const config = demoConfig(root);
  config.port = blocker.address().port;
  const app = await startMarketingServer({config, provider: new DemoProvider()});
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  assert.equal(app.config.port, blocker.address().port + 1);
  const runtime = JSON.parse(await readFile(path.join(config.dataDir, "runtime.json"), "utf8"));
  assert.equal(runtime.url, `http://127.0.0.1:${app.config.port}`);
});
