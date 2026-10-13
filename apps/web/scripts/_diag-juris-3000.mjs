// Lista TODOS os alunos com progresso no juris: dom/best + se tem leitura rápida concluída + ledger.
// Objetivo: achar quem tem best=3000 SEM ter jogado o labirinto (só leitura rápida).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const f of ['.env.local']) { try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"|"$/g, '') } } catch {} }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const TZ = 'America/Sao_Paulo'
const diaDe = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }) : null)

const DESAFIO = 'e5ce59bc-710f-4e45-8b09-67a70a06b62a' // Jurisprudência - JurisClub
const TENANT = '02195fa6-3db8-49d0-8c07-d21328a26a13'

const { data: progs } = await sb.from('simulado_jurisprudencia_progresso').select('estudante_id, dom, best, recorde, atualizado_em').eq('desafio_id', DESAFIO)
console.log('Total com progresso:', progs?.length ?? 0)
const ids = (progs ?? []).map((p) => p.estudante_id)
const { data: ests } = await sb.from('simulado_estudantes').select('id, nome, email').in('id', ids)
const nomeDe = new Map((ests ?? []).map((e) => [e.id, `${e.nome} <${e.email}>`]))

for (const p of (progs ?? []).sort((a, b) => (b.recorde || 0) - (a.recorde || 0)).slice(0, 25)) {
  const dom = p.dom || {}, best = p.best || {}
  const domResumo = Object.fromEntries(Object.entries(dom).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]))
  // Quantos eventos de ledger (dias) e quantos são "hoje" legítimo
  const { data: evs } = await sb.from('simulado_xp_eventos').select('meta, criado_em').eq('tenant_id', TENANT).eq('estudante_id', p.estudante_id).eq('origem', 'jurisprudencia').eq('meta->>desafio', DESAFIO)
  const diasLedger = (evs ?? []).map((e) => e.meta?.dia).filter(Boolean)
  const fabricados = (evs ?? []).filter((e) => e.meta?.dia && e.criado_em && e.meta.dia !== diaDe(e.criado_em)).length
  console.log(`\n${nomeDe.get(p.estudante_id) || p.estudante_id}`)
  console.log(`  recorde=${p.recorde} best=${JSON.stringify(best)} dom=${JSON.stringify(domResumo)}`)
  console.log(`  ledger dias=${JSON.stringify(diasLedger)} fabricados=${fabricados}`)
}
process.exit(0)
