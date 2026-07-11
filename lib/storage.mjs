import {copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile} from "node:fs/promises";
import path from "node:path";

function safeId(id) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(String(id || ""))) throw new Error("Invalid job id");
  return id;
}

function safeAssetName(name) {
  if (!/^[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/i.test(String(name || ""))) throw new Error("Invalid asset name");
  return name;
}

export class FileStore {
  constructor({dataDir, reportDir}) {
    this.dataDir = dataDir;
    this.jobsDir = path.join(dataDir, "jobs");
    this.reportDir = reportDir;
    this.uiStatePath = path.join(dataDir, "ui-state.json");
  }

  async init() {
    await Promise.all([
      mkdir(this.jobsDir, {recursive: true}),
      mkdir(this.reportDir, {recursive: true})
    ]);
    await this.recoverInterruptedJobs();
  }

  jobPath(id) {
    return path.join(this.jobsDir, safeId(id) + ".json");
  }

  async atomicJson(filePath, value) {
    const tempPath = filePath + ".tmp-" + process.pid + "-" + Date.now();
    await writeFile(tempPath, JSON.stringify(value, null, 2), {encoding: "utf8", mode: 0o600});
    await rename(tempPath, filePath);
  }

  async createJob(job) {
    await this.atomicJson(this.jobPath(job.id), job);
    return job;
  }

  async getJob(id) {
    try {
      return JSON.parse(await readFile(this.jobPath(id), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async updateJob(id, patch) {
    const current = await this.getJob(id);
    if (!current) throw new Error("Job not found");
    const next = {...current, ...patch, updatedAt: new Date().toISOString()};
    await this.atomicJson(this.jobPath(id), next);
    return next;
  }

  async listJobs(limit = 50) {
    const files = (await readdir(this.jobsDir)).filter((name) => name.endsWith(".json"));
    const jobs = [];
    for (const file of files) {
      try { jobs.push(JSON.parse(await readFile(path.join(this.jobsDir, file), "utf8"))); }
      catch (_) { /* Ignore incomplete temp or externally damaged records. */ }
    }
    return jobs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
  }

  async writeReport(id, html, reportData) {
    const reportId = safeId(id);
    const htmlPath = path.join(this.reportDir, reportId + ".html");
    const dataPath = path.join(this.reportDir, reportId + ".json");
    await writeFile(htmlPath, html, {encoding: "utf8", mode: 0o600});
    await this.atomicJson(dataPath, reportData);
    return {htmlPath, dataPath};
  }

  assetDir(id) {
    return path.join(this.reportDir, safeId(id));
  }

  async writeGeneratedImage(id, generated) {
    const reportId = safeId(id);
    const targetDir = this.assetDir(reportId);
    await mkdir(targetDir, {recursive: true});
    const sourcePath = typeof generated?.savedPath === "string" ? generated.savedPath : "";
    if (sourcePath && path.isAbsolute(sourcePath)) {
      const extension = [".png", ".jpg", ".jpeg", ".webp"].includes(path.extname(sourcePath).toLowerCase()) ? path.extname(sourcePath).toLowerCase() : ".png";
      const name = "proposal-image" + extension;
      const targetPath = path.join(targetDir, name);
      await copyFile(sourcePath, targetPath);
      return {name, path: targetPath};
    }
    let result = generated?.result;
    try {
      const parsed = JSON.parse(result);
      result = parsed.image_url || parsed.imageUrl || parsed.result || result;
    } catch (_) { /* The result may already be a data URL. */ }
    const match = /^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(String(result || ""));
    if (!match) throw new Error("생성 이미지 파일을 로컬 저장소로 옮길 수 없습니다.");
    const extension = match[1] === "jpeg" ? ".jpg" : `.${match[1]}`;
    const name = "proposal-image" + extension;
    const targetPath = path.join(targetDir, name);
    await writeFile(targetPath, Buffer.from(match[2], "base64"), {mode: 0o600});
    return {name, path: targetPath};
  }

  async readJobAssetPath(id, name) {
    const filePath = path.join(this.assetDir(id), safeAssetName(name));
    try {
      const info = await stat(filePath);
      return info.isFile() ? filePath : null;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async readReport(id) {
    try { return await readFile(path.join(this.reportDir, safeId(id) + ".html"), "utf8"); }
    catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async deleteJob(id) {
    const job = await this.getJob(id);
    if (!job) return false;
    await Promise.all([
      rm(this.jobPath(id), {force: true}),
      rm(path.join(this.reportDir, safeId(id) + ".html"), {force: true}),
      rm(path.join(this.reportDir, safeId(id) + ".json"), {force: true}),
      rm(this.assetDir(id), {recursive: true, force: true})
    ]);
    return true;
  }

  async readUiState() {
    try {
      const state = JSON.parse(await readFile(this.uiStatePath, "utf8"));
      return {
        orders: Array.isArray(state.orders) ? state.orders.slice(0, 500) : [],
        chartPreferences: state.chartPreferences && typeof state.chartPreferences === "object" ? state.chartPreferences : {}
      };
    } catch (error) {
      if (error.code === "ENOENT" || error instanceof SyntaxError) return {orders: [], chartPreferences: {}};
      throw error;
    }
  }

  async writeUiState(state) {
    const safe = {
      orders: Array.isArray(state.orders) ? state.orders.slice(0, 500) : [],
      chartPreferences: state.chartPreferences && typeof state.chartPreferences === "object" ? state.chartPreferences : {}
    };
    await this.atomicJson(this.uiStatePath, safe);
    return safe;
  }

  async recoverInterruptedJobs() {
    let files = [];
    try { files = (await readdir(this.jobsDir)).filter((name) => name.endsWith(".json")); }
    catch (_) { return; }
    for (const file of files) {
      const id = path.basename(file, ".json");
      const job = await this.getJob(id);
      if (!job || job.status !== "running") continue;
      const agents = (job.agents || []).map((agent) => agent.status === "running" ? {...agent, status: "interrupted"} : agent);
      await this.updateJob(id, {
        status: "interrupted",
        agents,
        error: "서버가 종료되어 작업이 중단되었습니다. 같은 요청으로 다시 실행할 수 있습니다."
      });
    }
  }
}
