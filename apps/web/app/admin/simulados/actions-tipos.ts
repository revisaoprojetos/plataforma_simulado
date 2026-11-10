// Tipos de actions.ts — sem 'use server' para não quebrar o next build

export interface EstudanteLinkado {
  id: string
  nome: string
  email: string | null
  cpf: string | null
  telefone: string | null
  classificacao: string
  liberado: boolean
  situacao: 'finalizou' | 'em_andamento' | 'nao_iniciou'
  nota: number | null
}

export type SituacaoAoVivo = 'fazendo' | 'pausado' | 'finalizou' | 'nao_iniciou'

export interface ProgressoEstudante {
  id: string
  nome: string
  email: string | null
  respondidas: number  // questões marcadas (acertos + erros)
  acertos: number
  erros: number
  emBranco: number
  media: number        // aproveitamento 0–100 (acertos / total)
  situacao: SituacaoAoVivo         // estado ao vivo (fazendo agora / pausado / finalizou / não iniciou)
  ultimaAtividadeMs: number | null // epoch ms da última atividade (resposta ou início); null se não iniciou
}

export interface Testador { id: string; estudante_id: string; nome: string; email: string | null; criado_em: string }

export interface SessaoLinkada {
  id: string
  estudante: string
  status: string
  nota: number | null
  iniciado_em: string | null
  finalizado_em: string | null
  is_teste: boolean
}

export type EstudanteBuscaItem = { id: string; nome: string; email: string | null; telefone: string | null; cpf: string | null; classificacao: string | null; avatar: string | null; perfil_avatar_cor: string | null }

export type QuestaoWizardItem = { id: string; enunciado: string; disciplina: string | null; banca: string | null }
