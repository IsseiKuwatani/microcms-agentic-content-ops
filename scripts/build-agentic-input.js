import fs from "node:fs/promises";
import path from "node:path";
import { getConfig, ensureDir, readJson } from "./lib/config.js";

export function compactReport(report) {
  return {
    generatedAt: report.generatedAt,
    site: report.site,
    cms: report.cms,
    summary: report.summary,
    issues: (report.issues || []).slice(0, 100),
    articles: (report.records?.articles || []).map((record) => ({
      id: record.id,
      title: record.title,
      slug: record.slug,
      updatedAt: record.updatedAt || record.updated_at,
      publishedAt: record.publishedAt || record.published_at
    })),
    franchises: (report.records?.franchises || []).map((record) => ({
      id: record.id,
      name: record.name || record.title,
      slug: record.slug,
      updatedAt: record.updatedAt || record.updated_at
    }))
  };
}

async function main() {
  const config = getConfig();
  const reportPath = path.join(config.outputDir, "reports", "seo-ops-audit.json");
  const outputPath = path.join(config.outputDir, "reports", "operator-input.json");
  const report = await readJson(reportPath);
  const compact = compactReport(report);
  await ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, `${JSON.stringify(compact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, issueCount: compact.issues.length }, null, 2));
}

if (process.argv[1]?.endsWith("build-agentic-input.js")) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
