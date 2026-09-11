/**
 * Posição da imagem de capa (object-position) SEM coluna nova: é codificada como um fragmento
 * `#pos=x,y` no próprio `capa_url` (ex.: "data:image/webp;base64,AAAA#pos=50,30"). O fragmento
 * viaja junto com a imagem em qualquer lugar que já use `capa_url` — nada de schema/plumbing extra.
 * Na renderização, `capaComPos` separa a URL base (para o <img src>) do object-position.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

/** Separa `capa_url` na URL base (sem fragmento) + o object-position CSS ("x% y%", default centro). */
export function capaComPos(capa: string | null | undefined): { src: string | null; pos: string } {
  if (!capa) return { src: null, pos: '50% 50%' }
  const i = capa.lastIndexOf('#pos=')
  if (i < 0) return { src: capa, pos: '50% 50%' }
  const m = capa.slice(i + 5).match(/^(\d{1,3}),(\d{1,3})/)
  return { src: capa.slice(0, i), pos: m ? `${m[1]}% ${m[2]}%` : '50% 50%' }
}

/** Posição como par numérico {x,y} (0–100) — para inicializar o controle de arrastar. */
export function posNumerica(capa: string | null | undefined): { x: number; y: number } {
  if (!capa) return { x: 50, y: 50 }
  const i = capa.lastIndexOf('#pos=')
  const m = i >= 0 ? capa.slice(i + 5).match(/^(\d{1,3}),(\d{1,3})/) : null
  return m ? { x: clamp(+m[1]), y: clamp(+m[2]) } : { x: 50, y: 50 }
}

/** Constrói `capa_url` com a posição no fragmento. Centro (50,50) → sem fragmento (limpo). */
export function comPosicao(baseUrl: string, x: number, y: number): string {
  const base = baseUrl.split('#pos=')[0]
  const cx = clamp(x), cy = clamp(y)
  return cx === 50 && cy === 50 ? base : `${base}#pos=${cx},${cy}`
}
