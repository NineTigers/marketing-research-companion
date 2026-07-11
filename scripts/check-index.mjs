import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
if (!scripts.length) throw new Error("index.html에서 검사할 스크립트를 찾지 못했습니다.");
for (const source of scripts) new Function(source);
console.log(`index.html inline scripts: ${scripts.length} valid`);
