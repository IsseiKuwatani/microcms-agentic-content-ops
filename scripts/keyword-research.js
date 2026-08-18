import fs from "node:fs/promises";
import path from "node:path";
import { getConfig, ensureDir, readJson } from "./lib/config.js";

const STATUS = new Set(["observed", "estimated", "unknown"]);
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index].startsWith("--")) args.set(process.argv[index].slice(2), process.argv[index + 1] || true);
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function freshness(retrievedAt) {
  const timestamp = Date.parse(retrievedAt || "");
  if (!Number.isFinite(timestamp)) return { status: "unknown", ageHours: null };
  const ageHours = Math.max(0, (Date.now() - timestamp) / 3600000);
  return { status: ageHours > 2160 ? "stale" : "fresh", ageHours: Math.round(ageHours) };
}

function normalizeRecord(record, index) {
  const keyword = String(record.keyword || record.query || record.term || "").trim();
  const volumeStatus = String(record.volumeStatus || "unknown").toLowerCase();
  const errors = [];
  if (!keyword) errors.push("keyword is required");
  if (!STATUS.has(volumeStatus)) errors.push("volumeStatus must be observed, estimated, or unknown");
  const avgMonthlySearches = numberOrNull(record.avgMonthlySearches ?? record.monthlySearches);
  const impressions = numberOrNull(record.impressions);
  if (volumeStatus !== "unknown" && avgMonthlySearches === null && impressions === null) {
    errors.push("a non-unknown record needs avgMonthlySearches or impressions");
  }

  const businessFit = Math.min(1, Math.max(0, numberOrNull(record.businessFit) ?? 0.5));
  const coverageGap = record.coveredBy ? 0.2 : 1;
  const competition = String(record.competition || "unknown").toLowerCase();
  const competitionPenalty = competition === "low" ? 0.2 : competition === "high" ? 0.8 : competition === "medium" ? 0.5 : 0.5;
  const demand = avgMonthlySearches ?? impressions ?? 0;
  const demandScore = demand ? Math.min(100, Math.round((Math.log10(demand + 1) / 4) * 100)) : 0;
  const evidenceConfidence = volumeStatus === "observed" ? 1 : volumeStatus === "estimated" ? 0.6 : 0.2;
  const evidenceFreshness = freshness(record.retrievedAt);
  const freshnessMultiplier = evidenceFreshness.status === "stale" ? 0.5 : 1;
  const score = Math.round((demandScore * 0.35 + businessFit * 100 * 0.3 + coverageGap * 100 * 0.2 + (1 - competitionPenalty) * 100 * 0.15) * evidenceConfidence * freshnessMultiplier);

  return {
    index,
    keyword,
    locale: record.locale || record.language || "unknown",
    country: record.country || "unknown",
    source: record.source || record.provider || "unknown",
    volumeStatus,
    avgMonthlySearches,
    impressions,
    clicks: numberOrNull(record.clicks),
    position: numberOrNull(record.position),
    competition: record.competition ?? null,
    intent: record.intent || "unknown",
    cluster: record.cluster || record.topic || keyword,
    coveredBy: record.coveredBy || null,
    period: record.period || null,
    retrievedAt: record.retrievedAt || null,
    freshness: evidenceFreshness,
    notes: record.notes || null,
    errors,
    opportunity: {
      score,
      scoreIsPrioritizationOnly: true,
      components: { demandScore, businessFit, coverageGap, competitionPenalty, evidenceConfidence, freshnessMultiplier }
    }
  };
}

export function analyzeKeywords(input) {
  const records = Array.isArray(input) ? input : Array.isArray(input?.keywords) ? input.keywords : [];
  const normalized = records.map(normalizeRecord);
  const valid = normalized.filter((record) => record.errors.length === 0).sort((left, right) => right.opportunity.score - left.opportunity.score);
  const invalid = normalized.filter((record) => record.errors.length > 0);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    methodology: "Opportunity is a transparent prioritization signal, not a ranking prediction. Volume is never inferred when provider evidence is absent.",
    summary: { inputCount: normalized.length, validCount: valid.length, invalidCount: invalid.length, observedCount: valid.filter((record) => record.volumeStatus === "observed").length, estimatedCount: valid.filter((record) => record.volumeStatus === "estimated").length, unknownVolumeCount: valid.filter((record) => record.volumeStatus === "unknown").length },
    opportunities: valid,
    invalidRecords: invalid
  };
}

async function main() {
  const config = getConfig();
  const inputPath = path.resolve(config.root, String(args.get("input") || config.keywordDataPath));
  const outputPath = path.resolve(config.root, String(args.get("output") || path.join(config.outputDir, "reports", "keyword-opportunities.json")));
  const input = await readJson(inputPath);
  const report = analyzeKeywords(input);
  await ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, summary: report.summary }, null, 2));
  if (report.summary.invalidCount > 0) process.exitCode = 2;
}

if (process.argv[1]?.endsWith("keyword-research.js")) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
