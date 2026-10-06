// Contrato de DADOS do Resultado interno. Os campos OBRIGATÓRIOS têm fonte real no backend
// (header, melhor, tentativas, porDisciplina, mapa, correcao, downloads). Os campos OPCIONAIS
// (turma/ranking/tempo/dificuldade/padrão + extras de marca) alimentam os blocos do mockup que
// ainda não têm fonte real — no preview vêm de valores de EXEMPLO (mock.ts). Mantendo-os opcionais,
// a assinatura `ResultadoInternoData` continua compatível: produção pode omitir e os blocos
// caem num estado neutro. A Avaliação (NPS/estrelas/report) entra via SLOT (componente real).

export type ResStatus = 'certa' | 'errada' | 'branco' | 'anulada'

export interface ResDisc { nome: string; pct: number; ac: number; tt: number; turmaPct?: number }

export interface ResTentativa {
  n: number
  nota: number | null
  acertos: number
  erros: number
  branco: number
  total: number
  pct: number
  tempo: string
  posicao: number | null
  data: string // dd/mm
  porDisc: ResDisc[]
  mapa?: ResStatus[] // sequência de status por questão (p/ barcode comparativo)
  downloads?: ResDownload[] // cadernos DESTA realização (cada tentativa com os seus)
}

export interface ResCorrecao {
  ordem: number
  enunciado: string
  disciplina: string | null
  dificuldade?: 'facil' | 'media' | 'dificil' | null
  comentario: string | null
  status: ResStatus
  gabarito: string | null
  // alternativas com % da turma que marcou (sample quando sem fonte real)
  alternativas: { letra: string; texto: string; correta: boolean; turmaPct?: number; usuario?: boolean }[]
  turmaPct?: number // % de acerto da turma nesta questão
  tempoSeg?: number // tempo do aluno nesta questão
  historico?: ResStatus[] // status por tentativa
  mudanca?: 'up' | 'down' | 'keep' | null
}

export interface ResDownload { nome: string; href: string; comGab: boolean }

// ── blocos de EXEMPLO (sample) — sem fonte real, mantidos para fidelidade visual ──────────
export interface ResDificuldade { nivel: 'facil' | 'media' | 'dificil'; pct: number; turmaPct: number; qtd: number }
export interface ResPadrao {
  marcouCpct: number // % das respostas que foram "Certo"
  marcouEpct: number
  brancoPct: number
  acertoQuandoC: number // % de acerto quando marcou C
  acertoQuandoE: number
  acertoBranco: number // sempre 0 (em branco), mas mantido p/ simetria
  dica: string
}
export interface ResHistBin { faixa: string; qtd: number; voce?: boolean }
export interface ResRankPeer { iniciais: string; nota: number; acertos: number; posicao: number; voce?: boolean }
export interface ResDificil { ordem: number; disciplina: string; turmaPct: number; seuStatus: ResStatus }
export interface ResRanking {
  participantes: number
  posicao: number
  percentil: number
  mediaTurma: number
  histograma: ResHistBin[]
  mediaMarcador: number // posição (0..100) da linha "média"
  top: ResRankPeer[] // top 5 (iniciais only)
  voce: ResRankPeer
  dificeis: ResDificil[]
  podio?: ResRankPeer[] // VND (3)
  corteEstimado?: { valor: number; diff: number; faltam: number } // MEQ
}

export interface ResultadoInternoData {
  titulo: string
  banca?: string
  short?: string // rótulo curto da capa
  notaLiberada: boolean
  gabaritoLiberado: boolean
  refazerHref: string | null
  cadernoHref?: string | null
  treinarErrosHref?: string | null
  melhor: { nota: number | null; acertos: number; erros: number; branco: number; total: number; pct: number; tempo: string; tpq?: string; posicao: number | null; participantes?: number; percentil?: number; mediaTurma?: number; xp?: number }
  tentativas: ResTentativa[]
  porDisciplina: ResDisc[]
  mapa: { ordem: number; status: ResStatus }[]
  correcao: ResCorrecao[]
  downloads: ResDownload[]
  // ── opcionais de EXEMPLO ──
  dificuldade?: ResDificuldade[]
  padrao?: ResPadrao
  ranking?: ResRanking
  tempoPorQuestao?: { ordem: number; seg: number; status: ResStatus }[]
  tempoMedia?: number // média em seg (linha tracejada)
  assuntosMaisErrados?: { assunto: string; disciplina: string; erros: number; total: number }[]
  corteEstimado?: number // MEQ — nota de corte
}
