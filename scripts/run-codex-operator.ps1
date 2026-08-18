param(
  [string]$RepoRoot = (Get-Location).Path,
  [string]$CodexCommand = "codex",
  [switch]$AllowWorkspaceWrite
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath "content-ops/strategy.json")) {
  throw "content-ops/strategy.json was not found"
}

$auditExitCode = 0
node scripts/microcms-audit.js
$auditExitCode = $LASTEXITCODE
if ($auditExitCode -eq 1) { throw "Audit failed before producing a report" }
if ($auditExitCode -eq 2) { Write-Warning "Audit found critical issues; continuing to create a remediation proposal" }
node scripts/build-agentic-input.js
if ($LASTEXITCODE -ne 0) { throw "Input build exited with code $LASTEXITCODE" }
node scripts/agentic-plan.js
if ($LASTEXITCODE -ne 0) { throw "Plan generation exited with code $LASTEXITCODE" }

$prompt = Get-Content -LiteralPath "content-ops/codex-operator-prompt.md" -Raw
$sandbox = if ($AllowWorkspaceWrite) { "workspace-write" } else { "read-only" }
Write-Host "Codex sandbox: $sandbox"
# Run Codex in a credential-free scratch workspace. Only sanitized inputs are copied in.
$scratchRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("microcms-agentic-ops-" + [guid]::NewGuid().ToString("N"))
try {
  New-Item -ItemType Directory -Path (Join-Path $scratchRoot "content-ops/reports") -Force | Out-Null
  Copy-Item -LiteralPath "content-ops/reports/operator-input.json" -Destination (Join-Path $scratchRoot "content-ops/reports/operator-input.json")
  Copy-Item -LiteralPath "content-ops/strategy.json" -Destination (Join-Path $scratchRoot "content-ops/strategy.json")
  Copy-Item -LiteralPath "content-ops/codex-operator-prompt.md" -Destination (Join-Path $scratchRoot "content-ops/codex-operator-prompt.md")
  Copy-Item -LiteralPath "README.md" -Destination (Join-Path $scratchRoot "README.md")
  Copy-Item -LiteralPath "SECURITY.md" -Destination (Join-Path $scratchRoot "SECURITY.md")
  if ($AllowWorkspaceWrite) {
    New-Item -ItemType Directory -Path (Join-Path $scratchRoot "content-ops/drafts") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $scratchRoot "content-ops/proposals") -Force | Out-Null
  }

  # Safe default is read-only. Opt in explicitly when you want proposal files written.
  & $CodexCommand exec --ephemeral --ignore-user-config --sandbox $sandbox --cd $scratchRoot $prompt
  if ($LASTEXITCODE -ne 0) { throw "Codex operator exited with code $LASTEXITCODE" }
  if ($AllowWorkspaceWrite) {
    Copy-Item -Path (Join-Path $scratchRoot "content-ops/drafts/*") -Destination "content-ops/drafts/" -Force -ErrorAction SilentlyContinue
    Copy-Item -Path (Join-Path $scratchRoot "content-ops/proposals/*") -Destination "content-ops/proposals/" -Force -ErrorAction SilentlyContinue
  }
} finally {
  if (Test-Path -LiteralPath $scratchRoot) { Remove-Item -LiteralPath $scratchRoot -Recurse -Force }
}
if ($auditExitCode -ne 0) { exit $auditExitCode }
