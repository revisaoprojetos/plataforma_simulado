// Formatação inline leve para os textos do caderno de teste (prévia + download HTML/Word).
// Sintaxe: **negrito**, *itálico* ou _itálico_, <u>sublinhado</u>. Escapa HTML antes de aplicar,
// então só as marcações reconhecidas viram tags (nada de injeção).

const escHtml = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Marcação inline (negrito/itálico/sublinhado) SEM converter quebras de linha. */
function inlineSemBr(texto: string): string {
  let h = escHtml(texto)
  h = h.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/gi, '<u>$1</u>') // <u>…</u>
  h = h.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')     // **negrito**
  h = h.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>') // *itálico*
  h = h.replace(/(^|[^\w_])_([^_\n]+?)_(?![\w_])/g, '$1<em>$2</em>') // _itálico_
  return h
}

/** Converte o texto (com as marcações) em HTML seguro. Quebras de linha viram <br>. */
export function formatarInline(texto: string): string {
  return inlineSemBr(texto).replace(/\n/g, '<br>')
}

/**
 * Como formatarInline, mas quando uma LINHA começa com `>` ou `>>` o marcador ganha cor
 * (padronização dos tópicos): `>>` = corForte, `>` = corNormal. O resto formata inline normal.
 */
export function formatarMarcadores(texto: string, corNormal = '#3b5bdb', corForte = '#e8850c'): string {
  return String(texto ?? '').split('\n').map((linha) => {
    let m: RegExpMatchArray | null
    if ((m = linha.match(/^(\s*)>>\s?([\s\S]*)$/))) return `${m[1]}<span style="color:${corForte};font-weight:700">&gt;&gt;</span> ${inlineSemBr(m[2])}`
    if ((m = linha.match(/^(\s*)>\s?([\s\S]*)$/))) return `${m[1]}<span style="color:${corNormal};font-weight:700">&gt;</span> ${inlineSemBr(m[2])}`
    return inlineSemBr(linha)
  }).join('<br>')
}
