import puppeteer from 'puppeteer-core'

// Browser Chromium COMPARTILHADO entre requests de PDF. Subir um Chromium novo a cada PDF custa ~1–2s
// (e CPU); como o acesso é serializado pelo chromium-guard (1 por réplica), dá p/ reusar uma instância.
// Fecha sozinho após OCIOSO (libera memória no VPS). O servidor Next (standalone/Docker) é long-running,
// então este singleton de módulo persiste entre requests.

type Browser = Awaited<ReturnType<typeof puppeteer.launch>>

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
const IDLE_MS = 90_000 // fecha o browser após 90s sem uso

let browserPromise: Promise<Browser> | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null

async function criar(exec: string): Promise<Browser> {
  const b = await puppeteer.launch({ executablePath: exec, headless: true, args: LAUNCH_ARGS })
  b.on('disconnected', () => { browserPromise = null }) // crashou/fechou → próxima request religa
  return b
}

/** Browser reusado (religa se desconectou). Chame `agendarFecharBrowserPdf()` no finally da request. */
export async function obterBrowserPdf(exec: string): Promise<Browser> {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
  if (browserPromise) {
    try {
      const b = await browserPromise
      if (b.connected) return b
    } catch { /* lançamento anterior falhou — religa abaixo */ }
    browserPromise = null
  }
  browserPromise = criar(exec)
  return browserPromise
}

/** Agenda o fechamento do browser ocioso (não deixa Chromium pendurado consumindo memória). */
export function agendarFecharBrowserPdf(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = null
    const p = browserPromise
    browserPromise = null
    void (async () => { try { const b = await p; await b?.close() } catch { /* noop */ } })()
  }, IDLE_MS)
}
