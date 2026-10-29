'use client'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Conversor de COR por marca (VND → MAC) — Mentoria Além do Corte
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A MAC reaproveita EXATAMENTE os componentes de marca do VND (nada de fork): as
 * SUPERFÍCIES já trocam de cor sozinhas via tokens (`--bg`, `--brand`, `--ink`…,
 * ver brand-tokens.ts MAC_CLARO/MAC_ESCURO). Mas os componentes do VND ainda têm
 * ~175 cores FIXAS em estilos inline (degradês, hero, loaders, decorações) que o
 * CSS de um ancestral não consegue recolorir.
 *
 * Este módulo resolve isso com uma função PURA e determinística: `corMarca('mac',
 * valor)` troca cada cor verde da marca VND pelo bordô correspondente, usando a
 * TABELA do handoff (TOKENS-MAC.md / referencia/mapa-cores.csv). Para VND, MEQ e
 * Revisão a função é IDENTIDADE — devolve o valor intacto —, então nenhuma outra
 * marca muda de pixel.
 *
 * Cores NÃO listadas na tabela (dourado, verde de acerto, vermelho de erro,
 * laranja de sequência, capas de simulado) permanecem iguais — é exatamente o que
 * o handoff pede (são acento/semântica, não cor de marca).
 *
 * Aceita hex (#RGB/#RRGGBB), rgb()/rgba() (preservando o alpha) e strings
 * compostas (ex.: `linear-gradient(...)`), convertendo TODOS os tokens de cor
 * dentro da string.
 */

import { createContext, useContext, type ReactNode } from 'react'
import type { Brand } from './brand-tokens'

// Tabela VND → MAC de HEX (TOKENS-MAC.md §"Tabela completa de conversão de cor").
// Fonte da verdade da transformação bordô. Chave/valor sem o `#`, maiúsculas.
const HEX_PARES: ReadonlyArray<readonly [string, string]> = [
  ['0EA5B7', '960B12'], ['0F7A44', '640C11'], ['3FD58A', 'C86A6F'], ['CFE3D7', 'E3CFD0'],
  ['B9F5D4', 'E9C5C7'], ['0B4A2E', '3D090C'], ['16804F', '691216'], ['5E7368', '5E4D4E'],
  ['B7D3C3', 'D3B7B8'], ['12643D', '520F12'], ['0F4A2E', '3D0C0F'], ['0E5434', '450B0E'],
  ['14924F', '781016'], ['0C6E3C', '5A0A0E'], ['072A1B', '220607'], ['041A10', '150304'],
  ['062A1B', '220506'], ['0B1F15', '19090A'], ['E4F3EA', 'F3E4E5'], ['9DB5A8', 'B59D9E'],
  ['0A4F2C', '41080B'], ['04170F', '130304'], ['0B5E34', '4D090C'], ['86CFA6', 'CF868A'],
  ['B7DEC6', 'DEB7B9'], ['0F6B3C', '580C10'], ['F2F6F3', 'F6F2F2'], ['1C7A8C', '73171C'],
  ['1E9E5E', '82191E'], ['F2F7F4', 'F7F2F2'], ['B5C4BB', 'C4B5B6'], ['E1EAE4', 'EAE1E1'],
  ['CFDDD4', 'DDCFD0'], ['E3ECE6', 'ECE3E3'], ['1A2D24', '251516'], ['22392E', '2F1C1D'],
  ['C0D3C8', 'D3C0C1'], ['71907F', '907173'], ['4FE098', 'D37A7F'], ['BAC7BF', 'C7BABB'],
  ['4BB3C7', 'BF7175'], ['E4EDE7', 'EDE4E4'], ['1E2A23', '221919'], ['2A3A31', '302223'],
  ['2A3A32', '302223'], ['9CEFC4', 'E9B9BC'], ['5BE39E', 'D78589'], ['0C3324', '2A0A0B'],
  ['2E9A6A', '7E262A'], ['2E8A5A', '712629'], ['8AA05A', '834A4D'], ['D4EADD', 'EAD4D5'],
  ['0F5A36', '4A0C0F'], ['13301F', '271011'], ['3E8A3A', '713033'], ['7BF0B4', 'E6A3A7'],
  ['D3DED8', 'DED3D4'], ['0A2E22', '26080A'], ['1E8A64', '71191D'], ['CDEBD9', 'EBCDCF'],
  ['101C16', '170D0E'], ['062619', '1F0506'], ['9BF0C3', 'EAB9BB'], ['0A2E1C', '26080A'],
  ['072D1C', '250607'], ['0B3D26', '32090B'], ['E1E8E3', 'E8E1E1'], ['F8FAF9', 'FAF8F8'],
  ['7FA893', 'A87F81'], ['020906', '070202'], ['03100A', '0D0203'], ['051A10', '150405'],
  ['8DA89A', 'A88D8E'], ['E9EFEC', 'EFE9E9'], ['CFDCD5', 'DCCFD0'], ['2A5A3E', '4A2224'],
  ['2EC77A', 'BE555A'], ['E3F6EC', 'F5E4E5'], ['0A5A32', '4A080B'], ['ECF8F0', 'F8ECED'],
  ['F5FAF7', 'FAF5F5'], ['D7EEDF', 'EED7D8'], ['4D6357', '513F40'], ['0B4D2C', '3F090C'],
  ['6F8A7C', '715B5C'], ['0D1F16', '190B0B'], ['08140E', '100707'], ['A9C2B5', 'C2A9AA'],
  ['86B59B', 'B58688'], ['5E7F6E', '684D4E'],
]

// Tabela VND → MAC de rgb() (mesma §, bloco rgb/rgba). Chave/valor "r,g,b".
const RGB_PARES: ReadonlyArray<readonly [string, string]> = [
  ['11,74,46', '61,9,12'], ['185,245,212', '233,197,199'], ['4,26,16', '21,3,4'],
  ['79,224,152', '211,122,127'], ['63,213,138', '200,106,111'], ['120,230,170', '222,158,161'],
  ['15,122,68', '100,12,17'], ['34,197,110', '194,68,74'], ['6,38,25', '31,5,6'],
  ['18,100,61', '82,15,18'], ['6,60,35', '49,5,7'], ['6,34,21', '28,5,6'],
  ['52,200,140', '189,93,98'], ['140,240,185', '233,178,181'], ['46,210,120', '195,91,97'],
  ['20,40,25', '33,16,17'],
]

function hexParaRgbChave(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `${r},${g},${b}`
}

// Mapa unificado de hex (RRGGBB maiúsculo → RRGGBB bordô).
const HEX_MAP = new Map<string, string>(HEX_PARES.map(([v, m]) => [v, m]))

// Mapa unificado de rgb ("r,g,b" → "r,g,b"), incluindo os triplets derivados da
// tabela hex — assim uma rgba() cujo triplet casa com uma entrada hex também converte.
const RGB_MAP = new Map<string, string>()
for (const [v, m] of RGB_PARES) RGB_MAP.set(v, m)
for (const [v, m] of HEX_PARES) {
  const k = hexParaRgbChave(v)
  if (!RGB_MAP.has(k)) RGB_MAP.set(k, hexParaRgbChave(m))
}

function expandirHex3(h: string): string {
  return h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
}

// Qualquer token de cor dentro de uma string (hex 6/3 dígitos ou rgb/rgba).
const RE_COR = /#([0-9a-fA-F]{6})\b|#([0-9a-fA-F]{3})\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g

/**
 * Converte um valor de cor (ou string com cores) de VND para MAC. Para marcas que
 * não são 'mac', devolve o valor intacto (identidade). Tokens fora da tabela ficam
 * inalterados.
 */
export function corMarca(brand: Brand | null | undefined, valor: string): string {
  if (brand !== 'mac' || !valor) return valor
  return valor.replace(RE_COR, (match, hex6, hex3, r, g, b, a) => {
    if (hex6) {
      const mapped = HEX_MAP.get(hex6.toUpperCase())
      return mapped ? `#${mapped}` : match
    }
    if (hex3) {
      const mapped = HEX_MAP.get(expandirHex3(hex3.toUpperCase()))
      return mapped ? `#${mapped}` : match
    }
    if (r !== undefined) {
      const mapped = RGB_MAP.get(`${r},${g},${b}`)
      if (!mapped) return match
      return a !== undefined ? `rgba(${mapped},${a})` : `rgb(${mapped})`
    }
    return match
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexto React: provê a marca atual aos componentes de marca (reaproveitados do
// VND) sem precisar passar `brand` por dezenas de props intermediárias. Fora de um
// provider, `useCm()` é identidade — logo VND/MEQ/Revisão não são afetados.
// ─────────────────────────────────────────────────────────────────────────────

const BrandCorContext = createContext<Brand | null>(null)

/** Envolve a subárvore de uma marca para habilitar a conversão de cor (só 'mac' converte). */
export function BrandCorProvider({ brand, children }: { brand: Brand | null; children: ReactNode }) {
  return <BrandCorContext.Provider value={brand}>{children}</BrandCorContext.Provider>
}

/**
 * Hook que devolve a função de conversão `cm(valor)` já ligada à marca do contexto.
 * Use em qualquer componente de marca do VND que tenha cor FIXA em estilo inline:
 *   const cm = useCm(); style={{ background: cm('#0F7A44') }}
 */
export function useCm(): (valor: string) => string {
  const brand = useContext(BrandCorContext)
  return (valor: string) => corMarca(brand, valor)
}

/** Marca ativa no contexto (null fora de um provider). Útil p/ trocar o símbolo (V→M). */
export function useBrandAtual(): Brand | null {
  return useContext(BrandCorContext)
}
