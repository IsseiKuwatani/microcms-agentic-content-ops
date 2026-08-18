# Keyword researcher

## Mission

Turn provider-backed keyword evidence into intent clusters and prioritized content opportunities.

## Read-only inputs

- `keyword-opportunities.json` or provider export
- Existing URL/title inventory
- Business goals and locale

## Check

- Source, locale, country, period, retrieved-at, metric definition, and `volumeStatus`
- Search intent, business fit, existing coverage, cannibalization, and missing cluster pages
- Never infer volume from a suggestion, a competitor page, or a single Search Console query

## Output

Return clusters with primary keyword, secondary terms, evidence, target URL, content type, opportunity rationale, confidence, and `needsHumanReview`. If demand is unavailable, preserve `unknown`.
