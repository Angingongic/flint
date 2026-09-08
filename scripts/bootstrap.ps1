$ErrorActionPreference = 'Stop'
$results = [System.Collections.Generic.List[string]]::new()
function Has($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }
function Mark($message) { $results.Add($message); Write-Host $message }

if (-not $IsWindows -and $PSVersionTable.PSEdition -eq 'Core') { throw 'Use scripts/bootstrap.sh on macOS or Linux.' }
Mark "Flint bootstrap: Windows $([Environment]::OSVersion.Version)"

if (-not (Has node)) {
  if (Has winget) { Write-Host 'Node.js requires an OS installer and may show an approval prompt.'; winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements; Mark 'Installed Node.js LTS' }
  else { throw 'Node.js is missing and winget is unavailable. Install Node.js LTS, then rerun.' }
} else { Mark "Node: $(node --version)" }

if (-not (Has cargo)) {
  if (Has winget) { Write-Host 'Rust requires an OS installer and may show an approval prompt.'; winget install Rustlang.Rustup --accept-package-agreements --accept-source-agreements; $env:Path += ";$env:USERPROFILE\.cargo\bin" }
  else { throw 'Rust is missing and winget is unavailable. Install rustup, then rerun.' }
}
if (-not (Has cargo)) { throw 'Rust installation completed but Cargo is not on PATH. Reopen the terminal and rerun bootstrap.' }
rustup default stable
Mark "Rust: $(rustc --version)"

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasCpp = (Test-Path $vswhere) -and (& $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)
if (-not $hasCpp) {
  if (Has winget) { Write-Host 'Visual Studio C++ Build Tools require an OS installer and may show an approval/elevation prompt.'; winget install Microsoft.VisualStudio.2022.BuildTools --override '--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended' --accept-package-agreements --accept-source-agreements }
  else { throw 'Visual Studio C++ Build Tools are missing and winget is unavailable.' }
}
Mark 'Windows C++ build tools: available or installer completed'

npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'frontend lint failed' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'frontend tests failed' }
Push-Location src-tauri
try { cargo test; if ($LASTEXITCODE -ne 0) { throw 'Rust tests failed' }; cargo check; if ($LASTEXITCODE -ne 0) { throw 'Rust compile check failed' } } finally { Pop-Location }
Mark 'SUCCESS: dependencies installed; frontend and native checks passed.'
$results | ForEach-Object { Write-Host "  $_" }
