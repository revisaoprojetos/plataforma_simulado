import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { getGamConfig } from '@/lib/gamificacao'
import { rebuildCacheTenant } from '@/lib/gamificacao/cache'

// POST /api/cron/gamificacao-backfill  { tenant }  — concede XP retroativo dos simulados já
// finalizados (idempotente: refId=sessao_id, compartilha a chave dos awards ao vivo → re-executável).
// NÃO backfilla streak/missões. Protegido por CRON_SECRET. Rodar off-peak (scripts/backfill-gamificacao.mjs).
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  let body: { tenant?: string }
  try { body = await req.json() } catch { body = {} }
  const tenant = body.tenant
  if (!tenant) return NextResponse.json({ message: 'tenant ausente.' }, { status: 400 })

  const svc = createAdminClient()
  const config = await getGamConfig(svc, tenant)
  if (!config) return NextResponse.json({ message: 'Config não encontrada.' }, { status: 404 })
  const r = config.xp_regras.simulado

  // Todas as sessões finalizadas (não teste, não deletadas) do tenant.
  const sessoes = await fetchAll<any>(() =>
    svc.from('simulado_sessoes_prova')
      .select('id, estudante_id, nota')
      .eq('tenant_id', tenant).eq('status', 'finalizada').eq('is_teste', false).eq('deletado', false)
      .order('id'))

  // Acertos por sessão em lote.
  const acertos = new Map<string, number>()
  if (sessoes.length) {
    const resp = await fetchAllByIn<any>(sessoes.map((s) => s.id), (chunk) =>
      svc.from('simulado_respostas_objetivas').select('sessao_id, correta').in('sessao_id', chunk).order('sessao_id'))
    for (const x of resp) if (x.correta) acertos.set(x.sessao_id, (acertos.get(x.sessao_id) ?? 0) + 1)
  }

  const rows = sessoes
    .filter((s) => s.estudante_id)
    .map((s) => {
      const ac = acertos.get(s.id) ?? 0
      const bonus = Math.round((r.bonus_nota_max ?? 0) * (Number(s.nota || 0) / 100))
      const xp = (r.base ?? 0) + (r.por_acerto ?? 0) * ac + bonus
      return { tenant_id: tenant, estudante_id: s.estudante_id, origem: 'simulado', ref_id: s.id, xp: Math.round(xp), meta: { backfill: true, acertos: ac, nota: s.nota } }
    })
    .filter((x) => x.xp > 0)

  let eventosNovos = 0
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await svc
      .from('simulado_xp_eventos')
      .upsert(rows.slice(i, i + 500), { onConflict: 'tenant_id,estudante_id,origem,ref_id', ignoreDuplicates: true })
      .select('id')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    eventosNovos += data?.length ?? 0
  }

  const alunosRecalculados = await rebuildCacheTenant(svc, tenant)
  return NextResponse.json({ ok: true, sessoes: sessoes.length, eventosNovos, alunosRecalculados })
}
