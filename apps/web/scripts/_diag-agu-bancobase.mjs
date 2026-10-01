import { readFileSync } from 'node:fs'
import pg from 'pg'
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const SIM = '79813cd6-8d17-4671-b482-d70292678848'
const q = (t, p) => pool.query(t, p).then((r) => r.rows)
try {
  const sim = await q(`SELECT regras FROM simulado_simulados WHERE id = $1`, [SIM])
  const regras = sim[0]?.regras || {}
  console.log('regras.banco_base_id =', regras.banco_base_id ?? '(ausente)')
  console.log('regras (chaves):', Object.keys(regras).join(', '))

  // banco "Simulado AGU" 6c03f660: entrega + caderno AGU
  const BANCO = '6c03f660-a886-46c3-9c20-d377a73080ab'
  const b = await q(`SELECT id, nome, caderno_entrega FROM simulado_pastas WHERE id = $1`, [BANCO])
  console.log('\nBanco "Simulado AGU" 6c03f660:')
  console.log('  nome:', b[0]?.nome, '| caderno_entrega:', JSON.stringify(b[0]?.caderno_entrega))
  const nq = await q(`SELECT count(*)::int n FROM simulado_questao_pasta WHERE pasta_id=$1 AND tenant_id=$2`, [BANCO, TID])
  console.log('  questões vinculadas ao banco:', nq[0]?.n)

  // Caderno AGU (8eaf18c1) — modalidades/itens
  const CAD = '8eaf18c1-e844-4b45-be4a-78c8abd24c3e'
  const c = await q(`SELECT nome, config->'builderV3'->>'bancoId' banco, config->'builderV3'->'ativo' ativo, config->'builderV3'->'itens' itens FROM simulado_cadernos_teste WHERE id=$1`, [CAD])
  console.log('\nCaderno "Caderno AGU" 8eaf18c1:')
  console.log('  banco:', c[0]?.banco, '| ativo:', JSON.stringify(c[0]?.ativo))
  for (const it of (c[0]?.itens ?? [])) {
    console.log(`  item ${it.id} | modalidade=${it.modalidade} | modelo=${it.modelo} | conteudo=${it.conteudo && Object.keys(it.conteudo).length ? 'SIM' : 'não'} | subt=${it.conteudo?.subtitulo ?? ''}`)
  }

  // Também: a pasta "AGU" 563cd062 (que tem diagnostico) é usada por qual simulado?
  const P563 = '563cd062-29c6-477e-81aa-0fa2fb6d529e'
  const simsP = await q(`SELECT id, titulo, status FROM simulado_simulados WHERE pasta_id=$1 OR (regras->>'banco_base_id')=$1`, [P563])
  console.log('\nSimulados usando pasta/banco 563cd062 "AGU":', JSON.stringify(simsP))
  const nq563 = await q(`SELECT count(*)::int n FROM simulado_questao_pasta WHERE pasta_id=$1 AND tenant_id=$2`, [P563, TID])
  console.log('  questões vinculadas a 563cd062:', nq563[0]?.n)
} catch (e) { console.error('ERRO:', e.message) } finally { await pool.end() }
