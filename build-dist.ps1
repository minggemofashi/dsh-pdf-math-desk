# 构建可分发的插件包：复制插件目录到 ../dist/dsh-pdf-workbench-<version>/，
# 换成分发用的中性 cordis.patch.yml，再压成 zip。
# 用法：powershell -ExecutionPolicy Bypass -File .\build-dist.ps1
param([string]$Version = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($Version -eq '') {
    $Version = (Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
}
$distRoot = Join-Path (Split-Path -Parent $root) 'dist'
$pkg = Join-Path $distRoot "dsh-pdf-workbench-$Version"
Write-Host "packaging $Version -> $pkg"
foreach ($required in @('vendor\host-ui.cjs', 'vendor\host-ui.css')) {
    if (-not (Test-Path (Join-Path $root $required))) {
        throw "缺少 $required；先运行 npm install 和 npm run build:host-ui"
    }
}
if (Test-Path $distRoot) { Remove-Item $distRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $pkg | Out-Null
Get-ChildItem $root -Force |
    Where-Object { $_.Name -notin @('.git', 'node_modules', 'dist', '.dsh-scratch') } |
    ForEach-Object { Copy-Item $_.FullName -Destination $pkg -Recurse -Force }

$neutralPatch = @"
# dsh-pdf-workbench: a book -> chapter workbench in the main column.
#
# Optional: point ``libraryDir`` at a split-library root that holds ``分片/``
# (and optionally ``整本/``, ``索引.json``). Without it the plugin starts neutral:
# the workbench's 书库 page adds libraries on first use. Example:
#   - insert:
#       - id: pdfdesk
#         name: dsh-pdf-workbench
#         config:
#           libraryDir: 'D:\数学书库'
- insert:
    - id: pdfdesk
      name: dsh-pdf-workbench
"@
[IO.File]::WriteAllText((Join-Path $pkg 'cordis.patch.yml'), $neutralPatch, [Text.UTF8Encoding]::new($false))

# The py.cmd/node.cmd wrappers point at this machine's runtime; never ship them.
# tools\typst is a local Typst install (52 MB), not part of the package.
foreach ($wrapper in @('tools\py.cmd', 'tools\node.cmd')) {
    $path = Join-Path $pkg $wrapper
    if (Test-Path $path) { Remove-Item $path -Force }
}
$localTypst = Join-Path $pkg 'tools\typst'
if (Test-Path $localTypst) { Remove-Item $localTypst -Recurse -Force }

$leaks = Get-ChildItem $pkg -Recurse -File -Include *.md, *.yml, *.yaml, *.json, *.js, *.mjs, *.py, *.cmd |
    Select-String -Pattern 'C:\\Users\\' -ErrorAction SilentlyContinue
if ($leaks) {
    $leaks | ForEach-Object { Write-Host ("LEAK " + $_.Path + ':' + $_.LineNumber) }
    throw '分发副本里仍有本机路径，先清理再打包'
}

$zip = Join-Path $distRoot "dsh-pdf-workbench-$Version.zip"
Compress-Archive -Path (Join-Path $pkg '*') -DestinationPath $zip -Force
Write-Host "zip: $zip ($((Get-Item $zip).Length) bytes)"
