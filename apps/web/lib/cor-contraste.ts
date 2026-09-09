// Contraste automático de texto sobre um fundo colorido (escolhido pelo admin/tenant).
// Identifica a luminância do fundo e devolve a cor de TEXTO que dá pra enxergar — branco em
// fundo escuro, quase-preto em fundo claro. Assim, qualquer cor que o admin selecionar continua
// legível (não precisa acertar a cor do texto na mão).

/** Luminância relativa aproximada (0..255) de uma cor hex (#rgb ou #rrggbb). null se não for hex. */
export function luminancia(hex: string): number | null {
  let h = (hex ?? '').trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((x) => x + x).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return null
  const n = parseInt(h, 16)
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
}

/** True se o fundo é claro (texto escuro fica melhor). */
export function fundoClaro(hex: string): boolean {
  const L = luminancia(hex)
  return L != null && L > 150
}

/** Cor de TEXTO legível sobre `bg`. Fundo claro → escuro; fundo escuro/desconhecido → claro. */
export function textoSobre(bg: string, claro = '#ffffff', escuro = '#0f172a'): string {
  return fundoClaro(bg) ? escuro : claro
}

/** Camada translúcida da cor de texto (para bordas/chips/hover sobre o fundo) — ex.: 15 = 15%. */
export function veuTexto(bg: string, pct = 15): string {
  return `color-mix(in oklab, ${textoSobre(bg)} ${pct}%, transparent)`
}
