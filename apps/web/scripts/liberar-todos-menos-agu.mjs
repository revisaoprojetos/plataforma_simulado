// Liberar "acesso para todos" (regras.acesso_gratuito=true) em TODOS os simulados oficiais da Revisão
// MENOS "Concurso Simulado AGU". Faz backup do estado atual antes. Usa a conexão PRIMÁRIA (write).
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const URL = env.DATABASE_URL // PRIMÁRIO (não a réplica) — é escrita
if (!URL) { console.error('DATABASE_URL (primário) ausente'); process.exit(1) }
const pool = new pg.Pool({ connectionString: URL, max: 3, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const RE_AGU = 'concurso\\s+simulado\\s+agu'

// 1) BACKUP do estado atual (todos os 33 oficiais).
const { rows: antes } = await pool.query(
  `SELECT id, titulo, (regras->>'acesso_gratuito') AS gratuito
     FROM simulado_simulados WHERE tenant_id=$1 AND deletado=false AND owner_estudante_id IS NULL ORDER BY titulo`, [TID])
writeFileSync('scripts/_backup-acesso-gratuito.json', JSON.stringify({ tenant: TID, geradoEm: new Date().toISOString(), simulados: antes }, null, 2))
console.log(`Backup salvo: scripts/_backup-acesso-gratuito.json (${antes.length} simulados)`)

// 2) UPDATE: acesso_gratuito=true em todos MENOS o AGU. Idempotente (jsonb_set).
const { rows: mudados } = await pool.query(
  `UPDATE simulado_simulados
      SET regras = jsonb_set(coalesce(regras,'{}'::jsonb), '{acesso_gratuito}', 'true'::jsonb)
    WHERE tenant_id=$1 AND deletado=false AND owner_estudante_id IS NULL
      AND titulo !~* $2
      AND coalesce(regras->>'acesso_gratuito','') <> 'true'
    RETURNING id, titulo`, [TID, RE_AGU])

console.log(`\n✅ Liberados agora (estavam sem acesso_gratuito): ${mudados.length}`)
for (const r of mudados) console.log(`   - "${r.titulo}"`)

// 3) Verificação final.
const { rows: fim } = await pool.query(
  `SELECT count(*) FILTER (WHERE (regras->>'acesso_gratuito')='true' AND titulo !~* $2) AS liberados,
          count(*) FILTER (WHERE titulo ~* $2) AS agu,
          count(*) FILTER (WHERE (regras->>'acesso_gratuito') IS DISTINCT FROM 'true' AND titulo !~* $2) AS falta
     FROM simulado_simulados WHERE tenant_id=$1 AND deletado=false AND owner_estudante_id IS NULL`, [TID, RE_AGU])
console.log(`\nVerificação → liberados(não-AGU): ${fim[0].liberados} | AGU (mantido): ${fim[0].agu} | não-liberados restantes: ${fim[0].falta}`)
await pool.end()
