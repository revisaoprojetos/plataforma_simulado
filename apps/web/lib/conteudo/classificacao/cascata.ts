// Cascata de regras de uso (puro): meta (override) > área × classificação > padrão do motor da área > padrão interno.
// Devolve também a ORIGEM de cada campo para a UI mostrar "herdado × definido".
import { REGRAS_USO_PADRAO, lerRegrasParciais, type RegrasOverride, type RegrasUso } from './esquema'

export type OrigemRegra = 'meta' | 'area' | 'padrao'

export type CampoRegra =
  | `tempo.${keyof RegrasUso['tempo']}`
  | `meta.${keyof RegrasUso['meta']}`

export const CAMPOS_REGRA: readonly CampoRegra[] = [
  ...(Object.keys(REGRAS_USO_PADRAO.tempo) as (keyof RegrasUso['tempo'])[]).map((k) => `tempo.${k}` as const),
  ...(Object.keys(REGRAS_USO_PADRAO.meta) as (keyof RegrasUso['meta'])[]).map((k) => `meta.${k}` as const),
]

export interface RegrasResolvidas {
  regras: RegrasUso
  /** Camada que definiu cada campo. 'padrao' = padrão do motor da área OU padrão interno. */
  origem: Record<CampoRegra, OrigemRegra>
}

/**
 * @param override              `regras_override` da seleção da meta (jsonb cru ou parcial)
 * @param usoAreaClassificacao  `regras` de simulado_conteudo_regras_uso (área × classificação)
 * @param padraoMotor           padrão do motor da área (parcial); campos ausentes caem no padrão interno
 */
export function resolverRegras(args: {
  override?: unknown
  usoAreaClassificacao?: unknown
  padraoMotor?: unknown
}): RegrasResolvidas {
  const meta = lerRegrasParciais(args.override)
  const area = lerRegrasParciais(args.usoAreaClassificacao)
  const motor = lerRegrasParciais(args.padraoMotor)
  const regras = structuredClone(REGRAS_USO_PADRAO) as RegrasUso
  const origem = {} as Record<CampoRegra, OrigemRegra>
  const dst = regras as unknown as Record<string, Record<string, unknown>>
  const camadas: [OrigemRegra, RegrasOverride][] = [['meta', meta], ['area', area], ['padrao', motor]]
  for (const campo of CAMPOS_REGRA) {
    const [g, k] = campo.split('.') as ['tempo' | 'meta', string]
    origem[campo] = 'padrao'
    for (const [o, c] of camadas) {
      const v = (c[g] as Record<string, unknown>)[k]
      if (v !== undefined) { dst[g][k] = v; origem[campo] = o; break }
    }
  }
  return { regras, origem }
}

export interface Medidas {
  paginas?: number | null
  palavras?: number | null
  artigos?: number | null
  caracteres?: number | null
}

const ok = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/**
 * Minutos da meta (inteiro, mínimo 1). `null` = não calculável: modo 'manual' ou medida ausente/0
 * (ex.: `paginas` nulo em docx) — o chamador trata como pendência, nunca chuta.
 * As medidas vêm do servidor.
 */
export function calcularMinutos(regras: Pick<RegrasUso, 'tempo'>, medidas: Medidas): number | null {
  const t = regras.tempo
  let bruto: number | null = null
  switch (t.modo) {
    case 'manual': return null
    case 'fixo': bruto = t.minutos_fixo; break
    case 'por_pagina': bruto = ok(medidas.paginas) ? medidas.paginas * t.min_por_pagina : null; break
    case 'por_palavras': bruto = ok(medidas.palavras) ? medidas.palavras / t.palavras_por_min : null; break
    case 'por_artigo': bruto = ok(medidas.artigos) ? medidas.artigos * t.min_por_artigo : null; break
    case 'por_caracteres': bruto = ok(medidas.caracteres) ? medidas.caracteres / t.caracteres_por_min : null; break
  }
  if (bruto === null || !Number.isFinite(bruto)) return null
  return Math.max(1, Math.round(bruto))
}
