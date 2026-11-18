import { NextRequest, NextResponse } from 'next/server'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { diagnosticarLigacoes, type ProblemaLigacao } from '@/lib/cronograma/adaptativo/diagnostico-ligacoes'

// GET /api/admin/cronogramas/ligacoes?pagina=1&porPagina=50&problema=documento_deletado&busca=...
// Diagnóstico SOMENTE LEITURA das ligações meta ↔ documento (ID + snapshot de nome): metas que apontam p/ documentos deletados/
// despublicados/movidos, metas sem documento, título divergente e candidatos de relink (único/ambíguo). Paginado.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const PROBLEMAS = new Set(['sem_documento', 'documento_deletado', 'documento_despublicado', 'documento_inexistente', 'documento_movido', 'titulo_divergente'])
const json = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(req: NextRequest) {
  try {
    if (!(await checkPermission('cronogramas:view'))) return json(403, 'Sem permissão.')
    const access = await getCurrentAccess()
    if (!access.tenantId) return json(400, 'Tenant não resolvido.')
    const q = req.nextUrl.searchParams
    const problema = q.get('problema') ?? ''
    const r = await diagnosticarLigacoes(createAdminClient(), access.tenantId, {
      pagina: Number(q.get('pagina')) || 1, porPagina: Number(q.get('porPagina')) || 50,
      problema: PROBLEMAS.has(problema) ? (problema as ProblemaLigacao) : '', busca: (q.get('busca') ?? '').slice(0, 100),
    })
    return NextResponse.json(r, { status: r.ok ? 200 : 500, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return json(500, (e as Error)?.message ?? 'Erro ao diagnosticar.')
  }
}
