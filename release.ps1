# One-command release for the fakecard Obsidian plugin.
#
#   .\release.ps1                 # patch bump, publish, deploy into the vaults
#   .\release.ps1 -Bump minor
#   .\release.ps1 -SkipVault
#
# The release itself is done by GitHub Actions (.github/workflows/release.yml),
# which triggers on a tag push, builds the plugin there and publishes it with
# the contents of RELEASE_NOTES.md as the release body plus main.js /
# manifest.json / styles.css as assets. This script only drives that flow, in
# the one order that works, so the release is never created twice - creating a
# release by hand while the workflow is running is what leaves an empty body.
#
# Before running: commit your source changes AND the updated RELEASE_NOTES.md
# (its first line must be "# <next version>"), and set WHATS_NEW_VERSION in
# src/whatsNew.ts to that same version - otherwise the "what is new" dialog is
# skipped silently after the update.
[CmdletBinding()]
param(
    [ValidateSet('patch', 'minor', 'major')] [string] $Bump = 'patch',
    [string] $Repo   = 'godfatherlg/fakecard',
    [string] $Branch = 'main',
    [string] $Vault  = 'J:\OB\.obsidian\plugins\fakecard',
    # A vault that has never run the plugin - it has no data.json, so it is the
    # only place where "fresh install" bugs show up. Deploy there too, always.
    [string] $TestVault = 'F:\OBtest\test\.obsidian\plugins\fakecard',
    [int]    $TimeoutSeconds = 300,
    [switch] $SkipVault,
    # Push the tag and return at once. The workflow keeps building; verify and
    # deploy afterwards, so a slow asset host cannot hold the whole release.
    [switch] $NoWait
)

# Native commands write progress to stderr; with 'Stop' PowerShell would treat
# that as a failure. Every step is checked through $LASTEXITCODE instead.
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "ABORT: $msg" -ForegroundColor Red; exit 1 }
function Assert-Ok($what) { if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit code $LASTEXITCODE)" } }

# GitHub serves release assets from release-assets.githubusercontent.com, which
# some local DNS setups resolve to 127.0.0.1 (a stale "GitHub accelerator" entry
# is the usual cause). git and the API still work then, because they go to
# github.com, but `gh release download` dies on "connection refused" - after the
# release has already been published. The Windows proxy resolves names itself,
# so hand the download the system proxy when there is one.
function Enable-SystemProxy {
    $key = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
    if (-not $key -or $key.ProxyEnable -ne 1 -or -not $key.ProxyServer) { return $false }
    $server = $key.ProxyServer
    if ($server -notmatch '://') { $server = "http://$server" }
    $env:HTTP_PROXY = $server
    $env:HTTPS_PROXY = $server
    Write-Host "using the system proxy for asset downloads: $server" -ForegroundColor DarkGray
    return $true
}

# The three files a vault needs, straight from the published release: the vault
# then holds exactly what the workflow built, not a local build that happens to
# have the same version number. Retried through the proxy once, because the
# direct attempt is the one that fails on a poisoned asset host.
function Save-ReleaseAssets([string] $dir, [string] $version) {
    $patterns = @('--pattern', 'main.js', '--pattern', 'manifest.json', '--pattern', 'styles.css')
    $gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
    if (-not $gh) { return $false }
    $attempt = 0
    while ($attempt -lt 2) {
        $attempt++
        # gh has no timeout of its own; a stalled release-assets connection used
        # to hang the whole release at the last step. 45s is far more than three
        # small files need.
        $argsList = @('release', 'download', $version, '--repo', $script:Repo, '--dir', $dir, '--clobber') + $patterns
        $proc = Start-Process -FilePath $gh -ArgumentList $argsList -NoNewWindow -PassThru
        $exited = $proc.WaitForExit(45000)
        if (-not $exited) {
            try { $proc.Kill() } catch { }
            Write-Host "asset download timed out after 45s (attempt $attempt)" -ForegroundColor Yellow
        } elseif ($proc.ExitCode -eq 0) {
            return $true
        }
        if ($attempt -eq 1 -and -not (Enable-SystemProxy)) { return $false }
    }
    return $false
}

Step 'Checking the working tree'
$dirty = git status --porcelain
Assert-Ok 'git status'
if ($dirty) { Fail "the working tree is not clean - commit or stash first:`n$dirty" }
$current = (Get-Content manifest.json -Raw -Encoding UTF8 | ConvertFrom-Json).version
if (-not $current) { Fail 'could not read the version from manifest.json' }

$p = $current.Split('.')
$major = [int]$p[0]; $minor = [int]$p[1]; $patch = [int]$p[2]
switch ($Bump) {
    'major' { $major++; $minor = 0; $patch = 0 }
    'minor' { $minor++; $patch = 0 }
    default { $patch++ }
}
$next = "$major.$minor.$patch"
Write-Host "version: $current -> $next ($Bump)"

Step 'Checking RELEASE_NOTES.md'
if (-not (Test-Path -LiteralPath 'RELEASE_NOTES.md')) { Fail 'RELEASE_NOTES.md is missing - the release body comes from it' }
$firstLine = (Get-Content RELEASE_NOTES.md -TotalCount 1 -Encoding UTF8).Trim()
if ($firstLine -ne "# $next") {
    Fail "RELEASE_NOTES.md starts with '$firstLine' but the next version is $next - update it first (first line must be '# $next')."
}
if (git tag -l $next) { Fail "tag $next already exists" }

Step 'Checking the "what is new" notes'
# The dialog only shows when the constant matches the running version, so a
# release that forgets to update it would ship silently with no notes at all.
$whatsNew = Select-String -Path 'src/whatsNew.ts' -Pattern "WHATS_NEW_VERSION\s*=\s*'([^']+)'" |
    Select-Object -First 1
if (-not $whatsNew) { Fail 'could not find WHATS_NEW_VERSION in src/whatsNew.ts' }
$whatsNewVersion = $whatsNew.Matches[0].Groups[1].Value
if ($whatsNewVersion -ne $next) {
    Fail "WHATS_NEW_VERSION in src/whatsNew.ts is '$whatsNewVersion' but the next version is $next - update the notes first."
}
Write-Host "WHATS_NEW_VERSION: $whatsNewVersion"

Step "Bumping to $next"
npm version $Bump --no-git-tag-version
Assert-Ok 'npm version'

Step 'Committing'
git add -A
git commit -m "chore: release $next"
Assert-Ok 'git commit'

Step 'Tagging and pushing'
git tag $next
Assert-Ok 'git tag'
git push origin $Branch
Assert-Ok "git push $Branch"
git push origin $next
Assert-Ok "git push $next"

if ($NoWait) {
    Write-Host "`nTag $next pushed. The workflow builds in the background:" -ForegroundColor Green
    Write-Host "  https://github.com/$Repo/actions/workflows/release.yml"
    Write-Host "  https://github.com/$Repo/releases/tag/$next"
    Write-Host "Verify and deploy once it turns green; this shell is free now." -ForegroundColor Green
    exit 0
}

Step "Waiting for the Release workflow on tag $next"

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$run = $null
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 10
    $runs = (gh run list --repo $Repo --workflow release.yml --limit 10 --json databaseId,status,conclusion,headBranch) | ConvertFrom-Json
    $run = $runs | Where-Object { $_.headBranch -eq $next } | Select-Object -First 1
    if ($run -and $run.status -eq 'completed') { break }
}
if (-not $run) { Fail "no workflow run appeared for tag $next - check https://github.com/$Repo/actions" }
if ($run.conclusion -ne 'success') { Fail "the workflow finished as '$($run.conclusion)' - check https://github.com/$Repo/actions/runs/$($run.databaseId)" }

Step 'Verifying the published release'
$rel = (gh release view $next --repo $Repo --json author,isDraft,isPrerelease,assets,url) | ConvertFrom-Json
if ($rel.isDraft) { Fail 'the release is still a draft' }
if ($rel.assets.Count -lt 3) { Fail "the release has $($rel.assets.Count) asset(s) - expected main.js, manifest.json, styles.css" }
Write-Host "url     : $($rel.url)"
Write-Host "author  : $($rel.author.login)  (github-actions[bot] = published by the workflow)"
Write-Host "assets  : $(($rel.assets | ForEach-Object { $_.name }) -join ', ')"

if (-not $SkipVault) {
    Step "Deploying the published assets into $Vault"
    if (-not (Test-Path -LiteralPath $Vault)) {
        Write-Host "vault folder not found, skipping: $Vault" -ForegroundColor Yellow
    } elseif (Save-ReleaseAssets $Vault $next) {
        Write-Host "deployed - reload the plugin in Obsidian to pick up $next"
    } else {
        Fail "could not download the assets into $Vault - the release itself is fine, grab them by hand from https://github.com/$Repo/releases/tag/$next"
    }

    Step "Deploying into the test vault ($TestVault)"
    if (-not (Test-Path -LiteralPath $TestVault)) {
        Write-Host "test vault not found, skipping: $TestVault" -ForegroundColor Yellow
    } else {
        $mainManifest = Join-Path $Vault 'manifest.json'
        $mainVersion = if (Test-Path -LiteralPath $mainManifest) {
            (Get-Content $mainManifest -Raw -Encoding UTF8 | ConvertFrom-Json).version
        } else { $null }
        if ($mainVersion -eq $next) {
            # The main vault already holds the verified assets; a second network
            # download only adds another chance to stall at the end.
            foreach ($file in 'main.js', 'manifest.json', 'styles.css') {
                Copy-Item -LiteralPath (Join-Path $Vault $file) -Destination (Join-Path $TestVault $file) -Force
            }
            Write-Host "installed into the test vault from the main vault." -ForegroundColor Yellow
        } elseif (Save-ReleaseAssets $TestVault $next) {
            Write-Host "installed into the test vault." -ForegroundColor Yellow
        } else {
            Fail "could not place the assets into $TestVault - grab them by hand from https://github.com/$Repo/releases/tag/$next"
        }
        Write-Host "NOW RELOAD THAT VAULT AND OPEN THE FAKECARD SETTINGS TAB:" -ForegroundColor Yellow
        Write-Host "  it must open instantly, and the 'what is new' dialog should" -ForegroundColor Yellow
        Write-Host "  appear once (it is skipped when data.json has no lastSeenVersion)." -ForegroundColor Yellow
    }
}

Write-Host "`nDone: $next" -ForegroundColor Green
