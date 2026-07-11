import {spawn} from "node:child_process";
import {createInterface} from "node:readline";
import {EventEmitter} from "node:events";

function runtimeError(message, details = "") {
  const error = new Error(message);
  error.details = details;
  return error;
}

export class CodexRuntime extends EventEmitter {
  constructor({codexBin = "codex", cwd = process.cwd(), requestTimeoutMs = 30 * 60 * 1000, spawnProcess = spawn} = {}) {
    super();
    this.codexBin = codexBin;
    this.cwd = cwd;
    this.requestTimeoutMs = requestTimeoutMs;
    this.spawnProcess = spawnProcess;
    this.process = null;
    this.pending = new Map();
    this.nextId = 1;
    this.starting = null;
    this.stderr = "";
    this.modelCache = null;
    this.capabilityCache = null;
  }

  async start() {
    if (this.process && !this.process.killed) return;
    if (this.starting) return this.starting;
    this.starting = this.#startProcess();
    try { await this.starting; }
    finally { this.starting = null; }
  }

  async #startProcess() {
    const child = this.spawnProcess(this.codexBin, ["app-server", "--listen", "stdio://"], {
      cwd: this.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.process = child;
    this.stderr = "";
    child.stderr.on("data", (chunk) => {
      this.stderr = (this.stderr + chunk.toString("utf8")).slice(-8000);
    });
    child.once("error", (error) => this.#handleExit(runtimeError("Codex 실행기를 시작할 수 없습니다.", error.message)));
    child.once("exit", (code, signal) => {
      const detail = [code !== null ? `exit ${code}` : "", signal || "", this.stderr].filter(Boolean).join("\n");
      this.#handleExit(runtimeError("Codex 실행기가 종료되었습니다.", detail));
    });
    const lines = createInterface({input: child.stdout, crlfDelay: Infinity});
    lines.on("line", (line) => this.#handleLine(line));
    await this.request("initialize", {
      clientInfo: {name: "marketing_research_companion", title: "Marketing Research Companion", version: "3.0.0"},
      capabilities: {optOutNotificationMethods: ["item/agentMessage/delta"]}
    }, 15000, false);
    this.notify("initialized", {});
  }

  #handleLine(line) {
    let message;
    try { message = JSON.parse(line); }
    catch (_) { return; }
    if (message.id !== undefined && (message.result !== undefined || message.error)) {
      const pending = this.pending.get(String(message.id));
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(String(message.id));
      if (message.error) pending.reject(runtimeError(message.error.message || "Codex 요청이 실패했습니다.", JSON.stringify(message.error)));
      else pending.resolve(message.result);
      return;
    }
    if (message.method) {
      this.emit("notification", message);
      this.emit(message.method, message.params || {});
    }
  }

  #handleExit(error) {
    const child = this.process;
    this.process = null;
    if (child && !child.killed) child.kill();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.emit("runtimeExit", error);
  }

  async request(method, params = {}, timeoutMs = this.requestTimeoutMs, ensureStarted = true) {
    if (ensureStarted) await this.start();
    if (!this.process?.stdin?.writable) throw runtimeError("Codex 실행기가 연결되지 않았습니다.", this.stderr);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        reject(runtimeError(`Codex 요청 시간이 초과되었습니다: ${method}`));
      }, timeoutMs);
      this.pending.set(String(id), {resolve, reject, timer});
      this.process.stdin.write(JSON.stringify({method, id, params}) + "\n");
    });
  }

  notify(method, params = {}) {
    if (!this.process?.stdin?.writable) return;
    this.process.stdin.write(JSON.stringify({method, params}) + "\n");
  }

  async getAccount({refresh = false} = {}) {
    const result = await this.request("account/read", {refreshToken: refresh}, 30000);
    return result.account || null;
  }

  async listModels({refresh = false} = {}) {
    if (!refresh && this.modelCache && Date.now() - this.modelCache.checkedAt < 5 * 60 * 1000) return this.modelCache.models;
    const result = await this.request("model/list", {}, 30000);
    const models = Array.isArray(result.data) ? result.data : [];
    this.modelCache = {models, checkedAt: Date.now()};
    return models;
  }

  async capabilities({refresh = false} = {}) {
    if (!refresh && this.capabilityCache && Date.now() - this.capabilityCache.checkedAt < 5 * 60 * 1000) return this.capabilityCache.value;
    const value = await this.request("modelProvider/capabilities/read", {}, 30000);
    this.capabilityCache = {value, checkedAt: Date.now()};
    return value;
  }

  async status({requiredModel = null, requiredModels = []} = {}) {
    try {
      const account = await this.getAccount();
      const connected = account?.type === "chatgpt";
      const candidates = requiredModels.length ? requiredModels : (requiredModel ? [requiredModel] : []);
      let modelAvailable = null;
      let selectedModel = null;
      let imageGenerationAvailable = null;
      if (connected && candidates.length) {
        const [models, capabilities] = await Promise.all([this.listModels(), this.capabilities().catch(() => null)]);
        selectedModel = candidates.find((candidate) => models.some((item) => item.id === candidate || item.model === candidate)) || null;
        modelAvailable = Boolean(selectedModel);
        imageGenerationAvailable = Boolean(capabilities?.imageGeneration);
      }
      const ready = connected && modelAvailable !== false;
      return {
        installed: true,
        connected,
        ready,
        accountType: account?.type || null,
        email: account?.type === "chatgpt" ? account.email : null,
        planType: account?.type === "chatgpt" ? account.planType : null,
        requiredModel: candidates[0] || null,
        requiredModels: candidates,
        selectedModel,
        fallbackUsed: Boolean(selectedModel && candidates[0] && selectedModel !== candidates[0]),
        modelAvailable,
        imageGenerationAvailable,
        reason: modelAvailable === false ? `${candidates.join(" 또는 ")} 모델을 현재 Codex 계정에서 사용할 수 없습니다.` : (account?.type === "apiKey" ? "ChatGPT 계정 로그인이 필요합니다." : (account ? null : "ChatGPT 계정을 연결해 주세요."))
      };
    } catch (error) {
      return {installed: false, connected: false, ready: false, accountType: null, email: null, planType: null, requiredModel, requiredModels, selectedModel: null, fallbackUsed: false, modelAvailable: null, imageGenerationAvailable: null, reason: error.message, details: error.details || ""};
    }
  }

  async startChatGptLogin() {
    return this.request("account/login/start", {type: "chatgpt", useHostedLoginSuccessPage: true}, 30000);
  }

  async logout() {
    await this.request("account/logout", {}, 30000);
    this.modelCache = null;
    this.capabilityCache = null;
  }

  async rateLimits() {
    return this.request("account/rateLimits/read", {}, 30000);
  }

  async runStructured({prompt, outputSchema, cwd = this.cwd, model = "gpt-5.6-terra", effort = "high", signal, onEvent}) {
    const account = await this.getAccount({refresh: true});
    if (account?.type !== "chatgpt") throw Object.assign(new Error("ChatGPT 계정을 먼저 연결해 주세요."), {statusCode: 401});
    const thread = await this.request("thread/start", {
      cwd,
      model,
      sandbox: "read-only",
      approvalPolicy: "never",
      personality: "pragmatic",
      ephemeral: false
    });
    const threadId = thread.thread.id;
    let finalText = "";
    let turnId = null;
    let settled = false;
    const events = [];

    const cleanup = () => {
      this.off("item/completed", itemCompleted);
      this.off("turn/completed", turnCompleted);
      signal?.removeEventListener("abort", abortTurn);
    };
    const itemCompleted = (params) => {
      if (params.threadId !== threadId) return;
      const item = params.item || {};
      events.push({type: item.type, query: item.query || null});
      if (item.type === "agentMessage") finalText = item.text;
      onEvent?.({type: item.type, item, threadId, turnId: params.turnId});
    };
    const abortTurn = () => {
      if (turnId) this.request("turn/interrupt", {threadId, turnId}, 15000).catch(() => {});
    };

    this.on("item/completed", itemCompleted);
    signal?.addEventListener("abort", abortTurn, {once: true});
    try {
      const completion = new Promise((resolve, reject) => {
        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          cleanup();
          fn(value);
        };
        turnCompleted = (params) => {
          if (params.threadId !== threadId || (turnId && params.turn.id !== turnId)) return;
          if (params.turn.status === "completed") finish(resolve, params.turn);
          else if (params.turn.status === "interrupted") finish(reject, new DOMException("Codex turn interrupted", "AbortError"));
          else finish(reject, runtimeError(params.turn.error?.message || "Codex 작업이 실패했습니다.", JSON.stringify(params.turn.error || {})));
        };
        this.on("turn/completed", turnCompleted);
      });
      // Declared before use by the completion callback above.
      var turnCompleted;
      const started = await this.request("turn/start", {
        threadId,
        input: [{type: "text", text: prompt}],
        effort,
        outputSchema
      });
      turnId = started.turn.id;
      if (signal?.aborted) abortTurn();
      await completion;
      if (!finalText) throw runtimeError("Codex가 최종 결과를 반환하지 않았습니다.");
      return {data: JSON.parse(finalText), threadId, turnId, events};
    } finally {
      cleanup();
    }
  }

  async runImageGeneration({prompt, cwd = this.cwd, model = "gpt-5.6-terra", effort = "high", referenceImagePaths = [], signal, onEvent}) {
    const account = await this.getAccount({refresh: true});
    if (account?.type !== "chatgpt") throw Object.assign(new Error("ChatGPT 계정을 먼저 연결해 주세요."), {statusCode: 401});
    const capabilities = await this.capabilities({refresh: true});
    if (!capabilities?.imageGeneration) throw Object.assign(new Error("현재 Codex 계정 런타임은 이미지 생성을 지원하지 않습니다."), {statusCode: 409});
    const thread = await this.request("thread/start", {
      cwd,
      model,
      sandbox: "workspace-write",
      approvalPolicy: "never",
      personality: "pragmatic",
      ephemeral: false
    });
    const threadId = thread.thread.id;
    let turnId = null;
    let settled = false;
    let generated = null;

    const cleanup = () => {
      this.off("item/completed", itemCompleted);
      this.off("turn/completed", turnCompleted);
      signal?.removeEventListener("abort", abortTurn);
    };
    const itemCompleted = (params) => {
      if (params.threadId !== threadId) return;
      const item = params.item || {};
      if (item.type === "imageGeneration") generated = item;
      onEvent?.({type: item.type, item, threadId, turnId: params.turnId});
    };
    const abortTurn = () => {
      if (turnId) this.request("turn/interrupt", {threadId, turnId}, 15000).catch(() => {});
    };
    let turnCompleted;

    this.on("item/completed", itemCompleted);
    signal?.addEventListener("abort", abortTurn, {once: true});
    try {
      const completion = new Promise((resolve, reject) => {
        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          cleanup();
          fn(value);
        };
        turnCompleted = (params) => {
          if (params.threadId !== threadId || (turnId && params.turn.id !== turnId)) return;
          if (params.turn.status === "completed") finish(resolve, params.turn);
          else if (params.turn.status === "interrupted") finish(reject, new DOMException("Codex turn interrupted", "AbortError"));
          else finish(reject, runtimeError(params.turn.error?.message || "Codex 이미지 생성이 실패했습니다.", JSON.stringify(params.turn.error || {})));
        };
        this.on("turn/completed", turnCompleted);
      });
      const started = await this.request("turn/start", {
        threadId,
        input: [
          {type: "text", text: prompt},
          ...referenceImagePaths.filter((item) => typeof item === "string" && item.startsWith("/")).slice(0, 5).map((imagePath) => ({type: "localImage", path: imagePath}))
        ],
        effort
      });
      turnId = started.turn.id;
      if (signal?.aborted) abortTurn();
      await completion;
      if (!generated || generated.status === "failed") throw runtimeError("Codex가 생성 이미지를 반환하지 않았습니다.", generated?.result || "");
      return {...generated, threadId, turnId};
    } finally {
      cleanup();
    }
  }

  async close() {
    if (!this.process) return;
    const child = this.process;
    this.process = null;
    child.stdin.end();
    if (!child.killed) child.kill("SIGTERM");
  }
}
