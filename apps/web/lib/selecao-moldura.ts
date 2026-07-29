/** Classe de canto da logo no card do seletor de plataforma (compartilhada entre a
 *  prévia da config e os seletores reais: login + modais de trocar plataforma). */
export function molduraSelecao(estilo?: string | null): string {
  if (estilo === 'quadrada') return 'rounded-md'
  if (estilo === 'arredondada') return 'rounded-xl'
  return 'rounded-full'
}
