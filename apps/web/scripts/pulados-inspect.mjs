// READ-ONLY — lê os 21 pulados do relatório e dumpa os primeiros trechos de cada (p/ entender por que
// não casou âncora e se há capa). Uso: node scripts/pulados-inspect.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const S = 'C:\\Users\\joooa\\AppData\\Local\\Temp\\claude\\c--Users-joooa-Downloads-Plataforma-Simulado\\526b571b-6115-41c1-9720-26c054780cda\\scratchpad\\'
function lerEnv(p) { const e = {}; for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue; let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); e[m[1]] = v } return e }
const env = lerEnv('.env.local')
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const txt = readFileSync(S + 'relatorio-capas.txt', 'utf8').split(/\r?\n/)
const titulos = txt.filter((l) => /→ PULADO/.test(l)).map((l) => l.replace(/^\s*-\s*/, '').replace(/\s*→ PULADO.*/, '').trim())
for (const titulo of titulos) {
  const { data: docs } = await svc.from('simulado_conteudo_documentos').select('id, titulo, versao_atual_id').eq('tenant_id', T).eq('categoria', 'conteudo').eq('deletado', false).ilike('titulo', titulo.replace(/[%_]/g, (c) => '\\' + c)).limit(1)
  const d = docs?.[0]
  if (!d) { console.log(`\n### (não achei) ${titulo}`); continue }
  const { data: tr } = await svc.from('simulado_conteudo_trechos').select('ordem, texto').eq('tenant_id', T).eq('versao_id', d.versao_atual_id).order('ordem', { ascending: true }).range(0, 11)
  console.log(`\n### ${d.titulo.slice(0, 60)}  (trechos: ${tr?.length ?? 0})`)
  for (const t of tr ?? []) console.log(`   [${String(t.ordem).padStart(2)}] ${(t.texto || '').slice(0, 78)}`)
}
process.exit(0)
