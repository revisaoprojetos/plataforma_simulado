export type MeuSimuladoResumo = {
  id: string; titulo: string; status: string; questoes: number; criadoEm: string | null
  /** Estatísticas das sessões DESTE aluno (para o card mostrar nota/tentativas, como nos oficiais). */
  tentativas: number            // sessões finalizadas
  melhorNota: number | null     // maior nota entre as finalizadas
  emAndamento: boolean          // tem sessão não finalizada
  ultimaSessaoId: string | null // sessão para "Ver resultado" (a de maior nota; desempate: mais recente)
  cor: string                   // cor da capa (regras.visual.cor)
  icone: string                 // ícone da capa (regras.visual.icone)
}

export type QuestaoEscolhida = { questaoId: string; ordem: number; enunciado: string }
/** Seção (fileira) do simulado do aluno: agrupa questões. Persistida em `regras.secoes` (jsonb). */
export type Secao = { id: string; nome: string; questaoIds: string[] }

export type QuestaoDisponivel = {
  id: string; enunciado: string
  disciplinaId: string | null; disciplina: string | null
  assuntoId: string | null; assunto: string | null
  bancaId: string | null; banca: string | null
  ano: number | null; tipo: string | null; dificuldade: string | null
  simuladoId: string | null; simulado: string | null
  favorito: boolean
}
export type OpcoesFiltro = {
  disciplinas: { id: string; nome: string }[]
  assuntos: { id: string; nome: string; disciplinaId: string | null }[]
  bancas: { id: string; nome: string }[]
  simulados: { id: string; nome: string }[]
  anos: number[]
  tipos: string[]
  dificuldades: string[]
}
