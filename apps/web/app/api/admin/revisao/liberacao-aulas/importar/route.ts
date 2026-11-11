import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { LIMITE_PLANILHA } from '@/lib/produtos/liberacao-aulas-import'
import { gravarImportacao, prepararImportacao } from '@/app/admin/revisao/cronograma/liberacao-aulas/importar'
import { semTabela } from '@/app/admin/revisao/cronograma/liberacao-aulas/dados'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Importar a planilha de liberação de aulas (multipart, sem base64). Rota de API (e não server action) por causa dos
// domínios custom. modo=previa só lê/casa e devolve o resumo; modo=gravar repete o casamento e substitui as linhas do produto.
export async function POST(req: NextRequest) {
  if (!(await checkPermission('cronogramas:update'))) return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
  const access = await getCurrentAccess()
  if (!access.tenantId) return NextResponse.json({ ok: false, error: 'Tenant não resolvido.' }, { status: 400 })
  const tenantId = access.tenantId

  const form = await req.formData().catch(() => null)
  const arquivo = form?.get('arquivo')
  const produtoId = String(form?.get('produtoId') ?? '')
  const modo = form?.get('modo') === 'gravar' ? 'gravar' : 'previa'
  if (!(arquivo instanceof File)) return NextResponse.json({ ok: false, error: 'Envie o arquivo .xlsx.' }, { status: 400 })
  if (!/\.xlsx$/i.test(arquivo.name)) return NextResponse.json({ ok: false, error: 'O arquivo precisa ser .xlsx.' }, { status: 400 })
  if (arquivo.size > LIMITE_PLANILHA) return NextResponse.json({ ok: false, error: 'Arquivo grande demais (máx. 8 MB).' }, { status: 400 })
  const buf = await arquivo.arrayBuffer()
  const magia = new Uint8Array(buf.slice(0, 4))
  if (!(magia[0] === 0x50 && magia[1] === 0x4b)) return NextResponse.json({ ok: false, error: 'O arquivo não parece um .xlsx válido.' }, { status: 400 })

  const svc = createAdminClient()
  const { data: prod } = await svc.from('simulado_produtos').select('id').eq('tenant_id', tenantId).eq('id', produtoId).maybeSingle()
  if (!prod) return NextResponse.json({ ok: false, error: 'Produto não encontrado.' }, { status: 404 })
  const t = await svc.from('simulado_produto_liberacao_aulas').select('id', { head: true, count: 'exact' }).eq('tenant_id', tenantId).eq('produto_id', produtoId)
  if (semTabela(t.error)) return NextResponse.json({ ok: false, error: 'Aplique a migração 20261117010000 antes de importar.' }, { status: 409 })

  let preparada
  try { preparada = await prepararImportacao(svc, tenantId, produtoId, buf) }
  catch { return NextResponse.json({ ok: false, error: 'Não consegui ler a planilha. Confira se é o arquivo de liberação de aulas (.xlsx).' }, { status: 400 }) }

  if (modo === 'previa') return NextResponse.json({ ok: true, previa: preparada.previa })
  const r = await gravarImportacao(svc, { tenantId, produtoId, atorId: access.userId ?? null, preparada, nomeArquivo: arquivo.name })
  return NextResponse.json(r, { status: r.ok ? 200 : 500 })
}
