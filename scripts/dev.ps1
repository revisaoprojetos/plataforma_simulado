# Início LIMPO do dev server da plataforma (apps/web).
#
# Resolve o problema de "trava o PC ao iniciar":
#  1) encerra dev servers node antigos que ficaram rodando (acúmulo = CPU/RAM saturada)
#  2) limpa o .next (evita o loop de reload do Turbopack / TurbopackInternalError)
#  3) sobe o servidor
#
# Uso:
#   pwsh scripts/dev.ps1            # modo padrão (webpack, mais estável)
#   pwsh scripts/dev.ps1 -Turbo    # usa Turbopack (mais rápido, porém instável aqui)

param(
  [switch]$Turbo
)

$ErrorActionPreference = 'SilentlyContinue'

Write-Host "==> Encerrando dev servers (next) antigos..." -ForegroundColor Yellow
$me = $PID
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.ProcessId -ne $me -and $_.CommandLine -like '*\next\dist\bin\next*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Seconds 1

$web  = Join-Path $PSScriptRoot '..\apps\web'
$next = Join-Path $web '.next'
if (Test-Path $next) {
  Write-Host "==> Limpando .next..." -ForegroundColor Yellow
  Remove-Item -Recurse -Force $next
}

# Limita a memória do Node para o dev server não consumir toda a RAM da máquina.
$env:NODE_OPTIONS = '--max-old-space-size=4096'

Set-Location $web
if ($Turbo) {
  Write-Host "==> Iniciando (Turbopack)..." -ForegroundColor Green
  npx next dev --turbopack
} else {
  Write-Host "==> Iniciando (webpack, estável)..." -ForegroundColor Green
  npx next dev
}
