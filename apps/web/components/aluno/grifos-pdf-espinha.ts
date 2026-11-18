// Cliente: espinha de TEXTO do PDF aberto (pdf.js) + chamadas de persistência da âncora. O vínculo do grifo é com o
// TEXTO (lib/conteudo/pdf-texto-ancora.ts); rects são cache. Nada aqui apaga grifo.
import { espinhaDoPdf, ancoraDeRectsETexto, ancoraDeTexto, hashAncora, metadadosDoTrecho, type Espinha, type AncoraTexto } from '@/lib/conteudo/pdf-texto-ancora'
import { extrairPaginasPdf } from '@/lib/conteudo/pdf-texto-extrair'

/** Monta a espinha a partir de um PDFDocumentProxy (reaproveita o doc já aberto pelo leitor). */
export async function espinhaDoDocumento(pdf: any): Promise<Espinha> {
  return espinhaDoPdf(await extrairPaginasPdf(pdf))
}

/** Âncora + identidade (hash) + metadados semânticos (rótulo/contexto/tipo) p/ a API. `e` opcional: sem espinha, só a âncora. */
export const ancoraParaApi = (a: AncoraTexto, e?: Espinha | null) => {
  const meta = e ? metadadosDoTrecho(e, a.char_inicio, a.char_fim) : null
  return { exact: a.exact, prefix: a.prefix, suffix: a.suffix, char_inicio: a.char_inicio, char_fim: a.char_fim, ancora_hash: hashAncora(a), ...(meta ?? {}) }
}

/** Âncora de um grifo (rects + texto) NA ESPINHA ATUAL: geometria primeiro (a posição é prova); senão texto único na página gravada. */
export function ancoraDoGrifo(e: Espinha, g: { pagina: number; rects: { x0: number; y0: number; x1: number; y1: number }[]; texto: string | null }): AncoraTexto | null {
  const geo = ancoraDeRectsETexto(e, g.pagina, g.rects, g.texto)
  if (geo?.confere) return geo.ancora
  if (g.texto) { const t = ancoraDeTexto(e, g.texto, g.pagina); if (t) return t.ancora }
  return null
}

/** PATCH idempotente (só grava se o grifo ainda não tem âncora). Best-effort. */
export async function gravarAncora(id: string, a: AncoraTexto, e?: Espinha | null): Promise<boolean> {
  try {
    const r = await fetch('/api/conteudo/grifo-pdf', { method: 'PATCH', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ id, ancora: ancoraParaApi(a, e) }) })
    const j = await r.json().catch(() => ({} as any))
    return r.ok && j?.aplicado !== false // aplicado:false = migração pendente (coluna ausente) → tenta de novo na próxima abertura
  } catch { return false }
}

/** PATCH da re-ancoragem (rects/página recalculados pelo TEXTO numa versão nova). Atualiza o cache de desenho; nunca apaga. */
export async function gravarReancoragem(id: string, pagina: number, rects: unknown[], a: AncoraTexto, e?: Espinha | null): Promise<boolean> {
  try {
    const r = await fetch('/api/conteudo/grifo-pdf', { method: 'PATCH', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ id, ancora: ancoraParaApi(a, e), reancorar: { pagina, rects } }) })
    return r.ok
  } catch { return false }
}
