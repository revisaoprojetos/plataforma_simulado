/**
 * Tipos compartilhados do módulo Cronograma.
 *
 * Vale a pena ler duas convenções antes de mexer aqui, porque ambas já causaram
 * bug no gerador legado:
 *
 * 1. `Meta.dia` é ÍNDICE dentro de `dias_curso`, NÃO o dia da semana (R3).
 *    `dia = 0` significa "o primeiro dia de curso deste cronograma".
 * 2. `Meta.aula` é TEXTO, nunca número (R11). Convivem "01", "1" e "1.1", e o
 *    casamento com os links de aula é exato — "01" não encontra "1".
 */

import type { DataISO } from './datas'

/** Os seis tipos de meta. `simulado` existe e aponta prova interna ou externa. */
export type TipoMeta = 'pdfull' | 'quest' | 'legproc' | 'flash' | 'juris' | 'simulado'

/** R10 — ordem fixa dentro do dia. Não é alfabética nem a ordem do enumerado. */
export const ORDEM_TIPO: readonly TipoMeta[] = ['pdfull', 'flash', 'legproc', 'quest', 'simulado', 'juris']

export const ROTULO_TELA: Record<TipoMeta, string> = {
  pdfull: 'PDFULL + Videoaula',
  quest: 'Resolução de Questões',
  legproc: 'Legproc',
  flash: 'PDFlash / Flashcards',
  juris: 'Atividade Extra',
  simulado: 'Simulado',
}

export const ROTULO_DOCX: Record<TipoMeta, string> = {
  pdfull: 'PDFULL OU VIDEOAULA',
  quest: 'RESOLUÇÃO DE QUESTÕES',
  legproc: 'LEGPROC',
  flash: 'PDFLASH OU FLASHCARDS',
  juris: 'ATIVIDADE EXTRA',
  simulado: 'SIMULADO',
}

/** R16 — a contagem de "Atividades" do topo ignora estes dois. */
export const TIPOS_FORA_DA_CONTAGEM: readonly TipoMeta[] = ['simulado', 'juris']

/** R13 — não é disciplina: é o valor usado quando a linha não pertence a uma matéria. */
export const PSEUDO_DISCIPLINA = 'Atividade'

/** O cronograma como está no catálogo (antes de datar e reprogramar). */
export type CronogramaFonte = {
  id: string
  slug: string
  nome: string
  total_semanas: number
  /** Dias da semana usados, em ordem. 1=segunda … 6=sábado, 0=domingo. */
  dias_curso: number[]
  /** Rótulos na mesma ordem de `dias_curso`. O tamanho é o "dias por semana" da tela. */
  dias_nome: string[]
  /** Semanas da grade original que são revisão e não têm metas (R5 as descarta). */
  semanas_revisao: number[]
  carga_horaria: number
}

/** Uma linha da grade, como está no banco. */
export type MetaFonte = {
  id: string
  semana: number
  /** ÍNDICE em `dias_curso` — ver o cabeçalho deste arquivo. */
  dia: number
  tipo: TipoMeta
  disciplina: string
  aula: string | null
  conteudo: string | null
  duracao: string | null
  ordem: number
  simulado_id: string | null
  simulado_externo_nome: string | null
  simulado_externo_url: string | null
}

/** Uma plataforma de curso cadastrada (QConcursos, TEC, Gran…). */
export type Plataforma = {
  id: string
  nome: string
  slug: string
  cor: string | null
  ordem: number
}

export type LinkAula = {
  disciplina: string
  aula: string
  tema: string | null
  /** N links, um por plataforma. Antes eram duas colunas fixas (url_qc/url_tec). */
  urls: { plataforma: Plataforma; url: string }[]
}

/**
 * R11 — o que a coluna "Links" mostra.
 *
 * Com N plataformas, listar "não há link" para cada uma cadastrada viraria ruído. O
 * espírito da regra é preservado no `ausente`: quando a aula não tem link NENHUM, o
 * texto é explícito, nunca em branco — o aluno precisa saber que não existe, e não
 * achar que a página quebrou.
 */
export type LinksMeta = {
  urls: { plataforma: Plataforma; url: string }[]
  ausente: string | null
}

/** Meta já posicionada no calendário e pronta para exibir. */
export type MetaDatada = MetaFonte & {
  data: DataISO
  /** Rótulo do dia vindo de `dias_nome`. */
  diaNome: string
  titulo: string
  complemento: string | null
  links: LinksMeta | null
  /** Só em metas `simulado` internas: se o aluno tem matrícula na prova apontada. */
  acessoSimulado?: boolean
}

export type BlocoRevisao = { titulo: string; texto: string }

export type SemanaGrade =
  | { kind: 'conteudo'; numero: number; inicio: DataISO; fim: DataISO; metas: MetaDatada[] }
  | { kind: 'revisao'; numero: number; inicio: DataISO; fim: DataISO; blocos: BlocoRevisao[] }
  | { kind: 'recesso'; numero: number; inicio: DataISO; fim: DataISO }

export type ResumoGrade = {
  /** R17 — total já COM revisões e recessos. */
  totalSemanas: number
  semanasConteudo: number
  semanasRevisao: number
  semanasRecesso: number
  /** R17 — tamanho de `dias_nome`. */
  diasPorSemana: number
  /** R16 — exclui `simulado` e `juris`. */
  atividades: number
  /** R4 — último dia de curso da última semana. */
  conclusao: DataISO
  /** R9 — recalculado, ignora o subtítulo gravado no cadastro. */
  subtitulo: string
}

export type Grade = {
  semanas: SemanaGrade[]
  resumo: ResumoGrade
  /** Problemas de DADO (não de uso) que a equipe precisa corrigir no catálogo. */
  avisos: string[]
}

export type ModoRecesso = 'nenhum' | 'natal' | 'ano_novo' | 'natal_ano_novo' | 'outras'

export type PeriodicidadeRevisao = 4 | 6 | 8 | 10 | 12

export type OpcoesGeracao = {
  inicio: DataISO
  revisao: { ativo: boolean; cada: PeriodicidadeRevisao }
  recesso: { modo: ModoRecesso; de?: DataISO; ate?: DataISO }
}
