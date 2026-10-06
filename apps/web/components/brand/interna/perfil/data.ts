// Contrato de DADOS REAIS do Perfil (quando ligado ao backend). Só o que tem fonte real;
// sub-widgets do mock sem dado real (heatmap dia×hora, sparklines, radar, meta diária config,
// preferências, resumo da semana) NÃO entram aqui — os componentes devem OMITI-LOS (nada de botão inerte).

export interface PerfilHeader {
  nome: string
  iniciais: string
  nivel: number
  tituloNivel: string
  xpNivelAtual: number
  xpNivelMax: number
  xpTotal: number
  liga: string | null
  posicaoLiga: number | null
  streak: number
  recorde: number
  memberSince: string | null // "março de 2024"
  foco: string | null
  avatarUrl: string | null
  avatarCor: string | null
  gamAtivo: boolean
}

export interface PerfilKpis {
  simuladosFeitos: number
  notaMedia: number | null
  acertoMedio: number | null // %
  tempoMedioMin: number | null
  melhorNota: number | null
  xpMes: number | null
}

export interface PerfilDisciplina { nome: string; aluno: number; turma: number }
export interface PerfilEvolucao { rotulo: string; nota: number }
export interface PerfilHistorico { simulado: string; quando: string; nota: number | null; acerto: number; tempo: string; href: string | null }
export interface PerfilConquista { titulo: string; desbloqueada: boolean; cor?: string | null; criterio?: string | null }
export interface PerfilLeiSeca { lei: string; feitas: number; total: number; href?: string | null }

export interface PerfilData {
  header: PerfilHeader
  kpis: PerfilKpis
  porDisciplina: PerfilDisciplina[]
  evolucao: PerfilEvolucao[]
  historico: PerfilHistorico[]
  conquistas: PerfilConquista[]
  leiSeca: PerfilLeiSeca[]
  matForte: string | null
  matReforcar: string | null
  /** Link da trilha de Lei Seca ("Ir para a trilha"). */
  trilhaHref: string
}
