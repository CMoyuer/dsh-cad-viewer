# restart-verify.ps1 — safe restart of dsh web for dsh-cad-viewer, with the
# export API added to the health check.
#
#   Phase 0  preflight  : import the plugin's server half (must print PREFLIGHT_OK)
#   Phase 1  kill old   : node.exe running @deepseek-ai/dsh/lib/bin.js under this profile
#   Phase 2  start new  : detached `node <dshBin> --profile web --no-open`
#   Phase 3  health     : /3dmodel/api/items, /tcv bundle, /3dmodel/api/items/formats,
#                         and a REAL export download (STL + STEP) of a stored model
#   Phase 4  rollback   : on failure, disable the plugin via a patch overlay and
#                         restart so the GUI stays usable
#
# Launch it DETACHED (it kills dsh, i.e. the agent's own parent):
#   Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine="..."}
# Everything it learns is appended to $log, so the result survives the restart.
#
# Exit codes / RESULT lines: ok | preflight-failed | startup-failed | plugin-rolled-back
$ErrorActionPreference = "Continue"

$dshBin     = "C:\Users\Moyuer\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js"
$profileDir = "C:\Users\Moyuer\.dsh\profiles\web"
$pluginDir  = "D:\AI\Plugins\dsh-cad-viewer"
$log        = Join-Path $pluginDir "dev\restart-log.log"
$tmp        = Join-Path $env:TEMP "dsh-cad-viewer-restart"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$stdout = Join-Path $tmp "dsh.stdout.log"
$stderr = Join-Path $tmp "dsh.stderr.log"
$port   = 3080

New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
function Log($m) { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format o), $m) }
function DshProcs {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -match 'dsh[\\/]lib[\\/]bin\.js' -and $_.CommandLine -match '(^|\s)web(\s|$)|--profile\s+web'
  }
}
function WaitPortGone {
  for ($i = 0; $i -lt 60; $i++) {
    if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}
function WaitPortUp {
  for ($i = 0; $i -lt 120; $i++) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}
function StartDsh {
  Start-Process -FilePath "node" -ArgumentList @($dshBin, "--profile", "web", "--no-open") `
    -WorkingDirectory $profileDir -RedirectStandardOutput $stdout -RedirectStandardError $stderr `
    -WindowStyle Hidden | Out-Null
}

Set-Content -Path $log -Value ("[{0}] === restart+verify started ===" -f (Get-Date -Format o))

# ---- Phase 0: preflight --------------------------------------------------
Log "phase0 preflight"
$pre = & node (Join-Path $profileDir "cad-viewer-preflight.mjs") 2>&1 | Out-String
Log ("preflight output: " + (($pre -replace "`r?`n", " ").Trim()))
if ($pre -notmatch 'PREFLIGHT_OK') {
  Log "RESULT=preflight-failed (dsh left untouched)"
  exit 1
}

# ---- small delay so the launching tool call has returned -----------------
Start-Sleep -Seconds 3

# ---- Phase 1: kill the old dsh -------------------------------------------
$old = @(DshProcs)
Log ("phase1 killing pids: " + (($old | ForEach-Object { $_.ProcessId }) -join ", "))
foreach ($p in $old) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { Log ("kill failed " + $p.ProcessId + ": " + $_.Exception.Message) } }
$gone = WaitPortGone
Log ("port $port released = $gone")
if (-not $gone) { Log "RESULT=startup-failed (port never released)"; exit 1 }

# ---- Phase 2: start the new dsh ------------------------------------------
Log "phase2 starting dsh web"
StartDsh
$up = WaitPortUp
Log ("port $port listening = $up")
if (-not $up) {
  Log "RESULT=startup-failed (dsh web did not listen)"
  $err = if (Test-Path $stderr) { (Get-Content $stderr -Raw) } else { "" }
  Log ("stderr tail: " + ($err.Substring([Math]::Max(0, $err.Length - 1200)) -replace "`r?`n", " "))
  exit 1
}
# the plugin tree + client bundles are composed during boot
Start-Sleep -Seconds 12

# ---- Phase 3: health checks ---------------------------------------------
# A probe returns a detail string when it passes and THROWS when it fails.
$fail = @()
function Check($label, [scriptblock]$probe) {
  try {
    $detail = & $probe
    Log ("PASS $label :: $detail")
    return $true
  } catch {
    Log ("FAIL $label :: " + $_.Exception.Message)
    return $false
  }
}

if (-not (Check "api/items" {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/3dmodel/api/items" -UseBasicParsing -TimeoutSec 20
  if ($r.StatusCode -ne 200 -or $r.Headers['Content-Type'] -notmatch 'application/json') {
    throw "status=$($r.StatusCode) ct=$($r.Headers['Content-Type'])"
  }
  "status=200 application/json"
})) { $fail += "api/items" }

if (-not (Check "tcv bundle" {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/tcv/three-cad-viewer.esm.min.js" -UseBasicParsing -TimeoutSec 20
  if ($r.StatusCode -ne 200 -or $r.Headers['Content-Type'] -notmatch 'text/javascript') {
    throw "status=$($r.StatusCode) ct=$($r.Headers['Content-Type'])"
  }
  "status=200 text/javascript"
})) { $fail += "tcv" }

if (-not (Check "api/items/formats" {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/3dmodel/api/items/formats" -UseBasicParsing -TimeoutSec 20
  $parsed = $r.Content | ConvertFrom-Json
  $ids = @($parsed.formats | ForEach-Object { $_.id })
  if ($ids.Count -ne 10) { throw ("expected 10 formats, got: " + ($ids -join ",")) }
  "10 formats: " + ($ids -join ",")
})) { $fail += "formats" }

$modelId = $null
try {
  $list = (Invoke-WebRequest -Uri "http://127.0.0.1:$port/3dmodel/api/items" -UseBasicParsing -TimeoutSec 20).Content | ConvertFrom-Json
  $modelId = @($list.items)[0].id
} catch {}
Log ("export probe model id: " + $modelId)

if ($modelId) {
  if (-not (Check "export headers (HEAD STL)" {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/3dmodel/api/items/$modelId/export?format=STL" -Method Head -UseBasicParsing -TimeoutSec 300
    $ct = $r.Headers['Content-Type']
    $cd = $r.Headers['Content-Disposition']
    if ($r.StatusCode -ne 200) { throw "status=$($r.StatusCode)" }
    if ($ct -notmatch 'model/stl') { throw "content-type=$ct" }
    if ($cd -notmatch 'attachment') { throw "content-disposition=$cd" }
    "status=200 ct=$ct cd=$cd"
  })) { $fail += "export-headers" }

  foreach ($fmt in @("STEP", "STL", "SVG", "DXF", "3MF", "VTP")) {
    if (-not (Check "export $fmt" {
      $out = Join-Path $tmp ("probe." + $fmt.ToLower())
      if (Test-Path $out) { Remove-Item $out -Force }
      Invoke-WebRequest -Uri "http://127.0.0.1:$port/3dmodel/api/items/$modelId/export?format=$fmt" -OutFile $out -UseBasicParsing -TimeoutSec 300 | Out-Null
      $size = (Get-Item $out).Length
      if ($size -le 0) { throw "empty file" }
      "bytes=$size"
    })) { $fail += "export-$fmt" }
  }
} else {
  # An empty library is a legitimate state (entries can be deleted), so the
  # export probes are skipped instead of being counted as a failure.
  Log "SKIP export probes :: the model library is empty"
}

# plugin load errors land on stderr
$errText = if (Test-Path $stderr) { Get-Content $stderr -Raw } else { "" }
if ($errText -match 'Cannot find|SyntaxError|TypeError|plugin.*failed') {
  Log ("stderr tail: " + ($errText.Substring([Math]::Max(0, $errText.Length - 1200)) -replace "`r?`n", " "))
}

if ($fail.Count -eq 0) {
  Log "RESULT=ok"
  exit 0
}

# ---- Phase 4: roll back (disable the plugin) and restart -----------------
Log ("health failed (" + ($fail -join ",") + ") -> rolling back")
$patchFile = Join-Path $profileDir "cordis.patch.yml"
$raw = Get-Content $patchFile -Raw
if ($raw -notmatch '(?m)^-\s*id:\s*cad-viewer\s*$') {
  Add-Content -Path $patchFile -Value "`n# Rollback overlay: disable dsh-cad-viewer (added by restart-verify.ps1 on failure).`n- id: cad-viewer`n  disabled: true"
  Log "added disable overlay to cordis.patch.yml"
} else {
  Log "disable overlay already present"
}
foreach ($p in @(DshProcs)) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }
WaitPortGone | Out-Null
StartDsh
WaitPortUp | Out-Null
Log "RESULT=plugin-rolled-back (dsh restarted with dsh-cad-viewer disabled)"
exit 0
