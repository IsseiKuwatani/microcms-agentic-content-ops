import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

function parseTopics(value) {
  return String(value || "")
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);
}

function readDotEnv(root) {
  const filePath = path.join(root, ".env");
  if (!fsSync.existsSync(filePath)) return {};
  const values = {};
  for (const line of fsSync.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

export function getConfig(env = process.env) {
  const root = process.cwd();
  const settings = { ...readDotEnv(root), ...env };
  const siteUrl = settings.SITE_URL || "";
  const maxRecordsValue = Number(settings.MICROCMS_MAX_RECORDS || 1000);
  if (siteUrl) {
    try {
      new URL(siteUrl);
    } catch {
      throw new Error("SITE_URL must be an absolute URL");
    }
  }

  return {
    root,
    siteUrl,
    outputDir: path.resolve(root, settings.OUTPUT_DIR || "content-ops"),
    strategyPath: path.resolve(root, settings.STRATEGY_PATH || "content-ops/strategy.json"),
    ga4SnapshotPath: settings.GA4_SNAPSHOT_PATH ? path.resolve(root, settings.GA4_SNAPSHOT_PATH) : "",
    microcms: {
      serviceDomain: String(settings.MICROCMS_SERVICE_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, ""),
      apiKey: settings.MICROCMS_READ_API_KEY || "",
      articleEndpoint: settings.MICROCMS_ARTICLE_ENDPOINT || "articles",
      franchiseEndpoint: settings.MICROCMS_FRANCHISE_ENDPOINT || "franchise",
      maxRecords: Number.isFinite(maxRecordsValue) ? Math.max(1, Math.floor(maxRecordsValue)) : 1000
    },
    topics: parseTopics(settings.FOCUS_TOPICS)
  };
}

export async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== null) return fallback;
    throw error;
  }
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}
