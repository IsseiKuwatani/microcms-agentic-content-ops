import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".git", "node_modules", ".next", "dist", "reports", "proposals", "drafts"]);
const textExtensions = new Set([".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml", ".ps1", ".txt", ".env"]);
const forbidden = [
  { label: "site domain", pattern: new RegExp("fitness-" + "fc\\.com", "i") },
  { label: "analytics property id", pattern: new RegExp("502" + "560397") },
  { label: "analytics account id", pattern: new RegExp("355" + "667449") },
  { label: "production repository name", pattern: new RegExp("ffc-" + "navi", "i") }
];
const secretPatterns = [
  { label: "OpenAI key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { label: "microCMS key value", pattern: /MICROCMS_(?:READ_)?API_KEY\s*=\s*(?!replace-with|your-|$)[A-Za-z0-9._-]{20,}/i }
];

async function walk(directory, files = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    if (entry.name === ".env" || (entry.name.startsWith(".env.") && entry.name !== ".env.example")) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(fullPath, files);
    else if (textExtensions.has(path.extname(entry.name).toLowerCase()) || entry.name === "LICENSE") files.push(fullPath);
  }
  return files;
}

export async function scanPublicSafety(directory = root) {
  const findings = [];
  for (const filePath of await walk(directory)) {
    const relative = path.relative(directory, filePath);
    const content = await fs.readFile(filePath, "utf8");
    for (const rule of [...forbidden, ...secretPatterns]) {
      if (rule.pattern.test(content)) findings.push({ file: relative, rule: rule.label });
    }
  }
  return findings;
}

if (process.argv[1]?.endsWith("public-safety-check.js")) {
  scanPublicSafety().then((findings) => {
    if (findings.length) {
      console.error(JSON.stringify({ safe: false, findings }, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ safe: true, scanned: root }, null, 2));
    }
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
