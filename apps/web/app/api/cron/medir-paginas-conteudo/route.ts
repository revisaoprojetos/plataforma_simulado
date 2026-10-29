import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { medirPaginasPendentes } from '@/lib/cronograma/adaptativo/paginas-pdf'

// Cron: mede páginas dos PDFs publicados na Biblioteca que ainda não têm contagem
// (versão atual com paginas NULL), por tenant, em lotes. Alimenta o Cronograma Adaptativo.
// Protegido por CRON_SECRET. O hook em definirVersaoAtual já mede os novos; isto é o backfill.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, message: 'não autorizado' }, { status: 401 })
  const svc = createAdminClient()
  const limiteTenant = Math.min(200, Math.max(1, Number(new URL(req.url).searchParams.get('limite') || 40)))
  const { data: tenants } = await svc.from('simulado_tenants').select('id').limit(500)
  const lista = (tenants || []) as Array<{ id: string }>
  let medidos = 0, falhas = 0
  for (const t of lista) {
    try { const r = await medirPaginasPendentes(svc, t.id, limiteTenant); medidos += r.medidos; falhas += r.falhas } catch { falhas++ }
  }
  return NextResponse.json({ ok: true, tenants: lista.length, medidos, falhas })
}

export async function GET(req: NextRequest) { return POST(req) }
