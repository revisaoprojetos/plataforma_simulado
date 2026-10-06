/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FONTE DA VERDADE DOS DESIGN TOKENS DO REDESIGN (Fase 1 · área do aluno)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Este módulo traduz, EXATAMENTE, os design tokens dos mockups de handoff
 * (spec `03-shell-inicio-realizados-recomendado.md` §1 + `02-login-carregamento.md`
 * §5.2) em mapas por MARCA (`revisao | vnd | meq`) e por TEMA (`claro | escuro`;
 * MEQ também `azul`). Ele será consumido pelas telas do redesign nas próximas
 * fases — NÃO é consumido ainda (esta fase só cria o módulo).
 *
 * Convivência com o white-label do tenant (`lib/tenant-theme.ts`):
 * - O tenant-theme injeta tokens do design-system base (`--primary`, `--brand-*`,
 *   `--sidebar`, `--background`, `--foreground`, `--card`, `--border`, `--muted`…)
 *   derivados da PALETA configurável do tenant, em oklch.
 * - ESTE módulo usa um namespace de nomes CURTOS vindo dos mockups
 *   (`--bg`, `--surface`, `--ink`, `--line`, `--brand`, `--chip`…), em hex/rgba.
 *   São os valores "pixel-perfeitos" do mockup de cada marca/tema.
 * - Por isso os dois quase não colidem. A ÚNICA colisão de nome é `--muted`
 *   (existe nos dois). Ver a constante `TOKENS_QUE_COLIDEM_COM_TENANT_THEME` no
 *   fim do arquivo — a resolução (renomear aqui p/ `--muted-ink`, ou escopar em
 *   `.app`) fica para a fase de consumo.
 *
 * DECISÃO TRAVADA DO PO (acento Revisão): no CONTEXTO de Revisão (login/loading e
 * acentos de UI) o acento principal é o amarelo da marca **#F1C232** — NÃO o
 * pêssego #FFC4A3 citado nos mockups de login/loading. Onde o spec usa pêssego
 * como acento principal, aqui está #F1C232; o pêssego permanece só como tom suave
 * secundário (ver `PEACH_SUAVE`).
 */

export type Brand = 'revisao' | 'vnd' | 'meq'
export type Theme = 'claro' | 'escuro' | 'azul' // 'azul' só MEQ

/** Mapa de tokens de UMA marca+tema. Chaves = nome da CSS var sem o prefixo `--`. */
export type TokenMap = Record<string, string>

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de marca (gradientes / decoração) — spec 03 §1.1–§1.3 "Constantes".
// ─────────────────────────────────────────────────────────────────────────────

/** Decisão do PO: acento principal da Revisão = amarelo da marca. */
export const REVISAO_AMARELO = '#F1C232'
/** Texto legível SOBRE o amarelo da Revisão. */
export const REVISAO_AMARELO_INK = '#2A1A55'
/** Pêssego do mockup — mantido só como tom suave secundário (NÃO acento principal). */
export const PEACH_SUAVE = '#FFC4A3'

/** Gradientes/decoração da Revisão (spec 03 §1.1). */
export const REVISAO = {
  sidebarClaro: 'linear-gradient(180deg,#2E1F7A,#3A27A0 60%,#4A31B8)',
  sidebarEscuro: 'linear-gradient(180deg,#160F36,#22184F)',
  cta: 'linear-gradient(180deg,#6449E0,#4B30BE)',
  ctaShadow:
    '0 10px 20px -12px rgba(75,48,190,.8), inset 0 1px 0 rgba(255,255,255,.2)',
  xpBar: 'linear-gradient(90deg,#6449E0,#8F75FF 70%,#F1C232)',
  /** Top bar mobile (gradiente roxo claro) — spec 03 §2.3. */
  topbarMobileClaro: 'linear-gradient(120deg,#2E1F7A,#4A31B8)',
  /** Down bar mobile — spec 03 §2.3. */
  downbarClaro: '#2E1F7A',
  downbarEscuro: '#22184F',
} as const

/** Gradientes/decoração da VND (spec 03 §1.2). */
export const VND = {
  cta: 'linear-gradient(180deg,#14924F,#0C6E3C)',
  gold: 'linear-gradient(180deg,#F1D48A,#D8B45A)',
  goldInk: '#2A1F02',
  /** Hero / faixas (spec 03 §1.2). */
  hero: 'linear-gradient(120deg,#041A10 0%,#0B4A2E 55%,#12643D 100%)',
  /** Padrão de pontos (dots) — background-image + tamanho do tile (spec 03 §1.2). */
  dotsPattern:
    'radial-gradient(circle,rgba(185,245,212,.18) 1.2px,transparent 1.8px)',
  dotsSize: '22px 22px',
} as const

/** Gradientes/decoração da MEQ (spec 03 §1.3). */
export const MEQ = {
  cta: 'linear-gradient(180deg,#4A8BEA,#2F64C8)',
  /** Fundo do tema AZUL (cards brancos sobre gradiente azul). */
  azulBg: 'linear-gradient(170deg,#2B5FA8 0%,#306AB5 30%,#3B82CC 70%,#4497DB 100%)',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Movimento / semânticos comuns — spec 03 §1.4.
// ─────────────────────────────────────────────────────────────────────────────

/** Easing padrão de todas as entradas/transições do redesign. */
export const EASING_PADRAO = 'cubic-bezier(.22,1,.36,1)'

/**
 * Semânticos de nota / prioridade (spec 03 §1.4). Faixas por percentual de acerto:
 * < 30 = alta prioridade; 30–59 = média; ≥ 60 = ok. Usados em Realizados/Recomendado.
 */
export const SEMANTICOS_NOTA = {
  baixa: { faixa: '< 30', cor: '#E5484D', bg: 'rgba(229,72,77,.12)', rotulo: 'Alta' },
  media: { faixa: '30–59', cor: '#D99A1E', bg: 'rgba(217,154,30,.14)', rotulo: 'Média' },
  ok: { faixa: '≥ 60', cor: '#1FA868', bg: 'rgba(31,168,104,.13)', rotulo: 'Ok' },
} as const

/** Os mesmos semânticos como CSS vars (`--note-*`), injetados em todos os temas. */
const SEMANTICOS_VARS: TokenMap = {
  'note-low': SEMANTICOS_NOTA.baixa.cor,
  'note-low-bg': SEMANTICOS_NOTA.baixa.bg,
  'note-mid': SEMANTICOS_NOTA.media.cor,
  'note-mid-bg': SEMANTICOS_NOTA.media.bg,
  'note-ok': SEMANTICOS_NOTA.ok.cor,
  'note-ok-bg': SEMANTICOS_NOTA.ok.bg,
}

// ─────────────────────────────────────────────────────────────────────────────
// 1.1 REVISÃO — spec 03 §1.1 (home_rev.THEME + realizados.R_VARS)
// Acento (accentInk/peachBg) traduzido para o amarelo #F1C232 por decisão do PO.
// ─────────────────────────────────────────────────────────────────────────────

const REVISAO_CLARO: TokenMap = {
  bg: '#F4F2FA',
  surface: '#FFFFFF',
  surface2: '#F6F4FC',
  ink: '#1D1933',
  muted: '#6E6886',
  muted2: '#B3ADC7',
  line: '#EAE6F4',
  line2: '#D9D2F0',
  track: '#ECE8F6',
  brand: '#5B3FD0',
  brandLine: 'rgba(91,63,208,.3)',
  chip: '#EFEBFD',
  // Acento = amarelo da marca (PO). `accentInk` = texto amarelo legível no claro.
  accentInk: '#9A7400',
  // peachBg = fundo amarelo suave (spec usava tom pêssego; PO = amarelo suave).
  peachBg: '#FDF5D8',
  top: 'rgba(244,242,250,.85)',
  tBg: '#ECE8F6',
  tOn: '#FFFFFF',
  tOnInk: '#2E1F7A',
  cnt: '#EFEBFD',
  cntInk: '#5B3FD0',
  fOn: '#2E1F7A',
  fOnInk: '#FFFFFF',
  hoverLine: 'rgba(91,63,208,.35)',
  // Amarelo da marca exposto como token direto para acentos de UI (PO).
  accent: REVISAO_AMARELO,
  accentOn: REVISAO_AMARELO_INK,
  peach: PEACH_SUAVE,
}

const REVISAO_ESCURO: TokenMap = {
  bg: '#18181D',
  surface: '#232329',
  surface2: '#2C2C34',
  ink: '#FFFFFF',
  muted: '#BDBBCB',
  muted2: '#73717F',
  line: 'rgba(255,255,255,.1)',
  line2: 'rgba(255,255,255,.18)',
  track: 'rgba(255,255,255,.12)',
  brand: '#B3A1FF',
  brandLine: 'rgba(179,161,255,.45)',
  chip: 'rgba(143,117,255,.2)',
  accentInk: '#F1C232',
  peachBg: 'rgba(241,194,50,.12)',
  top: 'rgba(24,16,56,.96)',
  tBg: '#2C2C34',
  tOn: '#3A3A44',
  tOnInk: '#FFFFFF',
  cnt: 'rgba(143,117,255,.22)',
  cntInk: '#D2C6FF',
  fOn: '#F1C232',
  fOnInk: '#2A1A55',
  hoverLine: 'rgba(179,161,255,.45)',
  accent: REVISAO_AMARELO,
  accentOn: REVISAO_AMARELO_INK,
  peach: PEACH_SUAVE,
}

// ─────────────────────────────────────────────────────────────────────────────
// 1.2 VND — spec 03 §1.2 (home_vnd.THEME + realizados.V_VARS)
// ─────────────────────────────────────────────────────────────────────────────

const VND_CLARO: TokenMap = {
  bg: '#F2F6F3',
  surface: '#FFFFFF',
  surface2: '#F2F7F4',
  ink: '#0B1F15',
  muted: '#5E7368',
  muted2: '#B5C4BB',
  line: '#E1EAE4',
  line2: '#CFDDD4',
  track: '#E3ECE6',
  brand: '#0F7A44',
  brandLine: 'rgba(15,122,68,.3)',
  chip: '#E4F3EA',
  gold: '#D8B45A',
  goldInk: '#9A7414',
  goldBg: '#FBF4E2',
  topbg: 'rgba(255,255,255,.88)',
  topink: '#0B1F15',
  topmuted: '#5E7368',
  tabact: '#E4F3EA',
  tBg: '#E4EDE7',
  tOn: '#FFFFFF',
  tOnInk: '#0B1F15',
  fOn: '#0F7A44',
  fOnInk: '#FFFFFF',
}

const VND_ESCURO: TokenMap = {
  bg: '#161917',
  surface: '#1A2D24',
  surface2: '#22392E',
  ink: '#FFFFFF',
  muted: '#C0D3C8',
  muted2: '#71907F',
  line: 'rgba(79,224,152,.16)',
  line2: 'rgba(79,224,152,.26)',
  track: 'rgba(255,255,255,.14)',
  brand: '#4FE098',
  brandLine: 'rgba(79,224,152,.4)',
  chip: 'rgba(79,224,152,.15)',
  gold: '#E8C877',
  goldInk: '#F1D48A',
  goldBg: 'rgba(232,200,119,.14)',
  topbg: 'rgba(6,34,21,.96)',
  topink: '#FFFFFF',
  topmuted: '#BAC7BF',
  tabact: 'rgba(63,213,138,.18)',
  tBg: '#1E2A23',
  tOn: '#2A3A31',
  tOnInk: '#FFFFFF',
  fOn: '#E8C877',
  fOnInk: '#2A1F02',
}

// ─────────────────────────────────────────────────────────────────────────────
// 1.3 MEQ — spec 03 §1.3 (home_meq.THEME + realizados.M_VARS + kit.SUBV)
// 3 temas: claro / azul / escuro. O `--bg` do AZUL é um gradiente.
// ─────────────────────────────────────────────────────────────────────────────

const MEQ_CLARO: TokenMap = {
  bg: '#F2F5FA',
  surface: '#FFFFFF',
  surface2: '#F6F8FC',
  ink: '#171E3B',
  head: '#171E3B',
  sub: '#66729A',
  muted: '#66729A',
  muted2: '#B7C0D8',
  line: '#E3E8F2',
  line2: '#CDD6E8',
  brand: '#306AB5',
  brand2: '#3E7FE0',
  cyan: '#5ECEF0',
  chip: '#EAF1FB',
  shadow: '0 1px 2px rgba(16,30,70,.04)',
  rail: '#171E3B',
  railInk: '#A9B6D9',
  railLine: 'rgba(255,255,255,.08)',
  railAct: '#306AB5',
  okBg: 'rgba(46,199,122,.14)',
  okInk: '#1FA868',
  top: 'rgba(242,245,250,.88)',
  topInk: '#171E3B',
  topMuted: '#66729A',
  tBg: '#E4EAF5',
  tOn: '#FFFFFF',
  tOnInk: '#171E3B',
  fOn: '#171E3B',
  fOnInk: '#FFFFFF',
}

const MEQ_AZUL: TokenMap = {
  bg: MEQ.azulBg,
  surface: '#FFFFFF',
  surface2: '#F5F8FD',
  ink: '#171E3B',
  head: '#FFFFFF', // títulos fora de card viram brancos sobre o fundo azul
  sub: '#DCEBFF',
  muted: '#66729A',
  muted2: '#DCEBFF', // (Realizados usa #DCEBFF no azul)
  line: '#E3E8F2', // idem claro
  line2: '#CDD6E8', // idem claro
  brand: '#306AB5', // idem claro
  brand2: '#3E7FE0', // idem claro
  cyan: '#5ECEF0', // idem claro
  chip: '#EAF1FB',
  shadow: '0 20px 40px -30px rgba(10,30,80,.6)',
  rail: 'rgba(23,30,59,.35)',
  railInk: '#DCEBFF',
  railLine: 'rgba(255,255,255,.14)',
  railAct: 'rgba(255,255,255,.18)',
  okBg: 'rgba(255,255,255,.2)',
  okInk: '#FFFFFF',
  top: 'rgba(43,95,168,.6)',
  topInk: '#FFFFFF',
  topMuted: '#DCEBFF',
  tBg: 'rgba(255,255,255,.18)',
  tOn: '#FFFFFF',
  tOnInk: '#171E3B',
  fOn: '#FFFFFF',
  fOnInk: '#171E3B',
}

const MEQ_ESCURO: TokenMap = {
  bg: '#0B1124',
  surface: '#121A3A',
  surface2: '#172146',
  ink: '#FFFFFF',
  head: '#FFFFFF',
  sub: '#8E9BC4',
  muted: '#8E9BC4',
  muted2: '#3E4A78',
  line: 'rgba(140,170,255,.13)',
  line2: 'rgba(140,170,255,.24)',
  brand: '#7FB2FF',
  brand2: '#5E9BFF',
  cyan: '#5ECEF0',
  chip: 'rgba(94,155,255,.14)',
  shadow: 'none',
  rail: '#0E1533',
  railInk: '#8E9BC4',
  railLine: 'rgba(140,170,255,.12)',
  railAct: '#2F64C8',
  okBg: 'rgba(46,199,122,.16)',
  okInk: '#4FDB98',
  top: 'rgba(11,17,36,.85)',
  topInk: '#FFFFFF',
  topMuted: '#8E9BC4',
  tBg: '#121A3A',
  tOn: '#2F64C8',
  tOnInk: '#FFFFFF',
  fOn: '#5E9BFF',
  fOnInk: '#0B1124',
}

// ─────────────────────────────────────────────────────────────────────────────
// Cores-chave de login/loading — spec 02 §5.2 (fundo da página por marca/tema).
// Exportadas à parte porque são usadas nas telas de login/loading (fase 2), não
// no shell do app. Revisão: acento = amarelo (PO), não pêssego.
// ─────────────────────────────────────────────────────────────────────────────

export const LOGIN_BG = {
  revisao: {
    claro: 'linear-gradient(150deg,#2E1F7A,#4A31B8,#7356E6)',
    escuro: 'linear-gradient(160deg,#0B0720,#140C38,#1F1352)',
  },
  vnd: {
    // centralizado/vitrine têm fundo escuro mesmo no "claro"; dividido é claro com painel.
    claro: 'linear-gradient(150deg,#041A10,#072D1C,#0B3D26)',
    escuro: 'linear-gradient(150deg,#020906,#03100A,#051A10)',
  },
  meq: {
    claro: 'linear-gradient(150deg,#F6F9FE,#EEF3FB,#E3ECF8)',
    azul: 'linear-gradient(150deg,#2B5FA8,#306AB5,#4497DB)',
    escuro: 'linear-gradient(150deg,#121A3A,#141B38,#0B1124)',
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Índice principal: tokens por marca × tema.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tabela completa de tokens por marca e tema. Cada mapa já inclui os semânticos
 * de nota (`--note-*`). MEQ tem os 3 temas; Revisão e VND só claro/escuro.
 */
export const BRAND_TOKENS: Record<Brand, Partial<Record<Theme, TokenMap>>> = {
  revisao: {
    claro: { ...REVISAO_CLARO, ...SEMANTICOS_VARS },
    escuro: { ...REVISAO_ESCURO, ...SEMANTICOS_VARS },
  },
  vnd: {
    claro: { ...VND_CLARO, ...SEMANTICOS_VARS },
    escuro: { ...VND_ESCURO, ...SEMANTICOS_VARS },
  },
  meq: {
    claro: { ...MEQ_CLARO, ...SEMANTICOS_VARS },
    azul: { ...MEQ_AZUL, ...SEMANTICOS_VARS },
    escuro: { ...MEQ_ESCURO, ...SEMANTICOS_VARS },
  },
}

/** Temas disponíveis por marca (MEQ inclui 'azul'). */
export const TEMAS_POR_MARCA: Record<Brand, Theme[]> = {
  revisao: ['claro', 'escuro'],
  vnd: ['claro', 'escuro'],
  meq: ['claro', 'azul', 'escuro'],
}

// ─────────────────────────────────────────────────────────────────────────────
// Geração de CSS.
// ─────────────────────────────────────────────────────────────────────────────

/** Retorna o mapa de tokens de uma marca+tema (ou null se o tema não existe nela). */
export function getBrandTokens(brand: Brand, theme: Theme): TokenMap | null {
  return BRAND_TOKENS[brand]?.[theme] ?? null
}

/** Transforma um TokenMap num corpo de declarações CSS (`  --nome: valor;`). */
function tokensToDeclarations(tokens: TokenMap): string {
  return Object.entries(tokens)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n')
}

/**
 * Qual seletor cada tema usa. Convive com `next-themes` (estratégia `class`):
 * - claro  → `:root`  (default, sem classe)
 * - escuro → `.dark`
 * - azul   → `.theme-azul` (só MEQ)
 */
function seletorDoTema(theme: Theme): string {
  if (theme === 'escuro') return '.dark'
  if (theme === 'azul') return '.theme-azul'
  return ':root'
}

/**
 * Gera o bloco CSS (`:root` / `.dark` / `.theme-azul`) com as vars de tokens da
 * marca+tema informados. É a função a ser consumida pelas próximas fases para
 * injetar os tokens do redesign (análogo ao `construirPaletaCompleta` do
 * tenant-theme, mas usando o namespace de nomes curtos dos mockups).
 */
export function brandTokensCss(brand: Brand, theme: Theme): string {
  const tokens = getBrandTokens(brand, theme)
  if (!tokens) return ''
  return `${seletorDoTema(theme)} {\n${tokensToDeclarations(tokens)}\n}`
}

/**
 * Gera o CSS de TODOS os temas de uma marca de uma vez (claro em `:root`,
 * escuro em `.dark`, e — na MEQ — azul em `.theme-azul`), concatenados. Útil
 * para injetar o conjunto inteiro de uma marca num único `<style>`.
 */
export function brandAllThemesCss(brand: Brand): string {
  return TEMAS_POR_MARCA[brand]
    .map((theme) => brandTokensCss(brand, theme))
    .filter(Boolean)
    .join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Conflitos de nome com o tenant-theme (lib/tenant-theme.ts) — para resolver
// na fase de consumo. Listados aqui para ficar explícito e rastreável.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tokens cujo NOME também é emitido pelo `tenant-theme.ts`. Hoje só `--muted`
 * colide (o tenant-theme usa `--muted` como SUPERFÍCIE muted/cinza; aqui `--muted`
 * é a cor de TEXTO secundário do mockup). Ao consumir, decidir:
 *   (a) escopar os tokens do redesign em `.app` (como o spec 03 §1 sugere), ou
 *   (b) renomear `--muted` → `--muted-ink` neste módulo.
 * Demais nomes (`--bg`, `--surface`, `--ink`, `--line`, `--brand`, `--chip`,
 * `--brand2`, `--cyan`, `--top`, `--rail*`…) NÃO existem no tenant-theme.
 */
export const TOKENS_QUE_COLIDEM_COM_TENANT_THEME = ['muted'] as const
