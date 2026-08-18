# Keyword evidence reference

## Metric vocabulary

- `avgMonthlySearches`: a provider-reported monthly demand metric for a defined country, language, device, and period. Do not compare values across different settings without recording the difference.
- `impressions`: observed appearances for this site in Search Console or another first-party analytics source. It is not total market demand.
- `competition`: provider-specific competition signal. Do not present it as an SEO difficulty score unless the provider explicitly defines it that way.
- `volumeStatus`: `observed`, `estimated`, or `unknown`.

## Source precedence

1. Google Ads Keyword Planner/API or an export from it for market-demand estimates.
2. Search Console for the site's observed query demand and page performance.
3. A named third-party provider, retained as an estimate with its date and settings.
4. Search suggestions, related searches, and competitor observations as qualitative evidence only.

## Required provenance

Store at least:

```json
{
  "keyword": "example query",
  "locale": "ja-JP",
  "country": "JP",
  "source": "google-ads-keyword-planner-export",
  "volumeStatus": "observed",
  "avgMonthlySearches": 1000,
  "period": "2026-01/2026-03",
  "retrievedAt": "2026-04-01T00:00:00.000Z"
}
```

If a source reports a range, retain the range and do not silently convert it into a point estimate. If a source does not define a metric, retain the original field name and describe it in `notes`.

## Opportunity analysis

Use volume only as one input. Combine it with intent fit, existing coverage, conversion relevance, evidence quality, freshness, and competition. A low-volume query with strong business intent may outrank a high-volume informational query. A computed opportunity score is an internal prioritization aid, not a search ranking prediction.
