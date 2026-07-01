/**
 * Cliente mínimo do Gotenberg (v8). Converte uma URL ou um HTML em PDF, fora do
 * app — o web só enfileira; aqui o Gotenberg (com Chromium embutido) renderiza.
 *
 * Requer Node 18+ (fetch/FormData/Blob globais).
 */

const GOTENBERG_URL = process.env.GOTENBERG_URL ?? 'http://localhost:3010'

interface PdfOpts {
  paperWidth?: number // polegadas (A4 = 8.27)
  paperHeight?: number // polegadas (A4 = 11.7)
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
  printBackground?: boolean
  waitDelay?: string // ex.: '1s' — espera após o load (fontes/imagens)
}

function aplicarOpts(form: FormData, o: PdfOpts) {
  form.append('paperWidth', String(o.paperWidth ?? 8.27))
  form.append('paperHeight', String(o.paperHeight ?? 11.7))
  form.append('marginTop', String(o.marginTop ?? 0.4))
  form.append('marginBottom', String(o.marginBottom ?? 0.4))
  form.append('marginLeft', String(o.marginLeft ?? 0.4))
  form.append('marginRight', String(o.marginRight ?? 0.4))
  form.append('printBackground', String(o.printBackground ?? true))
  form.append('preferCssPageSize', 'true')
  if (o.waitDelay) form.append('waitDelay', o.waitDelay)
}

async function postForm(rota: string, form: FormData): Promise<Buffer> {
  const res = await fetch(`${GOTENBERG_URL}${rota}`, { method: 'POST', body: form })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Gotenberg ${res.status} em ${rota}: ${txt.slice(0, 300)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** Renderiza uma URL (o Gotenberg busca a página) → PDF. */
export async function urlParaPdf(url: string, opts: PdfOpts = {}): Promise<Buffer> {
  const form = new FormData()
  form.append('url', url)
  aplicarOpts(form, { waitDelay: '1s', ...opts })
  return postForm('/forms/chromium/convert/url', form)
}

/** Renderiza um HTML (string) → PDF. O HTML é enviado como index.html. */
export async function htmlParaPdf(html: string, opts: PdfOpts = {}): Promise<Buffer> {
  const form = new FormData()
  form.append('files', new Blob([html], { type: 'text/html' }), 'index.html')
  aplicarOpts(form, opts)
  return postForm('/forms/chromium/convert/html', form)
}
