import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hojeBrt, somaDias } from '@/lib/admin/revisao/datas'

export const dynamic = 'force-dynamic'

// Refresh do agregado diário do Cronograma Adaptativo (simulado_cronograma_adaptativo_agg_dia) — alimenta a aba admin
// "Análise de uso". Idempotente (a RPC apaga e recalcula a janela) e BOUNDED: janela curta por padrão (14 dias atrás … 7 à frente),
// reprocessada em fatias de 7 dias, com teto de tempo. Às 03h (BRT) faz a passada funda (90 dias) p/ pegar marcações retroativas.
// `?dias=N` (máx. 400) força a janela para trás (backfill inicial); `?tenant=<uuid>` restringe a um tenant.
// Protegido por CRON_SECRET; chamado de hora em hora pelo worker. Sem a migração 20261119030000 → responde ok com `migrado:false`.
const FATIA = 7
const ORCAMENTO_MS = 50_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const url = new URL(req.url)
  const hoje = hojeBrt()
  const horaBrt = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Fortaleza', hour: '2-digit', hour12: false }).format(new Date()))
  const pedido = Math.trunc(Number(url.searchParams.get('dias')))
  const tras = Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, 400) : horaBrt === 3 ? 90 : 14
  const tenant = url.searchParams.get('tenant')
  const pTenant = tenant && UUID.test(tenant) ? tenant : null

  const svc = createAdminClient()
  const ini = somaDias(hoje, -tras), fim = somaDias(hoje, 7)
  const t0 = Date.now()
  let linhas = 0, fatias = 0, parcial = false
  // da data mais recente para trás: se o orçamento acabar, o que importa mais (hoje) já foi processado
  for (let fimFatia = fim; fimFatia >= ini; fimFatia = somaDias(fimFatia, -FATIA)) {
    if (Date.now() - t0 > ORCAMENTO_MS) { parcial = true; break }
    const iniFatia = somaDias(fimFatia, -(FATIA - 1)) < ini ? ini : somaDias(fimFatia, -(FATIA - 1))
    const { data, error } = await svc.rpc('simulado_cronograma_adaptativo_agg_refresh_todos', { p_de: iniFatia, p_ate: fimFatia, p_tenant: pTenant })
    if (error) {
      // migração pendente (função ausente) → nada a fazer; outro erro → loga e encerra a rodada
      if (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message)) return NextResponse.json({ ok: true, migrado: false })
      console.error('[cron adaptativo-agg]', error.message)
      return NextResponse.json({ ok: false, message: error.message, linhas, fatias }, { status: 500 })
    }
    for (const r of (data ?? []) as Array<{ linhas: number }>) linhas += Number(r.linhas) || 0
    fatias++
  }
  return NextResponse.json({ ok: true, migrado: true, janela: [ini, fim], fatias, linhas, parcial, ms: Date.now() - t0 })
}
