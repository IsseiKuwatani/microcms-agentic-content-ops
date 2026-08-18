# SEO agent contracts

These files define bounded, read-only roles for an orchestrator that has access to subagents. They are prompt contracts, not a provider-specific auto-spawn configuration. A runner should pass each agent only sanitized inputs and collect structured findings before the human approval gate.

Recommended execution order:

1. `seo-auditor` and `keyword-researcher` in parallel
2. `fact-checker` and `image-reviewer` on the selected URLs/records
3. `content-planner` after evidence is available
4. `release-reviewer` before any human-approved publication workflow

Every agent must return `status`, `findings`, `evidence`, `risks`, and `needsHumanReview`. No role publishes, deploys, sends messages, or handles write-capable credentials.
