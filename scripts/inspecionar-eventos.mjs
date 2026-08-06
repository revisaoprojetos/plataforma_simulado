import { readFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }
const j = async (p) => (await fetch(`${URL}/rest/v1/${p}`, { headers: H }).then(r => r.json()))

// 1) Estrutura: pega 1 evento qualquer p/ ver TODAS as colunas
const amostra = await j(`simulado_sessao_eventos?select=*&limit=3`)
console.log('=== COLUNAS de simulado_sessao_eventos (amostra) ===')
console.log(JSON.stringify(amostra, null, 2))

// 2) Existe ALGUM evento tipo "respondeu" no sistema inteiro? (com payload da alternativa?)
const tipos = await j(`simulado_sessao_eventos?select=tipo`)
if (Array.isArray(tipos)) {
  const cont = tipos.reduce((m, e) => (m[e.tipo] = (m[e.tipo]||0)+1, m), {})
  console.log('\n=== CONTAGEM por tipo de evento (todo o sistema) ===')
  console.log(cont)
}

// 3) Todos os eventos das 5 sessões suspeitas
const SESS = {
  'Mariana/Admin': null, // vou buscar pela sessão
}
const casos = [
  ['Mariana - Administrativo', '20/07/2026 - Direito Administrativo', '689e6f7a-814b-47f0-8ef2-e4eea05968e5'],
  ['Magda - Previdenciário', '25/07/2026 - Direito Previdenciário Público', '07b029b3-85b9-4a08-b7f3-5d935a8883c9'],
]
for (const [nome, simTit, est] of casos) {
  const sim = (await j(`simulado_simulados?titulo=eq.${encodeURIComponent(simTit)}&select=id`))[0]
  const s = (await j(`simulado_sessoes_prova?simulado_id=eq.${sim.id}&estudante_id=eq.${est}&status=eq.finalizada&select=id&order=finalizado_em.desc`))[0]
  const ev = await j(`simulado_sessao_eventos?sessao_id=eq.${s.id}&select=*&order=criado_em`)
  console.log(`\n=== EVENTOS de ${nome} (sessão ${s.id}) ===`)
  console.log(JSON.stringify(ev, null, 2))
}
