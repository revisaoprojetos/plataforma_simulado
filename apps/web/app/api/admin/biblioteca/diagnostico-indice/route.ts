import { NextRequest, NextResponse } from 'next/server'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'
import { diagnosticarDocumento, diagnosticarLote } from '@/lib/conteudo/diagnostico-indice-server'

// Diagnóstico do índice (somente leitura). API de rota (NÃO server action).
//   GET ?documentoId=…                       diagnóstico completo de 1 documento
//   GET ?[pastaId=…][&pagina=1][&porPagina=20]   matriz paginada (documentos diretos da pasta; sem pastaId = todos)
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: NO_STORE })
const STATUS = { invalido: 400, nao_encontrado: 404, erro: 500 } as const

export async function GET(req: NextRequest) {
  if (!(await checkPermission('configuracoes:view'))) return json(403, { ok: false, error: 'Sem permissão.' })
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return json(400, { ok: false, error: 'Tenant não resolvido.' })
  const sp = req.nextUrl.searchParams
  const svc = createAdminClient()

  const documentoId = sp.get('documentoId')
  if (documentoId) {
    const r = await diagnosticarDocumento(svc, tenantId, documentoId)
    return r.ok ? json(200, r) : json(STATUS[r.codigo], r)
  }
  const r = await diagnosticarLote(svc, tenantId, {
    pastaId: sp.get('pastaId'), pagina: Number(sp.get('pagina') ?? 1), porPagina: Number(sp.get('porPagina') ?? 20),
  })
  return r.ok ? json(200, r) : json(STATUS[r.codigo], r)
}
