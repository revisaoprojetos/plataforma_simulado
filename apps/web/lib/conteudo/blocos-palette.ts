// Paleta dos BLOCOS do diagnóstico (plugin OnlyOffice) derivada da MARCA do tenant (white-label).
// Mapeia cor_primaria/secundaria/accent → as cores das faixas/cards/destaques dos blocos. Os DEFAULTS
// são a paleta atual da Revisão (navy + dourado) — então um tenant SEM marca em hex não muda nada.
// Puro (sem IO): o servidor resolve do tema e passa ao editor, que injeta no plugin via localStorage.

export interface PaletaBlocos {
  faixa: string      // fundo das faixas de seção (escuro)
  faixaTexto: string // texto/destaque SOBRE a faixa (dourado na Revisão, verde no VND…)
  destaque: string   // cor principal: títulos, %, bordas dos cards
  primForte: string  // versão escura p/ títulos grandes e textos fortes
  cream: string      // fundo dos cards (claro, nunca branco puro — OnlyOffice descarta branco)
  fita: string       // fita do topo do cabeçalho
  nota: string       // fundo da caixa de nota (X/100)
}

const DEFAULT: PaletaBlocos = { faixa: '#071a3f', faixaTexto: '#f7b500', destaque: '#1a367c', primForte: '#071a3f', cream: '#f8f1d4', fita: '#ffc000', nota: '#f7b500' }

const hex6 = (v?: string): string | null => {
  if (!v) return null
  const s = v.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase()
  return null
}
const toRgb = (h: string) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) })
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')
function mix(a: string, b: string, t: number): string { const x = toRgb(a), y = toRgb(b); return toHex(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t) }
const shade = (h: string, t: number) => mix(h, '#000000', t)
const tint = (h: string, t: number) => mix(h, '#ffffff', t)

/** Deriva a paleta dos blocos a partir do tema do tenant. Suporta OS DOIS formatos de marca:
 *  - `tema.cores` (objeto novo/rico): btn=primária, sidebar/topbar=escura da faixa, accent=destaque;
 *  - `tema.cor_primaria/secundaria/accent` (formato antigo).
 *  Sem primária em hex (#rrggbb) → defaults da Revisão (navy+dourado) = zero regressão. */
export function paletaBlocosDoTema(tema: any): PaletaBlocos {
  const cores = tema && typeof tema.cores === 'object' && tema.cores ? tema.cores : null
  // OVERRIDE exato por tenant: tema.blocos = { faixa, faixaTexto, destaque } (hex). Usado quando a marca
  // quer cores escolhidas à mão (ex.: VND faixa #001B13 / claro #8DDF7E / pct #007746) que não derivam
  // de um único tom. Vale sobre a derivação.
  const ov = tema && typeof tema.blocos === 'object' && tema.blocos ? tema.blocos : null
  const prim = hex6((cores?.btn as string) || tema?.cor_primaria)
  if (!prim && !ov) return DEFAULT
  // PAPÉIS: override exato (tema.blocos) tem prioridade; senão deriva da primária da marca.
  //   faixa = ESCURO, faixaTexto/nota = CLARO, destaque = MÉDIO (pct = primária exata). cream = #EDE6D6.
  const faixa = hex6(ov?.faixa) || (prim ? shade(prim, 0.8) : DEFAULT.faixa)
  const faixaTexto = hex6(ov?.faixaTexto) || (prim ? tint(prim, 0.55) : DEFAULT.faixaTexto)
  const destaque = hex6(ov?.destaque) || prim || DEFAULT.destaque
  return {
    faixa, faixaTexto, destaque,
    primForte: prim ? shade(prim, 0.5) : DEFAULT.primForte,
    cream: hex6(ov?.cream) || '#ede6d6',
    fita: hex6(ov?.fita) || faixaTexto,  // borda do cabeçalho = CLARO (#8DDF7E)
    nota: faixaTexto,
  }
}
