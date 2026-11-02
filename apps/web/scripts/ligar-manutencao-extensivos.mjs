// Liga a manutenção da área "Meus Extensivos" (key: 'extensivos') nos tenants que NÃO são a Revisão
// (MEQ, VND, MAC). Mescla tema.manutencao_aluno.extensivos=true preservando o resto do tema.
// Uso: cd apps/web && node scripts/ligar-manutencao-extensivos.mjs [--apply]   (sem --apply = dry-run)
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
function lerEnv(p) { const e = {}; for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue; let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); e[m[1]] = v } return e }
const env = lerEnv('.env.local')
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')
// Revisão = 02195fa6 (NÃO mexer). Ligar nos outros:
const TENANTS = [
  { id: '737ed838-ba07-49e3-a34f-f7d25c3cf53c', nome: 'MEQ' },
  { id: '00367cbf-8c72-4552-9de1-187e99e5bb75', nome: 'VND' },
  { id: '2c302eb4-74c5-4143-a087-beec47c9c77e', nome: 'MAC' },
]
console.log(`\n=== Ligar manutenção 'extensivos' (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`)
for (const t of TENANTS) {
  const { data, error } = await svc.from('simulado_tenants').select('id, nome, tema').eq('id', t.id).maybeSingle()
  if (error || !data) { console.log(`✗ ${t.nome} (${t.id}) — não achei (${error?.message || 'sem linha'})`); continue }
  const tema = (data.tema && typeof data.tema === 'object') ? data.tema : {}
  const manut = (tema.manutencao_aluno && typeof tema.manutencao_aluno === 'object') ? tema.manutencao_aluno : {}
  const jaLigado = manut.extensivos === true
  console.log(`• ${data.nome || t.nome} — manutencao_aluno.extensivos atual = ${JSON.stringify(manut.extensivos)}${jaLigado ? ' (já ligado)' : ''}`)
  if (jaLigado || !APPLY) continue
  const novoTema = { ...tema, manutencao_aluno: { ...manut, extensivos: true } }
  const { error: upErr } = await svc.from('simulado_tenants').update({ tema: novoTema }).eq('id', t.id)
  console.log(upErr ? `  ✗ erro ao salvar: ${upErr.message}` : `  ✓ ligado`)
}
console.log(`\n${APPLY ? 'Feito.' : '(dry-run — rode com --apply para gravar)'}`)
process.exit(0)
