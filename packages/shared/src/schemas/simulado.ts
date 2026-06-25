import { z } from 'zod'

export const SimuladoRegrasSchema = z.object({
  retentativas: z.union([z.number().int().positive(), z.literal('ilimitado')]).default(1),
  politica_nota: z.enum(['ultima', 'melhor', 'media']).default('ultima'),
  embaralhar_questoes: z.boolean().default(false),
  embaralhar_alternativas: z.boolean().default(false),
  permitir_iniciar_atrasado: z.boolean().default(true),
  tempo_proporcional_atraso: z.boolean().default(false),
  liberacao_gabarito: z.enum(['imediato', 'apos_janela', 'manual']).default('apos_janela'),
  revisao_antes_enviar: z.boolean().default(true),
  politica_anulacao: z.enum(['pontua_todos', 'desconsidera']).default('pontua_todos'),
  bloquear_multiplas_sessoes: z.boolean().default(true),
  alertar_mudanca_ip: z.boolean().default(false),
  tempo_minimo_resposta_seg: z.number().int().min(0).default(0),
})

export const SimuladoSchema = z.object({
  titulo: z.string().min(1, 'Título obrigatório'),
  descricao: z.string().optional(),
  modo_aplicacao: z.enum(['janela_fixa', 'prazo_relativo', 'aberto']),
  data_inicio: z.string().datetime().optional(),
  data_fim: z.string().datetime().optional(),
  tempo_limite_min: z.number().int().positive().optional(),
  metodo_identificacao: z.enum(['email', 'email_cpf', 'email_telefone']).optional(),
  embed_ativo: z.boolean().default(false),
  regras: SimuladoRegrasSchema.default({}),
})

export const AutoSaveSchema = z.object({
  questao_id: z.string().uuid(),
  alternativa_id: z.string().uuid().nullable(),
  tempo_resposta_seg: z.number().int().min(0).optional(),
})

export type SimuladoDto = z.infer<typeof SimuladoSchema>
export type AutoSaveDto = z.infer<typeof AutoSaveSchema>
