# scripts/rollback-playbook.ps1 -- guided runner for the TESTING.md section-7
# rollback playbook. Click-to-run via rollback-playbook.cmd, or from a shell:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\rollback-playbook.ps1
#   powershell ... -File scripts\rollback-playbook.ps1 -Action status   (read-only, no menu)
#
# Talks to PRODUCTION (worker digimon-tcg-bot, D1 database `cards`) through the
# project-local wrangler and YOUR local wrangler OAuth login -- it does nothing
# without that auth and carries no secrets. Every write requires typing FLIP.
# Windows PowerShell 5.1 compatible (no &&, no ternary, ASCII only).
param([string]$Action = "")

$ErrorActionPreference = "Stop"
# Run from the repo root so npx resolves the project-local wrangler.
Set-Location (Split-Path $PSScriptRoot -Parent)

$HealthUrl = "https://digimon-tcg-bot.rstewart555.workers.dev/health"

function Get-HealthReport {
  # curl.exe, NOT curl: in Windows PowerShell `curl` aliases Invoke-WebRequest,
  # which chokes on -s and throws on the 503 that /health uses for "stale".
  $raw = @(curl.exe -s -w "`n%{http_code}" $HealthUrl)
  $code = $raw[-1].Trim()
  $body = ($raw[0..($raw.Count - 2)] -join "`n").Trim()
  Write-Host "/health -> HTTP $code"
  Write-Host "  $body"
  if ($code -ne "200") {
    Write-Host "  (non-200: 503 means the stale-data rule tripped; anything else means the worker is down)"
  }
}

function Invoke-D1Query([string]$Sql) {
  $out = npx wrangler d1 execute cards --remote --json --command $Sql
  if ($LASTEXITCODE -ne 0) { throw "wrangler d1 execute failed (exit $LASTEXITCODE)" }
  $parsed = ($out -join "`n") | ConvertFrom-Json
  return $parsed[0].results
}

function Get-ActiveVersion {
  $rows = Invoke-D1Query "SELECT value FROM meta WHERE key = 'active_version'"
  return [int]$rows[0].value
}

function Show-Status {
  Get-HealthReport
  Write-Host ""
  Write-Host "D1 rows by dataset version:"
  $rows = Invoke-D1Query "SELECT version, COUNT(*) AS n FROM cards GROUP BY version ORDER BY version"
  foreach ($r in $rows) { Write-Host ("  version {0}: {1} rows" -f $r.version, $r.n) }
  Write-Host ("  active_version: {0}" -f (Get-ActiveVersion))
}

function Set-ActiveVersion([int]$Target, [int]$Current) {
  if ($Target -eq $Current) {
    Write-Host "active_version is already $Current -- nothing to do."
    return
  }
  $rows = Invoke-D1Query "SELECT COUNT(*) AS n FROM cards WHERE version = $Target"
  $n = [int]$rows[0].n
  if ($n -eq 0) {
    Write-Host "REFUSING: version $Target has 0 rows in D1 -- flipping to it would serve an empty dataset."
    return
  }
  Write-Host ""
  Write-Host "About to set active_version $Current -> $Target ($n rows). One UPDATE on production meta."
  if ($Target -lt $Current) {
    Write-Host "WARNING: while flipped back, the next sync treats v$Current as staging and DELETES its rows."
    Write-Host "  - Real incident: that is the cure -- the next clean sync rebuilds and re-promotes."
    Write-Host "  - Rehearsal: it would destroy the good live dataset. Do NOT hit /admin/resync,"
    Write-Host "    and stay clear of the weekly cron (Saturday 06:00 UTC)."
  }
  $confirm = Read-Host "Type FLIP to proceed (anything else aborts)"
  if ($confirm -cne "FLIP") {
    Write-Host "Aborted -- nothing written."
    return
  }
  Invoke-D1Query "UPDATE meta SET value = '$Target' WHERE key = 'active_version'" | Out-Null
  Write-Host "Done. Re-checking:"
  Get-HealthReport
  Write-Host "Now spot-check a /card lookup in a soak guild."
}

function Invoke-DatasetRollback {
  $active = Get-ActiveVersion
  Set-ActiveVersion ($active - 1) $active
}

function Invoke-DatasetRollForward {
  $active = Get-ActiveVersion
  $target = Read-Host "Target version (active is $active)"
  Set-ActiveVersion ([int]$target) $active
}

function Invoke-CodeRollback {
  Write-Host "Recent deployments (note the CURRENT Version ID so you can roll forward to it later):"
  npx wrangler deployments list
  # $ErrorActionPreference = "Stop" does NOT stop on native-exe failures in
  # PS 5.1 -- check the exit code explicitly or we barrel into rollback anyway.
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "STOPPING: 'wrangler deployments list' failed (exit $LASTEXITCODE) -- nothing was changed."
    Write-Host "A 5xx from api.cloudflare.com is THEIR outage, not your auth: check"
    Write-Host "https://www.cloudflarestatus.com/ and retry later. The dataset options"
    Write-Host "use the D1 API, which may still be up (seen live 2026-07-12: the"
    Write-Host "deployments endpoint returned 521/525 while D1 and the worker were fine)."
    return
  }
  Write-Host ""
  Write-Host "Handing over to 'npx wrangler rollback' (interactive -- pick the version to restore)."
  npx wrangler rollback
  if ($LASTEXITCODE -ne 0) {
    Write-Host "'wrangler rollback' failed (exit $LASTEXITCODE) -- nothing was rolled back."
    return
  }
  Write-Host "Re-checking:"
  Get-HealthReport
}

if ($Action -eq "status") {
  Show-Status
  exit 0
}

while ($true) {
  Write-Host ""
  Write-Host "=== Rollback playbook (production: digimon-tcg-bot) -- TESTING.md section 7 ==="
  Write-Host "  [1] Status: /health + D1 versions (read-only)"
  Write-Host "  [2] Dataset rollback: flip active_version back one"
  Write-Host "  [3] Dataset roll-forward: set active_version to a chosen version"
  Write-Host "  [4] Code rollback: wrangler rollback (interactive)"
  Write-Host "  [q] Quit"
  $choice = Read-Host "Choose"
  switch ($choice) {
    "1" { Show-Status }
    "2" { Invoke-DatasetRollback }
    "3" { Invoke-DatasetRollForward }
    "4" { Invoke-CodeRollback }
    "q" { exit 0 }
    default { Write-Host "Unrecognized choice." }
  }
}
