// Limpa TODO o conteúdo de teste da plataforma sandbox "Revisão 2" (rev2). Reversível/idempotente.
import { readFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const g = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim()
const BASE = g('SUPABASE_URL') || g('NEXT_PUBLIC_SUPABASE_URL'), KEY = g('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const REV2 = '00367cbf-8c72-4552-9de1-187e99e5bb75'
const del = (path) => fetch(`${BASE}/rest/v1/${path}`, { method: 'DELETE', headers: H }).then((r) => r.status)

// ordem respeitando FKs
for (const t of ['simulado_alternativas', 'simulado_questao_pasta', 'simulado_questao_etiquetas', 'simulado_questoes', 'simulado_cadernos_designer', 'simulado_pasta_estudantes', 'simulado_matriculas', 'simulado_estudantes', 'simulado_pastas', 'simulado_bancas', 'simulado_orgaos', 'simulado_disciplinas', 'simulado_assuntos', 'simulado_etiquetas']) {
  const s = await del(`${t}?tenant_id=eq.${REV2}`).catch(() => 'skip')
  process.stdout.write(`${t.replace('simulado_', '')}:${s} `)
}
await del(`simulado_compartilhamentos?destino_tenant_id=eq.${REV2}`)
console.log('\nrev2 limpa.')
