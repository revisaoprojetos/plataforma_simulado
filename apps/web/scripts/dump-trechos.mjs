// READ-ONLY — despeja os primeiros trechos de alguns documentos (por trecho no título) p/ entender a
// fronteira capa→conteúdo. Uso: cd apps/web && node scripts/dump-trechos.mjs "parte do titulo" ...
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
function lerEnv(p) { const e = {}; for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue; let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); e[m[1]] = v } return e }
const env = lerEnv('.env.local')
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const alvos = process.argv.slice(2)
for (const termo of alvos) {
  const { data: docs } = await svc.from('simulado_conteudo_documentos').select('id, titulo, versao_atual_id')
    .eq('tenant_id', T).eq('categoria', 'conteudo').eq('deletado', false).eq('status', 'publicado').ilike('titulo', `%${termo}%`).limit(1)
  const d = docs?.[0]
  if (!d) { console.log(`\n### "${termo}" → não achei`); continue }
  const { data: tr } = await svc.from('simulado_conteudo_trechos').select('ordem, tipo, rotulo, texto')
    .eq('tenant_id', T).eq('versao_id', d.versao_atual_id).order('ordem', { ascending: true }).range(0, 27)
  console.log(`\n### ${d.titulo}`)
  for (const t of tr ?? []) console.log(`  [${String(t.ordem).padStart(3)}] ${t.tipo.padEnd(9)} ${t.rotulo ? '(' + t.rotulo + ') ' : ''}${(t.texto || '').slice(0, 72)}`)
}
process.exit(0)
