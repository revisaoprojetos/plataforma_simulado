// Normalização de texto PURA (cliente + servidor) usada para comparar nomes/enunciados: sem HTML, acento, caixa e pontuação.
const ENT: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }
export function plano(s: string | null | undefined): string {
  return (s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => ENT[m] ?? ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
export const semHtml = (s: string | null | undefined) => (s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
