import { NextRequest, NextResponse } from 'next/server'
import { existsSync } from 'node:fs'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarRelatorioEvento } from '@/lib/relatorio-eventos'
import puppeteer from 'puppeteer-core'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Base que o navegador headless (mesmo host do web) usa p/ buscar a página. NÃO usar WEB_INTERNAL_URL
// (endereço do host visto de dentro do Docker, p/ o Gotenberg).
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

// GET /api/aluno/caderno-teste-pdf?caderno={id}&grupo={itemId}&sessao={sessaoId}&gabarito=1&nome={arquivo}
// Gera o PDF de UM item do caderno V2 (folha "como fez"/correção, diagnóstico, caderno de questões) e
// devolve como download. Autorizado pelo id da sessão (a rota /imprimir/caderno-teste força o aluno=dono).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const cadernoId = searchParams.get('caderno')
  const grupo = searchParams.get('grupo') || ''
  const sessao = searchParams.get('sessao')
  const comGabarito = searchParams.get('gabarito') === '1' // versão "com correção"
  const nomeArquivo = (searchParams.get('nome') || 'caderno').replace(/[\\/:*?"<>|]+/g, '').slice(0, 120)
  if (!cadernoId || !sessao) return NextResponse.json({ message: 'Parâmetros ausentes.' }, { status: 400 })

  // Valida a sessão (credencial do aluno) + escopa ao tenant dela.
  const svc = createAdminClient()
  const { data: sess } = await svc.from('simulado_sessoes_prova').select('id, tenant_id, simulado_id, estudante_id').eq('id', sessao).maybeSingle()
  if (!sess) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })

  // Auditoria: o aluno baixou o caderno (PDF). Best-effort.
  if ((sess as any).tenant_id) {
    await registrarRelatorioEvento(svc, {
      tenantId: (sess as any).tenant_id,
      simuladoId: (sess as any).simulado_id,
      estudanteId: (sess as any).estudante_id,
      sessaoId: (sess as any).id,
      tipo: 'baixou',
    })
  }

  const exec = acharNavegador()
  if (!exec) return NextResponse.json({ message: 'Nenhum navegador (Edge/Chrome) encontrado para gerar o PDF.' }, { status: 503 })

  // URL interna da página de impressão (acesso pelo ?sessao, sem cookie). embed=1 esconde os controles.
  // gabarito → deixa o gabarito liberado (default); senão semgab=1 (só as marcações do aluno — "como fez").
  const qs = new URLSearchParams(comGabarito ? { grupo, sessao, embed: '1' } : { grupo, sessao, semgab: '1', embed: '1' })
  const url = `${WEB_INTERNAL}/imprimir/caderno-teste/${cadernoId}?${qs.toString()}`

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
  try {
    browser = await puppeteer.launch({ executablePath: exec, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    await page.setCacheEnabled(false)
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    // Espera a paginação do V2 terminar (o container ganha `.caderno-pronto` quando `paginas != null`)
    // e ter conteúdo — assim capturamos com as folhas já distribuídas.
    await page.waitForFunction(
      () => {
        const pronto = document.querySelector('.caderno-pronto')
        return !!pronto && (pronto.textContent || '').trim().length > 0
      },
      { timeout: 25_000 },
    ).catch(() => {})
    // Garante fontes + imagens de CONTEÚDO e de FUNDO (letterhead <img>) realmente pintadas.
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
