import type { CSSProperties } from 'react'

// Grid de cards ADAPTATIVO AO CONTAINER (não ao viewport). Resolve o corte de cards em tablet e,
// principalmente, DENTRO da Curseduca (iframe): media queries de viewport (sm:/md:/lg:) não "viram
// mobile" quando o iframe renderiza numa largura larga, então os cards saíam cortados. Com
// `repeat(auto-fill, minmax(min(100%, Npx), 1fr))` o número de colunas segue a LARGURA REAL do container:
//  - `min(100%, Npx)` → quando o espaço é menor que N, a coluna vira 100% = 1 COLUNA (nunca estoura);
//  - acima disso, encaixa quantas colunas de ≥N couberem, sempre esticando até preencher (1fr).
// Resultado: cards nunca cortam nem saem do lugar, sem perder tamanho/qualidade, em qualquer tela/iframe.
export function cardGrid(minPx: number, gapPx = 16): CSSProperties {
  return { display: 'grid', gap: gapPx, gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minPx}px), 1fr))` }
}

// Larguras mínimas por tipo de card (abaixo disso → 1 coluna). Pôster 4:5, ticket/folder são mais largos.
export const POSTER_MIN = 200
export const TICKET_MIN = 300
export const FOLDER_MIN = 300
