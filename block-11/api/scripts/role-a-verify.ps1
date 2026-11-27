$ErrorActionPreference = 'Stop'
$apiDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspaceDirectory = [System.IO.Path]::GetFullPath((Join-Path $apiDirectory '../..'))
$toolsDirectory = Join-Path $apiDirectory 'tests/role-a-toolchain'
$toolModules = Join-Path $toolsDirectory 'node_modules'
$apiModules = Join-Path $apiDirectory 'node_modules'

Push-Location $workspaceDirectory
try {
    if (-not (Test-Path -LiteralPath $toolModules)) {
        & npm.cmd ci --prefix $toolsDirectory --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Toolchain install failed' }
    }
    # B owns api/package.json. Before B integrates, resolve dependencies through this ignored junction.
    # Never replace an existing B node_modules directory.
    if (-not (Test-Path -LiteralPath $apiModules)) {
        New-Item -ItemType Junction -Path $apiModules -Target $toolModules | Out-Null
    }
    $previousDatabaseUrl = $env:DATABASE_URL
    try {
        $env:DATABASE_URL = 'postgresql://block11:placeholder@127.0.0.1:5432/block11_isolated'
        & node (Join-Path $toolModules 'prisma/build/index.js') validate --schema (Join-Path $apiDirectory 'prisma/schema.prisma')
        if ($LASTEXITCODE -ne 0) { throw 'Prisma validate failed' }
        & node (Join-Path $toolModules 'prisma/build/index.js') generate --schema (Join-Path $apiDirectory 'prisma/schema.prisma')
        if ($LASTEXITCODE -ne 0) { throw 'Prisma generate failed' }
    } finally { $env:DATABASE_URL = $previousDatabaseUrl }
    & node (Join-Path $toolModules 'typescript/bin/tsc') -p (Join-Path $toolsDirectory 'tsconfig.json')
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed' }
    $loader = ([System.Uri]::new((Join-Path $toolModules 'tsx/dist/loader.mjs'))).AbsoluteUri
    $testFiles = @(Get-ChildItem -LiteralPath (Join-Path $apiDirectory 'tests/role-a') -Filter '*.test.ts' | Select-Object -ExpandProperty FullName)
    & node --import $loader --test @testFiles
    if ($LASTEXITCODE -ne 0) { throw 'Role A tests failed' }
} finally { Pop-Location }
