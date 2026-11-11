// Tipos da FICHA do membro (painel de CS › Membros). Sem server-only: usados pelo cliente e pela rota de API.
export type FichaAba = 'resumo' | 'cadastro' | 'acessos' | 'plano' | 'desempenho' | 'leitura' | 'atendimento' | 'historico'
export const FICHA_ABAS: { id: FichaAba; titulo: string }[] = [
  { id: 'resumo', titulo: 'Resumo' },
  { id: 'cadastro', titulo: 'Cadastro' },
  { id: 'acessos', titulo: 'Acessos' },
  { id: 'plano', titulo: 'Plano de estudos' },
  { id: 'desempenho', titulo: 'Desempenho' },
  { id: 'leitura', titulo: 'Leitura' },
  { id: 'atendimento', titulo: 'Atendimento' },
  { id: 'historico', titulo: 'Histórico' },
]

export type Kpi = { rotulo: string; valor: string; detalhe?: string }

export type FichaResumo = {
  kpis: Kpi[]
  cadastroResumo: { classificacao: string | null; origem: string | null; criadoEm: string | null; ultimoAcesso: string | null; bloqueadoEm: string | null }
  gamificacao: { xp: number; nivel: number; liga: string | null; sequenciaAtual: number; sequenciaMaior: number; ultimoDia: string | null } | null
  tempo30d: { frente: string; segundos: number }[]
}

export type FichaCadastro = {
  id: string; nome: string; email: string | null; emailsSecundarios: string[]; cpf: string | null; cpfMascarado: boolean; telefone: string | null
  dataNascimento: string | null; classificacao: string | null; matriculaExterna: string | null; origemProvider: string | null
  criadoEm: string | null; atualizadoEm: string | null; userId: string | null; bloqueado: boolean
}

export type FichaAcessos = {
  grupos: { grupoId: string; nome: string; validade: string; origem: 'guru' | 'curseduca' | 'manual'; expiraEm: string | null }[]
  liberaveis: { id: string; nome: string; pasta: string | null }[]
  produtos: { produtoId: string; nome: string; status: string; inicio: string | null; fim: string | null; origens: string[]; temAcesso: boolean }[]
  assinaturas: { id: string; provider: string; produto: string | null; status: string; inicio: string | null; expira: string | null; origem: string | null; externalId: string | null }[]
  matriculas: { id: string; simulado: string | null; status: string | null; plano: string | null; validade: string | null; liberado: boolean | null }[]
  bloqueado: boolean
}

export type FichaPlano = {
  temPlano: boolean
  plano: { id: string; titulo: string | null; inicio: string | null; criadoEm: string | null; pausado: boolean; total: number; feitas: number; naoRealizadas: number; atrasadas: number; pct: number; semanaAtual: number | null } | null
  semanas: { semana: number; total: number; feitas: number; atrasadas: number }[]
  porTipo: { tipo: string; total: number; feitas: number }[]
  planosOutros: number
}

export type FichaDesempenho = {
  sessoes: { id: string; simulado: string | null; status: string; nota: number | null; posicao: number | null; iniciadoEm: string | null; finalizadoEm: string | null; tentativa: number | null; acertos: number | null; total: number | null }[]
  feitos: number; notaMedia: number | null; melhorNota: number | null; emAndamento: number
  disciplinas: { nome: string; acertos: number; total: number; pct: number }[]
  amostraSessoes: number
}

export type FichaLeitura = {
  documentos: { id: string; titulo: string | null; pct: number; tempoSeg: number; concluidoEm: string | null; atualizadoEm: string | null }[]
  concluidos: number; iniciados: number; tempoTotalSeg: number
  ultimoPonto: { documento: string | null; em: string | null } | null
  tempo30d: { frente: string; segundos: number; paginas: number }[]
}

export type FichaAtendimento = {
  duvidas: { id: string; titulo: string | null; status: string; criadoEm: string | null; ultimaMsgEm: string | null }[]
  requerimentos: { id: string; protocolo: string | null; tipo: string | null; status: string | null; descricao: string | null; criadoEm: string | null; respondidoEm: string | null }[]
  reportes: { id: string; tipo: string | null; mensagem: string | null; status: string | null; criadoEm: string | null }[]
}

export type FichaHistorico = {
  eventos: { id: string; operacao: string; entidade: string; ator: string | null; detalhe: string | null; em: string | null }[]
  acessos: { id: string; em: string | null; email: string | null }[]
  notificacoes: { id: string; titulo: string; lida: boolean; em: string | null }[]
}

export type FichaDados = FichaResumo | FichaCadastro | FichaAcessos | FichaPlano | FichaDesempenho | FichaLeitura | FichaAtendimento | FichaHistorico
