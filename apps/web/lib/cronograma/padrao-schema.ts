import { z } from 'zod'
import { parseISO, toISO } from './datas'

/**
 * 'YYYY-MM-DD' que EXISTE no calendário. O regex sozinho aceitava "2026-02-31" e "2026-13-45",
 * que `parseISO` transforma em outra data (ou lança) — a grade nascia deslocada ou dava 500.
 */
const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    try {
      return toISO(parseISO(d)) === d
    } catch {
      return false
    }
  }, 'Data inválida')

/** Corpo das rotas POST /api/aluno/cronograma/padrao/{previa,gerar} — mesmos campos do wizard. */
export const corpoPadraoSchema = z.object({
  cronogramaId: z.string().uuid(),
  nome: z.string().trim().max(80).default(''),
  paleta: z.string().max(40).default('revisao'),
  semDatas: z.boolean().default(false),
  opcoes: z.object({
    inicio: data,
    revisao: z.object({ ativo: z.boolean(), cada: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)]) }),
    // `de`/`ate` podem faltar em "outras" (o motor ignora o recesso pela metade — R8), mas, se vierem, têm de ser datas reais.
    recesso: z.object({
      modo: z.enum(['nenhum', 'natal', 'ano_novo', 'natal_ano_novo', 'outras']),
      de: data.optional(),
      ate: data.optional(),
    }),
  }),
})
export type CorpoPadrao = z.infer<typeof corpoPadraoSchema>
