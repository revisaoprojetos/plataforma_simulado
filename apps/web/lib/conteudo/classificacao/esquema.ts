// Esquemas (zod) da CLASSIFICAÇÃO de conteúdo: `exibicao` (vive em simulado_conteudo_tipos.exibicao) e
// `regras de uso` (simulado_conteudo_regras_uso.regras / simulado_conteudo_selecao_meta.regras_override).
// Puro: sem I/O. Tempo e regras de meta NÃO moram na classificação (plano §1.5).
import { z } from 'zod'

export const VERSAO_ESQUEMA_EXIBICAO = 1
export const VERSAO_ESQUEMA_REGRAS = 1

const SLUG_FORMATO = /^[a-z0-9][a-z0-9_-]{1,39}$/

export const TIPOS_INDICE = ['livro', 'parte', 'titulo', 'capitulo', 'secao', 'subsecao', 'artigo'] as const
export type TipoIndice = (typeof TIPOS_INDICE)[number]

// ───────────── Exibição ─────────────
export const IndiceExibicaoSchema = z.object({
  tipos: z.array(z.enum(TIPOS_INDICE)).default(['titulo', 'capitulo', 'secao', 'artigo']),
  nivel_max: z.number().int().min(1).max(6).default(4),
  artigos_agrupados: z.boolean().default(false),
  incluir_caixas: z.boolean().default(false),
})

export const ExibicaoClassificacaoSchema = z.object({
  versao: z.number().int().min(1).default(VERSAO_ESQUEMA_EXIBICAO),
  formato_leitura: z.string().regex(SLUG_FORMATO).nullable().default(null),
  indice: IndiceExibicaoSchema.default({}),
  legenda: z.boolean().default(false),
  nome_aluno: z.string().trim().max(60).nullable().default(null),
  cor: z.string().trim().max(40).nullable().default(null),
})
export type ExibicaoClassificacao = z.infer<typeof ExibicaoClassificacaoSchema>

/** Lê o jsonb do banco: `{}`/null/inválido → defaults (nunca lança). */
export function lerExibicao(bruto: unknown): ExibicaoClassificacao {
  const r = ExibicaoClassificacaoSchema.safeParse(bruto ?? {})
  return r.success ? r.data : ExibicaoClassificacaoSchema.parse({})
}

// ───────────── Regras de uso ─────────────
export const MODOS_TEMPO = ['por_pagina', 'por_palavras', 'por_artigo', 'por_caracteres', 'fixo', 'manual'] as const
export type ModoTempo = (typeof MODOS_TEMPO)[number]

const pos = z.number().positive().finite()

export const TempoSchema = z.object({
  modo: z.enum(MODOS_TEMPO),
  /** modo por_pagina: minutos por página */
  min_por_pagina: pos,
  /** modo por_palavras: palavras lidas por minuto */
  palavras_por_min: pos,
  /** modo por_artigo: minutos por artigo */
  min_por_artigo: pos,
  /** modo por_caracteres: caracteres lidos por minuto */
  caracteres_por_min: pos,
  /** modo fixo: minutos fixos */
  minutos_fixo: pos,
})

export const MetaSchema = z.object({
  gera_meta: z.boolean(),
  qtd_semana: z.number().int().min(0).max(100),
  aceita_partes: z.boolean(),
  conta_como_aula: z.boolean(),
  entra_liberacao: z.boolean(),
  prioridade: z.number().int().min(0).max(1000),
})

/** Regras completas (todos os campos presentes). */
export const RegrasUsoSchema = z.object({
  versao: z.number().int().min(1),
  tempo: TempoSchema,
  meta: MetaSchema,
})
export type RegrasUso = z.infer<typeof RegrasUsoSchema>

/** Padrão interno (último degrau da cascata quando nem o motor define o campo). WPM=200 como hoje no front. */
export const REGRAS_USO_PADRAO: RegrasUso = {
  versao: VERSAO_ESQUEMA_REGRAS,
  tempo: { modo: 'por_palavras', min_por_pagina: 2, palavras_por_min: 200, min_por_artigo: 1, caracteres_por_min: 1000, minutos_fixo: 30 },
  meta: { gera_meta: false, qtd_semana: 1, aceita_partes: false, conta_como_aula: false, entra_liberacao: true, prioridade: 50 },
}

/** Override/regras PARCIAIS (qualquer subconjunto de campos). Chaves desconhecidas são descartadas. */
export const RegrasOverrideSchema = z.object({
  versao: z.number().int().min(1).optional(),
  tempo: TempoSchema.partial().default({}),
  meta: MetaSchema.partial().default({}),
})
export type RegrasOverride = z.infer<typeof RegrasOverrideSchema>

/** Lê jsonb parcial campo a campo (um campo inválido não derruba os demais). Nunca lança. */
export function lerRegrasParciais(bruto: unknown): RegrasOverride {
  const out: RegrasOverride = { tempo: {}, meta: {} }
  if (!bruto || typeof bruto !== 'object') return out
  const b = bruto as Record<string, unknown>
  const v = z.number().int().min(1).safeParse(b.versao)
  if (v.success) out.versao = v.data
  for (const grupo of ['tempo', 'meta'] as const) {
    const src = b[grupo]
    if (!src || typeof src !== 'object') continue
    const shape = (grupo === 'tempo' ? TempoSchema : MetaSchema).shape as Record<string, z.ZodTypeAny>
    for (const [k, sch] of Object.entries(shape)) {
      const val = (src as Record<string, unknown>)[k]
      if (val === undefined || val === null) continue
      const r = sch.safeParse(val)
      if (r.success) (out[grupo] as Record<string, unknown>)[k] = r.data
    }
  }
  return out
}
