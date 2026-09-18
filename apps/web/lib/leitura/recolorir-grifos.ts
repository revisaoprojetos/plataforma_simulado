// Recolorir/ocultar os grifos do conteúdo. Os grifos são cores INLINE (background/color) vindas do Word,
// não classes semânticas — então classificamos cada cor por MATIZ (HSL) para inferir o tipo (Núcleo/
// Complemento/Prazos nos FUNDOS; exceção/STF/STJ nas CORES DE TEXTO) e reaplicamos a cor configurada
// pelo admin. Guarda o `style` original em data-grifo-orig para reclassificar de forma estável.
import type { GrifoCores } from './trilha-aparencia'

function toRgb(c: string): [number, number, number] | null {
  const s = (c || '').trim().toLowerCase()
  if (!s || s === 'transparent' || s === 'inherit') return null
  let m = s.match(/^#([0-9a-f]{3})$/)
  if (m) { const h = m[1]; return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)] }
  m = s.match(/^#([0-9a-f]{6})$/)
  if (m) { const h = m[1]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] }
  m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  if (m) return [+m[1], +m[2], +m[3]]
  return null
}
function hsl(rgb: [number, number, number]): [number, number, number] {
  const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360 }
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return [h, s * 100, l * 100]
}

export type TipoBg = 'nucleo' | 'complemento' | 'prazo'
export type TipoTxt = 'excecao' | 'stf' | 'stj'

export function tipoFundo(c: string): TipoBg | null {
  const rgb = toRgb(c); if (!rgb) return null
  const [h, s, l] = hsl(rgb)
  if (s < 12 || l > 96 || l < 10) return null // cinza/branco/preto: não é realce
  if (h >= 35 && h < 75) return 'nucleo'       // amarelo
  if (h >= 75 && h < 175) return 'complemento' // verde
  if (h >= 235 && h < 320) return 'prazo'      // roxo/violeta
  return null
}
export function tipoTexto(c: string): TipoTxt | null {
  const rgb = toRgb(c); if (!rgb) return null
  const [h, s, l] = hsl(rgb)
  if (s < 25 || l > 82) return null            // texto quase-preto/cinza/claro: normal
  if (h < 20 || h >= 335) return 'excecao'     // vermelho
  if (h >= 190 && h < 260) return 'stf'        // azul
  if (h >= 28 && h < 55) return 'stj'          // dourado/marrom
  return null
}

/** Reaplica as cores dos grifos (por matiz) e/ou OCULTA. Idempotente e estável (reclassifica do original). */
export function aplicarGrifos(cont: HTMLElement | null, opts: { ocultar: boolean; cores: GrifoCores }): void {
  if (!cont) return
  const els = cont.querySelectorAll<HTMLElement>('[style]')
  els.forEach((el) => {
    if (el.dataset.grifoOrig == null) {
      const tBg = tipoFundo(el.style.backgroundColor || ''), tCol = tipoTexto(el.style.color || '')
      if (!tBg && !tCol) return
      el.dataset.grifoOrig = el.getAttribute('style') || ''
    }
    el.setAttribute('style', el.dataset.grifoOrig) // base estável p/ reclassificar
    const oBg = tipoFundo(el.style.backgroundColor || ''), oCol = tipoTexto(el.style.color || '')
    if (opts.ocultar) {
      if (oBg) { el.style.setProperty('background', 'transparent', 'important'); el.style.setProperty('background-color', 'transparent', 'important') }
      if (oCol) el.style.setProperty('color', 'inherit', 'important')
    } else {
      if (oBg) el.style.setProperty('background-color', opts.cores[oBg], 'important')
      if (oCol) el.style.setProperty('color', opts.cores[oCol], 'important')
    }
  })
}
