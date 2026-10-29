// Tipos compartilhados do novo Cronograma — SEM 'server-only' (o design client importa daqui; o loader
// server-only importa daqui também). Forma que o design (shared.tsx) consome, produzida por nova-dados.ts.

export type GoalType = 'aula' | 'flash' | 'q' | 'lei' | 'pdf' | 'video' | 'rev'

export type MetaView = {
  id: string
  day: number
  dayLabel: string
  type: GoalType
  title: string
  dur: string
  resolverHref: string | null
}
export type SemanaView = {
  n: number
  range: string
  kind: 'conteudo' | 'revisao' | 'recesso'
  metas: MetaView[]
  grid: (MetaView[])[][]
  dias: string[]
  blocos?: { titulo: string; texto: string }[]
}
export type MeuView = { id: string; name: string; base: string; sub: string; date: string; hour: string; done: number; total: number; status: 'ativo' | 'arq' }
export type BaseView = { id: string; title: string; sub: string; via: string; since: string; cor: string }

export type PlanoView = {
  emissaoId: string
  title: string
  baseLabel: string
  totalGoals: number
  weeks: number
  currentWeek: number
  semanas: SemanaView[]
  checks: Record<string, boolean>
  doneTotal: number
  indisponivel: boolean
}

export type CronogramaData = {
  meus: MeuView[]
  meusFilter: { todos: string; ativos: string; arq: string }
  bases: BaseView[]
  plano: PlanoView | null
}
