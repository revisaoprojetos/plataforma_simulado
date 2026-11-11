// JurisClub (admin Plataforma Revisão) — tipos e constantes PUROS (sem 'server-only'): usáveis no client e no server.
// Espelha JC_PASTAS / JC_SELOS / JC_SG / JC_COR / JC_STEPS do protótipo (admin-plataforma-revisao, app.js).

export type PastaSlug = 'mensal' | '1a7d' | 'trim'

export interface JcPasta {
  id: PastaSlug
  n: string
  d: string
  c1: string
  c2: string
  un: string // "Edição" | "Dia" | "Simulado"
  uns: string
  item: string // "julgados" | "temas" | "questões"
  /** Pasta aplicada em OUTRO admin (Simulado Trimestral): só linka. */
  ext?: string
}

export const JC_PASTAS: JcPasta[] = [
  { id: 'mensal', n: 'JurisClub Mensal', d: 'Caderno de Jurisprudência do mês: julgados, selos, filtros e revisão V/F', c1: '#1F4E79', c2: '#CAAB4F', un: 'Edição', uns: 'edições', item: 'julgados' },
  { id: '1a7d', n: '1 Ano em 7 Dias', d: 'Desafio de 7 dias: material do dia com tópicos e caderno de questões', c1: '#7703DD', c2: '#4A91E9', un: 'Dia', uns: 'dias', item: 'temas' },
  { id: 'trim', n: 'Simulado Trimestral', d: 'Simulado com as questões V/F das 3 últimas edições. Montado no admin de simulados', c1: '#0D0631', c2: '#E5B230', un: 'Simulado', uns: 'simulados', item: 'questões', ext: '/admin/simulados' },
]

export const jcPasta = (id: string | null | undefined): JcPasta => JC_PASTAS.find((p) => p.id === id) ?? JC_PASTAS[0]

/** Selos do JurisClub: [chave, rótulo, grupo, classes de cor por token Tailwind (claro/escuro)]. */
export const JC_SELOS: { k: string; n: string; g: 'forca' | 'sit' | 'faz'; cls: string }[] = [
  { k: 'rg', n: 'Repercussão geral', g: 'forca', cls: 'border-blue-600/40 bg-blue-600/10 text-blue-700 dark:text-blue-300' },
  { k: 'rep', n: 'Repetitivo', g: 'forca', cls: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  { k: 'vinc', n: 'Vinculante', g: 'forca', cls: 'border-violet-600/40 bg-violet-600/10 text-violet-700 dark:text-violet-300' },
  { k: 'reaf', n: 'Reafirmação', g: 'sit', cls: 'border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300' },
  { k: 'sup', n: 'Superação', g: 'sit', cls: 'border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-300' },
  { k: 'nov', n: 'Novidade', g: 'sit', cls: 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  { k: 'fav', n: 'Favorável à Fazenda', g: 'faz', cls: 'border-amber-600/40 bg-amber-600/10 text-amber-700 dark:text-amber-300' },
  { k: 'desf', n: 'Desfavorável à Fazenda', g: 'faz', cls: 'border-orange-700/40 bg-orange-700/10 text-orange-800 dark:text-orange-300' },
]
export const JC_SELO_GRUPOS: Record<string, string> = { forca: 'Força da decisão', sit: 'Situação do entendimento', faz: 'Impacto para a Fazenda' }

/** Cores do card (dado escolhido pelo admin, guardado na edição — não é tema). */
export const JC_COR = ['#1F4E79', '#0D0631', '#7703DD', '#3853B8', '#4A91E9', '#17936A', '#B98408', '#C93A47']

export const JC_FILTROS_AUTO: { k: string; n: string }[] = [
  { k: 'tipo', n: 'Tipo de decisão' }, { k: 'tema', n: 'Tema' }, { k: 'orgao', n: 'Órgão julgador' }, { k: 'votacao', n: 'Votação' },
  { k: 'resultado', n: 'Resultado' }, { k: 'disp', n: 'Dispositivos citados' }, { k: 'faz', n: 'Interesse da Fazenda' },
]
export const JC_FILTROS_ALUNO = ['Disciplina', 'Tribunal', 'Selos', 'Interesse da Fazenda', 'Votação', 'Dispositivos', 'Busca']

export const JC_VERSOES: { v: 'ambos' | 'ess' | 'comp'; n: string }[] = [
  { v: 'ambos', n: 'Essencial e Completo (o aluno escolhe)' },
  { v: 'ess', n: 'Só Essencial' },
  { v: 'comp', n: 'Só Completo' },
]
export const jcVer = (v: string) => JC_VERSOES.find((x) => x.v === v)?.n ?? v

export const JC_ORDENS: { v: 'doc' | 'disc' | 'trib'; n: string }[] = [
  { v: 'doc', n: 'Como no documento' }, { v: 'disc', n: 'Por disciplina' }, { v: 'trib', n: 'STF primeiro, depois STJ' },
]

export const JC_STEPS = (p: JcPasta) => [
  'Personalizar',
  p.id === '1a7d' ? 'Material do dia' : 'Julgados',
  'Selos e filtros',
  p.id === '1a7d' ? 'Caderno de questões' : 'Questões V/F',
  'Estudantes',
  'Publicação',
]

export const JC_LIBERACOES: { k: 'leitura' | 'vf' | 'pdf' | 'cad' | 'gab'; n: string; d: (item: string) => string }[] = [
  { k: 'leitura', n: 'Leitura do caderno', d: () => 'O caderno digital com filtros e selos.' },
  { k: 'vf', n: 'Revisão V/F', d: (i) => `Perguntas rápidas ao fim de cada ${i}.` },
  { k: 'pdf', n: 'PDF original', d: () => 'Download do documento como foi diagramado.' },
  { k: 'cad', n: 'Caderno de questões', d: () => 'Questões com gabarito e comentário.' },
  { k: 'gab', n: 'Gabarito comentado em PDF', d: () => 'Download depois de responder.' },
]

export type Liberacoes = Record<'leitura' | 'vf' | 'pdf' | 'cad' | 'gab', boolean>
export type StatusEdicao = 'rascunho' | 'agendado' | 'publicado'

export interface EdicaoRow {
  id: string
  pasta: 'mensal' | '1a7d'
  titulo: string
  mes_ref: string | null
  status: StatusEdicao
  publicar_em: string | null
  publicado_em: string | null
  falta: string | null
  cor: string
  imagem_url: string | null
  versao: 'ambos' | 'ess' | 'comp'
  todos: boolean
  ordem_julgados: 'doc' | 'disc' | 'trib'
  filtros: string[]
  filtros_auto: Record<string, boolean>
  documento_id: string | null
  questoes_doc_id: string | null
  pdf_doc_id: string | null
  sem_questoes: boolean
  para_banco: boolean
  liberacoes: Liberacoes
  avisar_alunos: boolean
  destaque_inicio: boolean
  preparar_email: boolean
  n_julgados: number
  n_questoes: number
  criado_em: string
}

export interface JulgadoRow {
  id: string
  edicao_id: string
  ordem: number
  titulo: string
  tribunal: string
  orgao: string | null
  disciplina: string | null
  selos: string[]
  fazenda: boolean
  conferido: boolean
}

export interface QuestaoJcRow {
  id: string
  edicao_id: string
  julgado_id: string | null
  ordem: number
  enunciado: string
  gabarito: 'C' | 'E'
  disciplina: string | null
  assunto: string | null
  comentario: string | null
  questao_id: string | null
}

export interface ErrataRow { id: string; julgado_titulo: string | null; texto: string; avisou: boolean; criado_em: string }

/** Rascunho de julgado no passo a passo (ainda sem id). */
export interface JulgadoDraft {
  titulo: string; tribunal: string; orgao: string; disciplina: string; selos: string[]; fazenda: boolean; conferido: boolean; trecho_uid?: string | null
}
export interface QuestaoDraft { enunciado: string; gabarito: 'C' | 'E'; disciplina: string; assunto: string; comentario: string; julgadoIdx: number | null }

export const EDICAO_COLS =
  'id, pasta, titulo, mes_ref, status, publicar_em, publicado_em, falta, cor, imagem_url, versao, todos, ordem_julgados, filtros, filtros_auto, documento_id, questoes_doc_id, pdf_doc_id, sem_questoes, para_banco, liberacoes, avisar_alunos, destaque_inicio, preparar_email, n_julgados, n_questoes, criado_em'

/** "2026-10-05" / ISO → "05/10/2026" (Brasília). */
export function jcData(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(+d)) return '—'
  const br = new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const [y, m, da] = br.split('-')
  return `${da}/${m}/${y}`
}

export const jcStatusLabel = (s: string) => (s === 'publicado' ? 'No ar' : s === 'agendado' ? 'Agendado' : 'Rascunho')

/** Extrai o tribunal citado num título (STF/STJ…); padrão STF. */
export function inferirTribunal(t: string): string {
  const m = t.match(/\b(STF|STJ|TST|TSE|TCU)\b/)
  return m ? m[1] : 'STF'
}

export interface NovaEdicaoInput {
  pasta: 'mensal' | '1a7d'
  titulo: string
  mes: string
  cor: string
  imagem: string | null
  versao: 'ambos' | 'ess' | 'comp'
  todos: boolean
  grupos: string[]
  filtrosAuto: Record<string, boolean>
  documentoId: string | null
  questoesDocId: string | null
  semQ: boolean
  paraBanco: boolean
  julgados: JulgadoDraft[]
  questoes: QuestaoDraft[]
  quando: 'agora' | 'agendar'
  data: string // datetime-local (BRT)
  avisar: boolean
  destaque: boolean
  email: boolean
  ordemJulgados?: 'doc' | 'disc' | 'trib'
  filtros?: string[]
}

/** ISO → "12/09" (Brasília). */
export function jcDataCurta(iso?: string | null): string {
  const c = jcData(iso)
  return c === '—' ? c : c.slice(0, 5)
}
