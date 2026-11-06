import { NextRequest, NextResponse } from 'next/server'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'
import { carregarEscopo, type CategoriaPlanilha } from '@/lib/conteudo/planilha'
import { gerarPdfDocumento } from '@/lib/conteudo/thumb'

// PRÉ-GERA o PDF fiel (formatação, cores e fontes do .docx) dos documentos de uma pasta (+ subpastas) ou da
// categoria inteira. Sem esse PDF o leitor do aluno espera a conversão do OnlyOffice e, se falhar, cai no texto
// simplificado (sem formatação). Idempotente: o que já tem PDF em cache responde na hora. Roda com orçamento de
// tempo; devolve `restantes` para o admin repetir até zerar.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ORCAMENTO_MS = 240_000
const CONCORRENCIA = 3

export async function POST(req: NextRequest) {
  if (!(await checkPermission('configuracoes:update'))) return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return NextResponse.json({ ok: false, error: 'Tenant não resolvido.' }, { status: 400 })
  const body = await req.json().catch(() => ({})) as { categoria?: string; pasta?: string }
  const categoria: CategoriaPlanilha = body.categoria === 'jurisclub' ? 'jurisclub' : body.categoria === 'modelo_caderno' ? 'modelo_caderno' : 'conteudo'
  const pastaId = typeof body.pasta === 'string' && UUID_RE.test(body.pasta) ? body.pasta : null

  const esc = await carregarEscopo(createAdminClient(), tenantId, categoria, pastaId)
  if ('erro' in esc) return NextResponse.json({ ok: false, error: esc.erro }, { status: 400 })
  const fila = esc.docs.filter((d) => d.tipo_origem === 'docx' || d.tipo_origem === 'html' || d.tipo_origem === 'pdf')

  const inicio = Date.now()
  let prontos = 0, falhas = 0, i = 0
  const falhou: string[] = []
  const worker = async () => {
    while (i < fila.length && Date.now() - inicio < ORCAMENTO_MS) {
      const d = fila[i++]
      const url = await gerarPdfDocumento(tenantId, d.id).catch(() => null)
      if (url) prontos++; else { falhas++; falhou.push(d.titulo) }
    }
  }
  await Promise.all(Array.from({ length: CONCORRENCIA }, worker))
  return NextResponse.json({ ok: true, total: fila.length, prontos, falhas, restantes: Math.max(0, fila.length - i), falhou: falhou.slice(0, 20) })
}
