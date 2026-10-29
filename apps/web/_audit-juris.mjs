import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
const envTxt = fs.readFileSync('./.env.local', 'utf8')
const env = Object.fromEntries(envTxt.split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const svc = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const DES = process.argv[2] || 'e5ce59bc-710f-4e45-8b09-67a70a06b62a'
const TESE_PTS = 100

const diaBRT = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const hoje = diaBRT(Date.now()), ontem = diaBRT(Date.now() - 86400000)
function calcSeq(diasSet) {
  const dias = [...diasSet].sort()
  let run = 0, maior = 0, prev = ''
  for (const d of dias) { const consec = prev && (Date.parse(d + 'T00:00:00Z') - Date.parse(prev + 'T00:00:00Z') === 86400000); run = consec ? run + 1 : 1; maior = Math.max(maior, run); prev = d }
  const ultimo = dias[dias.length - 1]
  return { atual: (ultimo === hoje || ultimo === ontem) ? run : 0, maior, n: dias.length }
}

// 1) config
const { data: pasta } = await svc.from('simulado_pastas').select('nome, desafio_jogo').eq('id', DES).maybeSingle()
const dias = pasta.desafio_jogo?.dias || {}
const tesesPorDia = {}; for (const k of Object.keys(dias)) tesesPorDia[k] = Array.isArray(dias[k].teses) ? dias[k].teses.length : 0
const validKeys = new Set(Object.keys(dias))
const pontuaveis = Object.keys(dias).filter(k => tesesPorDia[k] > 0)
console.log(`### AUDITORIA JURIS — ${pasta.nome} (${DES.slice(0,8)}) | hoje=${hoje}`)
console.log(`dias config: ${Object.keys(dias).length} | pontuáveis(teses>0): ${pontuaveis.length} [${pontuaveis.join(',')}] | teses/dia:`, JSON.stringify(tesesPorDia))

// 2) progresso arcade (todos)
const prog = []
for (let from = 0; ; from += 1000) { const { data } = await svc.from('simulado_jurisprudencia_progresso').select('estudante_id, dom, best, recorde, atualizado_em').eq('desafio_id', DES).range(from, from + 999); if (!data?.length) break; prog.push(...data); if (data.length < 1000) break }

// 3) ledger juris → dias por aluno (com filtro anti-fabricado)
const diasLedger = new Map()
for (let from = 0; ; from += 1000) { const { data } = await svc.from('simulado_xp_eventos').select('estudante_id, meta, criado_em').eq('origem', 'jurisprudencia').filter('meta->>desafio', 'eq', DES).range(from, from + 999); if (!data?.length) break
  for (const r of data) { const dia = r.meta?.dia; if (!dia) continue; if (r.criado_em && dia !== diaBRT(r.criado_em)) continue; if (!diasLedger.has(r.estudante_id)) diasLedger.set(r.estudante_id, new Set()); diasLedger.get(r.estudante_id).add(dia) }
  if (data.length < 1000) break }
// fabricados (p/ contagem)
let fabricadosEv = 0, fabricadosAl = new Set()
for (let from = 0; ; from += 1000) { const { data } = await svc.from('simulado_xp_eventos').select('estudante_id, meta, criado_em').eq('origem', 'jurisprudencia').filter('meta->>desafio', 'eq', DES).range(from, from + 999); if (!data?.length) break
  for (const r of data) { const dia = r.meta?.dia; if (dia && r.criado_em && dia !== diaBRT(r.criado_em)) { fabricadosEv++; fabricadosAl.add(r.estudante_id) } }
  if (data.length < 1000) break }

// 4) overrides
const overrides = new Map()
try { const { data } = await svc.from('simulado_jurisprudencia_sequencia_ajuste').select('estudante_id, overrides').eq('desafio_id', DES); for (const r of (data||[])) overrides.set(r.estudante_id, r.overrides || {}) } catch {}

// 5) nomes
const estIds = prog.map(p => p.estudante_id)
const nomes = new Map()
for (let i = 0; i < estIds.length; i += 300) { const { data } = await svc.from('simulado_estudantes').select('id, nome, email').in('id', estIds.slice(i, i + 300)); for (const e of (data||[])) nomes.set(e.id, e) }

// ===== cálculo por aluno =====
const rows = []
for (const p of prog) {
  const dom = p.dom || {}, best = p.best || {}
  const domKeys = Object.keys(dom), bestKeys = Object.keys(best)
  const domPhantom = domKeys.filter(k => !validKeys.has(k))
  const bestPhantom = bestKeys.filter(k => !validKeys.has(k) && Number(best[k]) > 0)
  const overDom = pontuaveis.filter(k => Array.isArray(dom[k]) && dom[k].length > tesesPorDia[k])
  const aulas = pontuaveis.filter(k => Array.isArray(dom[k]) && dom[k].length >= tesesPorDia[k]).length
  const pontos = pontuaveis.reduce((a, k) => a + Math.max(0, Number(best[k]) || 0), 0)
  const dia15 = Number(best['15']) || 0
  // best irregular: score num dia pontuável acima do máximo plausível (teses*100 + folga de labirinto 3000)
  const bestAlto = pontuaveis.filter(k => (Number(best[k]) || 0) > tesesPorDia[k] * TESE_PTS + 3000)
  // streak
  let dset = diasLedger.get(p.estudante_id)
  const bk = !dset || dset.size === 0
  if (bk && p.atualizado_em) dset = new Set([diaBRT(p.atualizado_em)]) // backfill 1 dia
  dset = new Set(dset || [])
  const ov = overrides.get(p.estudante_id) || {}
  for (const [d, v] of Object.entries(ov)) { if (v) dset.add(d); else dset.delete(d) }
  const seq = calcSeq(dset)
  rows.push({ id: p.estudante_id, aulas, pontos, recorde: p.recorde || 0, streak: seq.atual, streakMaior: seq.maior, diasLedger: seq.n, backfill: bk,
    domPhantom, bestPhantom, overDom, dia15, bestAlto })
}

// ===== resumo =====
const N = rows.length
const nm = (id) => { const e = nomes.get(id); return e ? `${(e.nome||'?').slice(0,24)} <${e.email||''}>` : id.slice(0,8) }
console.log(`\n=== TOTAL de alunos com progresso: ${N} ===`)
const comAlgo = rows.filter(r => r.aulas>0 || r.pontos>0 || r.diasLedger>0)
console.log(`com qualquer atividade (aulas/pontos/dias): ${comAlgo.length} | zerados: ${N-comAlgo.length}`)

// streak vs aulas
const sMaior = rows.filter(r => r.streak > r.aulas), sMenor = rows.filter(r => r.streak < r.aulas), sIgual = rows.filter(r => r.streak === r.aulas)
console.log(`\n--- STREAK vs AULAS CONCLUÍDAS ---`)
console.log(`streak == aulas: ${sIgual.length} | streak > aulas: ${sMaior.length} | streak < aulas: ${sMenor.length}`)
console.log(`(streak>aulas = leu/marcou dias mas não dominou as teses; streak<aulas = dominou dias sem marcar leitura no ledger — ambos possíveis por design)`)

// ANOMALIAS DURAS
const aPhantomBest = rows.filter(r => r.bestPhantom.length)
const aPhantomDom = rows.filter(r => r.domPhantom.length)
const aOverDom = rows.filter(r => r.overDom.length)
const aDia15 = rows.filter(r => r.dia15 > 0)
const aPontosSemAula = rows.filter(r => r.pontos > 0 && r.aulas === 0)
const aAulaSemPontos = rows.filter(r => r.aulas > 0 && r.pontos === 0)
const aBestAlto = rows.filter(r => r.bestAlto.length)
const aRecordeForaPontos = rows.filter(r => r.recorde > 0 && r.recorde > r.pontos && (r.bestPhantom.length || r.dia15 > 0)) // recorde vindo de dia fantasma/15
console.log(`\n--- ANOMALIAS DURAS (potenciais bugs) ---`)
console.log(`best em DIA FANTASMA (fora da config): ${aPhantomBest.length} alunos`)
console.log(`dom em DIA FANTASMA: ${aPhantomDom.length} alunos`)
console.log(`dom SOBRE-dominado (mais teses que existem): ${aOverDom.length} alunos`)
console.log(`score no DIA 15 (selo, não pontuável): ${aDia15.length} alunos`)
console.log(`PONTOS mas 0 aulas dominadas: ${aPontosSemAula.length} alunos (jogo parcial, não dominou nenhum dia inteiro)`)
console.log(`AULAS dominadas mas 0 pontos (IMPOSSÍVEL normal): ${aAulaSemPontos.length} alunos`)
console.log(`best ACIMA do máximo plausível (>teses*100+3000): ${aBestAlto.length} alunos`)
console.log(`recorde inflado por dia fantasma/15: ${aRecordeForaPontos.length} alunos`)
console.log(`eventos de ledger FABRICADOS (meta.dia ≠ dia de criação): ${fabricadosEv} eventos em ${fabricadosAl.size} alunos (já filtrados do streak, mas existem no banco)`)

const lst = (arr, f, n=12) => arr.slice(0,n).map(f).forEach(s=>console.log('   ', s))
if (aAulaSemPontos.length) { console.log('\n>> AULAS sem PONTOS (verificar!):'); lst(aAulaSemPontos, r=>`${nm(r.id)} | aulas=${r.aulas} pontos=${r.pontos} recorde=${r.recorde}`) }
if (aOverDom.length) { console.log('\n>> SOBRE-dominados:'); lst(aOverDom, r=>`${nm(r.id)} | dias=${r.overDom.join(',')} (dom>teses)`) }
if (aPhantomBest.length) { console.log('\n>> best em DIA FANTASMA:'); lst(aPhantomBest, r=>`${nm(r.id)} | dias=${r.bestPhantom.join(',')} recorde=${r.recorde}`) }
if (aDia15.length) { console.log('\n>> score no DIA 15:'); lst(aDia15, r=>`${nm(r.id)} | best15=${r.dia15} recorde=${r.recorde} pontos=${r.pontos}`) }
if (aBestAlto.length) { console.log('\n>> best ALTO demais:'); lst(aBestAlto, r=>`${nm(r.id)} | dias=${r.bestAlto.map(k=>k+':'+ (r.id,'') ).join(',')}`) }

// top streak>aulas (o que o usuário notou)
console.log('\n--- TOP streak >> aulas (maior divergência) ---')
lst([...sMaior].sort((a,b)=>(b.streak-b.aulas)-(a.streak-a.aulas)), r=>`${nm(r.id)} | streak=${r.streak} (maior ${r.streakMaior}, diasLedger ${r.diasLedger}${r.backfill?' backfill':''}) aulas=${r.aulas} pontos=${r.pontos}`, 15)
console.log('\n--- TOP aulas >> streak ---')
lst([...sMenor].sort((a,b)=>(b.aulas-b.streak)-(a.aulas-a.streak)), r=>`${nm(r.id)} | aulas=${r.aulas} streak=${r.streak} diasLedger=${r.diasLedger} pontos=${r.pontos}`, 10)
