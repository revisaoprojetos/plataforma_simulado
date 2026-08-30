import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { htmlParaDiagnostico, pdfParaHtml, caixasDeTextoDocx } from '@/lib/caderno-teste/importar'
import { validateFile, PRESETS } from '@/lib/storage/validate'

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

  // Validação server-side central (magic bytes + tamanho + anti-spoof — ponto S3). HTML não tem assinatura.
  const ehDocx = nome.endsWith('.docx') || (buf[0] === 0x50 && buf[1] === 0x4b && !nome.endsWith('.pdf'))
  const ehPdfArq = nome.endsWith('.pdf') || buf.subarray(0, 4).toString('latin1') === '%PDF'
  if (ehDocx) { const v = validateFile(buf, 'application/zip', PRESETS.docx); if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 }) }
  else if (ehPdfArq) { const v = validateFile(buf, 'application/pdf', PRESETS.documento); if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 }) }

  let html = ''
  let ehPdf = false
  let caixas: string[] = [] // textos em caixas de texto do .docx (mammoth ignora)
  const avisosFonte: string[] = []
  try {
    if (nome.endsWith('.docx') || (buf[0] === 0x50 && buf[1] === 0x4b && !nome.endsWith('.pdf'))) {
      const mammoth = (await import('mammoth')).default ?? (await import('mammoth'))
      // styleMap preserva sublinhado/tachado; negrito/itálico/headings já são convertidos por padrão.
      const res = await (mammoth as any).convertToHtml({ buffer: buf }, { styleMap: ['u => u', 'strike => s', "p[style-name='Heading 1'] => h1", "p[style-name='Heading 2'] => h2", "p[style-name='Heading 3'] => h3", "p[style-name='Título 1'] => h1", "p[style-name='Título 2'] => h2"] })
      html = res.value
      try { caixas = caixasDeTextoDocx(buf) } catch { /* sem caixas */ }
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

  // Config embutida (CTV3:base64) do .docx gerado por nós.
  let embutido: any = null
  const mCfg = html.match(/CTV3:([A-Za-z0-9+/=]{16,})/)
  if (mCfg) { try { embutido = JSON.parse(Buffer.from(mCfg[1], 'base64').toString('utf8')) } catch { /* ignora */ } html = html.replace(mCfg[0], '') }

  // ROUND-TRIP EXATO: se o documento foi gerado por nós (config embutida com o item completo),
  // restaura o ITEM verbatim — SEM heurística de texto. Idêntico ao original (é o JSON do próprio item).
  if (embutido && typeof embutido === 'object' && embutido.conteudo && typeof embutido.conteudo === 'object') {
    return NextResponse.json({
      ok: true,
      fiel: true,
      modalidade: typeof embutido.modalidade === 'string' ? embutido.modalidade : 'diagnostico',
      item: embutido,                 // ItemCaderno completo (conteudo + ajustes + capa + docEdit + modelo)
      conteudo: embutido.conteudo,    // compat com consumidores antigos
      ajustes: embutido.ajustes,
      capa: embutido.capa,
      avisos: ['Documento restaurado da configuração embutida — idêntico ao original.'],
    })
  }

  // Documento EXTERNO (sem config embutida): reconstrução heurística do texto.
  const { conteudo, avisos } = htmlParaDiagnostico(html, caixas)
  avisos.unshift(...avisosFonte)
  if (ehPdf) avisos.unshift('Importado de PDF (aproximado) — os pilares em colunas podem embaralhar. Para fidelidade, use Word/HTML.')
  return NextResponse.json({ ok: true, modalidade: 'diagnostico', conteudo, avisos })
}
