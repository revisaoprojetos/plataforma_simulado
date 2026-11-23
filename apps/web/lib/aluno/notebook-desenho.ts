// Caderno OneNote — aba DESENHAR: modelo PURO das canetas/borracha/toque e das preferências persistidas (localStorage).
// Sem React, sem I/O: a leitura/escrita do storage fica em components/aluno/notebook/onenote/estado-desenho.ts.
import { ehCorHex } from './notebook-folha'

export const FERRAMENTAS_DESENHO = ['selecionar', 'laco', 'borracha', 'texto', 'caneta', 'marca-texto'] as const
export type FerramentaDesenho = (typeof FERRAMENTAS_DESENHO)[number]
export const SLOTS_CANETA = ['c1', 'c2', 'c3', 'mt'] as const
export type SlotCaneta = (typeof SLOTS_CANETA)[number]
export type TamanhoBorracha = 'pequena' | 'media' | 'grande'
export type ModoBorracha = 'area' | 'traco'

/** Cor de caneta: `tinta` (automática: segue o tema, legível no claro e no escuro) ou `#rrggbb`. */
export interface Caneta { cor: string; largura: number }
export interface PrefsDesenho {
  canetas: Record<SlotCaneta, Caneta>
  borracha: { tamanho: TamanhoBorracha; modo: ModoBorracha }
  toque: boolean
}

export const LARGURA_CANETA = { min: 1, max: 12 } as const
export const LARGURA_MARCA_TEXTO = { min: 8, max: 40 } as const
export const OPACIDADE_MARCA_TEXTO = 0.4
/** Raio da borracha em px de TELA (a camada divide pelo zoom). */
export const RAIO_BORRACHA_PX: Record<TamanhoBorracha, number> = { pequena: 6, media: 12, grande: 24 }

export const PADRAO_PREFS: PrefsDesenho = {
  canetas: {
    c1: { cor: 'tinta', largura: 2 },
    c2: { cor: '#2f6fd1', largura: 3 },
    c3: { cor: '#d64545', largura: 3 },
    mt: { cor: '#fff176', largura: 18 },
  },
  borracha: { tamanho: 'media', modo: 'area' },
  toque: false,
}

export const faixaLargura = (slot: SlotCaneta) => (slot === 'mt' ? LARGURA_MARCA_TEXTO : LARGURA_CANETA)
export function limitarLarguraCaneta(slot: SlotCaneta, n: number): number {
  const f = faixaLargura(slot)
  return Number.isFinite(n) ? Math.min(f.max, Math.max(f.min, Math.round(n))) : PADRAO_PREFS.canetas[slot].largura
}
export const corCanetaValida = (c: unknown): c is string => typeof c === 'string' && (c === 'tinta' || ehCorHex(c))

/** Ferramenta de traço e slot a partir do ID de comando (`desenho.caneta.2` -> c2). */
export function slotDoComando(id: string): SlotCaneta | null {
  if (id === 'desenho.marca_texto') return 'mt'
  const m = /^desenho\.caneta\.([123])$/.exec(id)
  return m ? (`c${m[1]}` as SlotCaneta) : null
}
export const idDoSlot = (s: SlotCaneta): string => (s === 'mt' ? 'desenho.marca_texto' : `desenho.caneta.${s.slice(1)}`)
export const ferramentaDoSlot = (s: SlotCaneta): 'caneta' | 'marca-texto' => (s === 'mt' ? 'marca-texto' : 'caneta')

/** Lê o JSON do storage tolerando qualquer lixo: campo inválido volta ao padrão. Nunca lança. */
export function sanitizarPrefs(raw: unknown): PrefsDesenho {
  let o: unknown = raw
  if (typeof raw === 'string') { try { o = JSON.parse(raw) } catch { o = null } }
  const r = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>
  const cs = (r.canetas && typeof r.canetas === 'object' ? r.canetas : {}) as Record<string, unknown>
  const canetas = {} as Record<SlotCaneta, Caneta>
  for (const s of SLOTS_CANETA) {
    const c = (cs[s] && typeof cs[s] === 'object' ? cs[s] : {}) as Record<string, unknown>
    canetas[s] = {
      cor: corCanetaValida(c.cor) ? c.cor : PADRAO_PREFS.canetas[s].cor,
      largura: typeof c.largura === 'number' ? limitarLarguraCaneta(s, c.largura) : PADRAO_PREFS.canetas[s].largura,
    }
  }
  const b = (r.borracha && typeof r.borracha === 'object' ? r.borracha : {}) as Record<string, unknown>
  const tamanho = b.tamanho === 'pequena' || b.tamanho === 'media' || b.tamanho === 'grande' ? b.tamanho : PADRAO_PREFS.borracha.tamanho
  const modo = b.modo === 'area' || b.modo === 'traco' ? b.modo : PADRAO_PREFS.borracha.modo
  return { canetas, borracha: { tamanho, modo }, toque: r.toque === true }
}
export const serializarPrefs = (p: PrefsDesenho): string => JSON.stringify(p)

/** Quem desenha: caneta/stylus sempre; mouse (botão principal) desenha com caneta ativa; DEDO só com "Desenhar com toque" ligado (senão rola). */
export function tipoDesenha(pointerType: string, toque: boolean): boolean {
  if (pointerType === 'pen' || pointerType === 'mouse') return true
  return toque
}
