/**
 * PALETA NOVA (designer unificado) — fonte única das cores de admin + aluno.
 *
 * Puro (sem server-only): usado pelo servidor (rota CSS), pelo Console (preview) e pelos testes.
 *
 * Como funciona (ver memory/paleta-nova-designer-plano.md):
 *  - `tema.paleta_nova = { modo, claro?, escuro? }` no tenant. `modo`: desligada | workspace | todos.
 *  - `gerarCssPaleta()` produz UM css (rota /api/tema/paleta) que, para quem o interruptor libera:
 *      1) sobrescreve os tokens padrão (--background, --primary, --sidebar…) com especificidade maior que o tema legado;
 *      2) define as variáveis `--pn-*` — os componentes usam `var(--pn-x, #legado)`, então SEM o css o legado é idêntico;
 *      3) sobrescreve as rampas do Tailwind (emerald/rose/amber/violet/purple…) → classes `bg-emerald-50` etc. seguem a paleta;
 *      4) recolore cada hex legado do catálogo (`paleta-nova-hexes.json`) → `--pn-<hex6>`.
 */

export type ModoPaleta = 'desligada' | 'workspace' | 'todos'
export type FamiliaMarca = 'purple' | 'blue' | 'green' | 'red'

/** Papéis de cor de UM tema (claro ou escuro). Nomes seguem a planilha do designer. */
export interface CoresPaleta {
  roxo: string        // barra do topo / sidebar / simulador (cor da marca, escura)
  onRoxo: string      // texto sobre o roxo
  dourado: string     // destaques, aba ativa, botão de destaque
  lilas: string       // roxo médio: links, botão primário (seguro p/ texto), foco de marca
  fundo: string       // fundo da página
  cartao: string      // cartões e seções
  fundo2: string      // fundo secundário (cabeçalho de tabela, abas)
  texto: string       // texto principal
  apoio: string       // texto de apoio
  linha: string       // linhas e bordas
  alterado: string    // campo alterado / destaque suave âmbar
  okTexto: string; okFundo: string
  errTexto: string; errFundo: string
  avisoTexto: string; avisoFundo: string
  propTexto: string; propFundo: string
}

export interface PaletaNova {
  modo: ModoPaleta
  familia: FamiliaMarca
  claro: CoresPaleta
  escuro: CoresPaleta
}

/** Paleta da planilha "Paleta_Admin_Cronograma_Adaptativo.xlsx" (Revisão). */
export const PALETA_REVISAO: Omit<PaletaNova, 'modo'> = {
  familia: 'purple',
  claro: {
    roxo: '#2C1654', onRoxo: '#FFFFFF', dourado: '#D9A521', lilas: '#4A2A85',
    fundo: '#F6F4FA', cartao: '#FFFFFF', fundo2: '#EFEBF6', texto: '#1F1830', apoio: '#625A75', linha: '#DED7EA', alterado: '#FBEFC4',
    okTexto: '#1F7A4D', okFundo: '#DCF3E6', errTexto: '#B3261E', errFundo: '#FDE4E2',
    avisoTexto: '#9A6A00', avisoFundo: '#FFF4D6', propTexto: '#5B3FB0', propFundo: '#ECE6FB',
  },
  escuro: {
    roxo: '#2C1654', onRoxo: '#FFFFFF', dourado: '#E8B93A', lilas: '#B89CF0',
    fundo: '#130D1F', cartao: '#1C1530', fundo2: '#251C3D', texto: '#ECE7F6', apoio: '#A79DBD', linha: '#342A4F', alterado: '#3A2F12',
    okTexto: '#5FCF95', okFundo: '#163527', errTexto: '#FF8A80', errFundo: '#3D1716',
    avisoTexto: '#F0C04A', avisoFundo: '#3A2E0E', propTexto: '#C4B0FF', propFundo: '#2E2450',
  },
}

export const ROTULOS_CORES: Record<keyof CoresPaleta, string> = {
  roxo: 'Cor da marca (barra do topo, sidebar)', onRoxo: 'Texto sobre a cor da marca', dourado: 'Destaque (aba ativa, item ativo)',
  lilas: 'Cor de ação (botões, links)', fundo: 'Fundo da página', cartao: 'Cartões e seções', fundo2: 'Fundo secundário (tabelas, abas)',
  texto: 'Texto principal', apoio: 'Texto de apoio', linha: 'Linhas e bordas', alterado: 'Campo alterado',
  okTexto: 'Cadastrado — texto', okFundo: 'Cadastrado — fundo', errTexto: 'Falta/erro — texto', errFundo: 'Falta/erro — fundo',
  avisoTexto: 'Confirmar/exemplo — texto', avisoFundo: 'Confirmar/exemplo — fundo', propTexto: 'Proposta — texto', propFundo: 'Proposta — fundo',
}

// ───────────────────────── cor (sRGB ⇄ OKLCH) ─────────────────────────
type Lch = { L: number; C: number; H: number }
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

export function hexValido(h: unknown): h is string { return typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h.trim()) }
function norm6(h: string): string {
  let x = h.trim().replace('#', '')
  if (x.length === 3) x = x.split('').map((c) => c + c).join('')
  return `#${x.toLowerCase()}`
}
function rgbDe(hex: string): [number, number, number] {
  const x = norm6(hex).slice(1)
  return [parseInt(x.slice(0, 2), 16) / 255, parseInt(x.slice(2, 4), 16) / 255, parseInt(x.slice(4, 6), 16) / 255]
}
export function hexParaLch(hex: string): Lch {
  const [r, g, b] = rgbDe(hex).map(toLin)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.hypot(a, bb)
  let H = (Math.atan2(bb, a) * 180) / Math.PI
  if (H < 0) H += 360
  return { L, C, H }
}
function lchParaRgb({ L, C, H }: Lch): [number, number, number, boolean] {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h), b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  const ok = r >= -0.0005 && r <= 1.0005 && g >= -0.0005 && g <= 1.0005 && bl >= -0.0005 && bl <= 1.0005
  return [fromLin(clamp01(r)), fromLin(clamp01(g)), fromLin(clamp01(bl)), ok]
}
/** LCH → hex, reduzindo o croma até caber no gamut sRGB. */
export function lchParaHex(lch: Lch): string {
  let { L, C } = lch
  L = clamp01(L)
  let lo = 0, hi = Math.max(0, C)
  let [r, g, b, ok] = lchParaRgb({ L, C: hi, H: lch.H })
  if (!ok) {
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; const t = lchParaRgb({ L, C: mid, H: lch.H }); if (t[3]) lo = mid; else hi = mid }
    ;[r, g, b] = lchParaRgb({ L, C: lo, H: lch.H })
  }
  const h2 = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')
  return `#${h2(r)}${h2(g)}${h2(b)}`.toUpperCase()
}
/** Mistura linear em sRGB (pct = % de `a`). */
export function misturar(a: string, pct: number, b: string): string {
  const A = rgbDe(a), B = rgbDe(b), t = pct / 100
  const h2 = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')
  return `#${h2(A[0] * t + B[0] * (1 - t))}${h2(A[1] * t + B[1] * (1 - t))}${h2(A[2] * t + B[2] * (1 - t))}`.toUpperCase()
}
const luminancia = (hex: string) => { const [r, g, b] = rgbDe(hex).map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export function contraste(a: string, b: string): number {
  const x = luminancia(a), y = luminancia(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
/** Texto legível (claro/escuro) sobre `bg`. */
export function textoSobre(bg: string, claro = '#FFFFFF', escuro = '#1F1830'): string {
  return contraste(bg, claro) >= contraste(bg, escuro) ? claro : escuro
}
const alfa = (hex: string, pct: number) => `color-mix(in srgb, ${norm6(hex)} ${pct}%, transparent)`

// ───────────────────────── normalização / persistência ─────────────────────────
const CHAVES = Object.keys(PALETA_REVISAO.claro) as Array<keyof CoresPaleta>

function normCores(raw: unknown, base: CoresPaleta): CoresPaleta {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...base }
  for (const k of CHAVES) if (hexValido(r[k])) out[k] = norm6(r[k] as string).toUpperCase()
  return out
}

export function familiaDoHue(h: number): FamiliaMarca {
  if (h >= 190 && h < 272) return 'blue'
  if (h >= 100 && h < 190) return 'green'
  if (h >= 340 || h < 35) return 'red'
  return 'purple'
}

/** Ajusta a luminosidade de `cor` até ter contraste ≥ `min` sobre `fundo` (mantém matiz/croma). */
function garantirContraste(cor: string, fundo: string, min: number): string {
  if (contraste(cor, fundo) >= min) return norm6(cor).toUpperCase()
  const o = hexParaLch(cor)
  const clarear = luminancia(fundo) < 0.4
  for (let i = 1; i <= 40; i++) {
    const h = lchParaHex({ L: o.L + (clarear ? i : -i) * 0.02, C: o.C, H: o.H })
    if (contraste(h, fundo) >= min) return h
  }
  return clarear ? '#FFFFFF' : '#000000'
}

/** Destaque = 1º candidato do designer legado com contraste ≥ 3 sobre a cor da marca (senão o padrão da planilha). */
function escolherDestaque(cands: Array<string | undefined>, roxo: string, padrao: string): string {
  for (const c of cands) if (hexValido(c) && contraste(norm6(c), roxo) >= 3) return norm6(c).toUpperCase()
  return contraste(padrao, roxo) >= 3 ? padrao : textoSobre(roxo)
}

/** Padrão derivado do designer legado do tenant (`tema.cores` / `cores_dark`) — usado p/ tenants sem paleta própria. */
export function padraoDoDesigner(tema: Record<string, unknown>): Omit<PaletaNova, 'modo'> {
  const c = (tema.cores && typeof tema.cores === 'object' ? tema.cores : null) as Record<string, string> | null
  const d = (tema.cores_dark && typeof tema.cores_dark === 'object' ? tema.cores_dark : null) as Record<string, string> | null
  if (!c || !hexValido(c.sidebar ?? c.btn)) return { familia: PALETA_REVISAO.familia, claro: PALETA_REVISAO.claro, escuro: PALETA_REVISAO.escuro }
  const get = (src: Record<string, string> | null, k: string, fb: string) => (src && hexValido(src[k]) ? norm6(src[k]).toUpperCase() : fb)
  const status = PALETA_REVISAO // status genéricos (verde/vermelho/âmbar/violeta) iguais p/ todas as marcas
  const mk = (src: Record<string, string> | null, claro: boolean): CoresPaleta => {
    const base = claro ? status.claro : status.escuro
    const roxo = get(src, 'sidebar', get(src, 'topbar', base.roxo))
    const lilas = get(src, 'btn', base.lilas)
    const fundo = get(src, 'bg', base.fundo), cartao = get(src, 'card', base.cartao)
    const texto = get(src, 'text', base.texto)
    return {
      ...base,
      roxo, onRoxo: textoSobre(roxo), lilas: garantirContraste(lilas, cartao, 4.5),
      dourado: escolherDestaque([src?.active, src?.accent, src?.icon, src?.btn], roxo, base.dourado),
      fundo, cartao, fundo2: get(src, 'tabBg', misturar(texto, 6, cartao)),
      texto, apoio: misturar(texto, 62, fundo), linha: get(src, 'cborder', misturar(texto, 12, cartao)),
    }
  }
  const claro = mk(c, true), escuro = mk(d ?? c, false)
  return { familia: familiaDoHue(hexParaLch(claro.lilas).H), claro, escuro }
}

/** Lê `tema.paleta_nova` (com padrão do tenant). Nunca lança. */
export function lerPaletaNova(tema: unknown): PaletaNova {
  const t = (tema && typeof tema === 'object' ? tema : {}) as Record<string, unknown>
  const raw = (t.paleta_nova && typeof t.paleta_nova === 'object' ? t.paleta_nova : {}) as Record<string, unknown>
  const modo: ModoPaleta = raw.modo === 'todos' || raw.modo === 'workspace' ? raw.modo : 'desligada'
  // Sem paleta salva: marca roxa (Revisão) usa a paleta da planilha; as demais derivam do próprio designer legado.
  const der = padraoDoDesigner(t)
  const base = !raw.claro && der.familia === 'purple' ? { ...PALETA_REVISAO } : der
  const claro = normCores(raw.claro, base.claro)
  const escuro = normCores(raw.escuro, base.escuro)
  const familia: FamiliaMarca = (['purple', 'blue', 'green', 'red'] as const).includes(raw.familia as FamiliaMarca) ? (raw.familia as FamiliaMarca) : familiaDoHue(hexParaLch(claro.lilas).H)
  return { modo, familia, claro, escuro }
}

/** Valida o que vem do Console antes de gravar em `tema.paleta_nova`. */
export function sanearPaleta(entrada: { modo?: unknown; claro?: unknown; escuro?: unknown; familia?: unknown }, atual: PaletaNova): PaletaNova {
  const modo: ModoPaleta = entrada.modo === 'todos' || entrada.modo === 'workspace' ? entrada.modo : 'desligada'
  const claro = normCores(entrada.claro, atual.claro)
  const escuro = normCores(entrada.escuro, atual.escuro)
  const familia: FamiliaMarca = (['purple', 'blue', 'green', 'red'] as const).includes(entrada.familia as FamiliaMarca) ? (entrada.familia as FamiliaMarca) : familiaDoHue(hexParaLch(claro.lilas).H)
  return { modo, familia, claro, escuro }
}

/** Hash estável (FNV-1a) p/ versionar a URL do css (cache imutável). */
/** Sobe quando a GERAÇÃO do css muda (novas variáveis/catálogo) — invalida o cache imutável do navegador. */
const CSS_VERSAO = 4

export function hashPaleta(p: PaletaNova): string {
  const s = JSON.stringify([CSS_VERSAO, p.familia, p.claro, p.escuro])
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(36)
}

// ───────────────────────── rampas do Tailwind ─────────────────────────
const PASSOS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
const L_PASSO: Record<number, number> = { 50: 0.975, 100: 0.945, 200: 0.9, 300: 0.83, 400: 0.74, 500: 0.65, 600: 0.56, 700: 0.47, 800: 0.4, 900: 0.34, 950: 0.24 }
const C_FATOR: Record<number, number> = { 50: 0.1, 100: 0.2, 200: 0.36, 300: 0.58, 400: 0.78, 500: 0.92, 600: 1, 700: 0.94, 800: 0.82, 900: 0.68, 950: 0.5 }

/** Rampa 50–950 com o matiz/croma do `texto`, fixando 100 e 700 (claro) ou 400 e 950 (escuro) nas cores da planilha. */
export function rampa(texto: string, fundo: string, escuro: boolean): Record<number, string> {
  const t = hexParaLch(texto)
  const cMax = Math.max(0.08, Math.min(0.2, t.C * 1.1))
  const out: Record<number, string> = {}
  for (const p of PASSOS) out[p] = lchParaHex({ L: L_PASSO[p], C: cMax * C_FATOR[p], H: t.H })
  if (escuro) { out[400] = norm6(texto).toUpperCase(); out[950] = norm6(fundo).toUpperCase(); out[900] = misturar(fundo, 80, texto) }
  else { out[700] = norm6(texto).toUpperCase(); out[100] = norm6(fundo).toUpperCase() }
  return out
}

function linhasRampa(nomes: string[], r: Record<number, string>): string[] {
  const out: string[] = []
  for (const n of nomes) for (const p of PASSOS) out.push(`--color-${n}-${p}:${r[p]};`)
  return out
}

// ───────────────────────── recolorização do catálogo de hex legados ─────────────────────────
const FAIXA: Record<FamiliaMarca, [number, number]> = { purple: [272, 340], blue: [190, 272], green: [105, 185], red: [345, 375] }
const noHue = (h: number, [a, b]: [number, number]) => (h >= a && h <= b) || (h + 360 >= a && h + 360 <= b)

/** Cor de marca LEGADA (claro, escuro) de cada família — referência de croma p/ recolorir os hex antigos. */
const REF_MARCA_LEGADA: Record<FamiliaMarca, [string, string]> = {
  purple: ['#5B3FD0', '#B3A1FF'], blue: ['#306AB5', '#7AA8F0'], green: ['#0F7A44', '#3FD58A'], red: ['#640C11', '#C86A6F'],
}
/** Dourado LEGADO do Revisão (usado nos dois temas). */
const REF_OURO_LEGADO = '#F1C232'

/** Recolore um hex LEGADO para a paleta: troca matiz da marca e do dourado preservando luminosidade. */
export function recolorirLegado(hex: string, p: PaletaNova, escuro: boolean): string | null {
  const c = escuro ? p.escuro : p.claro
  const o = hexParaLch(hex)
  if (o.C < 0.006) return null // branco/preto/cinza puro: não muda
  const marca = hexParaLch(c.lilas)
  const ouro = hexParaLch(c.dourado)
  if (noHue(o.H, FAIXA[p.familia])) {
    // marca: matiz da nova cor de ação; croma proporcional (limitado) — neutros tingidos seguem o matiz
    const base = hexParaLch(REF_MARCA_LEGADA[p.familia][escuro ? 1 : 0])
    const k = base.C > 0 ? Math.min(1.15, Math.max(0.6, marca.C / base.C)) : 1
    return lchParaHex({ L: o.L, C: o.C * k, H: marca.H })
  }
  if (o.H >= 55 && o.H <= 110 && o.C > 0.06) {
    const ref = hexParaLch(REF_OURO_LEGADO)
    const dL = (ouro.L - ref.L) * 0.6
    const k = ref.C > 0 ? Math.min(1.15, Math.max(0.6, ouro.C / ref.C)) : 1
    return lchParaHex({ L: o.L + dL, C: o.C * k, H: ouro.H })
  }
  return null
}

// ───────────────────────── geração do CSS ─────────────────────────
function varsPn(c: CoresPaleta, escuro: boolean): Record<string, string> {
  const brand2 = misturar(c.lilas, 75, escuro ? '#FFFFFF' : c.fundo)
  const chip = misturar(c.lilas, escuro ? 18 : 10, c.cartao)
  const sel = misturar(c.lilas, escuro ? 16 : 8, c.cartao)
  const ink = c.texto
  return {
    // ── vocabulário do fluxo do simulado (sim-tokens / interna-tokens) — prefixo s ──
    's-bg': c.fundo, 's-surface': c.cartao, 's-surface2': c.fundo2, 's-ink': ink, 's-muted': c.apoio,
    's-line': c.linha, 's-line2': misturar(c.linha, 60, c.fundo), 's-chip': chip, 's-brand': c.lilas, 's-brand2': brand2,
    's-track': misturar(c.linha, 85, c.fundo2), 's-selBg': sel, 's-selLine': brand2, 's-selDot': c.lilas,
    's-flag': c.dourado, 's-flagBg': alfa(c.dourado, 16), 's-nAns': misturar(c.lilas, escuro ? 22 : 14, c.cartao),
    's-nAnsInk': escuro ? misturar(c.lilas, 70, '#FFFFFF') : c.lilas, 's-peachBg': c.alterado, 's-goldBg': c.alterado,
    's-goldInk': escuro ? c.dourado : c.avisoTexto, 's-fOn': c.dourado, 's-fOnInk': c.roxo,
    's-tBg': c.fundo2, 's-tOn': escuro ? c.roxo : c.onRoxo, 's-tOnInk': escuro ? misturar(c.lilas, 70, '#FFFFFF') : c.lilas,
    's-gDone': c.okFundo, 's-sub': c.apoio, 's-head': ink, 's-gCell': c.fundo2, 's-cyan': c.lilas,
    's-ok': c.okTexto, 's-warn': c.avisoTexto, 's-err': c.errTexto,
    // ── vocabulário do shell Revisão (revisao-nova/tokens.ts) — prefixo r ──
    'r-bg': c.fundo, 'r-surface': c.cartao, 'r-surface2': c.fundo2, 'r-ink': ink, 'r-muted': c.apoio,
    'r-muted2': misturar(c.apoio, 60, c.fundo), 'r-line': c.linha, 'r-line2': misturar(c.linha, 70, c.apoio), 'r-track': misturar(c.linha, 80, c.fundo2),
    'r-brand': c.lilas, 'r-brandLine': alfa(c.lilas, escuro ? 45 : 30), 'r-chip': escuro ? alfa(c.lilas, 20) : chip,
    'r-accentInk': escuro ? c.dourado : c.avisoTexto, 'r-peachBg': c.alterado,
    'r-top': escuro ? alfa(c.roxo, 96) : alfa(c.fundo, 85), 'r-cnt': escuro ? alfa(c.lilas, 22) : chip,
    'r-cntInk': escuro ? misturar(c.lilas, 80, '#FFFFFF') : c.lilas, 'r-fOn': escuro ? c.dourado : c.roxo, 'r-fOnInk': escuro ? c.roxo : c.onRoxo,
    'r-hoverLine': alfa(c.lilas, escuro ? 45 : 35),
    'r-side': escuro
      ? `linear-gradient(180deg,${misturar(c.roxo, 80, '#000000')},${c.roxo})`
      : `linear-gradient(180deg,${c.roxo},${misturar(c.roxo, 80, c.lilas)} 60%,${misturar(c.roxo, 60, c.lilas)})`,
    'r-collapse': escuro ? misturar(c.roxo, 85, c.lilas) : misturar(c.roxo, 78, c.lilas),
    'r-menu-head': `radial-gradient(120% 140% at 100% 0%,${misturar(c.roxo, 55, c.lilas)},${misturar(c.roxo, 85, c.lilas)} 60%,${misturar(c.roxo, 70, '#000000')})`,
    // botão primário e hero da área nova (nova.css): gradientes derivados da cor de ação / da marca
    btn: escuro
      ? `linear-gradient(180deg,${misturar(c.lilas, 60, c.roxo)},${misturar(c.lilas, 45, c.roxo)})`
      : `linear-gradient(180deg,${misturar(c.lilas, 88, '#FFFFFF')},${c.lilas})`,
    hero: escuro
      ? `linear-gradient(120deg,${misturar(c.roxo, 70, '#000000')} 0%,${c.roxo} 55%,${misturar(c.roxo, 80, c.lilas)} 100%)`
      : `linear-gradient(120deg,${c.roxo} 0%,${misturar(c.roxo, 80, c.lilas)} 55%,${misturar(c.roxo, 60, c.lilas)} 100%)`,
    // ── papéis diretos (uso livre pelos componentes) ──
    roxo: c.roxo, 'on-roxo': c.onRoxo, dourado: c.dourado, 'dourado-ink': textoSobre(c.dourado, '#FFFFFF', c.roxo), lilas: c.lilas,
    fundo: c.fundo, cartao: c.cartao, fundo2: c.fundo2, texto: c.texto, apoio: c.apoio, linha: c.linha, alterado: c.alterado,
    ok: c.okTexto, 'ok-bg': c.okFundo, err: c.errTexto, 'err-bg': c.errFundo, warn: c.avisoTexto, 'warn-bg': c.avisoFundo, prop: c.propTexto, 'prop-bg': c.propFundo,
  }
}

function tokensPadrao(c: CoresPaleta, escuro: boolean): string[] {
  const primFg = textoSobre(c.lilas, '#FFFFFF', escuro ? c.cartao : c.texto)
  const sideBorda = misturar(c.onRoxo, 14, c.roxo)
  return [
    `--background:${c.fundo};`, `--foreground:${c.texto};`,
    `--card:${c.cartao};`, `--card-foreground:${c.texto};`, `--popover:${c.cartao};`, `--popover-foreground:${c.texto};`,
    `--secondary:${c.fundo2};`, `--secondary-foreground:${c.texto};`, `--muted:${c.fundo2};`, `--muted-foreground:${c.apoio};`,
    `--accent:${misturar(c.lilas, escuro ? 18 : 10, c.cartao)};`, `--accent-foreground:${c.texto};`,
    `--border:${c.linha};`, `--input:${c.linha};`, `--input-bg:${c.cartao};`, `--ring:${c.dourado};`,
    `--primary:${c.lilas};`, `--primary-foreground:${primFg};`,
    `--destructive:${c.errTexto};`, `--destructive-foreground:${textoSobre(c.errTexto, '#FFFFFF', c.cartao)};`,
    `--brand-primary:${c.lilas};`, `--brand-accent:${c.dourado};`, `--brand-secondary:${c.dourado};`, `--crono-cor:${c.lilas};`,
    `--sidebar:${c.roxo};`, `--sidebar-foreground:${c.onRoxo};`, `--sidebar-primary:${c.dourado};`, `--sidebar-primary-foreground:${c.roxo};`,
    `--sidebar-accent:${c.dourado};`, `--sidebar-accent-foreground:${c.roxo};`, `--sidebar-border:${sideBorda};`, `--sidebar-ring:${c.dourado};`,
    `--sidebar-icon:${c.dourado};`, `--sidebar-icon-hover:${c.roxo};`, `--sidebar-icon-active:${c.roxo};`,
    `--sidebar-text-hover:${c.roxo};`, `--sidebar-text-active:${c.roxo};`,
    `--topbar:${c.roxo};`, `--topbar-foreground:${c.onRoxo};`,
    `--tab-bg:${c.fundo2};`, `--tab-active:${c.dourado};`, `--tab-active-contrast:${c.roxo};`, `--tab-active-foreground:${escuro ? c.dourado : c.lilas};`,
    `--content-title:${escuro ? c.texto : c.roxo};`,
    `--chart-1:${c.lilas};`, `--chart-2:${c.dourado};`, `--chart-3:${c.okTexto};`, `--chart-4:${c.errTexto};`, `--chart-5:${c.propTexto};`,
  ]
}

function rampasTailwind(c: CoresPaleta, escuro: boolean): string[] {
  const ok = rampa(c.okTexto, c.okFundo, escuro)
  const err = rampa(c.errTexto, c.errFundo, escuro)
  const warn = rampa(c.avisoTexto, c.avisoFundo, escuro)
  const prop = rampa(c.propTexto, c.propFundo, escuro)
  const marca = rampa(c.lilas, misturar(c.lilas, 12, c.cartao), escuro)
  const ouro = rampa(c.dourado, misturar(c.dourado, 16, c.cartao), escuro)
  return [
    ...linhasRampa(['emerald', 'green'], ok),
    ...linhasRampa(['rose', 'red'], err),
    ...linhasRampa(['amber', 'orange'], warn),
    ...linhasRampa(['yellow'], ouro),
    ...linhasRampa(['violet'], prop),
    ...linhasRampa(['purple', 'indigo', 'fuchsia'], marca),
  ]
}

function blocoModo(p: PaletaNova, escuro: boolean, hexes: string[], iframe: boolean): string {
  const c = escuro ? p.escuro : p.claro
  // iframes têm vocabulário próprio (ex.: `--muted` = cor de TEXTO): só recebem as variáveis `--pn-*`, nunca os tokens padrão.
  const linhas: string[] = iframe ? [] : [...tokensPadrao(c, escuro), ...rampasTailwind(c, escuro)]
  for (const [k, v] of Object.entries(varsPn(c, escuro))) linhas.push(`--pn-${k}:${v};`)
  for (const h of hexes) {
    const n = recolorirLegado(h, p, escuro)
    if (n && n.toLowerCase() !== norm6(h)) linhas.push(`--pn-${norm6(h).slice(1)}:${n};`)
  }
  return linhas.join('\n')
}

/**
 * CSS completo da paleta. Especificidade (0,3,1+) vence o tema legado (`html:root:not(.dark)` = 0,2,1).
 * Só no `html`: nenhum seletor `.app`, porque os shells VND/MEQ usam `--muted` como cor de texto dentro de `.app`.
 */
export function gerarCssPaleta(p: PaletaNova, hexesLegados: string[] = [], opc: { iframe?: boolean } = {}): string {
  const iframe = !!opc.iframe
  const claro = blocoModo(p, false, hexesLegados, iframe), escuro = blocoModo(p, true, hexesLegados, iframe)
  return [
    `/* paleta-nova ${hashPaleta(p)}${iframe ? ' (iframe)' : ''} */`,
    `html:root:root:not(.dark):not([data-theme="dark"]){\n${claro}\ncolor-scheme:light;\n}`,
    // os iframes (cronograma/leitor) marcam o escuro com data-theme="dark" em vez de .dark
    `html.dark:root:root, html[data-theme="dark"]:root:root{\n${escuro}\ncolor-scheme:dark;\n}`,
  ].join('\n')
}

/** Diagnóstico de contraste dos pares críticos (p/ o Console avisar antes de ligar). */
export function auditarContraste(p: PaletaNova): Array<{ tema: 'claro' | 'escuro'; par: string; razao: number; ok: boolean }> {
  const out: Array<{ tema: 'claro' | 'escuro'; par: string; razao: number; ok: boolean }> = []
  for (const [tema, c] of [['claro', p.claro], ['escuro', p.escuro]] as const) {
    const pares: Array<[string, string, string, number]> = [
      ['Texto × fundo', c.texto, c.fundo, 4.5], ['Texto × cartão', c.texto, c.cartao, 4.5], ['Apoio × cartão', c.apoio, c.cartao, 4.5],
      ['Apoio × fundo secundário', c.apoio, c.fundo2, 4.5], ['Texto sobre a marca', c.onRoxo, c.roxo, 4.5],
      ['Ação (links/botões) × cartão', c.lilas, c.cartao, 4.5], ['Destaque × marca', c.dourado, c.roxo, 3],
      ['Cadastrado', c.okTexto, c.okFundo, 4.5], ['Falta/erro', c.errTexto, c.errFundo, 4.5],
      ['Confirmar/exemplo', c.avisoTexto, c.avisoFundo, 4.5], ['Proposta', c.propTexto, c.propFundo, 4.5],
    ]
    for (const [par, a, b, min] of pares) { const r = contraste(a, b); out.push({ tema, par, razao: Math.round(r * 100) / 100, ok: r >= min }) }
  }
  return out
}
