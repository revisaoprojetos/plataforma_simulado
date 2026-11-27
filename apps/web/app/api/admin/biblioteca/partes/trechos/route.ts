import { NextRequest, NextResponse } from 'next/server'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'

// Trechos LEVES da versão atual do documento, para o seletor de faixa da aba "Partes".
//   GET ?documentoId=…[&q=texto][&todos=1][&offset=0][&limit=50]
// Por padrão só marcos estruturais (livro/parte/título/capítulo/seção/subseção/artigo). `todos=1` inclui o resto.
// Paginado (limit máx. 100) e com count — nunca devolve o documento inteiro.
export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: NO_STORE })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ESTRUTURAIS = ['livro', 'parte', 'titulo', 'capitulo', 'secao', 'subsecao', 'artigo']

export async function GET(req: NextRequest) {
  if (!(await checkPermission('configuracoes:view'))) return json(403, { ok: false, error: 'Sem permissão.' })
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return json(400, { ok: false, error: 'Tenant não resolvido.' })
  const sp = req.nextUrl.searchParams
  const documentoId = sp.get('documentoId') ?? ''
  if (!UUID.test(documentoId)) return json(400, { ok: false, error: 'Documento inválido.' })
  const offset = Math.max(0, Number(sp.get('offset')) || 0)
  const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 50))
  const q = (sp.get('q') ?? '').trim().slice(0, 80).replace(/[%,()*\\]/g, ' ').trim()

  const svc = createAdminClient() as any
  const { data: doc } = await svc.from('simulado_conteudo_documentos').select('versao_atual_id, deletado')
    .eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
  if (!doc || doc.deletado || !doc.versao_atual_id) return json(404, { ok: false, error: 'Documento não encontrado, excluído ou sem versão atual.' })

  let query = svc.from('simulado_conteudo_trechos').select('uid, tipo, rotulo, ordem, texto', { count: 'exact' }).eq('versao_id', doc.versao_atual_id)
  if (sp.get('todos') !== '1') query = query.in('tipo', ESTRUTURAIS)
  if (q) query = query.or(`rotulo.ilike.%${q}%,texto.ilike.%${q}%`)
  const { data, error, count } = await query.order('ordem', { ascending: true }).range(offset, offset + limit - 1)
  if (error) return json(500, { ok: false, error: error.message })
  const itens = ((data ?? []) as { uid: string; tipo: string | null; rotulo: string | null; ordem: number; texto: string | null }[])
    .map((t) => ({ uid: t.uid, tipo: t.tipo, rotulo: t.rotulo, ordem: t.ordem, previa: (t.texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 90) }))
  return json(200, { ok: true, itens, total: count ?? itens.length, offset, limit })
}
