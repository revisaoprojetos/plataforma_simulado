import { resolverSimbolosRaw, DEFAULT_TRILHA_SIMBOLOS, type TrilhaSimbolos } from '@/lib/gamificacao/trilha-simbolos'
import { resolverFormatoRaw, DEFAULT_TRILHA_FORMATO, type TrilhaFormato } from '@/lib/gamificacao/trilha-formato'

/** Ponto em % (0–100) relativo à área da trilha — responsivo. */
export interface PosXY { x: number; y: number }

/**
 * Trilha PERSONALIZADA (formato 'livre'): o admin posiciona cada aula (nós) e desenha a curva de cada
 * trecho (ponto de controle da bézier), tudo em % sobre a imagem de fundo do módulo.
 * `nos[aulaId]` = centro do nó; `curvas[aulaId]` = ponto de controle do trecho que SAI daquele nó.
 */
/** Imagem de fundo da trilha personalizada + ajustes visuais (desfoque, transparência, encaixe, enquadramento). */
/** Retângulo do recorte em frações 0..1 da imagem (canto sup-esq + tamanho). */
export interface TrilhaCrop { x: number; y: number; w: number; h: number }

export interface TrilhaFundoConfig {
  url: string | null
  /** Recorte aplicado (frações da imagem). Renderizado via CSS background (sem rasterizar). */
  crop?: TrilhaCrop | null
  /** Desfoque em px (0–24). */
  desfoque: number
  /** Opacidade 0–100 (transparência). */
  opacidade: number
  /** Encaixe: 'cover' (preenche e corta) | 'contain' (mostra inteira) | 'fill' (estica). */
  ajuste: 'cover' | 'contain' | 'fill'
  /** Enquadramento (arraste): ponto de foco 0–100 (object-position). Padrão 50/50 = centro. */
  posX: number
  posY: number
  /** Zoom/escala da imagem (1–3) — "puxa" a largura para enquadrar. Padrão 1. */
  zoom: number
}

export const DEFAULT_TRILHA_FUNDO: TrilhaFundoConfig = { url: null, crop: null, desfoque: 0, opacidade: 100, ajuste: 'cover', posX: 50, posY: 50, zoom: 1 }

export interface TrilhaLivreConfig {
  nos: Record<string, PosXY>
  curvas: Record<string, PosXY>
  /** Proporção do canvas = largura/altura. <1 = retrato (alto, ideal p/ "montanha"); >1 = paisagem. Padrão 0.8 (4:5). */
  aspecto?: number
  /** Imagem de fundo própria da trilha (sobrepõe a capa do módulo) + ajustes. */
  fundo?: TrilhaFundoConfig
  /** Multiplicador do tamanho dos nós/trilha (proporcional ao canvas). 1 = padrão; 0.4–3. */
  escala?: number
}

export const ESCALA_MIN = 0.4
export const ESCALA_MAX = 3

/** Degradê do banner + o degradê no topo da imagem que liga a trilha ao banner (liga/desliga, intensidade e cor). */
export interface TrilhaDegrade { ativo: boolean; intensidade: number; cor: string }
export const DEFAULT_TRILHA_DEGRADE: TrilhaDegrade = { ativo: true, intensidade: 45, cor: '#000000' }

/** Cores dos grifos do módulo (realces de fundo + cores de texto). O conteúdo usa cores INLINE; a
 *  aplicação classifica cada cor por matiz e reaplica a configurada (ver lib recolorir-grifos). */
export interface GrifoCores { nucleo: string; complemento: string; prazo: string; excecao: string; stf: string; stj: string }
export const DEFAULT_GRIFO_CORES: GrifoCores = { nucleo: '#fff35c', complemento: '#a8d08d', prazo: '#cc99ff', excecao: '#c00000', stf: '#2f6fd0', stj: '#c98a00' }
const hex6 = (v: unknown, def: string): string => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : def)
export function resolverGrifoCores(raw: unknown): GrifoCores {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<GrifoCores>
  return {
    nucleo: hex6(r.nucleo, DEFAULT_GRIFO_CORES.nucleo), complemento: hex6(r.complemento, DEFAULT_GRIFO_CORES.complemento),
    prazo: hex6(r.prazo, DEFAULT_GRIFO_CORES.prazo), excecao: hex6(r.excecao, DEFAULT_GRIFO_CORES.excecao),
    stf: hex6(r.stf, DEFAULT_GRIFO_CORES.stf), stj: hex6(r.stj, DEFAULT_GRIFO_CORES.stj),
  }
}

export interface TrilhaAparencia { simbolos: TrilhaSimbolos; formato: TrilhaFormato; livre: TrilhaLivreConfig; inverter: boolean; degrade: TrilhaDegrade; descricao: string; grifoCores: GrifoCores }

export const DEFAULT_TRILHA_APARENCIA: TrilhaAparencia = { simbolos: DEFAULT_TRILHA_SIMBOLOS, formato: DEFAULT_TRILHA_FORMATO, livre: { nos: {}, curvas: {} }, inverter: false, degrade: DEFAULT_TRILHA_DEGRADE, descricao: '', grifoCores: DEFAULT_GRIFO_CORES }

const clamp = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : NaN)
/** Proporção do canvas (largura/altura) entre 0.25 (bem alto) e 4 (bem largo); indefinido = padrão. */
export const ASPECTO_MIN = 0.25
export const ASPECTO_MAX = 4
export function resolverAspecto(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(ASPECTO_MIN, Math.min(ASPECTO_MAX, v)) : undefined
}
const num = (v: unknown, lo: number, hi: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def)
const clampFrac = (n: unknown, min = 0): number => Math.max(min, Math.min(1, typeof n === 'number' && Number.isFinite(n) ? n : 0))
function resolverEscala(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(ESCALA_MIN, Math.min(ESCALA_MAX, v)) : undefined
}
function resolverDegrade(raw: unknown): TrilhaDegrade {
  if (raw == null || typeof raw !== 'object') return { ...DEFAULT_TRILHA_DEGRADE }
  const r = raw as Partial<TrilhaDegrade>
  return { ativo: r.ativo !== false, intensidade: num(r.intensidade, 0, 100, DEFAULT_TRILHA_DEGRADE.intensidade), cor: hex6(r.cor, DEFAULT_TRILHA_DEGRADE.cor) }
}
function resolverFundo(raw: unknown): TrilhaFundoConfig | undefined {
  if (raw == null || typeof raw !== 'object') return undefined
  const r = raw as Partial<TrilhaFundoConfig>
  const url = typeof r.url === 'string' && r.url.trim() ? r.url.trim() : null
  const ajuste = r.ajuste === 'contain' || r.ajuste === 'fill' ? r.ajuste : 'cover'
  const c = r.crop as Partial<TrilhaCrop> | undefined
  const crop = c && [c.x, c.y, c.w, c.h].every((n) => typeof n === 'number' && Number.isFinite(n))
    ? { x: clampFrac(c.x), y: clampFrac(c.y), w: clampFrac(c.w, 0.02), h: clampFrac(c.h, 0.02) } : null
  return { url, crop, desfoque: num(r.desfoque, 0, 24, 0), opacidade: num(r.opacidade, 0, 100, 100), ajuste, posX: num(r.posX, 0, 100, 50), posY: num(r.posY, 0, 100, 50), zoom: num(r.zoom, 1, 3, 1) }
}
function resolverPontos(raw: unknown): Record<string, PosXY> {
  const out: Record<string, PosXY> = {}
  const r = (raw ?? {}) as Record<string, unknown>
  for (const [k, v] of Object.entries(r)) {
    const p = (v ?? {}) as Partial<PosXY>
    const x = clamp(p.x), y = clamp(p.y)
    if (!Number.isNaN(x) && !Number.isNaN(y)) out[k] = { x, y }
  }
  return out
}

export function resolverTrilhaAparencia(raw: unknown): TrilhaAparencia {
  const r = (raw ?? {}) as { simbolos?: unknown; formato?: unknown; livre?: { nos?: unknown; curvas?: unknown }; inverter?: unknown }
  return {
    simbolos: resolverSimbolosRaw(r.simbolos),
    formato: resolverFormatoRaw(r.formato),
    livre: { nos: resolverPontos(r.livre?.nos), curvas: resolverPontos(r.livre?.curvas), aspecto: resolverAspecto((r.livre as { aspecto?: unknown })?.aspecto), fundo: resolverFundo((r.livre as { fundo?: unknown })?.fundo), escala: resolverEscala((r.livre as { escala?: unknown })?.escala) },
    inverter: r.inverter === true,
    degrade: resolverDegrade((r as { degrade?: unknown }).degrade),
    descricao: typeof (r as { descricao?: unknown }).descricao === 'string' ? ((r as { descricao: string }).descricao).slice(0, 400) : '',
    grifoCores: resolverGrifoCores((r as { grifoCores?: unknown }).grifoCores),
  }
}
