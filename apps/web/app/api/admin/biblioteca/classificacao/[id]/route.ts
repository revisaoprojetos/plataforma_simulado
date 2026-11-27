import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { resolverAtorAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/server'
import { AcaoDetalheSchema } from '@/lib/conteudo/classificacao/detalhe'
import { executarAcaoDetalhe } from '@/lib/conteudo/classificacao/detalhe-server'

// AÇÕES da PÁGINA de uma classificação. API de rota (server actions são rejeitadas em domínio custom).
//   POST { acao:'mover', delta:-1|1 }
//        { acao:'clonar-regras', origemId, modo:'preencher'|'substituir', areas?, dryRun? }   (dryRun devolve só a prévia)
//        { acao:'remover-docs', ids | filtro:{origem,q} }          tira a classificação PRÓPRIA dos documentos (voltam a herdar)
//        { acao:'trocar-docs', para, ids | filtro:{origem,q} }     define outra classificação nos documentos
//        { acao:'aplicar-pendencias', ids? }                       classifica os documentos sem tipo que a regra de sugestão associa a esta
// Editar/duplicar/arquivar/apagar continuam em /api/admin/biblioteca/classificacao/tipos. Permissão: configuracoes:update.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: NO_STORE })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkPermission('configuracoes:update'))) return json(403, { ok: false, error: 'Sem permissão.' })
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return json(400, { ok: false, error: 'Tenant não resolvido.' })
  const id = z.string().uuid().safeParse((await params).id)
  if (!id.success) return json(400, { ok: false, error: 'id inválido.' })
  const p = AcaoDetalheSchema.safeParse(await req.json().catch(() => null))
  if (!p.success) return json(400, { ok: false, error: `Dados inválidos: ${p.error.issues[0]?.path.join('.') || 'corpo'} — ${p.error.issues[0]?.message ?? 'verifique os campos'}.` })
  try {
    const r = await executarAcaoDetalhe(createAdminClient(), tenantId, await resolverAtorAudit(), id.data, p.data)
    return r.ok ? json(200, r) : json(r.status, { ok: false, error: r.error })
  } catch (e) { return json(500, { ok: false, error: (e as Error)?.message || 'Falha ao executar.' }) }
}
