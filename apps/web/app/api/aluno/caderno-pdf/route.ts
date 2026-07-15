import { NextRequest, NextResponse } from 'next/server'
import { existsSync } from 'node:fs'
import { createAdminClient } from '@/lib/supabase/server'
import puppeteer from 'puppeteer-core'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Base que o navegador headless (rodando no MESMO host do web) usa para buscar a página.
// NÃO usar WEB_INTERNAL_URL (é o endereço do host visto de dentro do Docker, p/ o Gotenberg).
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

// GET /api/aluno/caderno-pdf?caderno={id}&sessao={sessaoId}&mod={mod}&aluno={estId}&nome={arquivo}
// Gera o PDF do caderno "como você fez" (sem gabarito) e devolve como download (attachment).
// Autorizado pelo id da sessão (mesma credencial de /imprimir/resultado e /imprimir/caderno).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const cadernoId = searchParams.get('caderno')
  const sessao = searchParams.get('sessao')
  const mod = searchParams.get('mod') || 'caderno_completo'
  const aluno = searchParams.get('aluno') || ''
  const nomeArquivo = (searchParams.get('nome') || 'caderno').replace(/[\\/:*?"<>|]+/g, '').slice(0, 120)
  if (!cadernoId || !sessao) return NextResponse.json({ message: 'Parâmetros ausentes.' }, { status: 400 })

  // Valida a sessão (credencial do aluno).
  const svc = createAdminClient()
  const { data: sess } = await svc.from('simulado_sessoes_prova').select('id, tenant_id').eq('id', sessao).maybeSingle()
  if (!sess) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })

  const exec = acharNavegador()
  if (!exec) return NextResponse.json({ message: 'Nenhum navegador (Edge/Chrome) encontrado para gerar o PDF.' }, { status: 503 })

  // URL interna da página de impressão (acesso pelo ?sessao, sem cookie). Sem print=1
  // (quem imprime é o Puppeteer). semgab=1 = sem gabarito.
  const qs = new URLSearchParams({ mod, sessao, semgab: '1', rawimg: '1' })
  if (aluno) qs.set('aluno', aluno)
  const url = `${WEB_INTERNAL}/imprimir/caderno/${cadernoId}?${qs.toString()}`

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
  try {
    browser = await puppeteer.launch({ executablePath: exec, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    await page.setCacheEnabled(false)
    // Viewport A4 (px @96dpi) para o layout nascer no tamanho certo.
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 })
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 })
    // Espera o paginador (cliente) medir e montar as folhas de conteúdo com as questões.
    await page.waitForFunction(
      () => {
        const fs = document.querySelectorAll('.folha-cont')
        return fs.length > 0 && Array.from(fs).some((f) => (f.textContent || '').trim().length > 0)
      },
      { timeout: 12_000 },
    ).catch(() => {})
    await new Promise((r) => setTimeout(r, 500))
    await page.emulateMediaType('print')
    // preferCSSPageSize: respeita o `@page { size: A4; margin: 0 }` do CSS (senão o Chrome
    // reescala e quebra os cards). printBackground: mantém os fundos.
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
