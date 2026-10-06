// Mock da área "Recomendado / Para você" (spec 03 §5). Dados anonimizados e só agregados (§6):
// nunca e-mail/CPF/telefone; estatísticas coletivas apenas em números ("3.214 alunos").
// Portado de kit.page / recomendado.py (DIAG, insight, heatmap, lista de reforço, questão qcore).

import type { RecoData } from './data'
import type { QuestaoAluno } from '@/components/aluno/questao-resolvivel'

export type Prioridade = 'alta' | 'media' | 'ok'

export interface DiagMateria {
  materia: string
  acertos: number
  total: number
  pct: number
}

/** Prioridade derivada do % (recomendado.prio / spec §1.4). */
export function prioDe(pct: number): Prioridade {
  if (pct < 30) return 'alta'
  if (pct < 60) return 'media'
  return 'ok'
}

export const PRIO_LABEL: Record<Prioridade, string> = { alta: 'Alta', media: 'Média', ok: 'Ok' }
export const PRIO_LABEL_UP: Record<Prioridade, string> = { alta: 'ALTA', media: 'MÉDIA', ok: 'OK' }
// cor / fundo por faixa (spec §1.4)
export const PRIO_COR: Record<Prioridade, [string, string]> = {
  alta: ['#E5484D', 'rgba(229,72,77,.12)'],
  media: ['#D99A1E', 'rgba(217,154,30,.14)'],
  ok: ['#1FA868', 'rgba(31,168,104,.13)'],
}

// Stats do topo (spec §5): 12 matérias · 35% · 11 · 10
export const STATS = {
  materias: 12,
  acertoMedio: 35,
  paraReforcar: 11,
  questoesHoje: 10,
}

export const TOTAL_RESPONDIDAS = 263

// Diagnóstico por matéria (12 linhas — recomendado.DIAG), do pior ao melhor.
export const DIAG: DiagMateria[] = [
  { materia: 'Agrário', acertos: 0, total: 1, pct: 0 },
  { materia: 'Proc. do Trabalho', acertos: 1, total: 6, pct: 17 },
  { materia: 'Língua Portuguesa', acertos: 6, total: 32, pct: 19 },
  { materia: 'Tributário', acertos: 4, total: 16, pct: 25 },
  { materia: 'Trabalho', acertos: 5, total: 18, pct: 28 },
  { materia: 'Constitucional', acertos: 29, total: 97, pct: 30 },
  { materia: 'Previdenciário', acertos: 4, total: 10, pct: 40 },
  { materia: 'Financeiro', acertos: 4, total: 10, pct: 40 },
  { materia: 'Administrativo', acertos: 22, total: 51, pct: 43 },
  { materia: 'Ambiental', acertos: 6, total: 12, pct: 50 },
  { materia: 'Civil', acertos: 5, total: 10, pct: 50 },
  { materia: 'Processual Civil', acertos: 10, total: 10, pct: 100 },
]

// Insight (Revisão) — maior oportunidade = Língua Portuguesa 19% (spec §5)
export const INSIGHT = {
  materia: 'Língua Portuguesa',
  feitas: 32,
  pct: 19,
  projecaoPontos: 4,
  ctaMateria: 'Português',
}

// Mapa das suas matérias (VND) — grid 6 tiles por prioridade
export interface MapaTile {
  materia: string
  pct: number
  feitas: number
  total: number
}
export const MAPA: MapaTile[] = [
  { materia: 'Agrário', pct: 0, feitas: 0, total: 1 },
  { materia: 'Proc. do Trabalho', pct: 17, feitas: 1, total: 6 },
  { materia: 'Língua Portuguesa', pct: 19, feitas: 6, total: 32 },
  { materia: 'Tributário', pct: 25, feitas: 4, total: 16 },
  { materia: 'Constitucional', pct: 30, feitas: 29, total: 97 },
  { materia: 'Administrativo', pct: 43, feitas: 22, total: 51 },
]

// Heatmap matéria × banca (MEQ). null = sem questões ("—"). (spec §5)
export const BANCAS = ['FCC', 'FGV', 'Cebraspe', 'Vunesp', 'Cesgranrio'] as const
export interface HeatRow {
  materia: string
  cols: (number | null)[] // FCC, FGV, Cebraspe, Vunesp, Cesgranrio
  geral: number
}
export const HEATMAP: HeatRow[] = [
  { materia: 'Agrário', cols: [null, null, null, null, null], geral: 0 },
  { materia: 'Proc. do Trabalho', cols: [null, null, null, null, null], geral: 17 },
  { materia: 'Língua Portuguesa', cols: [null, null, 37, null, 4], geral: 19 },
  { materia: 'Tributário', cols: [32, null, 42, 25, 41], geral: 25 },
  { materia: 'Trabalho', cols: [null, 21, null, 22, 45], geral: 28 },
  { materia: 'Constitucional', cols: [48, null, 46, 32, 41], geral: 30 },
  { materia: 'Previdenciário', cols: [37, 37, null, 53, 50], geral: 40 },
  { materia: 'Financeiro', cols: [26, null, 43, null, 24], geral: 40 },
  { materia: 'Administrativo', cols: [29, 61, 45, 47, 54], geral: 43 },
  { materia: 'Ambiental', cols: [null, null, 36, null, 68], geral: 50 },
  { materia: 'Civil', cols: [60, 56, 54, null, 42], geral: 50 },
  { materia: 'Processual Civil', cols: [100, null, 90, 100, 100], geral: 100 },
]

// Lista de reforço (MEQ) — matéria-alvo + meta
export const LISTA_REFORCO = {
  total: 10,
  materiaAlvo: 'Administrativo',
  acertoAtual: 43,
  meta: 60,
  questoes: 10,
  progressoMeta: 72, // "Rumo à meta"
  atualizadoEm: 'hoje às 07:00',
}

// Motivos (VND) — "POR QUE ESSA QUESTÃO?"
export interface Motivo {
  tipo: 'erro' | 'banca' | 'nivel'
  titulo: string
  texto: string
}
export const MOTIVOS: Motivo[] = [
  { tipo: 'erro', titulo: 'Você errou 3 de 4', texto: 'questões sobre Defensoria na CF' },
  { tipo: 'banca', titulo: 'Cobrado pela FCC', texto: 'em 5 das últimas 6 provas de DPE' },
  { tipo: 'nivel', titulo: 'Nível médio', texto: '58% dos alunos acertam' },
]
export const SEQ_ACERTOS = { atual: 0, meta: 3, xp: 30 }

// ---------------------------------------------------------------- Questão (qcore)
export type Letra = 'a' | 'b' | 'c' | 'd' | 'e'
export const LETRAS: Letra[] = ['a', 'b', 'c', 'd', 'e']

export interface Alternativa {
  letra: Letra
  texto: string
}
export interface DistItem {
  letra: Letra
  pct: number
}
export interface Questao {
  // tags por marca
  tags: string[]
  enunciado: string
  alternativas: Alternativa[]
  gabarito: Letra
  comentario: string
  totalRespostas: number
  pctAcerto: number
  distribuicao: DistItem[]
}

// Revisão — Constitucional / STF, gabarito B
export const QUESTAO_REV: Questao = {
  tags: ['Direito Constitucional', '2026', 'PGM Manaus/AM (2026) – FCC'],
  enunciado: 'Compete ao Supremo Tribunal Federal:',
  alternativas: [
    { letra: 'a', texto: 'processar e julgar, originariamente, os mandados de segurança contra atos de Ministro de Estado.' },
    { letra: 'b', texto: 'julgar, em recurso ordinário, o habeas corpus decidido em única instância pelos Tribunais Superiores, se denegatória a decisão.' },
    { letra: 'c', texto: 'processar e julgar, originariamente, os Governadores dos Estados nos crimes comuns.' },
    { letra: 'd', texto: 'julgar, em recurso especial, as causas decididas em única ou última instância pelos Tribunais Regionais Federais.' },
    { letra: 'e', texto: 'processar e julgar, originariamente, os conflitos de competência entre juízes vinculados a tribunais diversos.' },
  ],
  gabarito: 'b',
  comentario:
    'Gabarito: B. Pelo art. 102, II, a, da CF, compete ao STF julgar, em recurso ordinário, o habeas corpus, o mandado de segurança, o habeas data e o mandado de injunção decididos em única instância pelos Tribunais Superiores, se denegatória a decisão. As demais alternativas trazem competências do STJ (art. 105, I, a, b e d, e III).',
  totalRespostas: 3214,
  pctAcerto: 41,
  distribuicao: [
    { letra: 'a', pct: 18 },
    { letra: 'b', pct: 41 },
    { letra: 'c', pct: 22 },
    { letra: 'd', pct: 9 },
    { letra: 'e', pct: 10 },
  ],
}

// VND — Defensoria na CF, gabarito C
export const QUESTAO_VND: Questao = {
  tags: ['Direito Constitucional', 'DPE/RJ (2025) – FGV', 'Defensoria Pública'],
  enunciado:
    'Sobre a Defensoria Pública na Constituição Federal, é correto afirmar que a Defensoria Pública é instituição permanente, essencial à função jurisdicional do Estado, incumbindo-lhe, como expressão e instrumento do regime democrático, fundamentalmente, a orientação jurídica, a promoção dos direitos humanos e a defesa dos necessitados.',
  alternativas: [
    { letra: 'a', texto: 'As Defensorias Públicas Estaduais não possuem autonomia funcional e administrativa.' },
    { letra: 'b', texto: 'O ingresso na carreira independe de concurso público de provas e títulos.' },
    { letra: 'c', texto: 'A Defensoria Pública é instituição permanente, essencial à função jurisdicional do Estado.' },
    { letra: 'd', texto: 'A atuação da Defensoria se restringe à esfera judicial, vedada a atuação extrajudicial.' },
    { letra: 'e', texto: 'A Defensoria Pública não possui legitimidade para a propositura de ação civil pública.' },
  ],
  gabarito: 'c',
  comentario:
    'Gabarito: C. É a redação do art. 134, caput, da CF (EC 80/2014). As Defensorias Estaduais têm autonomia funcional e administrativa (art. 134, §2º), o ingresso se dá por concurso público (§1º), a atuação é judicial e extrajudicial, e a legitimidade para a ação civil pública está no art. 5º, II, da Lei 7.347/85.',
  totalRespostas: 3214,
  pctAcerto: 58,
  distribuicao: [
    { letra: 'a', pct: 12 },
    { letra: 'b', pct: 9 },
    { letra: 'c', pct: 58 },
    { letra: 'd', pct: 8 },
    { letra: 'e', pct: 13 },
  ],
}

// MEQ — Administrativo, gabarito B
export const QUESTAO_MEQ: Questao = {
  tags: ['01', 'Direito Administrativo', 'PF – Agente (2024) – Cebraspe', 'Atos administrativos'],
  enunciado:
    'A respeito dos atributos do ato administrativo, assinale a opção correta.',
  alternativas: [
    { letra: 'a', texto: 'A presunção de legitimidade é atributo exclusivo dos atos administrativos vinculados.' },
    { letra: 'b', texto: 'A autoexecutoriedade permite à Administração executar diretamente suas decisões, independentemente de autorização judicial prévia, nos casos previstos em lei ou de urgência.' },
    { letra: 'c', texto: 'A imperatividade está presente em todos os atos administrativos, inclusive nos atos enunciativos.' },
    { letra: 'd', texto: 'A tipicidade não constitui atributo do ato administrativo segundo a doutrina majoritária.' },
    { letra: 'e', texto: 'A presunção de legitimidade é absoluta, não admitindo prova em contrário.' },
  ],
  gabarito: 'b',
  comentario:
    'Gabarito: B. A autoexecutoriedade é o atributo que autoriza a Administração a executar diretamente seus atos, sem necessidade de prévia manifestação do Poder Judiciário, nos casos expressamente previstos em lei ou em situações de urgência. A presunção de legitimidade é relativa (juris tantum) e alcança todos os atos; a imperatividade não está nos atos enunciativos; a tipicidade é, sim, atributo reconhecido pela doutrina.',
  totalRespostas: 3214,
  pctAcerto: 47,
  distribuicao: [
    { letra: 'a', pct: 11 },
    { letra: 'b', pct: 47 },
    { letra: 'c', pct: 14 },
    { letra: 'd', pct: 10 },
    { letra: 'e', pct: 18 },
  ],
}

// Chips de matéria do caderno (Revisão) — filtro rm
export const CADERNO_CHIPS = [
  { key: 'all', label: 'Todas' },
  { key: 'port', label: 'Língua Portuguesa' },
  { key: 'trib', label: 'Tributário' },
  { key: 'trab', label: 'Trabalho' },
  { key: 'const', label: 'Constitucional' },
]

export const CADERNO_TOTAL = 10

// ---------------------------------------------------------------- contrato data-driven (RecoData)
// Converte os mocks acima para o novo contrato `RecoData` (stats + diagnóstico + insight). Em produção,
// a página passa `data` real (diagnóstico por matéria do aluno); sem `data`, cai aqui (preview).

export function recoMock(): RecoData {
  return {
    stats: {
      materias: STATS.materias,
      acertoMedio: STATS.acertoMedio,
      paraReforcar: STATS.paraReforcar,
      questoesHoje: STATS.questoesHoje,
    },
    diagnostico: DIAG.map((d, i) => ({
      id: `diag-${i}`,
      nome: d.materia,
      ac: d.acertos,
      tot: d.total,
      pct: d.pct,
      prioridade: prioDe(d.pct),
    })),
    insight: INSIGHT
      ? { materia: INSIGHT.materia, pct: INSIGHT.pct, ac: DIAG.find((d) => d.materia === INSIGHT.materia)?.acertos ?? 0, tot: INSIGHT.feitas }
      : null,
    heatmap: {
      bancas: [...BANCAS],
      totalRespondidas: TOTAL_RESPONDIDAS,
      linhas: HEATMAP.map((h, i) => ({ id: `heat-${i}`, materia: h.materia, cols: h.cols, geral: h.geral })),
    },
  }
}

// Questões de PREVIEW (QCore) — usadas quando a página não injeta o array real `questoes`.
// Converte os mocks Questao → QuestaoAluno (dados) para o QCore novo renderizar e resolver.
function questaoMockToAluno(q: Questao, i: number): QuestaoAluno {
  const [disciplina, ...resto] = q.tags
  const banca = resto.find((t) => /–|\(/.test(t)) ?? null
  const assunto = resto.find((t) => t !== banca) ?? null
  return {
    id: `mock-reco-${i}`,
    tipo: 'objetiva',
    enunciado: q.enunciado,
    imagem_url: null,
    codigo: `#${i + 1}`,
    disciplina: disciplina ?? null,
    assunto: assunto,
    banca: banca,
    ano: null,
    comentario_professor: q.comentario,
    favorito: false,
    etiquetas: [],
    provas: [],
    alternativas: q.alternativas.map((a, idx) => ({ id: `${i}-${a.letra}`, texto: a.texto, ordem: idx, correta: a.letra === q.gabarito })),
  }
}

export function recoQuestoesMock(): QuestaoAluno[] {
  return [QUESTAO_REV, QUESTAO_VND, QUESTAO_MEQ].map(questaoMockToAluno)
}
