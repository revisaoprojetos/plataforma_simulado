import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sqlDisponivel } from '@/lib/data/sql'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { isoParaBrtLocal } from '@/lib/brt'

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

// Snapshots backend-first: se o roll parar, estes ficam "defasados" e as páginas voltam a RECOMPUTAR
// no request (egress alto / latência — exatamente o que o backend-first evita). Monitoramos a frescura.
// `dia` = snapshot é do dia a que se refere; defasado = `dia < hoje(BRT)`.
const SNAPSHOTS_DIA = ['painel', 'home', 'desempenho', 'perfil'] as const
// `cursos` não tem coluna `dia` (write-behind por evento); defasado = sem atualização há > 24h.
const SNAPSHOT_CURSOS = 'cursos'

// Limiar de alerta: consideramos o roll "possivelmente parado" para uma área quando há volume de
// defasagem (> 500 linhas) OU quando 100% das linhas existentes estão defasadas (total>0 && defasados===total).
// Área inexistente (migração não aplicada) ou vazia é NEUTRA — não derruba o alerta.
const DEFASADOS_ALTO = 500
function areaDefasada(b: { defasados: number; total: number } | null): boolean {
  if (!b || b.total === 0) return false
  return b.defasados > DEFASADOS_ALTO || b.defasados === b.total
}

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

  // 4) Frescura dos snapshots (o roll está rodando?). Só head counts (zero egress de linhas).
  //    Tabela ausente → `null` (neutro, migração não aplicada). Área vazia (total=0) → neutra.
  type Breakdown = { defasados: number; total: number } | null
  const hojeBrt = isoParaBrtLocal(new Date().toISOString()).slice(0, 10) // "YYYY-MM-DD" (BRT)
  const cursosCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const snapshots: Record<string, Breakdown> = {}

  for (const area of SNAPSHOTS_DIA) {
    const tabela = `simulado_${area}_snapshot`
    try {
      const { count: total, error: eTotal } = await svc.from(tabela).select('*', { count: 'exact', head: true })
      if (eTotal) { snapshots[area] = null; continue } // tabela ausente → neutro
      const { count: defas, error: eDefas } = await svc
        .from(tabela).select('*', { count: 'exact', head: true }).lt('dia', hojeBrt)
      if (eDefas) { snapshots[area] = null; continue }
      snapshots[area] = { defasados: defas ?? 0, total: total ?? 0 }
    } catch { snapshots[area] = null }
  }

  // cursos: sem `dia` → defasado = `atualizado_em < now() - 24h`.
  try {
    const tabela = `simulado_${SNAPSHOT_CURSOS}_snapshot`
    const { count: total, error: eTotal } = await svc.from(tabela).select('*', { count: 'exact', head: true })
    if (eTotal) { snapshots[SNAPSHOT_CURSOS] = null }
    else {
      const { count: defas, error: eDefas } = await svc
        .from(tabela).select('*', { count: 'exact', head: true }).lt('atualizado_em', cursosCutoff)
      snapshots[SNAPSHOT_CURSOS] = eDefas ? null : { defasados: defas ?? 0, total: total ?? 0 }
    }
  } catch { snapshots[SNAPSHOT_CURSOS] = null }

  const snapshotsDefasadosTotal = Object.values(snapshots).reduce((a, b) => a + (b?.defasados ?? 0), 0)
  // Roll possivelmente parado se QUALQUER área (existente e não vazia) cruzar o limiar.
  const snapshotsOk = !Object.values(snapshots).some(areaDefasada)

  // `ok` passa a considerar também a frescura dos snapshots (continua boolean — contrato intacto).
  const saude = {
    ok: sqlOk && redisOk && snapshotsOk,
    sqlAgregado: sqlOk,
    redis: redisOk,
    contagens,
    snapshots,
    snapshotsOk,
    snapshotsDefasadosTotal,
  }

  // ALERTA alto — é o que impede o incidente de voltar silenciosamente.
  if (!sqlOk) console.error('[egress-monitor] ⚠️ SQL AGREGADO INATIVO — relatórios via PostgREST (EGRESS ALTO). Confira DATABASE_URL no serviço.')
  if (!redisOk) console.error('[egress-monitor] ⚠️ REDIS INDISPONÍVEL — cache off, relatórios recomputam. Confira REDIS_URL.')
  if (!snapshotsOk) console.error(`[egress-monitor] ⚠️ SNAPSHOTS DEFASADOS (${snapshotsDefasadosTotal} linhas) — o roll pode estar PARADO; páginas voltam a recomputar no request (EGRESS/LATÊNCIA). Confira os crons *-roll.`)
  console.info('[egress-monitor]', JSON.stringify(saude))

  return NextResponse.json(saude)
}
