# Phase 0 Deploy Script
# Deploys both blog and course projects independently
# WARNING: Requires CF Pages project 'brianinchrist-courses' to exist first

param(
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== Phase 0: System Separation Deploy ===" -ForegroundColor Cyan
Write-Host ""

# 1. Deploy blog (static only)
Write-Host "[1/3] Deploying blog (brianinchrist-site)..." -ForegroundColor Yellow
if (-not $WhatIf) {
    Push-Location $root
    npx wrangler pages deploy --config wrangler-blog.toml
    Pop-Location
    Write-Host "  ✅ Blog deployed to organicchurch.dpdns.org" -ForegroundColor Green
}

# 2. Deploy course (with Functions)
Write-Host "[2/3] Deploying course (brianinchrist-courses)..." -ForegroundColor Yellow
if (-not $WhatIf) {
    Push-Location $root
    npx wrangler pages deploy
    Pop-Location
    Write-Host "  ✅ Course deployed to learn.organicchurch.dpdns.org" -ForegroundColor Green
}

# 3. Verify
Write-Host "[3/3] Verification..." -ForegroundColor Yellow
Write-Host "  Verify these URLs:"
Write-Host "  - Blog:  https://organicchurch.dpdns.org"
Write-Host "  - Course: https://learn.organicchurch.dpdns.org/api/auth/signin (should return 405 or 401)"
Write-Host "  - Blog no Functions: https://organicchurch.dpdns.org/api/auth/signin (should return 404)"

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan

if ($WhatIf) {
    Write-Host "WhatIf mode: No actual deployment was performed." -ForegroundColor Magenta
}
