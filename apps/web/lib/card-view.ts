// Estilo de exibição dos cards de simulado — escolhido pelo SUPER-ADMIN no console (tema.card_view),
// não pelo admin normal nem pelo aluno. 'poster' = card 4:5 (padrão); 'ticket' = card baixo/retangular
// (imagem à esquerda, infos à direita). O admin e o aluno só OBEDECEM ao que o console definiu.
export type CardView = 'poster' | 'ticket'

/** Normaliza o valor salvo em tema.card_view (default 'poster'). */
export function resolverCardView(v: unknown): CardView {
  return v === 'ticket' ? 'ticket' : 'poster'
}
