// HTML legado -> texto puro (sem executar nada). Módulo SEM TipTap/React: pode ser importado por qualquer parte do cliente
// (lista de seções automáticas, cartões) sem puxar o editor para o chunk inicial.
export function htmlParaTexto(html: unknown): string {
  if (typeof html !== 'string') return ''
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim()
}
