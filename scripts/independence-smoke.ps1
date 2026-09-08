param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $Executable).Path
if (-not ($resolved -like '*.exe')) { throw 'Expected a packaged Flint executable.' }
$isolated = Join-Path ([System.IO.Path]::GetTempPath()) "flint-independence-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $isolated | Out-Null
$copy = Join-Path $isolated 'Flint.exe'
Copy-Item -LiteralPath $resolved -Destination $copy
$oldPath = $env:Path
$oldAppData = $env:APPDATA
$oldLocalAppData = $env:LOCALAPPDATA
try {
  $env:Path = "$env:SystemRoot\System32;$env:SystemRoot"
  $env:APPDATA = Join-Path $isolated 'AppData\Roaming'
  $env:LOCALAPPDATA = Join-Path $isolated 'AppData\Local'
  New-Item -ItemType Directory -Force -Path $env:APPDATA,$env:LOCALAPPDATA | Out-Null
  $process = Start-Process -FilePath $copy -WorkingDirectory $isolated -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 5
  if ($process.HasExited) { throw "Packaged Flint exited during isolated launch with code $($process.ExitCode)." }
  Stop-Process -Id $process.Id
  Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  Write-Host "PASS: packaged Flint launched outside the project with Node, Rust, Cargo, Python, and the source tree absent from PATH."
} finally {
  $env:Path = $oldPath
  $env:APPDATA = $oldAppData
  $env:LOCALAPPDATA = $oldLocalAppData
  if (Test-Path $isolated) {
    Start-Sleep -Milliseconds 500
    Remove-Item -LiteralPath $isolated -Recurse -Force
  }
}
