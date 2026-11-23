// Tipos e constantes da Auditoria de Problemas (compartilhados servidor/cliente — sem lógica de banco).
import { z } from 'zod'

export const AREAS = ['cronograma', 'liberacao', 'biblioteca', 'simulados', 'curseduca', 'infra', 'migracoes'] as const
export const STATUS = ['aberto', 'em_andamento', 'resolvido'] as const
export const PRIORIDADES = ['baixa', 'media', 'alta', 'critica'] as const

export type Area = (typeof AREAS)[number]
export type StatusProblema = (typeof STATUS)[number]
export type Prioridade = (typeof PRIORIDADES)[number]

export const ROTULO_AREA: Record<Area, string> = {
  cronograma: 'Cronograma / área do aluno',
  liberacao: 'Liberação de materiais',
  biblioteca: 'Biblioteca e leitor',
  simulados: 'Simulados, desafios e streak',
  curseduca: 'Curseduca, acesso e login',
  infra: 'Infra, build e desenvolvimento',
  migracoes: 'Migrações',
}
export const ROTULO_STATUS: Record<StatusProblema, string> = { aberto: 'Aberto', em_andamento: 'Em andamento', resolvido: 'Resolvido' }
export const ROTULO_PRIORIDADE: Record<Prioridade, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' }

/** Cores SEMÂNTICAS de status (aberto = vermelho, andamento = âmbar, resolvido = verde) — única exceção a "só tokens". */
export const COR_STATUS: Record<StatusProblema, string> = {
  aberto: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  em_andamento: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  resolvido: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
}
export const COR_PRIORIDADE: Record<Prioridade, string> = {
  baixa: 'border-border bg-muted text-muted-foreground',
  media: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  alta: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  critica: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
}

/** Registro como a tela recebe (já pronto do servidor). */
export type Problema = {
  id: string
  area: Area
  assunto: string
  razao: string | null
  acao: string | null
  status: StatusProblema
  prioridade: Prioridade
  prazo: string | null // YYYY-MM-DD
  prazo_texto: string | null
  data_registro: string
  versao: string | null
  relator: string | null
  responsavel: string | null
  origem: string
  atrasado: boolean // calculado no servidor
  atualizado_em: string
}

export type HistoricoItem = {
  id: string
  problema_id: string
  assunto: string | null
  ator: string | null
  acao: string
  antes: Record<string, unknown> | null
  depois: Record<string, unknown> | null
  criado_em: string
}

export type Resumo = {
  total: number; abertos: number; em_andamento: number; resolvidos: number; atrasados: number; resolvidos_30d: number
  por_area: { area: Area; status: StatusProblema; total: number }[]
  por_prioridade: { prioridade: Prioridade; total: number }[]
  proximos: { id: string; assunto: string; area: Area; status: StatusProblema; prioridade: Prioridade; prazo: string; responsavel: string | null }[]
}

export type FiltrosProblemas = {
  q?: string
  area?: string
  status?: string
  prioridade?: string
  prazo?: string // atrasado | 7d | 30d | sem
  responsavel?: string
}

const texto = (max: number) => z.string().trim().max(max)
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')

/** Corpo de criação/edição (as rotas de API validam com isto). */
export const problemaSchema = z.object({
  area: z.enum(AREAS),
  assunto: texto(300).min(3, 'Informe o assunto.'),
  razao: texto(4000).nullish().transform((v) => v || null),
  acao: texto(4000).nullish().transform((v) => v || null),
  status: z.enum(STATUS).default('aberto'),
  prioridade: z.enum(PRIORIDADES).default('media'),
  prazo: data.nullish().transform((v) => v || null),
  prazo_texto: texto(200).nullish().transform((v) => v || null),
  data_registro: data.nullish().transform((v) => v || null),
  versao: texto(80).nullish().transform((v) => v || null),
  relator: texto(120).nullish().transform((v) => v || null),
  responsavel: texto(120).nullish().transform((v) => v || null),
})
export type ProblemaInput = z.infer<typeof problemaSchema>

export const problemaPatchSchema = problemaSchema.partial()
