import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
})

export const EmbedIdentifySchema = z.object({
  email: z.string().email('E-mail inválido'),
  cpf: z.string().optional(),
  telefone: z.string().optional(),
  simulado_token: z.string(),
})

export type LoginDto = z.infer<typeof LoginSchema>
export type EmbedIdentifyDto = z.infer<typeof EmbedIdentifySchema>
