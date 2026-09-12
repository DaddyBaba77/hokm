<#
  Hokm — one-time GitHub setup.

  Run it from this folder:

      powershell -ExecutionPolicy Bypass -File .\setup-github.ps1

  That does the safety checks and makes the first commit, then stops and tells
  you what to do next. Once you've created the empty repo on GitHub, run it
  again with the repo's URL to connect and push:

      powershell -ExecutionPolicy Bypass -File .\setup-github.ps1 -RepoUrl https://github.com/you/hokm.git

  It refuses to do anything it isn't sure about: it will not touch another
  repository, will not commit node_modules, and will not push without you
  typing PUSH first.
#>
[CmdletBinding()]
param([string]$RepoUrl)

# git reports perfectly normal things on stderr ("not a git repository", push
# progress, CRLF warnings). Windows PowerShell 5.1 turns those into fatal errors
# when ErrorActionPreference is Stop, so keep it Continue and check exit codes
# ourselves. The helpers below force Continue around every git call as well.
$ErrorActionPreference = 'Continue'
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

function Invoke-Git {
  param([string[]]$GitArgs, [ValidateSet('silent', 'capture', 'show')][string]$Mode = 'silent')
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    switch ($Mode) {
      'capture' { $out = & git @GitArgs 2>&1 | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } }
      'show'    { & git @GitArgs 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }; $out = $null }
      default   { & git @GitArgs 2>&1 | Out-Null; $out = $null }
    }
  } finally { $ErrorActionPreference = $prev }
  return $out
}

# first line of stdout, as a trimmed string; '' when git failed
function GitOut {
  $out = Invoke-Git -GitArgs $args -Mode capture
  if ($LASTEXITCODE -ne 0) { return '' }
  if ($out -is [array]) { $out = $out[0] }
  if ($null -eq $out) { return '' }
  return ([string]$out).Trim()
}
# every stdout line
function GitLines {
  $out = Invoke-Git -GitArgs $args -Mode capture
  if ($LASTEXITCODE -ne 0 -or $null -eq $out) { return @() }
  return @($out | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
}
# run it, say nothing
function GitDo { $null = Invoke-Git -GitArgs $args -Mode silent; return $LASTEXITCODE }
# run it, echo what git says
function GitShow { $null = Invoke-Git -GitArgs $args -Mode show; return $LASTEXITCODE }

function Line { Write-Host "" }
function Head($m) { Write-Host ""; Write-Host "  $m" -ForegroundColor Cyan; Write-Host ("  " + ("-" * $m.Length)) -ForegroundColor DarkCyan }
function Ok($m)   { Write-Host "  [ ok ] $m" -ForegroundColor Green }
function Note($m) { Write-Host "  [info] $m" -ForegroundColor Gray }
function Warn($m) { Write-Host "  [warn] $m" -ForegroundColor Yellow }
function Fail($m, $fix) {
  Line
  Write-Host "  STOPPED - $m" -ForegroundColor Red
  if ($fix) { Write-Host "           $fix" -ForegroundColor Yellow }
  Line
  exit 1
}

$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
Set-Location -LiteralPath $root

Write-Host ""
Write-Host "  HOKM - GitHub setup" -ForegroundColor Yellow
Write-Host "  $root" -ForegroundColor DarkGray

# ── 1. right folder? ──────────────────────────────────────────────────────────
Head "1. Checking the folder"
if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) {
  Fail "No package.json here, so this isn't the Hokm folder." "cd into the folder that contains server.js, then run this again."
}
if ((Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw) -notmatch 'hokm-online') {
  Fail "The package.json here belongs to a different project." "Run this from the Hokm folder only."
}
Ok "This is the Hokm project."

# ── 2. git present and configured ─────────────────────────────────────────────
Head "2. Checking git"
$version = GitOut '--version'
if ($LASTEXITCODE -ne 0 -or -not $version) {
  Fail "git isn't installed (or isn't on PATH)." "Install it from https://git-scm.com/download/win, reopen PowerShell, and try again."
}
Ok $version

$userName  = GitOut 'config' '--global' 'user.name'
$userEmail = GitOut 'config' '--global' 'user.email'
if (-not $userName -or -not $userEmail) {
  Warn "git doesn't know who you are yet; commits need a name and email."
  if (-not $userName)  { $userName  = Read-Host "        Your name"  ; $null = GitDo 'config' '--global' 'user.name'  $userName }
  if (-not $userEmail) { $userEmail = Read-Host "        Your email" ; $null = GitDo 'config' '--global' 'user.email' $userEmail }
}
Ok "Committing as $userName <$userEmail>"

# ── 3. make sure we're not inside somebody else's repository ──────────────────
Head "3. Checking for an existing repository"
$top = GitOut 'rev-parse' '--show-toplevel'
$insideRepo = ($LASTEXITCODE -eq 0 -and $top -and (Test-Path -LiteralPath $top))
$alreadyOurs = $false

if ($insideRepo) {
  $topFull  = (Resolve-Path -LiteralPath $top).Path.TrimEnd('\','/')
  $rootFull = (Resolve-Path -LiteralPath $root).Path.TrimEnd('\','/')
  if ($topFull -ieq $rootFull) {
    $alreadyOurs = $true
    Ok "This folder is already its own repository - carrying on with it."
  } else {
    Fail "This folder sits INSIDE another git repository: $topFull" `
         "Committing here would add Hokm to that project. Move the Hokm folder somewhere outside it and run this again."
  }
} else {
  Ok "No repository here or above - clean slate."
}

# ── 4. initialise ─────────────────────────────────────────────────────────────
if (-not $alreadyOurs) {
  Head "4. Creating the repository"
  if ((GitDo 'init' '-q') -ne 0) { Fail "git init failed." }
  Ok "Created."
} else {
  Head "4. Repository"
  Note "Already initialised; skipping."
}

# ── 5. stage, and check what we're about to commit ────────────────────────────
Head "5. Staging files"
if ((GitDo 'add' '-A') -ne 0) { Fail "git add failed." }

$staged = @(GitLines 'diff' '--cached' '--name-only')
$junk = @($staged | Where-Object { $_ -match '(^|/)node_modules/' -or $_ -match 'Claude outputs' })
if ($junk.Count -gt 0) {
  Fail "$($junk.Count) file(s) that shouldn't be in the repo got staged, e.g. $($junk[0])" `
       "Check that .gitignore is present, then run:  git rm -r --cached node_modules"
}

if ($staged.Count -eq 0) {
  Note "Nothing new to commit - the working tree already matches the last commit."
} else {
  Ok "$($staged.Count) files staged, none of them node_modules."
  $staged | Select-Object -First 24 | ForEach-Object { Write-Host "         $_" -ForegroundColor DarkGray }
  if ($staged.Count -gt 24) { Write-Host "         ... and $($staged.Count - 24) more" -ForegroundColor DarkGray }

  Head "6. Committing"
  if ((GitDo 'commit' '-q' '-m' 'Hokm - four-player online Hokm') -ne 0) { Fail "git commit failed." }
  Ok "Committed."
}
$null = GitDo 'branch' '-M' 'main'

# ── 7. connect to GitHub ──────────────────────────────────────────────────────
Head "7. GitHub"
if (-not $RepoUrl) {
  Write-Host ""
  Write-Host "  Everything is committed locally. Nothing has left your PC." -ForegroundColor Green
  Write-Host ""
  Write-Host "  Next:" -ForegroundColor Yellow
  Write-Host "    1. Go to https://github.com/new"
  Write-Host "    2. Name it 'hokm'. Leave every checkbox UNTICKED (no README, no .gitignore, no licence)."
  Write-Host "    3. Copy the repo URL, then run:"
  Write-Host ""
  Write-Host "       powershell -ExecutionPolicy Bypass -File .\setup-github.ps1 -RepoUrl <paste-url-here>" -ForegroundColor Cyan
  Write-Host ""
  exit 0
}

if ($RepoUrl -notmatch '^https://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(\.git)?/?$') {
  Fail "That doesn't look like a GitHub repo URL: $RepoUrl" `
       "It should look like https://github.com/yourname/hokm.git"
}

$existing = GitOut 'remote' 'get-url' 'origin'
if ($existing) {
  if ($existing.TrimEnd('/') -ine $RepoUrl.TrimEnd('/')) {
    Fail "This folder is already pointed at a different repo: $existing" `
         "If that's wrong, run:  git remote remove origin   then run this again."
  }
  Ok "Already connected to $existing"
} else {
  if ((GitDo 'remote' 'add' 'origin' $RepoUrl) -ne 0) { Fail "Couldn't add the remote." }
  Ok "Connected to $RepoUrl"
}

# ── 8. push, but only on an explicit yes ──────────────────────────────────────
Head "8. Push"
Write-Host ""
Write-Host "  About to push this folder to:" -ForegroundColor Yellow
Write-Host "      $RepoUrl" -ForegroundColor White
Write-Host ""
Write-Host "  Make sure that is the NEW empty repo you just created," -ForegroundColor Yellow
Write-Host "  and not any other project of yours." -ForegroundColor Yellow
Write-Host ""
$answer = Read-Host "  Type PUSH to continue (anything else cancels)"
if ($answer -cne 'PUSH') { Line; Note "Cancelled. Nothing was pushed."; Line; exit 0 }

Line
$pushCode = GitShow 'push' '-u' 'origin' 'main'
if ($pushCode -ne 0) {
  Fail "The push failed - see the git message above." `
       "Common causes: the repo wasn't created empty, or the sign-in window was dismissed."
}

Line
Write-Host "  Done. Your code is at $RepoUrl" -ForegroundColor Green
Write-Host "  Check the page: you should see server.js, public/, src/, test/ and NO node_modules." -ForegroundColor Gray
Line
