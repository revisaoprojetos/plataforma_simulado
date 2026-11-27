import { NextRequest, NextResponse } from 'next/server'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { resolverAtorAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/server'
import { aplicarLote, idsDoFiltro, type FiltrosMatrizEntrada } from '@/lib/conteudo/classificacao/matriz-server'

// Classificação EM LOTE de documentos da Biblioteca. API de rota (NÃO server action — rejeitadas em domínio custom).
//   PATCH { ids: string[] | filtro: {filtro,q,pastaId,disciplinaId}   (um dos dois; `filtro` = "selecionar todos (N)")
//          classificacaoId?: uuid | null   (null limpa → volta a herdar da pasta; ausente não mexe)
//          formatoLeitura?: slug | null    (idem) }
//   → { ok, alterados, ignorados }. Chunks de 80, auditoria, invalida caches do tenant. Permissão configuracoes:update.
//   503 quando coluna/tabela das migrations 16/17 não existe (aviso "aplique migrations 16 e 17").
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: NO_STORE })
const STATUS = { invalido: 400, migracao: 503, erro: 500 } as const

export async function PATCH(req: NextRequest) {
  if (!(await checkPermission('configuracoes:update'))) return json(403, { ok: false, error: 'Sem permissão.' })
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
    if (r.truncado) return json(400, { ok: false, error: 'Mais de 5.000 documentos no filtro: refine o filtro e repita.' })
    ids = r.ids
  } else return json(400, { ok: false, error: 'Informe ids ou filtro.' })

  const pedido: Parameters<typeof aplicarLote>[3] = { ids }
  if ('classificacaoId' in b) {
    if (b.classificacaoId !== null && typeof b.classificacaoId !== 'string') return json(400, { ok: false, error: 'classificacaoId inválido.' })
    pedido.classificacaoId = b.classificacaoId as string | null
  }
  if ('formatoLeitura' in b) {
    if (b.formatoLeitura !== null && typeof b.formatoLeitura !== 'string') return json(400, { ok: false, error: 'formatoLeitura inválido.' })
    pedido.formatoLeitura = typeof b.formatoLeitura === 'string' ? b.formatoLeitura.trim() || null : null
  }
  const r = await aplicarLote(svc, tenantId, await resolverAtorAudit(), pedido)
  return r.ok ? json(200, r) : json(STATUS[r.codigo], r)
}
