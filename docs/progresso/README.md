# Progresso visual — antes / depois

Prints das telas capturados via Playwright (dirigindo o Edge). Pasta local (não versionada).

## Como recapturar
1. Dev server no ar (`pnpm --filter web dev`).
2. Admin de teste: `node scripts/temp-admin.mjs create` (apaga com `delete`).
3. `LABEL=antes  SC_EMAIL=screenshot-bot@teste.com SC_SENHA=ScreenBot@2026x node scripts/screenshot-progresso.mjs`
   (troque `LABEL=depois` após a mudança).

## Lote 1 — Cards de caderno alinhados ao padrão "pôster"
- **antes/** — cadernos com capa + faixa branca (diferente dos cards de simulado/banco).
- **depois/** — cadernos no mesmo padrão pôster (`aspect-[4/5]`, capa cheia, título sobreposto,
  chip de ícone, kebab) — consistente com Aplicação de Simulado e Banco de Simulado.

Arquivos: `admin-simulados.png`, `admin-cadernos.png`, `admin-banco.png`.
