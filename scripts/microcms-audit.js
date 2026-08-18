import fs from "node:fs/promises";
import path from "node:path";
import { getConfig, ensureDir, readJson } from "./lib/config.js";
import { fetchJson, microcmsEndpoint } from "./lib/http.js";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value.startsWith("--")) args.set(value.slice(2), process.argv[index + 1] || true);
}

function textOf(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function field(record, ...names) {
  for (const name of names) {
    if (record?.[name] !== undefined && record[name] !== null) return record[name];
  }
  return "";
}

function issue(severity, code, message, record = {}) {
  return {
    severity,
    code,
    message,
    recordId: field(record, "id", "slug", "name", "title") || null
  };
}

function publicRecordSummary(record) {
  return {
    id: field(record, "id"),
    title: field(record, "title", "name"),
    slug: field(record, "slug", "urlSlug"),
    updatedAt: field(record, "updatedAt", "updated_at"),
    publishedAt: field(record, "publishedAt", "published_at"),
    officialSiteUrl: field(record, "officialSiteUrl", "official_site_url", "officialUrl")
  };
}

export function auditRecords(records, kind) {
  const items = Array.isArray(records) ? records : [];
  const issues = [];
  const slugs = new Map();

  for (const record of items) {
    const title = field(record, "title", "name");
    const slug = field(record, "slug", "urlSlug");
    const body = textOf(field(record, "content", "description", "body"));
    const updatedAt = field(record, "updatedAt", "updated_at", "publishedAt", "published_at");

    if (!title) issues.push(issue("high", "missing-title", `${kind} record is missing title/name`, record));
    if (!slug) issues.push(issue("high", "missing-slug", `${kind} record is missing slug`, record));
    if (!body) issues.push(issue("medium", "missing-body", `${kind} record is missing content/description`, record));
    if (!updatedAt) issues.push(issue("medium", "missing-update-date", `${kind} record has no update date`, record));

    if (slug) {
      const prior = slugs.get(slug) || 0;
      slugs.set(slug, prior + 1);
    }

    for (const match of body.matchAll(/<img\b([^>]*)>/gi)) {
      const attributes = match[1];
      const src = attributes.match(/\bsrc\s*=\s*["']([^"']+)/i)?.[1] || "";
      const alt = attributes.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] || "";
      if (!src) issues.push(issue("high", "image-missing-src", `${kind} image is missing src`, record));
      if (!alt.trim()) issues.push(issue("medium", "image-missing-alt", `${kind} image is missing alt text`, record));
      if (/^(javascript:|data:)/i.test(src)) issues.push(issue("critical", "unsafe-image-src", `${kind} image uses an unsafe source`, record));
    }
  }

  for (const [slug, count] of slugs) {
    if (count > 1) issues.push({ severity: "high", code: "duplicate-slug", message: `${kind} slug is duplicated: ${slug}`, recordId: slug });
  }

  return { count: items.length, issues };
}

export async function auditSite(siteUrl) {
  if (!siteUrl) return { checked: false, status: null, issues: [{ severity: "low", code: "site-url-not-configured", message: "SITE_URL was not configured" }] };
  try {
    const response = await fetchJson(siteUrl);
    return {
      checked: true,
      status: response.status,
      issues: response.ok ? [] : [{ severity: "critical", code: "site-unreachable", message: `SITE_URL returned HTTP ${response.status}` }]
    };
  } catch (error) {
    return { checked: true, status: null, issues: [{ severity: "critical", code: "site-fetch-failed", message: error.name === "AbortError" ? "SITE_URL request timed out" : "SITE_URL request failed" }] };
  }
}

async function loadLiveCollection(config, endpoint) {
  if (!config.microcms.serviceDomain || !config.microcms.apiKey) {
    throw new Error("MICROCMS_SERVICE_DOMAIN and MICROCMS_READ_API_KEY are required for a live audit");
  }
  const contents = [];
  const limit = 100;
  let totalCount = 0;
  for (let offset = 0; offset < config.microcms.maxRecords; offset += limit) {
    const response = await fetchJson(`${microcmsEndpoint(config.microcms.serviceDomain, endpoint)}?limit=${limit}&offset=${offset}`, { apiKey: config.microcms.apiKey });
    if (!response.ok) throw new Error(`microCMS endpoint ${endpoint} returned HTTP ${response.status}`);
    if (!Array.isArray(response.body?.contents) || !Number.isInteger(Number(response.body?.totalCount))) {
      throw new Error(`microCMS endpoint ${endpoint} returned an invalid collection response`);
    }
    const page = response.body.contents;
    totalCount = Number(response.body.totalCount);
    contents.push(...page);
    if (!page.length || contents.length >= totalCount || contents.length >= config.microcms.maxRecords) break;
  }
  return {
    records: contents.slice(0, config.microcms.maxRecords),
    totalCount,
    truncated: totalCount > config.microcms.maxRecords
  };
}

export async function createReport({ config = getConfig(), fixture = "" } = {}) {
  let source;
  let coverage;
  if (fixture) {
    source = await readJson(path.resolve(config.root, fixture));
    coverage = {
      source: "fixture",
      articles: { fetched: (source.articles || []).length, totalCount: (source.articles || []).length, truncated: false },
      franchises: { fetched: (source.franchises || []).length, totalCount: (source.franchises || []).length, truncated: false }
    };
  } else {
    const [articleCollection, franchiseCollection] = await Promise.all([
      loadLiveCollection(config, config.microcms.articleEndpoint),
      loadLiveCollection(config, config.microcms.franchiseEndpoint)
    ]);
    source = {
      articles: articleCollection.records,
      franchises: franchiseCollection.records
    };
    coverage = {
      source: "live",
      articles: { fetched: articleCollection.records.length, totalCount: articleCollection.totalCount, truncated: articleCollection.truncated },
      franchises: { fetched: franchiseCollection.records.length, totalCount: franchiseCollection.totalCount, truncated: franchiseCollection.truncated }
    };
  }

  const [site, articles, franchises] = await Promise.all([
    fixture ? { checked: false, status: null, issues: [] } : auditSite(config.siteUrl),
    auditRecords(source.articles || [], "article"),
    auditRecords(source.franchises || [], "franchise")
  ]);
  const coverageIssues = ["articles", "franchises"]
    .filter((kind) => coverage[kind].truncated)
    .map((kind) => ({ severity: "high", code: "collection-truncated", message: `${kind} collection exceeded MICROCMS_MAX_RECORDS`, recordId: null }));
  const issues = [...site.issues, ...coverageIssues, ...articles.issues, ...franchises.issues];
  return {
    generatedAt: new Date().toISOString(),
    site: { url: config.siteUrl || null, ...site },
    cms: {
      provider: "microCMS Content API",
      articleEndpoint: config.microcms.articleEndpoint,
      franchiseEndpoint: config.microcms.franchiseEndpoint,
      source: fixture ? "fixture" : "live",
      coverage
    },
    summary: {
      articles: articles.count,
      franchises: franchises.count,
      issueCount: issues.length,
      critical: issues.filter((item) => item.severity === "critical").length,
      high: issues.filter((item) => item.severity === "high").length,
      medium: issues.filter((item) => item.severity === "medium").length,
      low: issues.filter((item) => item.severity === "low").length
    },
    issues,
    records: {
      articles: (source.articles || []).map(publicRecordSummary),
      franchises: (source.franchises || []).map(publicRecordSummary)
    }
  };
}

async function main() {
  const config = getConfig();
  const report = await createReport({ config, fixture: typeof args.get("fixture") === "string" ? args.get("fixture") : "" });
  const outputPath = path.resolve(config.root, String(args.get("output") || path.join(config.outputDir, "reports", "seo-ops-audit.json")));
  await ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, summary: report.summary }, null, 2));
  if (report.summary.critical > 0) process.exitCode = 2;
}

if (process.argv[1]?.endsWith("microcms-audit.js")) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
