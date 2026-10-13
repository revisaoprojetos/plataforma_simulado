// Adaptação AUTOMÁTICA das cores do conteúdo da leitura para o MODO ESCURO.
//
// O conteúdo vem do Word/editor com cores INLINE pensadas para fundo claro (títulos/tópicos
// coloridos, destaques, caixas peach etc.). No escuro, uma regra CSS achatava tudo para `inherit`
// (cinza claro), o que deixava legível mas APAGAVA a cor. Aqui reconhecemos, por luminância, a cor
// de CADA elemento e geramos uma versão adaptada A PARTIR da própria cor:
//   • texto sobre a folha ESCURA  → clareia mantendo o MATIZ (tópico roxo vira lavanda clara, etc.);
//   • texto claro sobre fundo CLARO (caixa/realce/pílula) → escurece para contrastar.
// Reversível: ao sair do escuro, restaura a cor inline original (guardada em data-adc-c).

type RGB = { r: number; g: number; b: number }

function parse(c: string | null | undefined): RGB | null {
  if (!c) return null
  const s = c.trim().toLowerCase()
  if (!s || s === 'transparent' || s === 'inherit' || s === 'currentcolor') return null
  if (s[0] === '#') {
    let h = s.slice(1)
    if (h.length === 3) h = h.split('').map((x) => x + x).join('')
    if (h.length !== 6) return null
    const n = parseInt(h, 16)
    if (Number.isNaN(n)) return null
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  const m = s.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const p = m[1].split(/[,/\s]+/).filter(Boolean).map((x) => parseFloat(x))
    if (p.length >= 3 && p.every((n, i) => i > 2 || !Number.isNaN(n))) {
      if (p.length >= 4 && p[3] === 0) return null // 100% transparente
      return { r: p[0], g: p[1], b: p[2] }
    }
  }
  return null
}

// Luminância relativa (WCAG), 0 (preto) … 1 (branco).
function lum({ r, g, b }: RGB): number {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function toHsl({ r, g, b }: RGB) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

// Versão CLARA da cor, mantendo o matiz (para texto sobre a folha escura).
function clarear(rgb: RGB): string {
  const { h, s } = toHsl(rgb)
  if (s < 8) return '#e6e6ea' // quase cinza/preto → fg neutro claro (sem matiz forçado)
  const sat = Math.min(Math.max(s, 35), 70) // nem lavado, nem neon
  return `hsl(${Math.round(h)}, ${sat}%, 82%)`
}

const SURF_CLARA = 0.5 // superfície (fundo) considerada clara acima disso
const TXT_ESCURO = 0.5 // texto considerado escuro (precisa clarear) abaixo disso
const TXT_CLARO = 0.5  // texto claro (precisa escurecer sobre fundo claro) acima disso

// Fundo EFETIVO atrás do elemento: primeiro ancestral (inclusive ele) com fundo opaco.
function fundoEfetivo(el: HTMLElement, root: HTMLElement): RGB | null {
  let cur: HTMLElement | null = el
  for (let i = 0; cur && i < 40; i++) {
    const cs = getComputedStyle(cur)
    const bg = parse(cs.backgroundColor)
    if (bg) return bg
    if (cur === root) break
    cur = cur.parentElement
  }
  return null
}

export function adaptarLeituraEscuro(root: HTMLElement | null, escuro: boolean) {
  if (!root || typeof window === 'undefined') return
  // Restaura sempre que NÃO está no escuro.
  if (!escuro) {
    root.querySelectorAll<HTMLElement>('[data-adc]').forEach((el) => {
      const orig = el.getAttribute('data-adc-c')
      if (orig != null) el.style.setProperty('color', orig)
      else el.style.removeProperty('color')
      el.removeAttribute('data-adc'); el.removeAttribute('data-adc-c')
    })
    return
  }
  const els = root.querySelectorAll<HTMLElement>('[style*="color"]')
  els.forEach((el) => {
    // Grifos e marcações (pincel/marcador amarelo) têm tratamento próprio (recolorir-grifos / CSS da
    // .marca-pincel → texto PRETO sobre a marcação); imagens/placeholders e exceção ficam de fora.
    if (el.classList.contains('exc') || el.classList.contains('sl-img') || el.closest('[data-grifo]') || el.closest('.marca-pincel')) return
    // Cor ORIGINAL (do atributo inline — o !important do CSS não altera a string inline).
    const origStr = el.getAttribute('data-adc-c') ?? el.style.color
    const txt = parse(origStr)
    if (!txt) return
    const fundo = fundoEfetivo(el, root)
    const fundoClaro = fundo ? lum(fundo) > SURF_CLARA : false
    const L = lum(txt)
    let nova: string | null = null
    if (fundoClaro) {
      // Sobre fundo CLARO o texto precisa ser escuro. Como o CSS do escuro força `inherit` (claro),
      // reafirmamos: texto claro → #1a1a1a; texto que já era escuro → a PRÓPRIA cor (mantém o matiz).
      nova = L > TXT_CLARO ? '#1a1a1a' : origStr
    } else if (L < TXT_ESCURO) {
      nova = clarear(txt) // texto escuro sobre a folha escura → claro (mantendo o matiz)
    }
    if (!nova) {
      // Se já tínhamos adaptado e agora não precisa (fundo mudou), restaura.
      if (el.hasAttribute('data-adc')) {
        const o = el.getAttribute('data-adc-c') || ''
        el.style.setProperty('color', o)
        el.removeAttribute('data-adc'); el.removeAttribute('data-adc-c')
      }
      return
    }
    if (!el.hasAttribute('data-adc')) {
      el.setAttribute('data-adc', '1')
      el.setAttribute('data-adc-c', el.style.color || '')
    }
    el.style.setProperty('color', nova, 'important')
  })
}
