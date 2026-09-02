// Recorte de capa NÃO-destrutivo: por imagem (card/banner) guardamos a ORIGINAL (não recortada) + os
// parâmetros do recorte (zoom + deslocamento normalizado), em simulado_pastas.capa_meta (jsonb). O
// capa_url/capa_card_url segue sendo o RECORTE exibido; isto serve só para o "Ajustar" reabrir de
// onde parou. Tipo compartilhado entre a server action (atualizarBanco/lerCapaMeta) e os dialogs.

// zoom (≥1) + centro do recorte (fração 0..1 da imagem) — estado do editor "Pan & Zoom".
export type CropParams = { zoom: number; cx: number; cy: number }

export type CapaMetaIn = {
  card?: { orig?: string | null; crop?: CropParams | null } | null
  banner?: { orig?: string | null; crop?: CropParams | null } | null
} | null
