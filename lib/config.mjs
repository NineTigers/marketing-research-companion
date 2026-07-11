import {existsSync, readFileSync} from "node:fs";
import path from "node:path";
import {resolveCodexBin} from "./codex-bin.mjs";

const ALLOWED_ENV_KEYS = new Set([
  "MARKETING_RUNTIME",
  "CODEX_BIN",
  "PORT",
  "HOST",
  "DATA_DIR"
]);

function loadDotEnv(rootDir, env) {
  const envPath = path.join(rootDir, ".env");
  if (!existsSync(envPath)) return;
  const source = readFileSync(envPath, "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!ALLOWED_ENV_KEYS.has(key) || env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
}

function integer(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig({rootDir = process.cwd(), env = process.env} = {}) {
  loadDotEnv(rootDir, env);
  const requestedMode = String(env.MARKETING_RUNTIME || "codex").trim().toLowerCase();
  const mode = requestedMode === "demo" ? "demo" : "codex";
  const dataDir = path.resolve(rootDir, env.DATA_DIR || ".data");
  return {
    version: "3.1.0",
    rootDir: path.resolve(rootDir),
    dataDir,
    reportDir: path.join(dataDir, "reports"),
    host: env.HOST || "127.0.0.1",
    port: integer(env.PORT, 8787),
    mode,
    ready: mode === "demo",
    codexBin: resolveCodexBin(env.CODEX_BIN),
    model: "gpt-5.6-terra",
    fallbackModel: "gpt-5.5",
    modelCandidates: ["gpt-5.6-terra", "gpt-5.5"],
    reasoningEffort: "high",
    maxBodyBytes: 512 * 1024,
    requestTimeoutMs: 15 * 60 * 1000
  };
}

export function publicConfig(config, runtime = null) {
  const connected = config.mode === "demo" || Boolean(runtime?.ready ?? runtime?.connected);
  return {
    version: config.version,
    mode: config.mode,
    ready: connected,
    model: config.mode === "codex" ? (runtime?.selectedModel || config.model) : "deterministic-demo",
    primaryModel: config.mode === "codex" ? config.model : null,
    fallbackModel: config.mode === "codex" ? config.fallbackModel : null,
    modelCandidates: config.mode === "codex" ? config.modelCandidates : [],
    fallbackUsed: config.mode === "codex" ? Boolean(runtime?.fallbackUsed) : false,
    reasoningEffort: config.mode === "codex" ? config.reasoningEffort : "deterministic",
    persistence: "server-local",
    capabilities: {
      chatgptOAuth: config.mode === "codex",
      webResearch: config.mode === "codex" && connected,
      vocAnalysis: true,
      agentWorkflow: true,
      reportGeneration: true,
      imageGeneration: config.mode === "codex" && connected && Boolean(runtime?.imageGenerationAvailable)
    }
  };
}
