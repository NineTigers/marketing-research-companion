import {spawnSync} from "node:child_process";
import {resolveCodexBin} from "../lib/codex-bin.mjs";
import {loadConfig} from "../lib/config.mjs";

const config = loadConfig();

const failures = [];
const major = Number.parseInt(process.versions.node.split(".")[0], 10);
if (major < 22) failures.push(`Node.js 22 이상이 필요합니다. 현재 ${process.versions.node}`);
else console.log(`OK  Node.js ${process.versions.node}`);

const codexBin = resolveCodexBin(process.env.CODEX_BIN);
const version = spawnSync(codexBin, ["--version"], {encoding: "utf8"});
if (version.error || version.status !== 0) {
  failures.push("Codex CLI를 찾을 수 없습니다. ChatGPT 데스크톱 앱 또는 Codex CLI를 설치해 주세요.");
} else {
  console.log(`OK  ${(version.stdout || version.stderr).trim().split("\n")[0]}`);
  const login = spawnSync(codexBin, ["login", "status"], {encoding: "utf8"});
  const loginText = `${login.stdout || ""}\n${login.stderr || ""}`;
  if (login.status !== 0 || !/ChatGPT/i.test(loginText)) failures.push("Codex에서 ChatGPT 계정 로그인이 필요합니다. 웹 화면에서 연결하거나 `codex login`을 실행하세요.");
  else console.log("OK  ChatGPT 계정으로 Codex 로그인됨");
}

console.log(`INFO 데이터 저장 위치: ${config.dataDir}`);

if (failures.length) {
  console.error("\n준비가 필요한 항목:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("\n준비 완료. `npm start` 후 터미널에 출력된 URL을 여세요. 기본값은 http://127.0.0.1:8787 입니다.");
}
