import { NextRequest, NextResponse } from 'next/server'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'
import { idsDoFiltro, sugerirParaDocumentos, type FiltrosMatrizEntrada } from '@/lib/conteudo/classificacao/matriz-server'

// "Sugerir classificação" (SÓ SUGERE; nada é gravado — o admin confirma e aplica pelo PATCH da rota-mãe).
//   POST { ids: string[] | filtro: {filtro,q,pastaId,disciplinaId} }
//   → { ok, sugestoes: [{id,titulo,slug,classificacaoId,classificacaoNome,motivo:'titulo'|'pasta',evidencia}], semSugestao, jaClassificados }
// Regra: título (PDFIGHT/PDFLASH/PDFULL) e, na falta, nome da pasta/ancestrais. Só para docs sem tipo próprio nem herdado.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: NO_STORE })
const STATUS = { invalido: 400, migracao: 503, erro: 500 } as const

export async function POST(req: NextRequest) {
  if (!(await checkPermission('configuracoes:view'))) return json(403, { ok: false, error: 'Sem permissão.' })
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return json(400, { ok: false, error: 'Tenant não resolvido.' })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return json(400, { ok: false, error: 'Corpo inválido.' })
  const svc = createAdminClient()
  let ids: string[] = []
  if (Array.isArray(b.ids)) ids = b.ids.filter((x): x is string => typeof x === 'string')
  else if (b.filtro && typeof b.filtro === 'object') {
    const f = b.filtro as FiltrosMatrizEntrada
    const r = await idsDoFiltro(svc, tenantId, { filtro: f.filtro, q: f.q, pastaId: f.pastaId ?? null, disciplinaId: f.disciplinaId ?? null })
    if (!r.ok) return json(400, { ok: false, error: r.error })
    ids = r.ids
  } else return json(400, { ok: false, error: 'Informe ids ou filtro.' })
  const r = await sugerirParaDocumentos(svc, tenantId, ids)
  return r.ok ? json(200, r) : json(STATUS[r.codigo], r)
}
