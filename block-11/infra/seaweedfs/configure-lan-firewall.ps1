param([string]$Address = '192.168.100.154', [string]$InterfaceAlias = 'Wi-Fi')
$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$resultDirectory = Join-Path $repositoryRoot '.runtime-tools'
if (-not (Test-Path -LiteralPath $resultDirectory)) { $resultDirectory = Join-Path $repositoryRoot '.block11-review/.runtime-tools' }
if (-not (Test-Path -LiteralPath $resultDirectory)) { $resultDirectory = Join-Path $repositoryRoot 'block-11/api/.runtime' }
$resultPath = Join-Path $resultDirectory 'lan-firewall-result.json'
try {
    $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this helper in PowerShell as Administrator.' }
    $ip = [System.Net.IPAddress]::Parse($Address)
    if ($ip.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { throw 'An IPv4 address is required.' }
    if (-not (Get-NetIPAddress -InterfaceAlias $InterfaceAlias -AddressFamily IPv4 | Where-Object IPAddress -eq $Address)) { throw 'The address no longer belongs to this network adapter. Check the current LAN IP.' }
    $nodePath = (Get-Command node.exe).Source
    $ruleName = 'Block11-LAN-5173'
    $existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    if ($existing) { Remove-NetFirewallRule -Name $ruleName }
    New-NetFirewallRule -Name $ruleName -DisplayName 'Block11 LAN demo (Node 5173)' `
      -Description 'Allow only Node.js/Vite 5173 from local subnet on the configured Wi-Fi IPv4. API and S3 remain loopback.' `
      -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -LocalAddress $Address `
      -RemoteAddress LocalSubnet -InterfaceAlias $InterfaceAlias -Program $nodePath -Profile Public,Private -Enabled True | Out-Null
    $result = @{ success = $true; address = $Address; port = 5173; rule = $ruleName; remoteScope = 'LocalSubnet'; changedNetworkProfile = $false }
    New-Item -ItemType Directory -Path $resultDirectory -Force | Out-Null
    $result | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding utf8
    Write-Output "Firewall configured for http://${Address}:5173 on $InterfaceAlias. API/S3 ports were not opened."
} catch {
    New-Item -ItemType Directory -Path $resultDirectory -Force | Out-Null
    @{ success = $false; message = $_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding utf8
    throw
}
