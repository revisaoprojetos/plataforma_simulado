import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { htmlParaDiagnostico, pdfParaHtml } from '@/lib/caderno-teste/importar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Importa um caderno (Diagnóstico) para a área de teste, mapeando-o em DiagConteudo.
 * - .docx  → mammoth → HTML → parser
 * - .html  → parser direto
 * - .pdf   → pdfjs extrai o texto (aproximado — colunas embaralham) → parser. Use Word/HTML p/ fidelidade.
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
  let ehPdf = false
  const avisosFonte: string[] = []
  try {
    if (nome.endsWith('.docx') || (buf[0] === 0x50 && buf[1] === 0x4b && !nome.endsWith('.pdf'))) {
      const mammoth = (await import('mammoth')).default ?? (await import('mammoth'))
      // styleMap preserva sublinhado/tachado; negrito/itálico/headings já são convertidos por padrão.
      const res = await (mammoth as any).convertToHtml({ buffer: buf }, { styleMap: ['u => u', 'strike => s', "p[style-name='Heading 1'] => h1", "p[style-name='Heading 2'] => h2", "p[style-name='Heading 3'] => h3", "p[style-name='Título 1'] => h1", "p[style-name='Título 2'] => h2"] })
      html = res.value
      const erros = ((res.messages ?? []) as any[]).filter((m) => m?.type === 'error').map((m) => String(m.message))
      if (erros.length) avisosFonte.push(`Word: ${erros.slice(0, 3).join('; ')}`)
    } else if (nome.endsWith('.pdf') || buf.subarray(0, 4).toString('latin1') === '%PDF') {
      ehPdf = true
      html = await pdfParaHtml(buf)
    } else if (nome.endsWith('.html') || nome.endsWith('.htm') || /^\s*<(!doctype|html)/i.test(buf.subarray(0, 200).toString('utf8'))) {
      html = buf.toString('utf8')
    } else {
      return NextResponse.json({ ok: false, error: 'Formato não suportado. Envie .docx, .pdf ou .html.' }, { status: 415 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'Falha ao ler o arquivo.' }, { status: 500 })
  }

  const { conteudo, avisos } = htmlParaDiagnostico(html)
  avisos.unshift(...avisosFonte)
  if (ehPdf) avisos.unshift('Importado de PDF (aproximado) — os pilares em colunas podem embaralhar. Para fidelidade, use Word/HTML.')
  return NextResponse.json({ ok: true, modalidade: 'diagnostico', conteudo, avisos })
}
