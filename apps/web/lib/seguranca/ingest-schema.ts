import { z } from 'zod'
import { CATEGORIAS, SEVERIDADES } from './tipos'

export const achadoSchema = z.object({
  categoria: z.enum(CATEGORIAS),
  severidade: z.enum(SEVERIDADES),
  titulo: z.string().min(1).max(300),
  detalhe: z.string().max(4000).optional(),
  arquivo: z.string().max(500).optional(),
  recomendacao: z.string().max(2000).optional(),
  fingerprint: z.string().min(3).max(300),
})

export const atualizacaoSchema = z.object({
  pacote: z.string().min(1).max(200),
  versao_atual: z.string().max(80).nullish(),
  versao_alvo: z.string().max(80).nullish(),
  tipo: z.enum(['patch', 'minor', 'major']),
  cve_ids: z.array(z.string().max(80)).max(200).optional(),
  severidade: z.enum(SEVERIDADES),
})

export const ingestSchema = z.object({
  /** Quais "escopos" de fingerprint este payload cobre (p/ marcar como resolvido o que sumiu). Ex.: ['codigo:'] ou ['dep:audit:']. */
  prefixos: z.array(z.string().min(2).max(40)).max(10),
  achados: z.array(achadoSchema).max(2000).default([]),
  atualizacoes: z.array(atualizacaoSchema).max(2000).optional(),
  /** Se informado, atualizações ausentes são marcadas como aplicadas (apenas as de origem ci). */
  cobreAtualizacoes: z.boolean().optional(),
})
export type IngestPayload = z.infer<typeof ingestSchema>
