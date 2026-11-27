import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { resolverAtorAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/server'
import { CriarTipoSchema, EdicaoTipoSchema, ReordenarSchema, filtroTipoValido, ordemTipoValida } from '@/lib/conteudo/classificacao/gestao'
import { criarTipoGestao, editarTipoGestao, listarTiposGestao, removerTipoGestao, reordenarTipos, semearModeloBase, type Resultado } from '@/lib/conteudo/classificacao/gestao-server'

// CLASSIFICAÇÕES do tenant (simulado_conteudo_tipos). API de rota (server actions são rejeitadas em domínio custom).
//   GET    ?q&f=todas|ativas|arquivadas|sistema|personalizadas&sort=nome|ordem|prioridade|papel|slug&dir&page&pp → lista paginada (+uso)
//   POST   { nome, slug?, modelo?|duplicarDe?, papel?, ... } cria | { semearModeloBase: true } cria os 6 do modelo-base que faltam
//   PATCH  { id, patch, versao? } edita | { reordenar: { itens:[{id,ordem}] } }
//   DELETE ?id&modo=arquivar|apagar   (apagar só personalizada sem uso; senão 409 com explicação)
// Permissão: configuracoes:view (GET) / configuracoes:update (escritas).
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: NO_STORE })
const resp = (r: Resultado<object>) => (r.ok ? json(200, r) : json(r.status, { ok: false, error: r.error }))

async function ctx(escrita: boolean) {
  if (!(await checkPermission(escrita ? 'configuracoes:update' : 'configuracoes:view'))) return { erro: json(403, { ok: false, error: 'Sem permissão.' }) }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { erro: json(400, { ok: false, error: 'Tenant não resolvido.' }) }
  return { tenantId, svc: createAdminClient() }
}
const msgZod = (e: z.ZodError) => `Dados inválidos: ${e.issues[0]?.path.join('.') || 'corpo'} — ${e.issues[0]?.message ?? 'verifique os campos'}.`

export async function GET(req: NextRequest) {
  const c = await ctx(false); if ('erro' in c) return c.erro
  const sp = req.nextUrl.searchParams
  const pp = Math.min(100, Math.max(5, Number(sp.get('pp')) || 25))
  try {
    const dados = await listarTiposGestao(c.svc, c.tenantId, {
      q: sp.get('q') ?? '', filtro: filtroTipoValido(sp.get('f')), sort: ordemTipoValida(sp.get('sort')),
      dir: sp.get('dir') === 'desc' ? 'desc' : 'asc', page: Math.max(1, Number(sp.get('page')) || 1), pp,
    })
    return json(200, { ok: true, ...dados })
  } catch (e) { return json(500, { ok: false, error: (e as Error)?.message || 'Falha ao listar.' }) }
}

export async function POST(req: NextRequest) {
  const c = await ctx(true); if ('erro' in c) return c.erro
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return json(400, { ok: false, error: 'Corpo inválido.' })
  const ator = await resolverAtorAudit()
  try {
    if (b.semearModeloBase === true) return resp(await semearModeloBase(c.svc, c.tenantId, ator))
    const p = CriarTipoSchema.safeParse(b)
    if (!p.success) return json(400, { ok: false, error: msgZod(p.error) })
    return resp(await criarTipoGestao(c.svc, c.tenantId, ator, p.data))
  } catch (e) { return json(500, { ok: false, error: (e as Error)?.message || 'Falha ao criar.' }) }
}

export async function PATCH(req: NextRequest) {
  const c = await ctx(true); if ('erro' in c) return c.erro
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return json(400, { ok: false, error: 'Corpo inválido.' })
  const ator = await resolverAtorAudit()
  try {
    if (b.reordenar) {
      const p = ReordenarSchema.safeParse(b.reordenar)
      if (!p.success) return json(400, { ok: false, error: msgZod(p.error) })
      return resp(await reordenarTipos(c.svc, c.tenantId, ator, p.data.itens))
    }
    const id = z.string().uuid().safeParse(b.id)
    if (!id.success) return json(400, { ok: false, error: 'id inválido.' })
    const p = EdicaoTipoSchema.safeParse(b.patch)
    if (!p.success) return json(400, { ok: false, error: msgZod(p.error) })
    const versao = typeof b.versao === 'number' ? b.versao : undefined
    return resp(await editarTipoGestao(c.svc, c.tenantId, ator, id.data, p.data, versao))
  } catch (e) { return json(500, { ok: false, error: (e as Error)?.message || 'Falha ao salvar.' }) }
}

export async function DELETE(req: NextRequest) {
  const c = await ctx(true); if ('erro' in c) return c.erro
  const id = z.string().uuid().safeParse(req.nextUrl.searchParams.get('id'))
  if (!id.success) return json(400, { ok: false, error: 'id inválido.' })
  const modo = req.nextUrl.searchParams.get('modo') === 'apagar' ? 'apagar' : 'arquivar'
  try { return resp(await removerTipoGestao(c.svc, c.tenantId, await resolverAtorAudit(), id.data, modo)) }
  catch (e) { return json(500, { ok: false, error: (e as Error)?.message || 'Falha ao remover.' }) }
}
