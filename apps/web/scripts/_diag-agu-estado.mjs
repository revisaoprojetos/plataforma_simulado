// SOMENTE LEITURA — estado do diagnóstico/entrega do simulado "Concurso Simulado AGU".
// Descobre: o simulado, seu banco (pasta), caderno_entrega, cadernos de teste ligados e se há
// item 'diagnostico' salvo (com conteúdo). Não altera nada.
import { readFileSync } from 'node:fs'
import pg from 'pg'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'

const q = (t, p) => pool.query(t, p).then((r) => r.rows)

try {
  // 1. simulados com "AGU" no título
  const sims = await q(
    `SELECT id, titulo, status, pasta_id, created_at FROM simulado_simulados
      WHERE tenant_id = $1 AND titulo ILIKE '%AGU%' ORDER BY created_at ASC`, [TID])
  console.log('=== SIMULADOS "AGU" ===')
  for (const s of sims) console.log(`  ${s.id} | ${s.titulo} | status=${s.status} | pasta_id=${s.pasta_id} | ${s.created_at?.toISOString?.() ?? s.created_at}`)

  for (const s of sims) {
    if (!/concurso simulado agu/i.test(s.titulo)) continue
    console.log(`\n=== FOCO: ${s.titulo} (${s.id}) ===`)
    // banco (pasta) do simulado
    const bancoId = s.pasta_id
    if (!bancoId) { console.log('  (sem pasta_id)'); continue }
    const pasta = await q(`SELECT id, nome, caderno_entrega, ordem_questoes FROM simulado_pastas WHERE id = $1 AND tenant_id = $2`, [bancoId, TID])
    const p = pasta[0]
    console.log(`  banco/pasta: ${p?.id} | ${p?.nome}`)
    console.log(`  caderno_entrega: ${JSON.stringify(p?.caderno_entrega) ?? 'null'}`)
    // nº de questões vinculadas ao banco
    const vinc = await q(`SELECT count(*)::int n FROM simulado_questao_pasta WHERE pasta_id = $1 AND tenant_id = $2`, [bancoId, TID])
    console.log(`  questões no banco: ${vinc[0]?.n}`)
    // cadernos de teste ligados a esse banco
    const cads = await q(
      `SELECT id, nome, atualizado_em, (config->'builderV3') IS NOT NULL AS tem_builder,
              jsonb_array_length(COALESCE(config->'builderV3'->'itens','[]'::jsonb)) AS n_itens
         FROM simulado_cadernos_teste
        WHERE tenant_id = $1 AND deletado = false AND (config->'builderV3'->>'bancoId') = $2`, [TID, bancoId])
    console.log(`  cadernos_teste ligados: ${cads.length}`)
    for (const c of cads) {
      console.log(`    - ${c.id} | ${c.nome} | itens=${c.n_itens}`)
      const itens = await q(`SELECT config->'builderV3'->'itens' itens FROM simulado_cadernos_teste WHERE id = $1`, [c.id])
      for (const it of (itens[0]?.itens ?? [])) {
        const temConteudo = it.conteudo && Object.keys(it.conteudo).length > 0
        console.log(`        item ${it.id} | modalidade=${it.modalidade} | modelo=${it.modelo} | conteudo=${temConteudo ? 'SIM('+ (it.conteudo.subtitulo||'') +')' : 'não'}`)
      }
    }
  }

  // 3. QUALQUER caderno de teste com item diagnostico no tenant (modelo salvo em outro banco?)
  console.log('\n=== TODOS cadernos_teste do tenant com item DIAGNOSTICO ===')
  const todos = await q(
    `SELECT id, nome, config->'builderV3'->>'bancoId' AS banco
       FROM simulado_cadernos_teste
      WHERE tenant_id = $1 AND deletado = false
        AND config->'builderV3'->'itens' @> '[{"modalidade":"diagnostico"}]'`, [TID])
  console.log(`  encontrados: ${todos.length}`)
  for (const t of todos) console.log(`    - ${t.id} | ${t.nome} | banco=${t.banco}`)

  // 4. caderno_entrega de QUALQUER pasta com diagnostico preenchido
  console.log('\n=== PASTAS com caderno_entrega.diagnostico ===')
  const comDiag = await q(
    `SELECT id, nome, caderno_entrega FROM simulado_pastas
      WHERE tenant_id = $1 AND caderno_entrega ? 'diagnostico' AND caderno_entrega->'diagnostico' IS NOT NULL
        AND caderno_entrega->>'diagnostico' <> 'null'`, [TID])
  console.log(`  encontradas: ${comDiag.length}`)
  for (const c of comDiag) console.log(`    - ${c.id} | ${c.nome} | ${JSON.stringify(c.caderno_entrega.diagnostico)}`)
} catch (e) {
  console.error('ERRO:', e.message)
} finally {
  await pool.end()
}
