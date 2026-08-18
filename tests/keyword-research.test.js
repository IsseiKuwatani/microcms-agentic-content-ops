import test from "node:test";
import assert from "node:assert/strict";
import { analyzeKeywords } from "../scripts/keyword-research.js";

test("keyword analysis preserves provenance and separates unknown volume", () => {
  const report = analyzeKeywords({ keywords: [
    { keyword: "observed term", source: "provider-export", volumeStatus: "observed", avgMonthlySearches: 1000, competition: "LOW" },
    { keyword: "unknown term", source: "search-console", volumeStatus: "unknown", impressions: 20 },
    { keyword: "invalid term", source: "manual", volumeStatus: "observed" }
  ] });
  assert.equal(report.summary.validCount, 2);
  assert.equal(report.summary.unknownVolumeCount, 1);
  assert.equal(report.opportunities[0].source, "provider-export");
  assert.equal(report.opportunities[0].freshness.status, "unknown");
  assert.ok(report.invalidRecords[0].errors.length > 0);
});
