// Inspeciona o HTML da leitura rápida de um documento: tamanho, se embute game/progresso/best/storageKey.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const f of ['.env.local']) { try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"|"$/g, '') } } catch {} }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const DOC = process.argv[2] || '98cd7303-3bb8-4d99-94f6-a3993238e665'
const { data } = await sb.from('simulado_documentos').select('id, titulo, quiz_config').eq('id', DOC).maybeSingle()
const html = String(data?.quiz_config?.leitura_rapida || '')
console.log('Doc:', data?.titulo, DOC)
console.log('leitura_rapida HTML len:', html.length)
for (const needle of ['jurisprudencia/progresso', 'best', 'storageKey', 'localStorage', 'postMessage', 'sc-for', '{{', 'script', 'fetch(', 'sendBeacon', 'jogo.js', 'bootstrap']) {
  const n = (html.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
  console.log(`  "${needle}": ${n}`)
}
// Quantas questões? (contagem grosseira de blocos de alternativa / sc-for)
console.log('\nPrimeiros 800 chars:\n', html.slice(0, 800))
process.exit(0)
