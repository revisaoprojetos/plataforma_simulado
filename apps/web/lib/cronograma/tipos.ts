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

/**
 * O tipo de uma meta é um SLUG livre — quem define os tipos válidos é o cadastro do
 * tenant (`simulado_cronograma_tipos_meta`), não uma união fechada aqui.
 */
export type TipoMeta = string

/**
 * Definição de um tipo de meta, com o comportamento explícito.
 *
 * Cada flag corresponde a uma regra que antes era um `if (tipo === 'x')` espalhado pelo
 * motor. Ler este objeto é ler as regras R10–R21 de forma tabular — e criar um tipo novo
 * passa a ser responder seis perguntas, em vez de mexer no código.
 */
export type TipoMetaDef = {
  id: string
  slug: string
  /** Rótulo na tela. */
  nome: string
  /** Rótulo na coluna "TIPO DE META" do DOCX. */
  rotulo_docx: string
  /** R10 — ordem dentro do dia. */
  ordem: number
  cor: string | null
  /** R11 — mostra os links de questões da aula. */
  mostra_links: boolean
  /** R12 — o conteúdo ganha o prefixo "Aula NN - ". */
  prefixo_aula: boolean
  /** R15 — com aula preenchida, exibe "Disciplina: Aula N" e ignora o conteúdo. */
  aula_no_titulo: boolean
  /** R14 — quebra o conteúdo em título + complemento. */
  quebra_conteudo: boolean
  /** R16 — entra na contagem de "Atividades". */
  conta_atividade: boolean
  /** Linha mais alta no DOCX. */
  destaque_docx: boolean
  /** Aparece em todas as páginas do DOCX, ou só onde houver meta dele. */
  sempre_no_docx: boolean
}

/** Índice slug → definição, que o motor recebe pronto. */
export type MapaTipos = Map<string, TipoMetaDef>

/**
 * Usado quando um slug não está no cadastro — meta importada com tipo que a equipe
 * ainda não cadastrou, por exemplo. Comportamento neutro: aparece, conta, sem
 * formatação especial. Melhor do que sumir da grade sem explicação.
 */
export function tipoPadrao(slug: string): TipoMetaDef {
  return {
    id: '',
    slug,
    nome: slug,
    rotulo_docx: slug.toUpperCase(),
    ordem: 999,
    cor: null,
    mostra_links: false,
    prefixo_aula: true,
    aula_no_titulo: false,
    quebra_conteudo: false,
    conta_atividade: true,
    destaque_docx: false,
    sempre_no_docx: false,
  }
}

export function acharTipo(tipos: MapaTipos, slug: string): TipoMetaDef {
  return tipos.get(slug) ?? tipoPadrao(slug)
}

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
  /** Rótulo de exibição — o nome que veio da origem. */
  disciplina: string
  /** Referência a `simulado_disciplinas`; quando existe, é a CHAVE do casamento. */
  disciplina_id?: string | null
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
  disciplina_id?: string | null
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
  /** Definição do tipo já resolvida — a UI não precisa carregar o mapa. */
  tipoDef: TipoMetaDef
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
