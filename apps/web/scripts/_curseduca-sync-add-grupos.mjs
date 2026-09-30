// Adiciona à sync Curseduca (simulado_curseduca_sync, 1 linha ativa) os grupos escolhidos:
// Simulado & Atualização (4) + Sprint Final (51) + Pré-Edital (10) + Passaporte (12) + Amostra (8) = 85.
// destino={"tipo":"nenhum"} e sincronizar=false → só cria/atualiza estudantes, NÃO vincula grupo nem remove.
// Uso:
//   node scripts/_curseduca-sync-add-grupos.mjs            → DRY-RUN (backup + mostra o plano)
//   node scripts/_curseduca-sync-add-grupos.mjs --aplicar  → grava (union dos atuais + novos)
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'
const APLICAR = process.argv.includes('--aplicar')
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'

// IDs escolhidos (verificados com o usuário nas tabelas por subtipo).
const SIMULADO = [244, 271, 258, 147]
const SPRINT_FINAL = [212, 179, 94, 34, 142, 207, 102, 54, 140, 272, 202, 208, 210, 237, 107, 111, 304, 279, 75, 251, 233, 225, 158, 234, 141, 174, 138, 136, 219, 45, 130, 281, 243, 221, 46, 154, 299, 246, 236, 63, 59, 186, 255, 187, 298, 155, 242, 294, 312, 245, 201]
const PRE_EDITAL = [104, 132, 56, 284, 198, 112, 180, 173, 266, 133]
const PASSAPORTE = [42, 38, 39, 41, 43, 44, 40, 290, 297, 287, 115, 300]
const AMOSTRA = [99, 283, 263, 226, 106, 222, 220, 160]
const NOVOS = [...new Set([...SIMULADO, ...SPRINT_FINAL, ...PRE_EDITAL, ...PASSAPORTE, ...AMOSTRA])]

const { rows } = await pool.query(`SELECT id, grupos FROM simulado_curseduca_sync WHERE tenant_id=$1 AND ativo=true`, [TID])
if (rows.length !== 1) { console.log('⚠️ Esperava 1 linha ativa, achei', rows.length, '- abortando.'); await pool.end(); process.exit(1) }
const rule = rows[0]
const atuais = (rule.grupos ?? []).map(Number)
const jaTinha = NOVOS.filter((g) => atuais.includes(g))
const paraAdd = NOVOS.filter((g) => !atuais.includes(g))
const final = [...new Set([...atuais, ...NOVOS])].sort((a, b) => a - b)

// Backup do estado atual (sempre).
const stamp = new Date().toISOString().slice(0, 10)
const fBk = `scripts/_backup-curseduca-sync-${stamp}.json`
writeFileSync(fBk, JSON.stringify({ ruleId: rule.id, tenantId: TID, grupos_antes: atuais }, null, 2), 'utf8')

console.log(`Escolhidos: ${NOVOS.length} grupos (Simulado ${SIMULADO.length} + SprintFinal ${SPRINT_FINAL.length} + PreEdital ${PRE_EDITAL.length} + Passaporte ${PASSAPORTE.length} + Amostra ${AMOSTRA.length})`)
console.log(`Já estavam na sync: ${jaTinha.length}${jaTinha.length ? ' -> ' + jaTinha.join(',') : ''}`)
console.log(`A ADICIONAR: ${paraAdd.length}`)
console.log(`Grupos: ${atuais.length} (antes) -> ${final.length} (depois)`)
console.log(`Backup: ${fBk}`)

if (!APLICAR) { console.log('\nDRY-RUN (nada gravado). Rode com --aplicar para gravar.'); await pool.end(); process.exit(0) }

await pool.query(`UPDATE simulado_curseduca_sync SET grupos=$1, updated_at=now() WHERE id=$2`, [final, rule.id])
console.log(`\n✅ APLICADO. grupos agora = ${final.length}.`)
await pool.end()
