// Contrato de DADOS da HOME do aluno (spec 03 §3.5). As telas por marca consomem `HomeData`.
// Modelado para espelhar os dados reais do portal — facilita o wiring futuro (/aluno) ao backend.

import type { Brand, InternaTheme } from '../interna-tokens'

export type { Brand, InternaTheme }

export interface HomeUsuario {
  nome: string
  iniciais: string
  nivel: number
  tituloNivel: string // "Aprovado"
  proximoTitulo: string // "Mestre"
  xpNivelAtual: number
  xpNivelMax: number
  xpTotal: number
  liga: string
  posicaoLiga: number
  xpParaProximaLiga: number
  plano: string // "PRO"
}

export interface HomeSemanaDia {
  dia: string // "SEG"
  estudou: boolean
}

export interface HomeSequenciaMeta {
  diasSeguidos: number
  recordeDias: number
  semana: HomeSemanaDia[]
  checkinHoje: boolean
  metaDiariaXp: number
  xpHoje: number
  bauDias: number
  bauXp: number
}

export interface HomeMissao {
  titulo: string
  xp: number
  progresso: number
  total: number
}

export interface HomeCapa {
  rotulo: string
  sub: string
  cores?: string // gradiente opcional
  capa?: string | null // imagem REAL do simulado (capa do card). Quando há, substitui o texto na capa.
}

export interface HomeContinuar {
  simuladoId: string
  titulo: string
  capa: HomeCapa
  questaoAtual: number
  totalQuestoes: number
  tempoRestante: string
  acertos?: number
  ultimaAtividade: string
  cadernoUrl?: string
}

export interface HomeResumo {
  simuladosFeitos: number
  questoesResolvidas: number
  taxaAcerto: number
  pendentes: number
}

export interface HomeDesempenhoMateria {
  materia: string
  pctAcerto: number
}

export interface HomeAgendaItem {
  diaSemana: string
  data: string
  titulo: string
  detalhe: string
}

export interface HomeDestaque {
  eyebrow: string
  titulo: string
  subtitulo: string
  chips: string[]
  cta: { rotulo: string; url: string }
  cores?: string
  fundoTexto?: string
  /** Imagem de fundo do slide (banners reais da plataforma, que são imagens). */
  imagem?: string | null
  /** Oculta os botões de ação do slide (ex.: slide "cara nova" = só texto + animação). */
  semAcoes?: boolean
}

export interface HomeSimuladoCard {
  id: string
  titulo: string
  capa: HomeCapa
  tipo: string // "Inédito" | "Prova real"
  banca: string
  /** Texto de disponibilidade real (ex.: "Sempre disponível", "Início 10/10 · Encerra 10/10"). */
  quando?: string
  status: string // "Em andamento" | "Não iniciado" | "Concluído"
  progresso: number // 0–100
  cadernoUrl?: string
  /** Link para abrir/retomar o simulado (runner). Null = sem token/sem acesso. */
  fazerUrl?: string | null
}

export interface HomePasta {
  id: string
  nome: string
  rotuloCapa: string
  subCapa: string
  qtdSimulados: number
  concluidos?: number // MEQ
  categoria: string // filtro (esfera/cargo/área)
  /** Imagem REAL da pasta (capa do card) + cor da marca da pasta. */
  capa?: string | null
  cor?: string | null
}

export interface HomeMeqObjetivo {
  cargoAlvo: string
  dataProva: string
  banca: string
  diasRestantes: number
  pctPlano: number
  focoArea: string
}

export interface HomeData {
  usuario: HomeUsuario
  sequenciaMeta: HomeSequenciaMeta
  missoes: HomeMissao[]
  renovaEm: string
  continuar: HomeContinuar | null
  resumo: HomeResumo
  desempenho: HomeDesempenhoMateria[]
  pontoAtencao: string
  agenda: HomeAgendaItem[]
  destaques: HomeDestaque[]
  recentes: HomeSimuladoCard[]
  pastas: HomePasta[]
  outros: HomeSimuladoCard[]
  outrosDisponiveis: number
  /** Só MEQ. */
  meqObjetivo?: HomeMeqObjetivo
  /** Cargos/áreas do aluno p/ o texto rotativo (VND/MEQ). */
  rotativo?: string[]
  /** Gamificação ligada p/ este aluno? false = esconde XP/nível/sequência/missões/liga na home. Default: true. */
  gamAtivo?: boolean
  /** Cronograma ativo no tenant? false = esconde o card "Sua semana" (flag OCULTAR_CRONOGRAMA). Default: true. */
  cronogramaAtivo?: boolean
}

export interface HomeScreenProps {
  brand: Brand
  theme: InternaTheme
  data: HomeData
  preview?: boolean
}
