import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
import {realpath} from "node:fs/promises";

const execFileAsync = promisify(execFile);
const EXPECTED_REPOSITORY = "github.com/NineTigers/marketing-research-companion";

function cleanRemote(value) {
  return String(value || "").trim().replace(/^git@github\.com:/, "github.com/").replace(/^https?:\/\//, "").replace(/\.git$/, "");
}

async function command(cwd, args, {allowFailure = false} = {}) {
  try {
    const result = await execFileAsync("git", args, {cwd, timeout: 60_000, maxBuffer: 1024 * 1024, env: {...process.env, GIT_TERMINAL_PROMPT: "0"}});
    return {ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim()};
  } catch (error) {
    if (allowFailure) return {ok: false, stdout: String(error.stdout || "").trim(), stderr: String(error.stderr || error.message || "").trim(), code: error.code};
    const message = String(error.stderr || error.message || "Git 명령을 실행하지 못했습니다.").trim();
    throw Object.assign(new Error(message), {statusCode: 409});
  }
}

async function repositoryState(rootDir, expectedRepository = EXPECTED_REPOSITORY) {
  const top = await command(rootDir, ["rev-parse", "--show-toplevel"], {allowFailure: true});
  const [actualTop, actualRoot] = top.ok ? await Promise.all([realpath(top.stdout), realpath(rootDir)]) : [null, null];
  if (!top.ok || actualTop !== actualRoot) {
    return {supported: false, reason: "독립 Git 설치본에서만 웹 업데이트를 사용할 수 있습니다."};
  }
  const remote = await command(rootDir, ["remote", "get-url", "origin"], {allowFailure: true});
  if (!remote.ok || cleanRemote(remote.stdout) !== cleanRemote(expectedRepository)) {
    return {supported: false, reason: "공식 Marketing Research Companion 저장소 설치본이 아닙니다."};
  }
  const branch = await command(rootDir, ["branch", "--show-current"]);
  if (branch.stdout !== "main") return {supported: false, reason: "main 브랜치에서만 웹 업데이트를 적용할 수 있습니다.", branch: branch.stdout || "detached"};
  const dirty = await command(rootDir, ["status", "--porcelain", "--untracked-files=no"]);
  const head = await command(rootDir, ["rev-parse", "HEAD"]);
  return {supported: true, branch: branch.stdout, dirty: Boolean(dirty.stdout), currentCommit: head.stdout};
}

export class GitUpdater {
  constructor({rootDir, version, expectedRepository = EXPECTED_REPOSITORY}) {
    this.rootDir = path.resolve(rootDir);
    this.version = version;
    this.expectedRepository = expectedRepository;
  }

  async check({fetchRemote = true} = {}) {
    const state = await repositoryState(this.rootDir, this.expectedRepository);
    if (!state.supported) return {...state, currentVersion: this.version, updateAvailable: false};
    if (fetchRemote) {
      const fetched = await command(this.rootDir, ["fetch", "--quiet", "origin", "main"], {allowFailure: true});
      if (!fetched.ok) return {...state, currentVersion: this.version, updateAvailable: false, reason: `원격 업데이트를 확인하지 못했습니다: ${fetched.stderr}`};
    }
    const remote = await command(this.rootDir, ["rev-parse", "refs/remotes/origin/main"], {allowFailure: true});
    if (!remote.ok) return {...state, currentVersion: this.version, updateAvailable: false, reason: "origin/main 정보를 찾을 수 없습니다."};
    const latestCommit = remote.stdout;
    const upToDate = state.currentCommit === latestCommit;
    const fastForward = upToDate || (await command(this.rootDir, ["merge-base", "--is-ancestor", state.currentCommit, latestCommit], {allowFailure: true})).ok;
    const localAhead = !upToDate && (await command(this.rootDir, ["merge-base", "--is-ancestor", latestCommit, state.currentCommit], {allowFailure: true})).ok;
    let reason = null;
    if (state.dirty) reason = "추적 파일에 로컬 변경이 있어 웹 업데이트를 적용할 수 없습니다.";
    else if (!upToDate && !fastForward) reason = localAhead ? "로컬 커밋이 원격보다 앞서 있어 수동 업데이트가 필요합니다." : "로컬과 원격 이력이 갈라져 수동 업데이트가 필요합니다.";
    return {
      ...state,
      currentVersion: this.version,
      latestCommit,
      updateAvailable: !upToDate && fastForward && !state.dirty,
      upToDate,
      fastForward,
      reason
    };
  }

  async apply() {
    const before = await this.check({fetchRemote: true});
    if (!before.supported) throw Object.assign(new Error(before.reason), {statusCode: 409});
    if (before.reason) throw Object.assign(new Error(before.reason), {statusCode: 409});
    if (!before.updateAvailable) return {...before, applied: false, restartRequired: false};
    await command(this.rootDir, ["merge", "--ff-only", "refs/remotes/origin/main"]);
    const after = await command(this.rootDir, ["rev-parse", "HEAD"]);
    return {
      ...before,
      applied: true,
      currentCommit: after.stdout,
      updateAvailable: false,
      upToDate: true,
      restartRequired: true
    };
  }
}

export {cleanRemote, repositoryState};
