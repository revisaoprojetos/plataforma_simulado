import { z } from 'zod'

export const AlternativaSchema = z.object({
  texto: z.string().min(1),
  correta: z.boolean(),
  ordem: z.number().int().min(0),
})

export const QuestaoSchema = z.object({
  tipo: z.enum(['objetiva', 'discursiva']),
  enunciado: z.string().min(1, 'Enunciado obrigatório'),
  banca_id: z.string().uuid().optional(),
  orgao_id: z.string().uuid().optional(),
  ano: z.number().int().min(1900).max(2100).optional(),
  disciplina_id: z.string().uuid().optional(),
  assunto_id: z.string().uuid().optional(),
  nivel_dificuldade: z.enum(['facil', 'medio', 'dificil']).optional(),
  gabarito_tipo: z.enum(['oficial', 'extraoficial']).optional(),
  comentario_professor: z.string().optional(),
  status: z.enum(['rascunho', 'publicada', 'arquivada']).default('rascunho'),
  alternativas: z.array(AlternativaSchema).optional(),
  etiqueta_ids: z.array(z.string().uuid()).optional(),
  pasta_id: z.string().uuid().optional(),
})

export type QuestaoDto = z.infer<typeof QuestaoSchema>
