import { NextRequest, NextResponse } from 'next/server'
import { existsSync } from 'node:fs'
import { createAdminClient } from '@/lib/supabase/server'
import { assinarRenderToken } from '@/lib/pdf/render-token'
import { carregarEntregaBanco } from '@/lib/caderno-teste/entrega-aluno'
import puppeteer from 'puppeteer-core'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const WEB_INTERNAL = process.env.CADERNO_PDF_WEB_URL ?? 'http://localhost:3000'

/** Acha um Chromium/Edge instalado (sem baixar nada). */
function acharNavegador(): string | null {
  const candidatos = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.EDGE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean) as string[]
  return candidatos.find((p) => { try { return existsSync(p) } catch { return false } }) ?? null
}

/**
 * GET /api/aluno/caderno-teste-questoes?token={embed_token}
 *
 * Versão V2 (entrega) do "Caderno de questões (sem respostas)" baixado ANTES de iniciar. Autoriza pelo
 * embed_token do simulado (sem sessão). Lê o slot `enunciado` do `caderno_entrega` do banco: se for PDF
 * importado, redireciona ao arquivo; se for item gerado, renderiza a modalidade `caderno_questoes` (só as
 * questões, sem gabarito nem dados do aluno) via pdftoken assinado. Espelha /api/aluno/caderno-questoes (v1).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.json({ message: 'Parâmetro ausente.' }, { status: 400 })

  const svc = createAdminClient()
  const { data: sim } = await svc
    .from('simulado_simulados')
    .select('id, tenant_id, titulo, regras, embed_token')
    .eq('embed_token', token)
    .eq('deletado', false)
    .maybeSingle()
  if (!sim) return NextResponse.json({ message: 'Simulado não encontrado.' }, { status: 404 })

  const regras = ((sim as any).regras ?? {}) as any
  if (regras.enunciado_liberado === false) return NextResponse.json({ message: 'Indisponível.' }, { status: 403 })

  const entrega = await carregarEntregaBanco(svc, (sim as any).tenant_id, regras.banco_base_id)
  const en = entrega?.enunciado
  if (!en || !(en.pdfUrl || (en.cadernoId && en.itemId))) {
    return NextResponse.json({ message: 'Este simulado não tem caderno de questões (V2).' }, { status: 404 })
  }

  // PDF importado → baixa o arquivo direto (com nome amigável).
  if (en.pdfUrl) {
    const arq = (en.pdfNome || 'Caderno de Questões').replace(/\.pdf$/i, '').trim() || 'Caderno de Questões'
    const sep = en.pdfUrl.includes('?') ? '&' : '?'
    return NextResponse.redirect(`${en.pdfUrl}${sep}download=${encodeURIComponent(arq)}.pdf`)
  }

  const exec = acharNavegador()
  if (!exec) return NextResponse.json({ message: 'Nenhum navegador (Edge/Chrome) encontrado para gerar o PDF.' }, { status: 503 })

  // Token de render assinado (server-side) → autoriza /imprimir/caderno-teste sem cookie/sessão.
  let pdftoken: string
  try {
    pdftoken = assinarRenderToken({ t: (sim as any).tenant_id, r: 'caderno-teste', id: en.cadernoId! })
  } catch {
    return NextResponse.json({ message: 'Geração de PDF indisponível (segredo não configurado).' }, { status: 503 })
  }

  const qs = new URLSearchParams({ grupo: en.itemId!, embed: '1', pdftoken })
  const url = `${WEB_INTERNAL}/imprimir/caderno-teste/${en.cadernoId}?${qs.toString()}`
  const nomeArquivo = `Caderno de questoes - ${((sim as any).titulo || 'simulado')}`.replace(/[\\/:*?"<>|]+/g, '').slice(0, 120)

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
  try {
    browser = await puppeteer.launch({ executablePath: exec, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    await page.setCacheEnabled(false)
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    // Espera a paginação do V2 terminar (container ganha `.caderno-pronto`) e ter conteúdo.
    await page.waitForFunction(
      () => {
        const pronto = document.querySelector('.caderno-pronto')
        return !!pronto && (pronto.textContent || '').trim().length > 0
      },
      { timeout: 25_000 },
    ).catch(() => {})
    await page.evaluate(async () => {
      try { await (document as any).fonts?.ready } catch { /* noop */ }
      const bg = new Set<string>()
      document.querySelectorAll('*').forEach((el) => {
        const b = getComputedStyle(el as Element).backgroundImage
        const m = b && b.match(/url\(["']?([^"')]+)["']?\)/)
        if (m && m[1] && !m[1].startsWith('data:')) bg.add(m[1])
      })
      const esperas: Promise<unknown>[] = []
      document.querySelectorAll('img').forEach((img) => {
        const el = img as HTMLImageElement
        if (!el.complete) esperas.push(new Promise((r) => { el.onload = el.onerror = () => r(null) }))
      })
      bg.forEach((u) => esperas.push(new Promise((r) => { const im = new Image(); im.onload = im.onerror = () => r(null); im.src = u })))
      await Promise.all(esperas)
    }).catch(() => {})
    await new Promise((r) => setTimeout(r, 250))
    await page.emulateMediaType('print')
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
    await browser.close()
    browser = null
    return new NextResponse(pdf as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nomeArquivo}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    try { await browser?.close() } catch { /* noop */ }
    return NextResponse.json({ message: 'Falha ao gerar o PDF.', detalhe: (e as Error).message }, { status: 500 })
  }
}
