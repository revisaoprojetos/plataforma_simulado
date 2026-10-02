import { CARGO_ICONE_SVG } from './cargo-icone-svg-map'

// Ícone do cargo (lucide) como SVG string — o jogo do Desafio de Jurisprudência roda num iframe
// vanilla (sem React/lucide). O mapa é PRÉ-GERADO (scripts/gen-cargo-icone-svg.mjs) para não
// importar react-dom/server em runtime (proibido em Server Components no Next 15).
// `currentColor` deixa a cor herdar do contexto (o jogo pinta via CSS). Fallback = maleta (briefcase).
export function cargoIconeSvg(key?: string | null): string {
  return (key && CARGO_ICONE_SVG[key]) || CARGO_ICONE_SVG.briefcase || ''
}
