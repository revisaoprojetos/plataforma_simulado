// Diagnóstico: progresso (dom/best) + ledger de sequência no Desafio de Jurisprudência de um aluno.
// Uso: node scripts/_diag-juris-rapida.mjs [nome ou email]
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const f of ['.env.local', '../../.env', '.env']) {
  try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"|"$/g, '') } } catch {}
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const TZ = 'America/Sao_Paulo'
const diaDe = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }) : null)
const alvo = (process.argv.slice(2).join(' ') || 'Juliana').trim().toLowerCase()

// Acha o(s) desafio(s) de jurisprudência (simulado_pastas folder_area='jurisprudencia')
const { data: pastas } = await sb.from('simulado_pastas').select('id, tenant_id, nome, folder_area').eq('folder_area', 'jurisprudencia')
console.log('Desafios juris:', (pastas ?? []).map((p) => `${p.nome} [${p.id}]`).join(' | ') || '(nenhum)')

// Acha o aluno por nome OU email
const { data: ests } = await sb.from('simulado_estudantes').select('id, tenant_id, nome, email').or(`nome.ilike.%${alvo}%,email.ilike.%${alvo}%`).limit(10)
if (!ests?.length) { console.log('Aluno não encontrado para:', alvo); process.exit(0) }
for (const e of ests) {
  console.log(`\n=== ${e.nome} <${e.email}> [${e.id}] tenant=${e.tenant_id} ===`)
  for (const pasta of (pastas ?? []).filter((p) => p.tenant_id === e.tenant_id)) {
    const { data: prog } = await sb.from('simulado_jurisprudencia_progresso').select('dom, best, recorde, atualizado_em').eq('desafio_id', pasta.id).eq('estudante_id', e.id).maybeSingle()
    if (prog) {
      const dom = prog.dom || {}, best = prog.best || {}
      console.log(`  [${pasta.nome}] recorde=${prog.recorde} atualizado=${diaDe(prog.atualizado_em)}`)
      console.log('    dom  =', JSON.stringify(Object.fromEntries(Object.entries(dom).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]))))
      console.log('    best =', JSON.stringify(best))
    } else {
      console.log(`  [${pasta.nome}] sem progresso`)
    }
    // Ledger da sequência (origem=jurisprudencia)
    const { data: evs } = await sb.from('simulado_xp_eventos').select('ref_id, xp, meta, criado_em').eq('tenant_id', e.tenant_id).eq('estudante_id', e.id).eq('origem', 'jurisprudencia').eq('meta->>desafio', pasta.id).order('criado_em')
    if (evs?.length) {
      console.log('    ledger:')
      for (const ev of evs) {
        const metaDia = ev.meta?.dia, criaDia = diaDe(ev.criado_em)
        const flag = metaDia !== criaDia ? '  ⚠️ FABRICADO (meta.dia != dia criação)' : ''
        console.log(`      ref=${ev.ref_id} xp=${ev.xp} meta.dia=${metaDia} criado=${criaDia}${flag}`)
      }
    } else console.log('    ledger: (vazio)')
    // Leitura rápida concluída?
    const { data: rap } = await sb.from('simulado_leitura_rapida_progresso').select('documento_id, respondidas, total, acertos, concluido_em').eq('estudante_id', e.id)
    if (rap?.length) { console.log('    leitura rápida:'); for (const r of rap) console.log(`      doc=${r.documento_id} ${r.respondidas}/${r.total} acertos=${r.acertos} concluido=${diaDe(r.concluido_em)}`) }
  }
}
process.exit(0)
