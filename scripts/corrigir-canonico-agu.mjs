// Alinha TODO o conjunto AGU pela MARCA do template (imagem de fundo) + CONTEÚDO (questão-âncora).
// Canônico: caderno com marca "pré-edital" gera Alfa (Pré-Edital); caderno com marca "gratuito" gera PAR.
// Cada simulado/banco resolve para o caderno da sua marca. Resolve por âncora (robusto a nomes trocados).
// Backup + dry-run por padrão (--apply para aplicar).
import { readFileSync, writeFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const rest = (p, init) => fetch(`${URL}/rest/v1/${p}`, { headers: H, ...init })
const j = async (p) => (await rest(p)).json()
const APPLY = process.argv.includes('--apply')
const NOME_PRE = 'Pré-Edital AGU - Simulado 01', TIT_PRE = 'Simulado 01 - Pré-Edital AGU'
const NOME_GRAT = 'AGU - Simulado Gratuito 01', TIT_GRAT = 'AGU - Simulado Gratuito 01'

// 1) Bancos por conteúdo (questão-âncora)
const acha = async (t) => (await j(`simulado_questoes?enunciado=ilike.*${encodeURIComponent(t)}*&select=id&limit=1`))[0]?.id
const bancoDe = async (qid) => (await j(`simulado_questao_pasta?questao_id=eq.${qid}&select=pasta_id`))[0]?.pasta_id
const bancoAlfa = await bancoDe(await acha('Alfa Engenharia S.A., contratada reiteradamente'))
const bancoPar = await bancoDe(await acha('instaurou Processo Administrativo de Responsabiliza'))

// 2) Cadernos por MARCA (imagem de fundo no docsV2)
const cads = await j(`simulado_cadernos_designer?nome=ilike.*AGU*&select=id,nome,config`)
const marca = (c) => { const raw = JSON.stringify(c.config?.docsV2 || {}); if (/agu-simulado-gratuito-01-fundo/i.test(raw)) return 'grat'; if (/pre-edital-agu-simulado-01-fundo/i.test(raw)) return 'pre'; return '?' }
const cadPre = cads.find((c) => marca(c) === 'pre')   // caderno com marca Pré-Edital
const cadGrat = cads.find((c) => marca(c) === 'grat')  // caderno com marca Gratuito
if (!bancoAlfa || !bancoPar || !cadPre || !cadGrat) { console.log('✗ não resolvi âncoras', { bancoAlfa, bancoPar, cadPre: cadPre?.id, cadGrat: cadGrat?.id }); process.exit(1) }

// 3) Simulados por banco_base_id
const simDe = async (bid) => (await j(`simulado_simulados?deletado=eq.false&regras->>banco_base_id=eq.${bid}&select=id,titulo`))[0]
const simPre = await simDe(bancoAlfa)   // usa banco Alfa → Pré-Edital
const simGrat = await simDe(bancoPar)   // usa banco PAR → Gratuito

const backup = { cadPre: { id: cadPre.id, nome: cadPre.nome, bancoId: cadPre.config?.bancoId }, cadGrat: { id: cadGrat.id, nome: cadGrat.nome, bancoId: cadGrat.config?.bancoId }, bancoAlfa, bancoPar, simPre, simGrat }

const patchCad = async (cad, nome, bancoId) => {
  const config = { ...(cad.config ?? {}), bancoId }
  return rest(`simulado_cadernos_designer?id=eq.${cad.id}`, { method: 'PATCH', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify({ nome, config }) })
}
const patch = (tabela, id, body) => rest(`${tabela}?id=eq.${id}`, { method: 'PATCH', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify(body) })

console.log('=== PLANO (canônico por marca + conteúdo) ===')
console.log(`Caderno PRÉ-EDITAL (marca) ${cadPre.id.slice(0,8)}: nome→"${NOME_PRE}", config.bancoId→${bancoAlfa.slice(0,8)} (Alfa)`)
console.log(`Caderno GRATUITO  (marca) ${cadGrat.id.slice(0,8)}: nome→"${NOME_GRAT}", config.bancoId→${bancoPar.slice(0,8)} (PAR)`)
console.log(`Banco Alfa ${bancoAlfa.slice(0,8)}: nome→"${NOME_PRE}", caderno_id→${cadPre.id.slice(0,8)}`)
console.log(`Banco PAR  ${bancoPar.slice(0,8)}: nome→"${NOME_GRAT}", caderno_id→${cadGrat.id.slice(0,8)}`)
if (simPre) console.log(`Simulado ${simPre.id.slice(0,8)} (banco Alfa): titulo→"${TIT_PRE}"  [era "${simPre.titulo}"]`)
if (simGrat) console.log(`Simulado ${simGrat.id.slice(0,8)} (banco PAR): titulo→"${TIT_GRAT}"  [era "${simGrat.titulo}"]`)

if (!APPLY) { console.log('\n[DRY-RUN] rode com --apply para aplicar.'); process.exit(0) }
writeFileSync('scripts/_backup-canonico-agu.json', JSON.stringify(backup, null, 2))
console.log('\n✔ Backup em scripts/_backup-canonico-agu.json\n')
const log = async (label, r) => console.log(`  ${label} → ${(await r).status}`)
await log('cadPre', patchCad(cadPre, NOME_PRE, bancoAlfa))
await log('cadGrat', patchCad(cadGrat, NOME_GRAT, bancoPar))
await log('bancoAlfa', patch('simulado_pastas', bancoAlfa, { nome: NOME_PRE, caderno_id: cadPre.id }))
await log('bancoPar', patch('simulado_pastas', bancoPar, { nome: NOME_GRAT, caderno_id: cadGrat.id }))
if (simPre) await log('simPre', patch('simulado_simulados', simPre.id, { titulo: TIT_PRE }))
if (simGrat) await log('simGrat', patch('simulado_simulados', simGrat.id, { titulo: TIT_GRAT }))
console.log('\n✔ Concluído.')
