import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {loadConfig} from "../lib/config.mjs";

const action = process.argv[2];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = loadConfig({rootDir: root});
const nodeBin = process.execPath;
const codexBin = config.codexBin;

function run(command, args) {
  const result = spawnSync(command, args, {stdio: "inherit"});
  if (result.status !== 0) throw new Error(`${command} 명령이 실패했습니다.`);
}

function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function systemdQuote(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`;
}

async function showRuntime() {
  try {
    const runtime = JSON.parse(await readFile(path.join(config.dataDir, "runtime.json"), "utf8"));
    if (runtime.url) console.log(`서비스 URL: ${runtime.url}`);
    console.log(`데이터 위치: ${config.dataDir}`);
  } catch (_) { /* Service may not have completed startup yet. */ }
}

async function macService() {
  const label = "com.ninetigers.marketing-research-companion";
  const dir = path.join(os.homedir(), "Library", "LaunchAgents");
  const file = path.join(dir, label + ".plist");
  const domain = `gui/${process.getuid()}`;
  if (action === "uninstall") {
    spawnSync("launchctl", ["bootout", domain, file], {stdio: "ignore"});
    await rm(file, {force: true});
    console.log("자동 시작 서비스를 제거했습니다.");
    return;
  }
  if (action === "status") {
    run("launchctl", ["print", `${domain}/${label}`]);
    await showRuntime();
    return;
  }
  await mkdir(dir, {recursive: true});
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(nodeBin)}</string><string>${xml(path.join(root, "server.mjs"))}</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>EnvironmentVariables</key><dict><key>CODEX_BIN</key><string>${xml(codexBin)}</string><key>HOST</key><string>127.0.0.1</string><key>PORT</key><string>8787</string><key>DATA_DIR</key><string>${xml(config.dataDir)}</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>${xml(path.join(config.dataDir, "service.log"))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(config.dataDir, "service-error.log"))}</string>
</dict></plist>`;
  await mkdir(config.dataDir, {recursive: true});
  await writeFile(file, plist, "utf8");
  spawnSync("launchctl", ["bootout", domain, file], {stdio: "ignore"});
  run("launchctl", ["bootstrap", domain, file]);
  console.log(`자동 시작 서비스를 설치했습니다: http://127.0.0.1:8787`);
}

async function linuxService() {
  const dir = path.join(os.homedir(), ".config", "systemd", "user");
  const file = path.join(dir, "marketing-research-companion.service");
  if (action === "uninstall") {
    spawnSync("systemctl", ["--user", "disable", "--now", path.basename(file)], {stdio: "ignore"});
    await rm(file, {force: true});
    run("systemctl", ["--user", "daemon-reload"]);
    console.log("자동 시작 서비스를 제거했습니다.");
    return;
  }
  if (action === "status") {
    run("systemctl", ["--user", "status", path.basename(file)]);
    await showRuntime();
    return;
  }
  await mkdir(dir, {recursive: true});
  await mkdir(config.dataDir, {recursive: true});
  const unit = `[Unit]\nDescription=Marketing Research Companion\nAfter=network.target\n\n[Service]\nType=simple\nWorkingDirectory=${root}\nEnvironment=${systemdQuote(`CODEX_BIN=${codexBin}`)}\nEnvironment=HOST=127.0.0.1\nEnvironment=PORT=8787\nEnvironment=${systemdQuote(`DATA_DIR=${config.dataDir}`)}\nExecStart=${systemdQuote(nodeBin)} ${systemdQuote(path.join(root, "server.mjs"))}\nRestart=always\nRestartSec=3\n\n[Install]\nWantedBy=default.target\n`;
  await writeFile(file, unit, "utf8");
  run("systemctl", ["--user", "daemon-reload"]);
  run("systemctl", ["--user", "enable", "--now", path.basename(file)]);
  console.log("자동 시작 서비스를 설치했습니다: http://127.0.0.1:8787");
}

if (!["install", "uninstall", "status"].includes(action)) {
  console.error("사용법: node scripts/service.mjs install|uninstall|status");
  process.exitCode = 2;
} else if (process.platform === "darwin") {
  await macService();
} else if (process.platform === "linux") {
  await linuxService();
} else {
  console.error("자동 시작 설치는 현재 macOS와 Linux를 지원합니다. Windows에서는 npm start를 사용하세요.");
  process.exitCode = 1;
}
