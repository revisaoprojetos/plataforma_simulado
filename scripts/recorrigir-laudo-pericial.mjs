// Re-correção da questão "laudo pericial" (simulado 24/07/2026 - Direito do Trabalho).
// O gabarito JÁ foi trocado no editor (agora A="Certo" é a correta), mas as respostas e as
// notas não foram reprocessadas. Este script reprocessa: respostas.correta -> nota -> ranking
// -> impactos (antes/depois) -> limpa cache de relatórios. Reproduz EXATAMENTE a regra de
// lib/simulado/nota.ts (calcularNota) e lib/ranking.ts (rankearSimulado).
//
//   DRY-RUN (nada gravado):  node scripts/recorrigir-laudo-pericial.mjs --politica=estrito
//   APLICAR:                 node scripts/recorrigir-laudo-pericial.mjs --politica=estrito --aplicar
//   Política 'lenhante' = padrão da plataforma (ninguém perde ponto: credita A e a antiga correta).
import { readFileSync, writeFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim().replace(/^"|"$/g, '')
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const APLICAR = process.argv.includes('--aplicar')
const POL = (process.argv.find(a => a.startsWith('--politica='))?.split('=')[1]) || 'estrito' // estrito | lenhante
const rest = (p, opt) => fetch(`${URL}/rest/v1/${p}`, { headers: H, ...opt })
const j = async (p, opt) => { const r = await rest(p, opt); if (!r.ok) { console.log('ERR', p.slice(0, 70), r.status, (await r.text()).slice(0, 160)); process.exit(1) } return r.json() }
const patch = async (p, body) => { const r = await rest(p, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body) }); if (!r.ok) { console.log('ERR PATCH', p.slice(0, 70), r.status, (await r.text()).slice(0, 160)); process.exit(1) } }

const SIM = '8a0bdf49-e7c9-4286-9fce-f87431eff869'
const QUESTAO = '8d41490a-9fae-4d23-b0c2-db66c0bf6516'
const A_CERTO = '0ee23fab' // prefixo; resolvo o id completo abaixo
console.log(`=== ${APLICAR ? 'APLICANDO' : 'DRY-RUN (nada gravado)'} | política=${POL} ===\n`)

// ---- Estado atual ----
const sim = (await j(`simulado_simulados?id=eq.${SIM}&select=id,titulo,tenant_id,regras`))[0]
const TENANT = sim.tenant_id
const politicaNota = sim?.regras?.politica_nota ?? 'ultima'
const alts = await j(`simulado_alternativas?questao_id=eq.${QUESTAO}&select=id,texto,correta,ordem&order=ordem.asc`)
const correta = alts.find(a => a.correta)
const antigaCorreta = alts.find(a => !a.correta) // C/E: a outra alternativa era a correta antiga
if (!correta) { console.log('!! nenhuma alternativa marcada como correta — abortar'); process.exit(1) }
console.log('simulado:', sim.titulo)
console.log('correta ATUAL no gabarito:', correta.texto, correta.id)
console.log('antiga correta (a ser tratada pela política):', antigaCorreta?.texto, antigaCorreta?.id)

// Sessões finalizadas reais + respostas desta questão
const sess = await j(`simulado_sessoes_prova?simulado_id=eq.${SIM}&is_teste=eq.false&status=eq.finalizada&deletado=eq.false&select=id,estudante_id,nota,posicao_ranking,finalizado_em&limit=100000`)
const sessSet = new Set(sess.map(s => s.id))
const resp = await j(`simulado_respostas_objetivas?questao_id=eq.${QUESTAO}&select=id,sessao_id,alternativa_id,correta&limit=100000`)
const respV = resp.filter(r => sessSet.has(r.sessao_id))

// Conjunto de alternativas que DEVEM pontuar, conforme a política
const validos = new Set([correta.id])
if (POL === 'lenhante' && antigaCorreta) validos.add(antigaCorreta.id) // padrão plataforma: antiga correta mantém ponto
const vaiCerto = respV.filter(r => validos.has(r.alternativa_id))
const vaiErrado = respV.filter(r => !validos.has(r.alternativa_id))
console.log(`\nrespostas nesta questão (sessões válidas): ${respV.length}`)
console.log(`  -> ficarão CORRETAS: ${vaiCerto.length}`)
console.log(`  -> ficarão ERRADAS:  ${vaiErrado.length}`)
console.log(`  (já corretas hoje: ${respV.filter(r => r.correta).length})`)

// ---- Contexto de nota canônico (total de questões, anuladas c/ política) ----
const pq = await j(`simulado_prova_questoes?simulado_id=eq.${SIM}&select=questao_id,anulada&limit=100000`)
const recsSim = await j(`simulado_recorrecoes?simulado_id=eq.${SIM}&select=questao_id,tipo,politica&limit=100000`)
const politicaAnul = new Map()
for (const r of recsSim) if (r.tipo === 'anulacao') politicaAnul.set(r.questao_id, r.politica === 'desconsidera' ? 'desconsidera' : 'pontua_todos')
const anuladas = new Map()
for (const q of pq) if (q.anulada) anuladas.set(q.questao_id, politicaAnul.get(q.questao_id) ?? 'pontua_todos')
const totalQ = pq.length
let nPontuaTodos = 0, nDesconsidera = 0
for (const p of anuladas.values()) { if (p === 'desconsidera') nDesconsidera++; else nPontuaTodos++ }
const denom = totalQ - nDesconsidera
const calcNota = (respostas) => {
  const corretasValidas = respostas.filter(r => r.correta && !anuladas.has(r.questao_id)).length
  const acertos = corretasValidas + nPontuaTodos
  return denom > 0 ? Math.round((acertos / denom) * 100 * 100) / 100 : 0
}

// ---- Simula a nova nota de cada sessão (aplicando o flip só nesta questão) ----
const novoCorretaPorResp = new Map() // resp.id -> bool novo
for (const r of respV) novoCorretaPorResp.set(r.id, validos.has(r.alternativa_id))
// carrega TODAS as respostas das sessões afetadas p/ recomputar a nota inteira
const afetadasSess = [...new Set(respV.map(r => r.sessao_id))]
const antes = new Map(sess.map(s => [s.id, { nota: Number(s.nota ?? 0), ranking: s.posicao_ranking, est: s.estudante_id }]))
const notaNovaPorSess = new Map()
for (let i = 0; i < afetadasSess.length; i += 200) {
  const chunk = afetadasSess.slice(i, i + 200)
  const rs = await j(`simulado_respostas_objetivas?sessao_id=in.(${chunk.join(',')})&select=id,sessao_id,questao_id,correta&limit=100000`)
  const porSess = new Map()
  for (const r of rs) {
    const corrigida = novoCorretaPorResp.has(r.id) ? novoCorretaPorResp.get(r.id) : r.correta
    const arr = porSess.get(r.sessao_id) ?? []; arr.push({ questao_id: r.questao_id, correta: corrigida }); porSess.set(r.sessao_id, arr)
  }
  for (const [sid, arr] of porSess) notaNovaPorSess.set(sid, calcNota(arr))
}
// resumo das mudanças de nota
let sobem = 0, descem = 0, iguais = 0
for (const sid of afetadasSess) {
  const a = antes.get(sid)?.nota ?? 0, n = notaNovaPorSess.get(sid) ?? a
  if (n > a + 0.001) sobem++; else if (n < a - 0.001) descem++; else iguais++
}
console.log(`\n=== IMPACTO NAS NOTAS (sessões afetadas: ${afetadasSess.length}) ===`)
console.log(`  sobem: ${sobem} | descem: ${descem} | iguais: ${iguais}`)
// amostra
console.log('  amostra (até 6):')
for (const sid of afetadasSess.slice(0, 6)) console.log(`    sess ${sid.slice(0, 8)}: ${antes.get(sid)?.nota} -> ${notaNovaPorSess.get(sid)}`)

if (!APLICAR) { console.log('\n(DRY-RUN — nada foi gravado. Rode com --aplicar para efetivar.)'); process.exit(0) }

// ================= APLICAÇÃO =================
// Backup do estado ANTES (respostas desta questão + notas/ranking de todas as sessões)
const backup = { quando: new Date().toISOString(), politica: POL, simulado: SIM, questao: QUESTAO,
  respostasAntes: respV.map(r => ({ id: r.id, alternativa_id: r.alternativa_id, correta: r.correta })),
  sessoesAntes: sess.map(s => ({ id: s.id, nota: s.nota, posicao_ranking: s.posicao_ranking })) }
writeFileSync(`scripts/_backup-recorr-laudo-${POL}.json`, JSON.stringify(backup, null, 2))
console.log('\nbackup salvo em scripts/_backup-recorr-laudo-' + POL + '.json')

// 1) Atualiza respostas.correta + pontuacao (correta -> 1, errada -> 0). snapshot_gabarito NÃO muda.
const idsCerto = vaiCerto.map(r => r.id), idsErrado = vaiErrado.map(r => r.id)
if (idsCerto.length) await patch(`simulado_respostas_objetivas?id=in.(${idsCerto.join(',')})`, { correta: true, pontuacao: 1 })
if (idsErrado.length) await patch(`simulado_respostas_objetivas?id=in.(${idsErrado.join(',')})`, { correta: false, pontuacao: 0 })
console.log(`respostas atualizadas: ${idsCerto.length} corretas, ${idsErrado.length} erradas.`)

// 2) Registra o evento de re-correção (troca de gabarito B->A, política aplicada).
//    Best-effort: se a tabela de auditoria falhar, NÃO aborta o recálculo de notas/ranking.
let rec = { id: null }
try {
  const r = await rest(`simulado_recorrecoes`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify([{
    tenant_id: TENANT, simulado_id: SIM, questao_id: QUESTAO, tipo: 'troca_alternativa',
    motivo: `Correção do gabarito B->A (Certo). Política: ${POL === 'estrito' ? 'apenas a alternativa correta pontua' : 'ninguém perde ponto'}.`,
    politica: 'pontua_todos', executado_por: null, executado_em: new Date().toISOString(),
  }]) })
  if (r.ok) { rec = (await r.json())[0]; console.log('recorrecao registrada:', rec.id) }
  else console.log('WARN recorrecao não registrada (segue notas/ranking):', r.status, (await r.text()).slice(0, 120))
} catch (e) { console.log('WARN recorrecao exceção:', String(e).slice(0, 120)) }

// 3) Recalcula a nota de cada sessão afetada.
for (const sid of afetadasSess) await patch(`simulado_sessoes_prova?id=eq.${sid}`, { nota: notaNovaPorSess.get(sid) })
console.log(`notas recalculadas em ${afetadasSess.length} sessões.`)

// 4) Re-rank do simulado inteiro (dedup por aluno conforme política de nota) — replica lib/ranking.ts.
const ss = await j(`simulado_sessoes_prova?simulado_id=eq.${SIM}&is_teste=eq.false&status=eq.finalizada&deletado=eq.false&select=id,estudante_id,nota,finalizado_em&limit=100000`)
const porAluno = new Map()
for (const s of ss) { const c = porAluno.get(s.estudante_id) ?? { ids: [], notas: [], datas: [] }; c.ids.push(s.id); c.notas.push(Number(s.nota ?? 0)); c.datas.push(s.finalizado_em ?? new Date(0).toISOString()); porAluno.set(s.estudante_id, c) }
const nPol = (notas, datas) => { if (politicaNota === 'melhor') return Math.max(...notas); if (politicaNota === 'media') return notas.reduce((a, b) => a + b, 0) / notas.length; let i = 0; for (let k = 1; k < datas.length; k++) if (new Date(datas[k]) > new Date(datas[i])) i = k; return notas[i] }
const alunos = [...porAluno.entries()].map(([id, v]) => ({ id, ids: v.ids, oficial: Math.round(nPol(v.notas, v.datas) * 100) / 100, ultima: v.datas.reduce((m, d) => (new Date(d) > new Date(m) ? d : m), v.datas[0]) }))
alunos.sort((a, b) => (b.oficial - a.oficial) || (new Date(a.ultima) - new Date(b.ultima)))
const rankPorSess = new Map()
for (let i = 0; i < alunos.length; i++) { await patch(`simulado_sessoes_prova?id=in.(${alunos[i].ids.join(',')})`, { posicao_ranking: i + 1 }); for (const sid of alunos[i].ids) rankPorSess.set(sid, i + 1) }
console.log(`ranking recalculado (${alunos.length} alunos).`)

// 5) Impactos por aluno (antes x depois) — só não-neutros.
const impactos = []
for (const s of ss) {
  const a = antes.get(s.id) ?? { nota: 0, ranking: null, est: s.estudante_id }
  const notaDepois = Number(s.nota ?? 0) // já atualizado no passo 3 p/ afetadas; para não-afetadas, = antes
  const nd = notaNovaPorSess.has(s.id) ? notaNovaPorSess.get(s.id) : a.nota
  const delta = Math.round((nd - a.nota) * 100) / 100
  const classificacao = delta > 0.0001 ? 'beneficiado' : delta < -0.0001 ? 'prejudicado' : 'neutro'
  if (classificacao === 'neutro') continue
  impactos.push({ tenant_id: TENANT, recorrecao_id: rec.id, estudante_id: a.est, nota_antes: a.nota, nota_depois: nd, delta, ranking_antes: a.ranking, ranking_depois: rankPorSess.get(s.id) ?? null, classificacao })
}
if (impactos.length && rec.id) { const r = await rest(`simulado_recorrecao_impactos`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(impactos) }); if (!r.ok) console.log('WARN impactos', r.status, (await r.text()).slice(0, 160)) }
const benef = impactos.filter(i => i.classificacao === 'beneficiado').length, prej = impactos.filter(i => i.classificacao === 'prejudicado').length
console.log(`impactos registrados: ${benef} beneficiados, ${prej} prejudicados.`)

// 6) Limpa cache de relatórios do tenant (força recomputo nas telas).
await rest(`simulado_relatorio_cache?tenant_id=eq.${TENANT}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } }).catch(() => {})
console.log('cache de relatórios limpo.')
console.log('\n=== RE-CORREÇÃO CONCLUÍDA ===')
