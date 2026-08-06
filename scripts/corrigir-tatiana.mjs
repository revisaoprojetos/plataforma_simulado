import { readFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const APLICAR = process.argv.includes('--aplicar')
const rest = (p, opt) => fetch(`${URL}/rest/v1/${p}`, { headers: H, ...opt })
const j = async (p, opt) => (await rest(p, opt)).json()

const SESS = 'a335d883-25f3-486c-bebc-73b837e7cfa6'
const SIM = '225f56c9-b984-4be2-a286-452890839cc2'
const TOTAL_Q = 10
// Q7=Errado(B), Q8=Certo(A), Q9=Errado(B) — corretas do simulado
const NOVAS = [
  { questao_id: '49df5c77-d9ce-45d7-b37b-30b20a297fa5', alternativa_id: '9bba982c-278a-403d-92ad-a9dfca57f48c', letra: 'B' },
  { questao_id: 'f76701b0-183e-48e0-a3d5-16eadb44d34d', alternativa_id: '17b8881c-0808-4972-a25f-e638d46ce97e', letra: 'A' },
  { questao_id: '9516923b-6ce4-4dea-91cf-2a9a3ac7bddd', alternativa_id: '528fe5ab-6cb9-4d6d-821f-e8d79b9da9e2', letra: 'B' },
]

console.log(`=== ${APLICAR ? 'APLICANDO' : 'DRY-RUN (nada gravado)'} ===`)
const tenant = (await j(`simulado_respostas_objetivas?sessao_id=eq.${SESS}&limit=1&select=tenant_id`))[0]?.tenant_id
console.log('tenant:', tenant)

const jaTem = await j(`simulado_respostas_objetivas?sessao_id=eq.${SESS}&questao_id=in.(${NOVAS.map(n => n.questao_id).join(',')})&select=questao_id`)
console.log('já existentes dessas 3:', jaTem.length, '(esperado 0)')

const rows = NOVAS.map(n => ({
  tenant_id: tenant, sessao_id: SESS, questao_id: n.questao_id, alternativa_id: n.alternativa_id,
  correta: true, pontuacao: 1,
  snapshot_gabarito: { letra: n.letra, correta: true, alternativa_id: n.alternativa_id },
}))
console.log('\nvai inserir:')
for (const r of rows) console.log('  Q', r.questao_id.slice(0, 8), '→ alt', r.snapshot_gabarito.letra, '(correta, 1 ponto)')

if (APLICAR) {
  const r = await rest(`simulado_respostas_objetivas?on_conflict=sessao_id,questao_id`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows),
  })
  if (!r.ok) { console.log('ERRO insert', r.status, (await r.text()).slice(0, 300)); process.exit(1) }
  console.log('respostas inseridas.')
}

// Recalcula a nota da sessão = corretas / total * 100
const resp = await j(`simulado_respostas_objetivas?sessao_id=eq.${SESS}&select=correta`)
const corretas = resp.filter(x => x.correta).length + (APLICAR ? 0 : NOVAS.length) // no dry-run soma as 3 futuras
const nota = Math.round((corretas / TOTAL_Q) * 100 * 100) / 100
console.log(`\ncorretas=${corretas}/${TOTAL_Q} → nota = ${nota} (antes: 60)`)

if (APLICAR) {
  const u = await rest(`simulado_sessoes_prova?id=eq.${SESS}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ nota }) })
  if (!u.ok) { console.log('ERRO nota', u.status, (await u.text()).slice(0, 200)); process.exit(1) }
  console.log('nota da sessão atualizada.')

  // Re-rank (replica lib/ranking.ts): dedup por aluno conforme política, ordena, grava posicao_ranking.
  const sim = (await j(`simulado_simulados?id=eq.${SIM}&select=regras`))[0]
  const politica = sim?.regras?.politica_nota ?? 'ultima'
  const ss = await j(`simulado_sessoes_prova?simulado_id=eq.${SIM}&is_teste=eq.false&status=eq.finalizada&deletado=eq.false&select=id,estudante_id,nota,finalizado_em`)
  const porAluno = new Map()
  for (const s of ss) { const c = porAluno.get(s.estudante_id) ?? { ids: [], notas: [], datas: [] }; c.ids.push(s.id); c.notas.push(Number(s.nota ?? 0)); c.datas.push(s.finalizado_em ?? new Date(0).toISOString()); porAluno.set(s.estudante_id, c) }
  const nPol = (notas, datas) => { if (politica === 'melhor') return Math.max(...notas); if (politica === 'media') return notas.reduce((a, b) => a + b, 0) / notas.length; let i = 0; for (let k = 1; k < datas.length; k++) if (new Date(datas[k]) > new Date(datas[i])) i = k; return notas[i] }
  const alunos = [...porAluno.entries()].map(([id, v]) => ({ id, ids: v.ids, oficial: nPol(v.notas, v.datas), ultima: v.datas.reduce((m, d) => (new Date(d) > new Date(m) ? d : m), v.datas[0]) }))
  alunos.sort((a, b) => (b.oficial - a.oficial) || (new Date(a.ultima) - new Date(b.ultima)))
  for (let i = 0; i < alunos.length; i++) {
    await rest(`simulado_sessoes_prova?id=in.(${alunos[i].ids.join(',')})`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ posicao_ranking: i + 1 }) })
  }
  const pos = alunos.findIndex(a => a.ids.includes(SESS)) + 1
  console.log(`ranking recalculado (${alunos.length} alunos). Nova posição da Tatiana: ${pos}º`)
}
console.log('\n=== FIM ===')
