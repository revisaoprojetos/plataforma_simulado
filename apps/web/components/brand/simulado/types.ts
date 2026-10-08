// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO do FLUXO DO SIMULADO por marca (spec 06) — Fase 5 do redesign.
// ─────────────────────────────────────────────────────────────────────────────
//
// Telas: Entrada → Prova → Resultado, uma composição PRÓPRIA por marca (Revisão/
// VND/MEQ). Nesta fase são PRESENTACIONAIS sobre dados MOCK (ver ./mock.ts) e
// renderizadas apenas em /simulado/preview (produção/motor de prova intactos).
// O wiring ao backend real vem em rodada dedicada.

export type Brand = 'revisao' | 'vnd' | 'meq'
export type SimTheme = 'claro' | 'escuro' | 'azul' // 'azul' só MEQ
export type Tela = 'entrada' | 'prova' | 'resultado'

/** Tipo de resposta: alternativas A–E (objetiva) ou Certo/Errado (Cebraspe). */
export type TipoResposta = 'ABCDE' | 'CE'

/** Estado da Entrada (spec §1.1 `es`). */
export type EstadoEntrada = 'aberto' | 'agendado' | 'semcad' | 'retomar' | 'encerrado'

export interface SimInfo {
  titulo: string
  curto: string
  subtitulo: string // cargo/linha secundária
  n: number // nº de questões
  tipo: TipoResposta
  banca: string // "Padrão PGE/PGM · objetiva A–E"
  duracaoMin: number | null // null = sem limite
  inicioISO: string
  fimISO: string
  /** Simulado SEM janela (sem data de início/fim) → UI mostra "Sempre aberto · sem prazo". */
  semJanela?: boolean
  inscritos: number
  regras: string[]
  recompensa: string
  permiteFolha: boolean
  permitePausa: boolean
}

export interface SimAlternativa {
  letra: string // 'A'..'E' ou 'C'/'E'
  texto: string
}

export interface SimQuestao {
  id: string
  numero: number
  materia: string
  enunciado: string
  tipo: TipoResposta
  /** Só para objetivas A–E. Em CE o componente mostra os dois botões Certo/Errado. */
  alternativas?: SimAlternativa[]
}

export interface SimTentativa {
  respostas: Record<number, string | null> // nº da questão → letra
  marcadas: number[] // flags "revisar"
  eliminadas: Record<number, string[]> // nº → letras eliminadas (tesoura)
  ultimaQuestao: number
  respondidas: number
  ultimaAtividade: string // "09:42"
  tempoRestante?: string // "2h38" (ausente na Revisão = sem limite)
}

export interface SimCorrecaoItem {
  numero: number
  materia: string
  status: 'certa' | 'errada' | 'branco'
  gabarito: string
  suaResposta: string | null
  comentario: string
  enunciado: string
  alternativas?: (SimAlternativa & { correta?: boolean; suaResposta?: boolean })[]
}

export interface SimMateriaDesempenho {
  nome: string
  total: number
  certas: number
  mediaPct?: number // média da turma (marcador)
}

export interface SimRankLinha {
  pos: number
  iniciais: string // PRIVACIDADE: só iniciais p/ terceiros (spec §0/§3.5)
  pct: number
  eu?: boolean
}

export interface SimResultado {
  certas: number
  erradas: number
  branco: number
  nota: string // "62%" ou "48" (líquida MEQ)
  posicao: number
  total: number
  percentil?: number
  mediaTurma?: number // %
  deltaMedia?: number // p.p. acima/abaixo
  tempo: string // "3h35"
  inicio: string // "08:12"
  termino: string // "11:47"
  data: string // "05/10/2026"
  cortEstimado?: number // MEQ
  liquida?: number // MEQ
  xpGanho?: number // VND
  porMateria: SimMateriaDesempenho[]
  histograma: number[] // 9 bins
  faixaAluno: number // índice do bin do aluno
  top3: SimRankLinha[]
  vizinhanca?: SimRankLinha[] // VND
  correcao: SimCorrecaoItem[]
  downloads: { grupo: string; itens: { nome: string; destaque?: boolean }[] }[]
}

export interface SimMock {
  info: SimInfo
  questoes: SimQuestao[]
  tentativa: SimTentativa
  resultado: SimResultado
  aluno: { primeiroNome: string }
  /** Contagem regressiva do estado `agendado` (fonte = servidor). */
  countdown: { dias: number; horas: number; min: number; dataLabel: string }
}

export type MetodoIdentificacao = 'email' | 'email_cpf' | 'email_telefone'

/** Ação disparada ao identificar na Entrada real. */
export type AcaoEntrada = 'iniciar' | 'folha' | 'resultado'

/**
 * Contrato de WIRING da Entrada ao backend real (rota /simulado/[token]).
 * Quando presente, o componente de Entrada deixa de ser só visual: o campo de
 * e-mail vira controlado, os botões chamam `onIdentificar` e a UI reflete
 * `carregando`/`erro`. Ausente = modo preview/mock (produção intacta).
 */
export interface SimEntradaReal {
  metodo: MetodoIdentificacao
  /** E-mail (controlado). */
  email: string
  setEmail: (v: string) => void
  cpf: string
  setCpf: (v: string) => void
  telefone: string
  setTelefone: (v: string) => void
  /** Dispara a identificação no servidor. `modo` define o destino pós-login. */
  onIdentificar: (modo: AcaoEntrada) => void
  /** Valida identidade/acesso SEM criar sessão. Resolve `true` se o aluno pode começar (→ abre o
   *  modal "Tudo pronto"); `false` quando há erro/bloqueio (a UI mostra o erro direto, sem modal). */
  onValidar?: () => Promise<boolean>
  /** Ação em curso (para spinner/disable dos botões). */
  carregando: AcaoEntrada | null
  /** Mensagem de erro de bloqueio/identidade (do backend, já personalizada). */
  erro?: { titulo?: string; mensagem: string } | null
  /** Link do botão "Voltar" (ex.: /aluno). */
  voltarHref: string
  /** Toggle de tema (claro/azul/escuro já resolvido fora). */
  onToggleTheme?: () => void
  /** Nome da plataforma para a linha "cadastrado na plataforma do …". */
  plataforma: string
  /** Simulado permite abrir só a folha de respostas? */
  permiteFolha: boolean
}

/** Props comuns a toda tela de simulado por marca. */
export interface SimScreenProps {
  theme: SimTheme
  data: SimMock
  /** Modo prévia (sem efeitos colaterais/navegação real). */
  preview?: boolean
  /** Estado inicial da Entrada (em prod vem do backend). */
  es?: EstadoEntrada
  /** Modo inicial da Prova (caderno/folha). */
  mo?: 'cad' | 'folha'
  /** Wiring real da Entrada (ausente = preview/mock). */
  real?: SimEntradaReal
}
