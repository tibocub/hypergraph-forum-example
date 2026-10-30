# Installs or updates the forum (Windows), then starts it.
#   irm https://raw.githubusercontent.com/tibocub/hypergraph-forum-example/main/install.ps1 | iex
# Your data stays in %USERPROFILE%\.hypergraph-forum: running this again only updates the program.
# Written for Windows PowerShell 5.1 (no && or ternaries).

$ErrorActionPreference = 'Stop'
$HypergraphRef = '290a86acb7844ae6c13b597be00fc350637e8690' # the hypergraph commit every member runs
$ForumRef = 'origin/main'
$App = Join-Path $HOME 'hypergraph-forum-app'

function Need ($cmd, $url) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Install $cmd first: $url (then open a new PowerShell window)" }
}
function Check ($what) {
  if ($LASTEXITCODE -ne 0) { throw "$what failed (see above)" }
}

Need git 'https://git-scm.com/download/win'
Need node 'https://nodejs.org'
$major = [int]((node -v).TrimStart('v').Split('.')[0])
if ($major -lt 20) { throw 'Node.js 20 or newer is needed: https://nodejs.org' }

# Clone or fetch, then that exact commit.
function Get-Repo ($url, $folder, $ref) {
  $dir = Join-Path $App $folder
  if (Test-Path (Join-Path $dir '.git')) { git -C $dir fetch --quiet origin; Check "Updating $folder" }
  else { git clone --quiet $url $dir; Check "Downloading $folder" }
  git -C $dir checkout --quiet --detach $ref; Check "Choosing the version of $folder"
}

New-Item -ItemType Directory -Force $App | Out-Null
Write-Host 'Downloading...'
Get-Repo 'https://github.com/tibocub/hypergraph.git' 'hypergraph' $HypergraphRef
Get-Repo 'https://github.com/tibocub/hypergraph-forum-example.git' 'hypergraph-forum-example' $ForumRef
Write-Host 'Installing...'
Push-Location (Join-Path $App 'hypergraph'); npm install --no-audit --no-fund --loglevel=error; Check 'Installing hypergraph'; Pop-Location
$forum = Join-Path $App 'hypergraph-forum-example'
Set-Location $forum
npm install --no-audit --no-fund --loglevel=error; Check 'Installing the forum'

Write-Host "Done. To start the forum later: open PowerShell, then: cd `"$forum`"; npm start"
npm start
