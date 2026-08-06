// Diagnóstico do SUBLINHADO no Simulado PGE/RS: confere o que está salvo (enunciado +
// alternativas) e como o marcador de sublinhado aparece. Uso: node scripts/diag-sublinhado-pge.mjs
import { readFileSync } from 'node:fs'

const SIM = 'e17cae0a-db46-4563-b2ad-dcc16c8ec367' // Simulado Pré Edital - PGE/RS
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }
const rest = (p) => fetch(`${URL}/rest/v1/${p}`, { headers: H }).then((r) => r.json())

const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
const contarPares = (s) => (s.match(/__/g) || []).length     // nº de marcadores __
const temSublinhado = (s) => /__[\s\S]+?__/.test(s || '')

;(async () => {
  // 1) título do simulado + questões vinculadas
  const sim = await rest(`simulado_simulados?id=eq.${SIM}&select=id,titulo,tenant_id`)
  console.log('Simulado:', sim?.[0]?.titulo, '| tenant:', sim?.[0]?.tenant_id)

  const vinc = await rest(`simulado_prova_questoes?simulado_id=eq.${SIM}&select=questao_id,ordem&order=ordem`)
  const qids = [...new Set((vinc || []).map((v) => v.questao_id))]
  console.log('Questões vinculadas:', qids.length)

  // 2) enunciados
  let questoes = []
  for (const g of chunk(qids, 80)) {
    questoes = questoes.concat(await rest(`simulado_questoes?id=in.(${g.join(',')})&select=id,numero,enunciado`))
  }
  // 3) alternativas
  let alts = []
  for (const g of chunk(qids, 80)) {
    alts = alts.concat(await rest(`simulado_alternativas?questao_id=in.(${g.join(',')})&select=questao_id,texto,ordem&order=ordem`))
  }
  console.log('Alternativas:', alts.length)

  // 4) contagem de sublinhado
  const enunSub = questoes.filter((q) => temSublinhado(q.enunciado))
  const altSub = alts.filter((a) => temSublinhado(a.texto))
  console.log('\n== SUBLINHADO (__ ... __) ==')
  console.log('Enunciados com sublinhado:', enunSub.length, '/', questoes.length)
  console.log('Alternativas com sublinhado:', altSub.length, '/', alts.length)

  // 5) marcadores ÍMPARES (não fecham) — renderizariam quebrados
  const imparEnun = questoes.filter((q) => contarPares(q.enunciado || '') % 2 !== 0)
  const imparAlt = alts.filter((a) => contarPares(a.texto || '') % 2 !== 0)
  console.log('\n== MARCADORES __ ÍMPARES (quebrados) ==')
  console.log('Enunciados com __ ímpar:', imparEnun.length)
  console.log('Alternativas com __ ímpar:', imparAlt.length)
  imparEnun.slice(0, 5).forEach((q) => console.log('  ! enun q', q.numero, ':', (q.enunciado || '').slice(0, 120)))
  imparAlt.slice(0, 5).forEach((a) => console.log('  ! alt', a.questao_id.slice(0, 8), ':', (a.texto || '').slice(0, 120)))

  // 6) amostras
  console.log('\n== AMOSTRAS (alternativas com sublinhado) ==')
  altSub.slice(0, 8).forEach((a) => console.log('  •', (a.texto || '').replace(/\n/g, ' ').slice(0, 160)))
  console.log('\n== AMOSTRAS (enunciados com sublinhado) ==')
  enunSub.slice(0, 4).forEach((q) => console.log('  • q' + q.numero + ':', (q.enunciado || '').replace(/\n/g, ' ').slice(0, 200)))

  // 7) outros marcadores (por via das dúvidas): <u>, text-decoration
  const htmlU = [...questoes.map(q=>q.enunciado), ...alts.map(a=>a.texto)].filter((t) => /<u>|text-decoration|underline/i.test(t || ''))
  console.log('\n== Marcadores HTML de underline (<u>/text-decoration):', htmlU.length, '==')
  htmlU.slice(0, 4).forEach((t) => console.log('  •', (t || '').slice(0, 140)))
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1) })
