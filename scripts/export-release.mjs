import {cp, mkdir, readFile, readdir, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.resolve(process.argv[2] || path.join(root, "dist", "marketing-research-companion"));
const files = [
  ".dockerignore", ".env.example", ".gitignore", "Dockerfile", "LICENSE", "README.md", "SECURITY.md",
  "index.html", "package.json", "server.mjs"
];
const directories = [".github", "docs", "lib", "scripts", "test"];

await mkdir(target, {recursive: true});
for (const entry of await readdir(target)) {
  if (entry !== ".git") await rm(path.join(target, entry), {recursive: true, force: true});
}
for (const file of files) await cp(path.join(root, file), path.join(target, file));
for (const directory of directories) await cp(path.join(root, directory), path.join(target, directory), {recursive: true});

const packagePath = path.join(target, "package.json");
const pkg = JSON.parse(await readFile(packagePath, "utf8"));
delete pkg.private;
await writeFile(packagePath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

console.log(target);
