import {createServer as createHttpServer} from "node:http";
import {createReadStream} from "node:fs";
import {stat, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {loadConfig, publicConfig} from "./lib/config.mjs";
import {CodexRuntime} from "./lib/codex-runtime.mjs";
import {createProvider} from "./lib/provider.mjs";
import {FileStore} from "./lib/storage.mjs";
import {createJobRecord, normalizeRequest, runResearchJob} from "./lib/workflow.mjs";
import {GitUpdater} from "./lib/updater.mjs";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf"
};

const STATIC_EXTENSIONS = new Set(Object.keys(MIME_TYPES));

function securityHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("content-security-policy", "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}

function json(res, statusCode, payload) {
  securityHeaders(res);
  res.writeHead(statusCode, {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"});
  res.end(JSON.stringify(payload));
}

function text(res, statusCode, payload) {
  securityHeaders(res);
  res.writeHead(statusCode, {"content-type": "text/plain; charset=utf-8", "cache-control": "no-store"});
  res.end(payload);
}

async function readJson(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("요청 본문이 너무 큽니다."), {statusCode: 413});
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch (_) { throw Object.assign(new Error("올바른 JSON 요청이 아닙니다."), {statusCode: 400}); }
}

function assertSameOrigin(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.origin;
  if (!origin) return;
  let originHost;
  try { originHost = new URL(origin).host; }
  catch (_) { throw Object.assign(new Error("허용되지 않은 요청 출처입니다."), {statusCode: 403}); }
  if (originHost !== req.headers.host) throw Object.assign(new Error("허용되지 않은 요청 출처입니다."), {statusCode: 403});
}

function publicJob(job) {
  if (!job) return null;
  const {reportDataPath, ...safe} = job;
  return safe;
}

async function serveStatic(req, res, config, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch (_) { return text(res, 400, "잘못된 경로입니다."); }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  if (relative.split("/").some((part) => !part || part.startsWith("."))) return text(res, 404, "찾을 수 없습니다.");
  const extension = path.extname(relative).toLowerCase();
  if (!STATIC_EXTENSIONS.has(extension)) return text(res, 404, "찾을 수 없습니다.");
  const filePath = path.resolve(config.rootDir, relative);
  if (!filePath.startsWith(config.rootDir + path.sep) && filePath !== path.join(config.rootDir, "index.html")) return text(res, 403, "허용되지 않은 경로입니다.");
  let info;
  try { info = await stat(filePath); }
  catch (_) { return text(res, 404, "찾을 수 없습니다."); }
  if (!info.isFile()) return text(res, 404, "찾을 수 없습니다.");
  securityHeaders(res);
  res.writeHead(200, {
    "content-type": MIME_TYPES[extension],
    "content-length": info.size,
    "cache-control": extension === ".html" ? "no-cache" : "public, max-age=3600"
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(filePath).pipe(res);
}

export async function createMarketingServer(options = {}) {
  const config = options.config || loadConfig({rootDir: options.rootDir || path.dirname(fileURLToPath(import.meta.url))});
  const store = options.store || new FileStore({dataDir: config.dataDir, reportDir: config.reportDir});
  await store.init();
  const runtime = options.runtime || (config.mode === "codex" ? new CodexRuntime({
    codexBin: config.codexBin,
    cwd: config.rootDir,
    requestTimeoutMs: config.requestTimeoutMs
  }) : null);
  const provider = options.provider || createProvider(config, runtime);
  const updater = options.updater || new GitUpdater({rootDir: config.rootDir, version: config.version});
  const managedService = options.managedService ?? Boolean(process.env.XPC_SERVICE_NAME || process.env.INVOCATION_ID);
  const restartProcess = options.restartProcess || (() => process.exit(0));
  const activeRuns = new Map();
  let updateInProgress = false;

  async function runtimeStatus() {
    if (config.mode === "demo") return {installed: true, connected: true, ready: true, accountType: "demo", email: null, planType: null, imageGenerationAvailable: false, reason: null};
    return runtime.status({requiredModels: config.modelCandidates});
  }

  async function requireConnected() {
    if (config.mode === "demo") return;
    const status = await runtimeStatus();
    if (!status.ready) throw Object.assign(new Error(status.reason || "ChatGPT 계정과 고정 모델을 먼저 확인해 주세요."), {statusCode: status.connected ? 409 : 401});
    return status;
  }

  async function startRun(request, runtimeState = null) {
    const jobConfig = runtimeState?.selectedModel ? {...config, model: runtimeState.selectedModel} : config;
    const job = createJobRecord(request, jobConfig);
    await store.createJob(job);
    const controller = new AbortController();
    activeRuns.set(job.id, controller);
    setImmediate(async () => {
      try { await runResearchJob({jobId: job.id, store, provider, signal: controller.signal}); }
      finally { activeRuns.delete(job.id); }
    });
    return job;
  }

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname;
    try {
      assertSameOrigin(req);
      if (pathname === "/api/health" && req.method === "GET") {
        const runtimeState = await runtimeStatus();
        return json(res, 200, {ok: true, mode: config.mode, ready: runtimeState.ready ?? runtimeState.connected, version: config.version, runtime: runtimeState});
      }
      if (pathname === "/api/config" && req.method === "GET") {
        const runtimeState = await runtimeStatus();
        return json(res, 200, {...publicConfig(config, runtimeState), runtime: runtimeState});
      }

      if (pathname === "/api/auth/chatgpt" && req.method === "POST") {
        if (config.mode !== "codex") return json(res, 409, {error: "데모 모드에서는 계정 연결을 사용하지 않습니다."});
        const login = await runtime.startChatGptLogin();
        let authUrl;
        try { authUrl = new URL(login.authUrl); }
        catch (_) { throw Object.assign(new Error("Codex가 올바른 로그인 주소를 반환하지 않았습니다."), {statusCode: 502}); }
        if (authUrl.protocol !== "https:") throw Object.assign(new Error("Codex가 안전한 로그인 주소를 반환하지 않았습니다."), {statusCode: 502});
        return json(res, 200, {authUrl: login.authUrl, loginId: login.loginId, type: login.type});
      }

      if (pathname === "/api/auth/logout" && req.method === "POST") {
        if (config.mode === "codex") await runtime.logout();
        return json(res, 200, {ok: true});
      }

      if (pathname === "/api/runtime/limits" && req.method === "GET") {
        await requireConnected();
        return json(res, 200, await runtime.rateLimits());
      }

      if (pathname === "/api/update/check" && req.method === "POST") {
        if (updateInProgress) return json(res, 409, {error: "업데이트가 이미 진행 중입니다."});
        return json(res, 200, {update: await updater.check({fetchRemote: true})});
      }

      if (pathname === "/api/update/apply" && req.method === "POST") {
        if (updateInProgress) return json(res, 409, {error: "업데이트가 이미 진행 중입니다."});
        if (activeRuns.size) return json(res, 409, {error: "실행 중인 조사가 있습니다. 완료하거나 중단한 뒤 업데이트해 주세요."});
        updateInProgress = true;
        try {
          const update = await updater.apply();
          json(res, 200, {update: {...update, automaticRestart: update.applied && managedService}});
          if (update.applied && managedService) setTimeout(async () => {
            try { await runtime?.close(); } catch (_) { /* Service manager will restart the process. */ }
            restartProcess();
          }, 400);
          return;
        } finally {
          updateInProgress = false;
        }
      }

      if (pathname === "/api/jobs" && req.method === "GET") {
        const jobs = (await store.listJobs()).map(publicJob);
        return json(res, 200, {jobs});
      }

      if (pathname === "/api/ui-state" && req.method === "GET") {
        return json(res, 200, await store.readUiState());
      }

      if (pathname === "/api/ui-state" && req.method === "PUT") {
        const state = await readJson(req, config.maxBodyBytes);
        return json(res, 200, await store.writeUiState(state));
      }

      if (pathname === "/api/research" && req.method === "POST") {
        const runtimeState = await requireConnected();
        const request = normalizeRequest(await readJson(req, config.maxBodyBytes));
        const job = await startRun(request, runtimeState);
        return json(res, 202, {job: publicJob(job)});
      }

      const jobMatch = pathname.match(/^\/api\/jobs\/([a-zA-Z0-9_-]{8,80})$/);
      if (jobMatch && req.method === "GET") {
        const job = await store.getJob(jobMatch[1]);
        return job ? json(res, 200, {job: publicJob(job)}) : json(res, 404, {error: "업무를 찾을 수 없습니다."});
      }

      const reportMatch = pathname.match(/^\/api\/jobs\/([a-zA-Z0-9_-]{8,80})\/report$/);
      if (reportMatch && req.method === "GET") {
        const report = await store.readReport(reportMatch[1]);
        if (!report) return text(res, 404, "보고서를 찾을 수 없습니다.");
        securityHeaders(res);
        res.writeHead(200, {"content-type": "text/html; charset=utf-8", "cache-control": "no-store"});
        return res.end(report);
      }

      const assetMatch = pathname.match(/^\/api\/jobs\/([a-zA-Z0-9_-]{8,80})\/assets\/([a-zA-Z0-9_-]+\.(?:png|jpe?g|webp))$/i);
      if (assetMatch && ["GET", "HEAD"].includes(req.method)) {
        const filePath = await store.readJobAssetPath(assetMatch[1], assetMatch[2]);
        if (!filePath) return text(res, 404, "이미지를 찾을 수 없습니다.");
        const info = await stat(filePath);
        securityHeaders(res);
        res.writeHead(200, {
          "content-type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
          "content-length": info.size,
          "cache-control": "private, max-age=3600"
        });
        if (req.method === "HEAD") return res.end();
        return createReadStream(filePath).pipe(res);
      }

      const cancelMatch = pathname.match(/^\/api\/jobs\/([a-zA-Z0-9_-]{8,80})\/cancel$/);
      if (cancelMatch && req.method === "POST") {
        const controller = activeRuns.get(cancelMatch[1]);
        if (!controller) return json(res, 409, {error: "현재 실행 중인 업무가 아닙니다."});
        controller.abort();
        return json(res, 202, {ok: true});
      }

      const retryMatch = pathname.match(/^\/api\/jobs\/([a-zA-Z0-9_-]{8,80})\/retry$/);
      if (retryMatch && req.method === "POST") {
        const runtimeState = await requireConnected();
        const previous = await store.getJob(retryMatch[1]);
        if (!previous) return json(res, 404, {error: "업무를 찾을 수 없습니다."});
        const job = await startRun(previous.request, runtimeState);
        return json(res, 202, {job: publicJob(job)});
      }

      if (jobMatch && req.method === "DELETE") {
        if (activeRuns.has(jobMatch[1])) return json(res, 409, {error: "실행 중인 업무는 먼저 중단해 주세요."});
        const deleted = await store.deleteJob(jobMatch[1]);
        return deleted ? json(res, 200, {ok: true}) : json(res, 404, {error: "업무를 찾을 수 없습니다."});
      }

      if (["GET", "HEAD"].includes(req.method)) return await serveStatic(req, res, config, pathname);
      return json(res, 405, {error: "지원하지 않는 요청입니다."});
    } catch (error) {
      const statusCode = error.statusCode || (error.message?.startsWith("필수 입력") ? 400 : 500);
      if (statusCode >= 500) console.error(new Date().toISOString(), error);
      return json(res, statusCode, {error: statusCode >= 500 ? "서버 처리 중 문제가 발생했습니다." : error.message});
    }
  });

  server.on("close", () => {
    activeRuns.forEach((controller) => controller.abort());
    runtime?.close().catch(() => {});
  });
  return {server, config, store, runtime, updater};
}

export async function listenWithFallback(server, host, preferredPort, attempts = 20) {
  let lastError;
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = preferredPort + offset;
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      });
      return port;
    } catch (error) {
      lastError = error;
      if (error.code !== "EADDRINUSE") throw error;
    }
  }
  throw Object.assign(new Error(`${preferredPort}부터 ${attempts}개 포트를 확인했지만 사용할 수 없습니다.`), {cause: lastError});
}

export async function startMarketingServer(options = {}) {
  const app = await createMarketingServer(options);
  const preferredPort = app.config.port;
  app.config.port = await listenWithFallback(app.server, app.config.host, preferredPort);
  const url = `http://${app.config.host}:${app.config.port}`;
  await writeFile(path.join(app.config.dataDir, "runtime.json"), JSON.stringify({
    url,
    pid: process.pid,
    mode: app.config.mode,
    startedAt: new Date().toISOString(),
    preferredPort
  }, null, 2) + "\n", {encoding: "utf8", mode: 0o600});
  if (app.config.port !== preferredPort) console.warn(`Port ${preferredPort} is occupied; using ${app.config.port}.`);
  console.log(`Marketing research team: ${url} (${app.config.mode})`);
  return app;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  startMarketingServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
