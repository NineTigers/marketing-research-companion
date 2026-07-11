import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
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
import {calculateSalesEstimate} from "../lib/commercial-calculator.mjs";
import {collectOfficialProductImages, extractProductImageCandidates} from "../lib/product-images.mjs";
import {renderCharts} from "../lib/chart-renderer.mjs";
import {CodexRuntime} from "../lib/codex-runtime.mjs";

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
    chartPlan: [{evidenceId: "voc", evidenceLabel: "고객 VOC", chartType: "bar", chartLabel: "막대 차트"}],
    ...overrides
  });
}

test("configuration pins Terra high without API secrets", async (t) => {
  const root = await tempRoot(t);
  const config = loadConfig({rootDir: root, env: {CODEX_MODEL: "test-model"}});
  const visible = publicConfig(config, {connected: true});
  assert.equal(config.mode, "codex");
  assert.equal(visible.ready, true);
  assert.equal(visible.mode, "codex");
  assert.equal(visible.model, "gpt-5.6-terra");
  assert.equal(visible.fallbackModel, "gpt-5.5");
  assert.deepEqual(visible.modelCandidates, ["gpt-5.6-terra", "gpt-5.5"]);
  assert.equal(visible.reasoningEffort, "high");
  assert.equal(publicConfig(config, {connected: true, ready: false}).ready, false);
  const job = createJobRecord(request(), config);
  assert.equal(job.model, "gpt-5.6-terra");
  assert.equal(job.reasoningEffort, "high");
  assert.equal(job.agents.find((agent) => agent.id === "scope").note, "");
  assert.equal(job.agents.find((agent) => agent.id === "visual").note, "공식 제품 이미지만 수집");
  const fallbackVisible = publicConfig(config, {connected: true, ready: true, selectedModel: "gpt-5.5", fallbackUsed: true});
  assert.equal(fallbackVisible.model, "gpt-5.5");
  assert.equal(fallbackVisible.fallbackUsed, true);
  const imageVisible = publicConfig(config, {connected: true, ready: true, selectedModel: "gpt-5.6-terra", imageGenerationAvailable: true});
  assert.equal(imageVisible.capabilities.imageGeneration, true);
  assert.equal("apiKey" in visible, false);
  assert.equal("baseUrl" in config, false);
  assert.equal(typeof resolveCodexBin(), "string");
});

test("request normalization rejects missing business scope", () => {
  assert.throws(() => normalizeRequest({product: "", stage: "토들러", decision: "진행"}), /필수 입력/);
  assert.equal(request({sourceUrls: ["javascript:alert(1)", "https://example.com"]}).sourceUrls.length, 1);
  assert.equal(request().generateImages, false);
  assert.equal(request({generateImages: true}).generateImages, true);
  assert.deepEqual(request().chartPlan.map(({evidenceId, chartType}) => ({evidenceId, chartType})), [{evidenceId: "voc", chartType: "bar"}]);
  assert.equal(request({chartPlan: [{evidenceId: "custom:%EC%96%B4%EB%A6%B0%EC%9D%B4%EC%A7%91", evidenceLabel: "어린이집", chartType: "matrix", chartLabel: "평가 매트릭스"}]}).chartPlan[0].evidenceId.startsWith("custom:"), true);
  assert.equal(request({taskId: "unknown"}).taskId, "custom");
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
  assert.equal(completed.agents.every((agent) => ["completed", "warning", "skipped"].includes(agent.status)), true);
  const html = await store.readReport(job.id);
  assert.match(html, /데모 분석/);
  assert.match(html, /고객 반응/);
  const data = JSON.parse(await readFile(path.join(config.reportDir, job.id + ".json"), "utf8"));
  assert.equal(data.mode, "demo");
});

test("optional image generation pairs an official image with the same-product usage image", async (t) => {
  const root = await tempRoot(t);
  const config = demoConfig(root);
  const store = new FileStore({dataDir: config.dataDir, reportDir: config.reportDir});
  await store.init();
  const generatedPath = path.join(root, "generated.png");
  const officialPath = path.join(root, "official.png");
  await writeFile(generatedPath, Buffer.from("89504e470d0a1a0a", "hex"));
  await writeFile(officialPath, Buffer.from("89504e470d0a1a0a", "hex"));
  const provider = new DemoProvider();
  const calls = [];
  provider.generateProductUsageImage = async (input) => {
    calls.push(input);
    return {savedPath: generatedPath, revisedPrompt: "동일 제품 사용 장면"};
  };
  const imageCollector = async ({jobId, report, store: collectorStore}) => Promise.all(report.competitors.map(async (item, index) => {
    const asset = await collectorStore.writeJobAssetBuffer(jobId, `competitor-${index + 1}-official.png`, await readFile(officialPath));
    return {index, brand: item.brand, product: item.product, official: {url: `/api/jobs/${jobId}/assets/${asset.name}`, localPath: asset.path, originalUrl: "https://example.com/image.png", sourceUrl: "https://example.com/product", checkedAt: "2026-07-12"}, generated: null, warning: null};
  }));
  const job = createJobRecord(request({generateImages: true}), config);
  await store.createJob(job);
  await runResearchJob({jobId: job.id, store, provider, imageCollector, signal: new AbortController().signal});
  const completed = await store.getJob(job.id);
  assert.equal(completed.productVisuals.length, 3);
  assert.match(completed.productVisuals[0].official.url, /competitor-1-official\.png$/);
  assert.match(completed.productVisuals[0].generated.url, /competitor-1-generated\.png$/);
  assert.equal("localPath" in completed.productVisuals[0].official, false);
  assert.equal(calls[0].referenceImagePath, path.join(config.reportDir, job.id, "competitor-1-official.png"));
  assert.equal(completed.agents.find((agent) => agent.id === "visual").status, "completed");
  assert.ok(await store.readJobAssetPath(job.id, "competitor-1-generated.png"));
  assert.match(await store.readReport(job.id), /동일 제품 사용 장면/);
});

test("Codex provider requests web evidence and structured output from the account runtime", async () => {
  const demoReport = await new DemoProvider().synthesize({request: request(), sources: []});
  const calls = [];
  const imageCalls = [];
  const runtime = {listModels: async () => [{id: "gpt-5.5", model: "gpt-5.5"}], runStructured: async (input) => {
    calls.push(input);
    if (calls.length === 1) return {data: {text: "source-backed research", sources: [{url: "https://example.com/source", title: "Example", sourceType: "official", checkedAt: "2026-07-11"}]}};
    if (calls.length === 2) return {data: demoReport};
    return {data: {sources: [{url: "https://example.com/source", title: "Example", sourceType: "official", checkedAt: "2026-07-11"}], report: demoReport}};
  }, runImageGeneration: async (input) => {
    imageCalls.push(input);
    return {savedPath: "/tmp/generated.png", status: "completed"};
  }};
  const provider = new CodexProvider({model: "gpt-5.6-terra", fallbackModel: "gpt-5.5", modelCandidates: ["gpt-5.6-terra", "gpt-5.5"], reasoningEffort: "high", rootDir: process.cwd()}, runtime);
  const research = await provider.webResearch({kind: "market", request: request(), depth: "quick", signal: new AbortController().signal});
  assert.equal(research.text, "source-backed research");
  assert.deepEqual(research.sources.map((source) => source.url), ["https://example.com/source"]);
  assert.match(calls[0].prompt, /최신 웹 검색/);
  assert.equal(calls[0].outputSchema.required.includes("sources"), true);
  assert.equal(calls[0].model, "gpt-5.5");
  assert.equal(calls[0].effort, "high");
  const report = await provider.synthesize({request: request(), research: {market: "m", competitor: "c", voc: "v"}, sources: research.sources, signal: new AbortController().signal});
  assert.equal(report.title, demoReport.title);
  assert.equal(calls[1].outputSchema.required.includes("commercialEstimate"), true);
  assert.equal(calls[1].model, "gpt-5.5");
  assert.equal(calls[1].effort, "high");
  const full = await provider.fullResearch({request: request(), signal: new AbortController().signal});
  assert.equal(full.report.title, demoReport.title);
  assert.match(calls[2].prompt, /제품군을 조사 경계로 고정/);
  assert.match(calls[2].prompt, /리뷰 수÷리뷰 작성률/);
  assert.match(calls[2].prompt, /조회 수×구매 전환율/);
  assert.equal(calls[2].outputSchema.properties.report.properties.competitors.items.properties.salesEstimate.required.includes("method"), true);
  assert.equal(calls[2].outputSchema.required.includes("sources"), true);
  assert.equal(calls[2].model, "gpt-5.5");
  assert.equal(calls[2].effort, "high");
  await provider.generateProductUsageImage({request: request(), competitor: demoReport.competitors[0], referenceImagePath: "/tmp/official.png", signal: new AbortController().signal});
  assert.match(imageCalls[0].prompt, /이미지 생성 도구를 정확히 한 번/);
  assert.deepEqual(imageCalls[0].referenceImagePaths, ["/tmp/official.png"]);
  assert.equal(imageCalls[0].model, "gpt-5.5");
  assert.equal(imageCalls[0].effort, "high");
});

test("sales estimates are deterministically back-calculated and verified", () => {
  const estimate = calculateSalesEstimate({
    method: "review_backcast", calculationInput: {currency: "KRW", periodMonths: 10, price: 40000, signalValue: 100, rateLow: 0.01, rateBase: 0.02, rateHigh: 0.04}
  });
  assert.equal(estimate.calculated.verified, true);
  assert.equal(estimate.calculated.monthlyUnits.base, 500);
  assert.equal(estimate.calculated.monthlyRevenue.base, 20000000);
  assert.equal(estimate.formula, "리뷰수 ÷ 리뷰 작성률 ÷ 관측 개월 × 적용 가격");
});

test("official product image metadata is extracted, downloaded, and cached", async (t) => {
  const root = await tempRoot(t);
  const config = demoConfig(root);
  const store = new FileStore({dataDir: config.dataDir, reportDir: config.reportDir});
  await store.init();
  const job = createJobRecord(request(), config);
  await store.createJob(job);
  const html = '<meta property="og:image" content="https://cdn.example.com/product.jpg"><script type="application/ld+json">{"@type":"Product","image":"https://cdn.example.com/product-2.jpg"}</script>';
  assert.deepEqual(extractProductImageCandidates(html, "https://shop.example.com/item"), ["https://cdn.example.com/product.jpg", "https://cdn.example.com/product-2.jpg"]);
  const fetchImpl = async (url) => String(url).includes("product.jpg")
    ? new Response(Buffer.from("jpeg"), {status: 200, headers: {"content-type": "image/jpeg"}})
    : new Response(html, {status: 200, headers: {"content-type": "text/html"}});
  const report = {competitors: [{brand: "브랜드", product: "제품", productUrl: "https://shop.example.com/item", officialImageUrl: "https://cdn.example.com/product.jpg", checkedAt: "2026-07-12", officialImageCheckedAt: "2026-07-12"}]};
  const visuals = await collectOfficialProductImages({jobId: job.id, report, store, fetchImpl, dnsLookup: async () => [{address: "93.184.216.34", family: 4}]});
  assert.match(visuals[0].official.url, /competitor-1-official\.jpg$/);
  assert.ok(await store.readJobAssetPath(job.id, "competitor-1-official.jpg"));
});

test("chart renderer produces escaped inline SVG", () => {
  const html = renderCharts([{evidenceId: "voc", type: "bar", title: "<VOC>", unit: "%", note: "표본", sourceRefs: ["https://example.com"], points: [{label: "세탁", value: 40, secondaryValue: 0, low: 30, high: 50, group: "만족"}]}], () => "근거");
  assert.match(html, /<svg/);
  assert.match(html, /&lt;VOC&gt;/);
  assert.equal(html.includes("<VOC>"), false);
});

test("Codex image turns include local official-image references", async () => {
  const runtime = new CodexRuntime();
  const calls = [];
  runtime.getAccount = async () => ({type: "chatgpt"});
  runtime.capabilities = async () => ({imageGeneration: true});
  runtime.request = async (method, params) => {
    calls.push({method, params});
    if (method === "thread/start") return {thread: {id: "thread-1"}};
    if (method === "turn/start") {
      queueMicrotask(() => {
        runtime.emit("item/completed", {threadId: "thread-1", turnId: "turn-1", item: {type: "imageGeneration", status: "completed", savedPath: "/tmp/generated.png"}});
        runtime.emit("turn/completed", {threadId: "thread-1", turn: {id: "turn-1", status: "completed"}});
      });
      return {turn: {id: "turn-1"}};
    }
    throw new Error(`Unexpected method: ${method}`);
  };
  const result = await runtime.runImageGeneration({prompt: "같은 제품", referenceImagePaths: ["/tmp/official.png"], signal: new AbortController().signal});
  const turn = calls.find((call) => call.method === "turn/start");
  assert.deepEqual(turn.params.input, [{type: "text", text: "같은 제품"}, {type: "localImage", path: "/tmp/official.png"}]);
  assert.equal(result.savedPath, "/tmp/generated.png");
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
  const {server, store} = await createMarketingServer({config, provider: new DemoProvider()});
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
  const generatedPath = path.join(root, "api-generated.png");
  await writeFile(generatedPath, Buffer.from("89504e470d0a1a0a", "hex"));
  const asset = await store.writeGeneratedImage(job.id, {savedPath: generatedPath});
  const assetResponse = await fetch(base + `/api/jobs/${job.id}/assets/${asset.name}`);
  assert.equal(assetResponse.status, 200);
  assert.equal(assetResponse.headers.get("content-type"), "image/png");

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
