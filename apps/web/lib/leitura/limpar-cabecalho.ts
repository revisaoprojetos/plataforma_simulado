// Remove DOCTYPE / declaração XML "vazada" no INÍCIO do HTML salvo — nas formas escapada (&lt;)
// e crua (<) — que aparecia como texto literal "<!DOCTYPE html>" no começo da leitura. É defensivo
// para conteúdo antigo, salvo antes do strip no sanitizador; idempotente e barato (só o começo).
export function limparCabecalhoHtml(html: string): string {
  return (html ?? '')
    .replace(/^\s*(?:&lt;\?xml\b[^&]*\?&gt;|<\?xml\b[^>]*\?>)\s*/i, '')
    .replace(/^\s*(?:&lt;!DOCTYPE\b[^&]*&gt;|<!DOCTYPE\b[^>]*>)\s*/i, '')
    .replace(/^\s+/, '')
}
