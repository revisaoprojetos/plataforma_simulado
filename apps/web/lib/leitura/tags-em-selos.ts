import 'server-only'
import { remember } from '@/lib/cache/relatorio-cache'
import { carregarTagsBiblioteca, mapaTagsBiblioteca } from './biblioteca-tags'
import { htmlDoMarcador } from './sanitize'

// Leitura do aluno: converte os marcadores de texto `<nome>` / `<nome sm|ic>` (ex.: <repercussão geral>) na IMAGEM
// do selo cadastrado na Biblioteca de tags do tenant. Alternativa para documentos que não foram montados com o
// plugin "Selos" no editor (onde a imagem já vem no .docx). Só troca o que existe na Biblioteca; o resto fica
// como texto. Ligada/desligada em Admin › Cronogramas › Metas & inteligência › Jurisprudência (jurisTagsImagem).
const IMG_BASE = '/leitura/selos'

/** `<span data-selo="slug" [data-selo-sm|ic]>` (selo padrão) → `<img>` do PNG oficial; tag com imagem própria passa direto. */
function seloParaImg(html: string): string {
  return html.replace(/<span data-selo="([a-z0-9-]+)"([^>]*)><\/span>/gi, (_m, slug: string, attrs: string) => {
    const suf = /data-selo-ic/.test(attrs) ? '-ic' : /data-selo-sm/.test(attrs) ? '-sm' : ''
    return `<img src="${IMG_BASE}/${slug}${suf}.png" alt="${slug}" class="sl-img" style="height:1.5em;vertical-align:middle;display:inline-block" />`
  })
}

export async function converterTagsEmSelos(html: string, tenantId: string): Promise<string> {
  if (!html || !html.includes('&lt;')) return html
  const mapa = await remember<Record<string, string>>(`leitura-tags-selos:${tenantId}`, 60, async () => mapaTagsBiblioteca(await carregarTagsBiblioteca(tenantId)))
  if (!mapa || !Object.keys(mapa).length) return html
  const partes = html.split(/(<[^>]+>)/)
  let dentroStyle = false
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i]
    if (i % 2 === 1) { if (/^<(style|script)\b/i.test(p)) dentroStyle = true; else if (/^<\/(style|script)/i.test(p)) dentroStyle = false; continue }
    if (dentroStyle || !p.includes('&lt;')) continue
    partes[i] = p.replace(/&lt;([^<>&]{1,60}?)&gt;/g, (m, miolo: string) => {
      const h = htmlDoMarcador(miolo, mapa)
      return h ? seloParaImg(h) : m
    })
  }
  return partes.join('')
}
