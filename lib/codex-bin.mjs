import {existsSync} from "node:fs";

const MAC_CHATGPT_CODEX = "/Applications/ChatGPT.app/Contents/Resources/codex";

export function resolveCodexBin(value = "") {
  const configured = String(value || "").trim();
  if (configured && configured !== "codex") return configured;
  if (process.platform === "darwin" && existsSync(MAC_CHATGPT_CODEX)) return MAC_CHATGPT_CODEX;
  return configured || "codex";
}
