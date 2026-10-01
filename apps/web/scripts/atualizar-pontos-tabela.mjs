// Atualiza os GANHOS DE PONTOS do tenant Revisão conforme a tabela pedida:
//  - Leitura: 5 por leitura, 5 por concluir o quiz (sem por-acerto, sem combo).
//  - Streak: sem XP fixo diário; bônus SEMANAL +10 (a cada 7 dias) + marcos que SOMAM (14→+15, 21→+35, 30→+50).
//  - Teto diário: 300 XP.
// Backup em scripts/_backup-pontos-tabela.json. Idempotente. Rode com --apply (sem isso = dry-run).
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

let e = {}
for (const f of ['.env.local', '../../.env']) { try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in e)) e[m[1]] = m[2].replace(/^"|"$/g, '') } } catch {} }
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const APPLY = process.argv.includes('--apply')

const PONTUACAO = { pontos_aula: 5, pontos_quiz: 5, pontos_acerto: 0, combo_ativo: false, combo_bonus: 0 }
const MARCOS = [{ dias: 14, xp: 15 }, { dias: 21, xp: 35 }, { dias: 30, xp: 50 }]

// 1) Config de gamificação
const { data: cfg } = await sb.from('simulado_gamificacao_config').select('xp_regras').eq('tenant_id', T).maybeSingle()
const xr = { ...(cfg?.xp_regras ?? {}) }
const xrNovo = {
  ...xr,
  streak: { ...(xr.streak ?? {}), por_dia: 0, cap: 300, tolerancia_dias: xr.streak?.tolerancia_dias ?? 0, marcos: MARCOS },
  chest: { cada_n_dias: 7, xp: 10 },
  limite_dia: 300,
}

// 2) Módulos de leitura (pontuação por módulo)
const { data: pastas } = await sb.from('simulado_pastas').select('id, nome, pontuacao').eq('tenant_id', T).eq('folder_area', 'leitura')

console.log(`Config: streak.por_dia ${xr.streak?.por_dia}→0, cap→300, chest→7d/+10, marcos=${JSON.stringify(MARCOS)}, limite_dia→300`)
console.log(`Módulos de leitura: ${pastas?.length ?? 0} (pontuação → ${JSON.stringify(PONTUACAO)})`)

if (!APPLY) { console.log('\nDRY-RUN. Rode com --apply para gravar.'); process.exit(0) }

writeFileSync('scripts/_backup-pontos-tabela.json', JSON.stringify({ config: cfg?.xp_regras ?? null, pastas: (pastas ?? []).map((p) => ({ id: p.id, pontuacao: p.pontuacao })) }, null, 2))

const u1 = await sb.from('simulado_gamificacao_config').update({ xp_regras: xrNovo }).eq('tenant_id', T)
if (u1.error) { console.error('ERRO config:', u1.error.message); process.exit(1) }

let ok = 0
for (const p of pastas ?? []) {
  const u = await sb.from('simulado_pastas').update({ pontuacao: PONTUACAO }).eq('id', p.id).eq('tenant_id', T)
  if (u.error) console.error(`ERRO pasta ${p.id}:`, u.error.message); else ok++
}
console.log(`\n✅ Config atualizada + ${ok}/${pastas?.length ?? 0} módulos. Backup em scripts/_backup-pontos-tabela.json`)
