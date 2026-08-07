import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { htmlParaDiagnostico } from '@/lib/caderno-teste/importar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Importa um caderno (Diagnóstico) para a área de teste, mapeando-o em DiagConteudo.
 * - .docx  → mammoth → HTML → parser
 * - .html  → parser direto
 * - .pdf   → recusado: o PDF perde a estrutura em colunas (mapeamento não confiável); use Word/HTML.
 */
export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || access.permissions.includes('questoes:update'))) {
    return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
  }
  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ ok: false, error: 'Envio inválido.' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Nenhum arquivo enviado.' }, { status: 400 })
  const nome = (file.name || '').toLowerCase()
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'Arquivo muito grande (máx. ~25 MB).' }, { status: 400 })
  const buf = Buffer.from(await file.arrayBuffer())
  if (!buf.length) return NextResponse.json({ ok: false, error: 'Arquivo vazio.' }, { status: 400 })

  let html = ''
  try {
    if (nome.endsWith('.docx') || (buf[0] === 0x50 && buf[1] === 0x4b)) {
      const mammoth = (await import('mammoth')).default ?? (await import('mammoth'))
      const res = await (mammoth as any).convertToHtml({ buffer: buf }, { styleMap: ['u => u', 'strike => s'] })
      html = res.value
    } else if (nome.endsWith('.html') || nome.endsWith('.htm') || /^\s*<(!doctype|html)/i.test(buf.subarray(0, 200).toString('utf8'))) {
      html = buf.toString('utf8')
    } else if (nome.endsWith('.pdf') || buf.subarray(0, 4).toString('latin1') === '%PDF') {
      return NextResponse.json({ ok: false, error: 'PDF perde a estrutura em colunas — para mapear com fidelidade, importe o Word (.docx) ou o HTML do diagnóstico.' }, { status: 415 })
    } else {
      return NextResponse.json({ ok: false, error: 'Formato não suportado. Envie .docx ou .html.' }, { status: 415 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'Falha ao ler o arquivo.' }, { status: 500 })
  }

  const { conteudo, avisos } = htmlParaDiagnostico(html)
  return NextResponse.json({ ok: true, modalidade: 'diagnostico', conteudo, avisos })
}
