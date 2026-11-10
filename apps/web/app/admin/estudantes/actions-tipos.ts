export type EstudanteBase = {
  id: string; nome: string; email: string | null; cpf: string | null; telefone: string | null
  classificacao: string | null; created_at: string | null; avatar: string | null; avatarCor: string | null
  feitos: number; media: number | null
  /** nº de produtos com acesso ATIVO (regras de venda + catálogo). Preenchido só com agregados. */
  acessoAtivos?: number
}

export type SortEstudante = { key: 'nome' | 'classificacao' | 'created_at'; dir: 'asc' | 'desc' }
export type FiltroEstudante = 'todos' | 'passaporte' | 'estudante'

export type KpisEstudantes = { total: number; passaporte: number; feitos: number; ativos: number; adminEmails: string[] }
