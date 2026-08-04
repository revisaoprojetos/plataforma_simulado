import { NextRequest, NextResponse } from 'next/server'
import { existsSync } from 'node:fs'
import { createAdminClient } from '@/lib/supabase/server'
import { assinarRenderToken } from '@/lib/pdf/render-token'
import puppeteer from 'puppeteer-core'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Mesma base que o navegador headless usa para buscar a página /imprimir (mesmo host do web).
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
 * GET /api/aluno/caderno-questoes?token={embed_token}
 *
 * "Caderno de questões (sem respostas)" gerado a partir do caderno já feito na área de Cadernos —
 * usado como FALLBACK quando o simulado NÃO tem o PDF "Enunciado de Questões" importado. Funciona
 * ANTES de iniciar (sem sessão): autoriza pelo embed_token do simulado (mesma credencial de acesso
 * à prova) e renderiza a modalidade `caderno_perguntas` com `semgab=1` (só as questões, sem gabarito).
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
  // Respeita a liberação: admin pode bloquear o caderno de questões (enunciado_liberado === false).
  if (regras.enunciado_liberado === false) return NextResponse.json({ message: 'Indisponível.' }, { status: 403 })

  // Caderno do simulado: regras.caderno_id → banco_base_id → banco.caderno_id.
  let cadernoId: string | null = regras.caderno_id ?? null
  if (!cadernoId && regras.banco_base_id) {
    const { data: banco } = await svc.from('simulado_pastas').select('caderno_id').eq('id', regras.banco_base_id).maybeSingle()
    cadernoId = (banco as any)?.caderno_id ?? null
  }
  if (!cadernoId) return NextResponse.json({ message: 'Este simulado não tem caderno de questões.' }, { status: 404 })

  const exec = acharNavegador()
  if (!exec) return NextResponse.json({ message: 'Nenhum navegador (Edge/Chrome) encontrado para gerar o PDF.' }, { status: 503 })

  // Token de render assinado (server-side, nunca exposto) → autoriza a página /imprimir sem cookie.
  let pdftoken: string
  try {
    pdftoken = assinarRenderToken({ t: (sim as any).tenant_id, r: 'caderno', id: cadernoId })
  } catch {
    return NextResponse.json({ message: 'Geração de PDF indisponível (segredo não configurado).' }, { status: 503 })
  }

  const qs = new URLSearchParams({ mod: 'caderno_perguntas', semgab: '1', rawimg: '1', pdftoken })
  const url = `${WEB_INTERNAL}/imprimir/caderno/${cadernoId}?${qs.toString()}`
  const nomeArquivo = `Caderno de questoes - ${((sim as any).titulo || 'simulado')}`.replace(/[\\/:*?"<>|]+/g, '').slice(0, 120)

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
  try {
    browser = await puppeteer.launch({ executablePath: exec, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    await page.setCacheEnabled(false)
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    // Espera a paginação terminar (nenhum `.caderno-medindo`) e existirem folhas com conteúdo.
    await page.waitForFunction(
      () => {
        const medindo = document.querySelectorAll('.caderno-medindo').length
        const folhas = document.querySelectorAll('.folha-cont')
        return medindo === 0 && folhas.length > 0 && Array.from(folhas).some((f) => (f.textContent || '').trim().length > 0)
      },
      { timeout: 25_000 },
    ).catch(() => {})
    // Garante fontes + imagens (conteúdo e fundo) pintadas antes de capturar.
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
    await new Promise((r) => setTimeout(r, 200))
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
