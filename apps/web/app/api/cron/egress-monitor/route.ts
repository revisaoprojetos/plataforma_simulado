import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sqlDisponivel } from '@/lib/data/sql'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'

export const dynamic = 'force-dynamic'

/**
 * O4 — Monitor de egress (rede de alerta "nunca mais").
 *
 * O incidente de egress teve como CAUSA RAIZ a `DATABASE_URL` ausente em produção → `sqlDisponivel()`
 * falso → relatórios caíam no PostgREST `fetchAll` (varredura de centenas de milhares de linhas). Este
 * cron verifica periodicamente os DOIS "gates" de egress e ALERTA alto nos logs se algum cair, além de
 * registrar o tamanho das tabelas quentes para acompanhar crescimento. Barato (só head counts + 1
 * roundtrip no Redis). Protegido por CRON_SECRET; chamado pelo worker.
 */
function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

// Tabelas que geram egress alto quando lidas sem SQL agregado / sem cache. Head count = só o número.
const TABELAS = [
  'simulado_respostas_objetivas',
  'simulado_sessoes_prova',
  'simulado_leitura_respostas',
  'simulado_estudantes',
  'audit_logs',
]

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })

  // 1) Gate real do egress: o SQL agregado está ligado? (a causa do incidente)
  const sqlOk = sqlDisponivel()

  // 2) Redis vivo? Sem cache, relatórios recomputam e o egress sobe. Roundtrip real: se o 2º remember
  //    devolver o valor gravado pelo 1º, o cache serviu → Redis ok. Se recomputar, o cache está off.
  let redisOk = false
  try {
    const marca = `m-${Date.now()}`
    const a = await remember('egress-monitor:ping', 30, async () => marca)
    const b = await remember('egress-monitor:ping', 30, async () => `outro-${Date.now()}`)
    redisOk = a === marca && b === marca
    await esquecer('egress-monitor:ping')
  } catch { redisOk = false }

  // 3) Tamanho das tabelas quentes (head count = barato, não traz linhas).
  const svc = createAdminClient()
  const contagens: Record<string, number | null> = {}
  for (const t of TABELAS) {
    try {
      const { count } = await svc.from(t).select('*', { count: 'exact', head: true })
      contagens[t] = count ?? null
    } catch { contagens[t] = null }
  }

  const saude = { ok: sqlOk && redisOk, sqlAgregado: sqlOk, redis: redisOk, contagens }

  // ALERTA alto — é o que impede o incidente de voltar silenciosamente.
  if (!sqlOk) console.error('[egress-monitor] ⚠️ SQL AGREGADO INATIVO — relatórios via PostgREST (EGRESS ALTO). Confira DATABASE_URL no serviço.')
  if (!redisOk) console.error('[egress-monitor] ⚠️ REDIS INDISPONÍVEL — cache off, relatórios recomputam. Confira REDIS_URL.')
  console.info('[egress-monitor]', JSON.stringify(saude))

  return NextResponse.json(saude)
}
