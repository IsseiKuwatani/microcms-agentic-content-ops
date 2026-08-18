import test from "node:test";
import assert from "node:assert/strict";
import { auditRecords } from "../scripts/microcms-audit.js";
import { buildPlan } from "../scripts/agentic-plan.js";
import { compactReport } from "../scripts/build-agentic-input.js";
import { microcmsEndpoint } from "../scripts/lib/http.js";
import { validateProposal } from "../scripts/validate-proposal.js";
import { readJson } from "../scripts/lib/config.js";

test("auditRecords finds missing metadata and duplicate slugs", () => {
  const result = auditRecords([
    { id: "1", title: "One", slug: "same", content: "<p>ok</p>", updatedAt: "2026-01-01" },
    { id: "2", name: "Two", slug: "same", description: "<img src=\"x.jpg\">" }
  ], "article");
  assert.equal(result.count, 2);
  assert.ok(result.issues.some((item) => item.code === "duplicate-slug"));
  assert.ok(result.issues.some((item) => item.code === "missing-update-date"));
  assert.ok(result.issues.some((item) => item.code === "image-missing-alt"));
});

test("compactReport removes record body content", () => {
  const result = compactReport({
    generatedAt: "2026-01-01T00:00:00.000Z",
    site: {},
    cms: {},
    summary: { issueCount: 0 },
    issues: [],
    records: { articles: [{ id: "a", title: "A", slug: "a", content: "secret body" }], franchises: [] }
  });
  assert.deepEqual(result.articles, [{ id: "a", title: "A", slug: "a", updatedAt: undefined, publishedAt: undefined }]);
  assert.equal(JSON.stringify(result).includes("secret body"), false);
});

test("agentic plan is proposal-only and includes human review", () => {
  const result = buildPlan({
    report: { summary: { critical: 1, high: 2, articles: 1 }, issues: [{ code: "x" }] },
    strategy: { topics: ["topic"] },
    ga4: { topPages: ["/"] }
  });
  assert.equal(result.mode, "proposal-only");
  assert.equal(result.humanApprovalRequired, true);
  assert.ok(result.actions.every((item) => item.status === "proposal" && item.humanReview));
});

test("agentic plan does not prioritize stale analytics", () => {
  const result = buildPlan({
    report: { summary: { critical: 0, high: 0, articles: 1 }, issues: [] },
    strategy: { topics: [] },
    ga4: { freshnessHours: 240, topPages: ["/"] }
  });
  assert.equal(result.source.analyticsFresh, false);
  assert.ok(result.actions.some((item) => item.type === "analytics" && item.title.includes("Refresh")));
});

test("microCMS endpoint validation rejects credential exfiltration targets", () => {
  assert.equal(microcmsEndpoint("example.microcms.io", "articles"), "https://example.microcms.io/api/v1/articles");
  assert.throws(() => microcmsEndpoint("attacker.example", "articles"), /microcms\.io/);
  assert.throws(() => microcmsEndpoint("example.microcms.io/path", "articles"), /hostname/);
  assert.throws(() => microcmsEndpoint("example.microcms.io", "articles/other"), /endpoint/);
});

test("proposal contract fails closed when human review is removed", () => {
  const proposal = buildPlan({ report: { generatedAt: "2026-01-01", summary: { articles: 1 }, issues: [] }, strategy: {} });
  assert.deepEqual(validateProposal(proposal), []);
  proposal.actions[0].humanReview = false;
  assert.ok(validateProposal(proposal).some((error) => error.includes("human-reviewed")));
});

test("optional JSON inputs can be absent without stopping the loop", async () => {
  assert.equal(await readJson("this-file-does-not-exist.json", null), null);
});
