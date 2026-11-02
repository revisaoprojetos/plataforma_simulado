# Inicio do dev server da plataforma (apps/web).
#
# VELOCIDADE: por padrao MANTEM o cache de compilacao (.next/cache). Antes, este script apagava o
# .next inteiro a CADA start - jogava o cache do webpack fora e recompilava tudo do zero toda vez
# (o que deixava o localhost MUITO lento). Agora o restart e "quente": so recompila o que mudou.
#
# Tambem:
#  1) encerra dev servers node antigos que ficaram rodando (acumulo = CPU/RAM saturada)
#  2) limpa o .next SOMENTE quando precisa: -Clean, ou quando troca o bundler (webpack<->turbopack),
#     porque caches de bundlers diferentes nao sao compativeis e ai sim da "chunk bugado".
#  3) sobe o servidor
#
# Uso:
#   pwsh scripts/dev.ps1            # webpack, estavel, cache mantido (rapido no restart)
#   pwsh scripts/dev.ps1 -Clean    # forca limpar o .next antes (use se der ChunkLoadError/estado corrompido)
#   pwsh scripts/dev.ps1 -Turbo    # Turbopack (mais rapido), com o cache de disco DESLIGADO p/ nao estourar a RAM

param(
  [switch]$Turbo,
  [switch]$Clean
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
if ($Turbo) { $bundler = 'turbopack' } else { $bundler = 'webpack' }

# Marcador do ultimo bundler usado (fica FORA do .next p/ sobreviver a limpeza). Se o bundler mudou,
# o cache antigo e de outro formato: limpa para nao servir chunk incompativel ("carregamento bugado").
$marker = Join-Path $web '.dev-last-bundler'
if (Test-Path $marker) { $last = (Get-Content $marker -Raw -ErrorAction SilentlyContinue).Trim() } else { $last = '' }
$trocouBundler = $last -and ($last -ne $bundler)

if (($Clean -or $trocouBundler) -and (Test-Path $next)) {
  if ($Clean) { $motivo = 'pedido (-Clean)' } else { $motivo = "troca de bundler: $last -> $bundler" }
  Write-Host "==> Limpando .next ($motivo)..." -ForegroundColor Yellow
  Remove-Item -Recurse -Force $next
} else {
  Write-Host "==> Mantendo o cache de compilacao (.next) - restart quente." -ForegroundColor DarkGray
}
Set-Content -Path $marker -Value $bundler -NoNewline -ErrorAction SilentlyContinue

# Limita a memoria do Node para o dev server nao consumir toda a RAM da maquina.
$env:NODE_OPTIONS = '--max-old-space-size=4096'

Set-Location $web
if ($Turbo) {
  # Turbopack no Windows: o cache PERSISTENTE de disco em dev estoura a RAM (~20GB, trava o PC).
  # TURBOPACK_FS_CACHE=off (lido em next.config.ts -> turbopackFileSystemCacheForDev:false) roda SEM
  # esse cache de disco: cold start um pouco mais lento, mas sem o pico de memoria.
  $env:TURBOPACK_FS_CACHE = 'off'
  Write-Host "==> Iniciando (Turbopack, cache de disco OFF)..." -ForegroundColor Green
  npx next dev --turbopack
} else {
  # Next 16 usa Turbopack POR PADRAO (instavel nesta maquina: OOM + ChunkLoadError do HMR,
  # que quebra a navegacao do editor). --webpack forca o bundler estavel.
  Write-Host "==> Iniciando (webpack, estavel, cache mantido)..." -ForegroundColor Green
  npx next dev --webpack
}
