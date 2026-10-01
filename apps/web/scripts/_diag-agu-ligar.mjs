// Liga o diagnóstico/entrega do "Concurso Simulado AGU" (modelo JÁ existe — só wiring de dados).
//  1) item diagnóstico do "Caderno AGU" → modelo agu_2023 + conteúdo DIAG_AGU_2023 (igual ao PDF do Victor)
//  2) caderno_entrega do banco "Simulado AGU" (6c03f660) → 4 itens do Caderno AGU
//  3) simulado.regras.banco_base_id → 6c03f660 (a tela de resultado do aluno lê daqui)
// Backup em scripts/_backup-diag-agu.json. DRY-RUN por padrão; use --apply para gravar.
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } })

const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const SIM = '79813cd6-8d17-4671-b482-d70292678848' // Concurso Simulado AGU
const BANCO = '6c03f660-a886-46c3-9c20-d377a73080ab' // pasta "Simulado AGU" (100 questões)
const CAD = '8eaf18c1-e844-4b45-be4a-78c8abd24c3e' // "Caderno AGU"
const ITEM_DIAG = 'ecos9z1u', ITEM_FOLHA = '23ob9743', ITEM_ENUN = 'jamsueu8', ITEM_GAB = 'pmrye61w'

const q = (t, p) => pool.query(t, p).then((r) => r.rows)

try {
  const { DIAG_AGU_2023 } = await import('./_tmp_diag/diagnostico.js')
  const conteudoAGU = { ...DIAG_AGU_2023, subtitulo: 'Concurso Simulado AGU' }

  // ── Backup ──
  const simRow = (await q(`SELECT regras FROM simulado_simulados WHERE id=$1`, [SIM]))[0]
  const pastaRow = (await q(`SELECT caderno_entrega FROM simulado_pastas WHERE id=$1`, [BANCO]))[0]
  const cadRow = (await q(`SELECT config FROM simulado_cadernos_teste WHERE id=$1`, [CAD]))[0]
  const backup = {
    quando: new Date().toISOString(),
    simulado: { id: SIM, regras: simRow?.regras },
    banco: { id: BANCO, caderno_entrega: pastaRow?.caderno_entrega },
    caderno: { id: CAD, config: cadRow?.config },
  }
  writeFileSync('scripts/_backup-diag-agu.json', JSON.stringify(backup, null, 2))
  console.log('✓ backup salvo em scripts/_backup-diag-agu.json')

  // ── 1) item diagnóstico → agu_2023 + conteúdo rico ──
  const config = cadRow.config
  const itens = config?.builderV3?.itens ?? []
  const idxDiag = itens.findIndex((it) => it.id === ITEM_DIAG)
  if (idxDiag < 0) throw new Error(`item diagnóstico ${ITEM_DIAG} não encontrado no caderno`)
  console.log(`  diag antes: modelo=${itens[idxDiag].modelo} conteudo.subtitulo=${itens[idxDiag].conteudo?.subtitulo ?? '—'}`)
  itens[idxDiag] = { ...itens[idxDiag], modelo: 'agu_2023', conteudo: conteudoAGU }
  console.log(`  diag depois: modelo=agu_2023 | pilares=${conteudoAGU.pilares.length} disciplinas=${conteudoAGU.disciplinas.length} gabaritoObs=${conteudoAGU.gabaritoObs.length}`)

  // ── 2) caderno_entrega do banco ──
  const entrega = {
    enunciado: { cadernoId: CAD, itemId: ITEM_ENUN },
    folha: { cadernoId: CAD, itemId: ITEM_FOLHA },
    diagnostico: { cadernoId: CAD, itemId: ITEM_DIAG },
    gabarito: { cadernoId: CAD, itemId: ITEM_GAB },
  }
  console.log('  caderno_entrega →', JSON.stringify(entrega))

  // ── 3) regras.banco_base_id ──
  const regras = { ...(simRow?.regras ?? {}), banco_base_id: BANCO }
  console.log(`  regras.banco_base_id: ${simRow?.regras?.banco_base_id ?? '(vazio)'} → ${BANCO}`)

  if (!APPLY) { console.log('\nDRY-RUN (nada gravado). Rode com --apply para gravar.'); await pool.end(); process.exit(0) }

  // ── Grava em transação ──
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`UPDATE simulado_cadernos_teste SET config=$1, atualizado_em=now() WHERE id=$2 AND tenant_id=$3`, [config, CAD, TID])
    await client.query(`UPDATE simulado_pastas SET caderno_entrega=$1 WHERE id=$2 AND tenant_id=$3`, [entrega, BANCO, TID])
    await client.query(`UPDATE simulado_simulados SET regras=$1, updated_at=now() WHERE id=$2 AND tenant_id=$3`, [regras, SIM, TID])
    await client.query('COMMIT')
    console.log('\n✓ GRAVADO (transação commitada).')
  } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
} catch (e) {
  console.error('ERRO:', e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
