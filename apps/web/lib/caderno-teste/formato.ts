// Formatação inline leve para os textos do caderno de teste (prévia + download HTML/Word).
// Sintaxe: **negrito**, *itálico* ou _itálico_, <u>sublinhado</u>. Escapa HTML antes de aplicar,
// então só as marcações reconhecidas viram tags (nada de injeção).

const escHtml = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Converte o texto (com as marcações) em HTML seguro. Quebras de linha viram <br>. */
export function formatarInline(texto: string): string {
  let h = escHtml(texto)
  // <u>...</u> (o usuário digita as tags; após o escape viram &lt;u&gt;)
  h = h.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/gi, '<u>$1</u>')
  // **negrito**
  h = h.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
  // *itálico* ou _itálico_
  h = h.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
  h = h.replace(/(^|[^\w_])_([^_\n]+?)_(?![\w_])/g, '$1<em>$2</em>')
  h = h.replace(/\n/g, '<br>')
  return h
}
