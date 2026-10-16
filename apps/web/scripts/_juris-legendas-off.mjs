// Desativa TODAS as legendas + o "Grifo do Revisão" em TODAS as aulas (documentos) de Jurisprudência.
// Juris = simulado_pastas.folder_area='jurisprudencia'; os dias ficam em desafio_jogo.dias[chave].documento_id.
// Grava quiz_config.legendasOff = [todas] e quiz_config.grifoRevisaoOff = true em cada documento.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const f of ['.env.local', '../../.env', '.env']) {
  try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"|"$/g, '') } } catch {}
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const TODAS = ['nucleo', 'complemento', 'prazo', 'crucial', 'excecao', 'stf', 'stj', 'equipe']
const DRY = process.argv.includes('--dry')

const { data: pastas, error: ep } = await sb.from('simulado_pastas').select('id, tenant_id, nome, desafio_jogo').eq('folder_area', 'jurisprudencia')
if (ep) { console.error(ep); process.exit(1) }
console.log(`Desafios de jurisprudência: ${pastas?.length ?? 0}`)

// Coleta os documento_id de todos os dias de todos os desafios.
const docs = new Map() // documentoId -> tenantId
for (const p of pastas ?? []) {
  const dias = (p.desafio_jogo && typeof p.desafio_jogo === 'object' ? p.desafio_jogo.dias : null) || {}
  const ids = Object.values(dias).map((d) => d && d.documento_id).filter(Boolean)
  console.log(`  [${p.nome}] ${ids.length} dia(s) com documento`)
  for (const id of ids) docs.set(id, p.tenant_id)
}
console.log(`Documentos de leitura (aulas) a atualizar: ${docs.size}`)
if (!docs.size) { console.log('Nada a fazer.'); process.exit(0) }

let ok = 0, falhas = 0
for (const [docId, tenantId] of docs) {
  const { data: d } = await sb.from('simulado_documentos').select('titulo, quiz_config').eq('id', docId).eq('tenant_id', tenantId).maybeSingle()
  if (!d) { console.log(`  ! doc ${docId} não encontrado`); falhas++; continue }
  const merged = { ...((d.quiz_config && typeof d.quiz_config === 'object') ? d.quiz_config : {}), legendasOff: TODAS, grifoRevisaoOff: true }
  if (DRY) { console.log(`  (dry) ${d.titulo || docId} → tudo OFF`); ok++; continue }
  const { error } = await sb.from('simulado_documentos').update({ quiz_config: merged, atualizado_em: new Date().toISOString() }).eq('id', docId).eq('tenant_id', tenantId)
  if (error) { console.log(`  ! erro ${docId}: ${error.message}`); falhas++ } else { console.log(`  ✓ ${d.titulo || docId}`); ok++ }
}
console.log(`\nConcluído: ${ok} atualizado(s), ${falhas} falha(s)${DRY ? ' (DRY-RUN)' : ''}`)
process.exit(0)
