// Recorte de capa NÃO-destrutivo: por imagem (card/banner) guardamos a ORIGINAL (não recortada) + os
// parâmetros do recorte, em simulado_pastas.capa_meta (jsonb). O capa_url/capa_card_url segue sendo um
// fallback exibível; o enquadramento fino vem daqui. Tipo compartilhado entre a server action
// (atualizarBanco/lerCapaMeta) e os dialogs/cards.

import type { TrilhaCrop, TrilhaDegrade } from '@/lib/leitura/trilha-aparencia'

// zoom (≥1) + centro do recorte (fração 0..1 da imagem) — estado do editor "Pan & Zoom" (LEGADO).
export type CropParams = { zoom: number; cx: number; cy: number }

// ── Editor profissional (reusa o da trilha): recorte por retângulo (frações 0..1) + ajustes visuais. ──
/** Retângulo do recorte (frações 0..1 da imagem) — mesma forma do recorte da trilha. */
export type CapaRect = TrilhaCrop
/** Degradê no topo da imagem da capa — mesma forma/fórmula do degradê da trilha. */
export type CapaDegrade = TrilhaDegrade
/** Config de UM formato do card (pôster 4:5 ou ticket 4:3): recorte + desfoque/transparência/degradê. */
export type CapaViewCfg = {
  crop?: CapaRect | null
  /** Desfoque em px (0–24). */
  desfoque?: number
  /** Opacidade 0–100 (transparência). */
  opacidade?: number
  degrade?: CapaDegrade | null
}

/** Metadado da imagem do CARD: ORIGINAL + enquadramento por formato (pôster/ticket). `crop` = legado. */
export type CapaCardMeta = {
  orig?: string | null
  poster?: CapaViewCfg | null
  ticket?: CapaViewCfg | null
  /** LEGADO (pan&zoom) — tolerado p/ reabrir cadernos antigos; não usado no novo render por CSS. */
  crop?: CropParams | null
}

export type CapaMetaIn = {
  card?: CapaCardMeta | null
  banner?: { orig?: string | null; crop?: CropParams | null } | null
} | null

/** Default de um formato (sem efeitos). */
export const DEFAULT_CAPA_VIEW: CapaViewCfg = { crop: null, desfoque: 0, opacidade: 100, degrade: null }
