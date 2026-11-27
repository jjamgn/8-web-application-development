param([string]$WeedExe = '', [string]$DataDirectory = '')
$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
if (-not $WeedExe) {
    foreach ($relative in @('.runtime-tools/seaweedfs/weed.exe', '.block11-review/.runtime-tools/seaweedfs/weed.exe')) {
        $candidate = Join-Path $repositoryRoot $relative
        if (Test-Path -LiteralPath $candidate) { $WeedExe = $candidate; break }
    }
}
if (-not $WeedExe -or -not (Test-Path -LiteralPath $WeedExe)) { throw 'Provide -WeedExe with the SeaweedFS 4.55 weed.exe path.' }
$WeedExe = (Resolve-Path -LiteralPath $WeedExe).Path
if (-not $DataDirectory) { $DataDirectory = Join-Path (Split-Path -Parent (Split-Path -Parent $WeedExe)) 'seaweed-data' }
if (-not (Test-Path -LiteralPath $DataDirectory -PathType Container)) { throw 'Existing SeaweedFS data directory missing. Specify -DataDirectory; do not accidentally start with an empty store.' }
$DataDirectory = (Resolve-Path -LiteralPath $DataDirectory).Path
$envPath = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw 'Configure infra/seaweedfs/.env first.' }
$settings = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^([A-Z_][A-Z_0-9]*)=(.*)$') { $settings[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'") }
}
foreach ($key in @('S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','S3_BUCKET')) {
    if (-not $settings[$key] -or $settings[$key] -match 'replace|placeholder') { throw "Missing real local configuration for $key" }
}
$previousAccess = $env:AWS_ACCESS_KEY_ID; $previousSecret = $env:AWS_SECRET_ACCESS_KEY; $previousBucket = $env:S3_BUCKET
try {
    $env:AWS_ACCESS_KEY_ID = $settings['S3_ACCESS_KEY_ID']
    $env:AWS_SECRET_ACCESS_KEY = $settings['S3_SECRET_ACCESS_KEY']
    $env:S3_BUCKET = $settings['S3_BUCKET']
    Write-Output 'Starting SeaweedFS at localhost:8333 with the existing data directory. Keep this terminal open.'
    & $WeedExe @('mini', "-dir=$DataDirectory", '-ip=127.0.0.1', '-ip.bind=127.0.0.1', '-s3.port=8333')
    if ($LASTEXITCODE -ne 0) { throw 'SeaweedFS stopped with an error. Check whether port 8333 is already in use.' }
} finally {
    $env:AWS_ACCESS_KEY_ID = $previousAccess; $env:AWS_SECRET_ACCESS_KEY = $previousSecret; $env:S3_BUCKET = $previousBucket
}
