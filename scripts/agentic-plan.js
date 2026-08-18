import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { getConfig, ensureDir, readJson } from "./lib/config.js";
import { validateProposal } from "./validate-proposal.js";

function action(priority, type, title, reason, humanReview = true, evidence = []) {
  return { priority, type, title, reason, humanReview, status: "proposal", evidence };
}

function fingerprint(report) {
  const source = JSON.stringify({ generatedAt: report?.generatedAt, summary: report?.summary, issues: report?.issues, records: report?.records });
  return crypto.createHash("sha256").update(source).digest("hex");
}

function evidenceFor(issues, severities) {
  return issues
    .filter((item) => severities.includes(item.severity))
    .slice(0, 20)
    .map((item) => ({ severity: item.severity, code: item.code, recordId: item.recordId || null }));
}

function analyticsIsFresh(ga4) {
  if (!ga4 || !Number.isFinite(Number(ga4.freshnessHours)) || Number(ga4.freshnessHours) > 168) return false;
  const generatedAt = Date.parse(ga4.generatedAt || "");
  if (!Number.isFinite(generatedAt)) return false;
  const ageHours = (Date.now() - generatedAt) / 3600000;
  return ageHours >= 0 && ageHours <= 168;
}

export function buildPlan({ report, strategy = {}, ga4 = null, keywords = null }) {
  const actions = [];
  const summary = report?.summary || {};
  const issues = report?.issues || [];
  const analyticsFresh = analyticsIsFresh(ga4);

  if (summary.critical) actions.push(action("P0", "fix", "Resolve critical audit issues", "Critical site, content, or safety issues were detected.", true, evidenceFor(issues, ["critical"])));
  if (summary.high) actions.push(action("P1", "review", "Review high-priority content issues", "Required metadata, slugs, or content fields need a human-approved fix.", true, evidenceFor(issues, ["high"])));
  if (!summary.articles) actions.push(action("P1", "content", "Define the first content cluster", "No article records were found; choose a small, evidence-backed cluster before drafting."));
  actions.push(action("P1", "content", "Refresh the highest-value pages", "Use analytics and current first-party sources to prioritize updates, not volume alone."));
  actions.push(action("P2", "content", "Draft one useful supporting article", "Add a genuinely useful article around a strategy topic only after source collection.", true));

  const topicList = strategy.topics || [];
  if (topicList.length) actions[actions.length - 1].topicCandidates = topicList.slice(0, 5);
  if (analyticsFresh && ga4.topPages?.length) actions.push(action("P1", "analytics", "Investigate top-page conversion paths", "A recent analytics snapshot contains high-traffic pages; compare engagement and CTA outcomes before editing."));
  if (ga4 && !analyticsFresh) actions.push(action("P2", "analytics", "Refresh the analytics snapshot", "The analytics snapshot is missing freshness metadata or is older than seven days; do not use it for prioritization."));
  const keywordCandidates = (keywords?.opportunities || []).filter((item) => item.volumeStatus !== "unknown").slice(0, 5);
  const staleKeywordCount = (keywords?.opportunities || []).filter((item) => item.freshness?.status === "stale").length;
  if (staleKeywordCount) actions.push(action("P1", "keyword", "Refresh stale keyword evidence", "Some keyword metrics are older than the configured evidence window; refresh them before making publication decisions."));
  if (keywordCandidates.length) {
    actions.push(action("P1", "keyword", "Create briefs for evidence-backed keyword opportunities", "Use the supplied provider metrics as one prioritization signal; verify intent and existing coverage before drafting.", true, keywordCandidates.map((item) => ({ keyword: item.keyword, cluster: item.cluster, volumeStatus: item.volumeStatus, source: item.source, opportunityScore: item.opportunity?.score }))));
  }

  const auditFingerprint = fingerprint(report);
  return {
    schemaVersion: 1,
    proposalId: `proposal-${auditFingerprint.slice(0, 16)}`,
    generatedAt: new Date().toISOString(),
    mode: "proposal-only",
    humanApprovalRequired: true,
    audit: { generatedAt: report?.generatedAt || null, fingerprint: auditFingerprint },
    approval: { status: "pending", approver: null, approvedAt: null, decisionNote: null },
    source: { auditIssues: issues.length, strategyTopics: topicList.length, hasAnalyticsSnapshot: Boolean(ga4), analyticsFresh, keywordCandidates: keywordCandidates.length, staleKeywordCount },
    actions
  };
}

async function main() {
  const config = getConfig();
  const report = await readJson(path.join(config.outputDir, "reports", "seo-ops-audit.json"));
  const strategy = await readJson(config.strategyPath, { topics: config.topics });
  const ga4 = config.ga4SnapshotPath ? await readJson(config.ga4SnapshotPath, null) : null;
  const keywords = await readJson(path.join(config.outputDir, "reports", "keyword-opportunities.json"), null);
  const outputPath = path.join(config.outputDir, "proposals", "next-actions.json");
  const plan = buildPlan({ report, strategy, ga4, keywords });
  const validationErrors = validateProposal(plan);
  if (validationErrors.length) throw new Error(`Generated proposal failed validation: ${validationErrors.join("; ")}`);
  await ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, actions: plan.actions.length, mode: plan.mode }, null, 2));
}

if (process.argv[1]?.endsWith("agentic-plan.js")) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
