param(
  [Parameter(Mandatory=$true)][string]$Owner,
  [Parameter(Mandatory=$true)][string]$Repo,
  [ValidateSet('Private','Public')][string]$Visibility='Private',
  [switch]$Pause
)

function Stop-Err($msg){ Write-Error $msg; if($Pause){Read-Host "Press Enter to close"}; exit 1 }

# Require git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Stop-Err "git not found in PATH" }

# Init repo if needed; ensure main
if (-not (Test-Path .git)) {
  git init | Out-Null
  git checkout -b main 2>$null | Out-Null
} else {
  git branch -M main 2>$null | Out-Null
}

# Minimal identity if missing
if (-not (git config user.name))  { git config user.name  "Your Name"   | Out-Null }
if (-not (git config user.email)) { git config user.email "you@example.com" | Out-Null }

# .gitignore (create if missing)
if (-not (Test-Path .gitignore)) {
@'
node_modules/
dist/
.wrangler/
.dev.vars
__pycache__/
.venv/
.env
.env.*
.pytest_cache/
.ruff_cache/
.mypy_cache/
coverage/
*.bin
k6/results/
.vscode/
.DS_Store
'@ | Set-Content .gitignore -Encoding UTF8
}

# Stage & commit if needed
git add -A
git diff --cached --quiet; $staged = $LASTEXITCODE
if ($staged -ne 0) { git commit -m "Initial commit: repo baseline" | Out-Null }

$remoteUrl = "https://github.com/$Owner/$Repo.git"

# Wire remote / create repo if possible
$hasOrigin = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
  git remote set-url origin $remoteUrl | Out-Null
} else {
  if (Get-Command gh -ErrorAction SilentlyContinue) {
    gh auth status 2>$null; if ($LASTEXITCODE -ne 0) { gh auth login }
    $flag = if ($Visibility -eq 'Public') { '--public' } else { '--private' }
    gh repo create "$Owner/$Repo" $flag --source . --remote origin --push 2>$null
    if ($LASTEXITCODE -ne 0) { git remote add origin $remoteUrl | Out-Null }
  } else {
    git remote add origin $remoteUrl | Out-Null
  }
}

# Sync & push
git pull --rebase origin main 2>$null | Out-Null
git push -u origin main
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Push failed. If using HTTPS with 2FA, use a Personal Access Token as the password or use 'gh' CLI."
  if ($Pause) { Read-Host "Press Enter to close" }
  exit 1
}

Write-Host "✅ Pushed to $remoteUrl"
if ($Pause) { Read-Host "Press Enter to close" }
