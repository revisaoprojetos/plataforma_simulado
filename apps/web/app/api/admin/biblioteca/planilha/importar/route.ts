import { NextRequest, NextResponse } from 'next/server'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'
import { importarPlanilha, type CategoriaPlanilha } from '@/lib/conteudo/planilha'

// IMPORTA uma planilha .xlsx (a mesma do export) e ATUALIZA os metadados dos conteúdos cujo NOME (e TIPO)
// bate com o do sistema. Título/Tipo não podem mudar; linhas que não batem são ignoradas e reportadas.
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  if (!(await checkPermission('configuracoes:update'))) return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return NextResponse.json({ ok: false, error: 'Tenant não resolvido.' }, { status: 400 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ ok: false, error: 'Envio inválido.' }, { status: 400 }) }
  const file = form.get('arquivo')
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Selecione a planilha.' }, { status: 400 })
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ ok: false, error: 'Envie um arquivo .xlsx (a planilha exportada pela Biblioteca).' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'Arquivo muito grande (máx. 10 MB).' }, { status: 400 })

  const cat = String(form.get('categoria') ?? '')
  const categoria: CategoriaPlanilha = cat === 'jurisclub' ? 'jurisclub' : cat === 'modelo_caderno' ? 'modelo_caderno' : 'conteudo'
  const p = String(form.get('pasta') ?? '')
  const pastaId = UUID_RE.test(p) ? p : null

  try {
    const access = await getCurrentAccess()
    const r = await importarPlanilha({
      svc: createAdminClient(), tenantId, atorId: access.userId ?? null, categoria, pastaId,
      buffer: Buffer.from(await file.arrayBuffer()),
    })
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'Falha ao importar.' }, { status: 500 })
  }
}
