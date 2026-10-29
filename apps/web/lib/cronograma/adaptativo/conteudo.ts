// Conteúdo + constantes do Cronograma Adaptativo (porte fiel do modelo).
// AS = catálogo de aulas; WLP = lei seca por semana. O seed é o conteúdo REAL
// do Revisão extraído do modelo (269 aulas, 51 semanas). Em produção, o loader
// pode trocar o seed por dados de banco por cronograma/tenant (ver nova-dados-adaptativo).
// Módulo PURO (sem 'server-only'): tipos/constantes importáveis no client.

import seed from './conteudo-seed.json'
import type { AS, WLP } from './engine'

export interface Conteudo { AS: AS; WLP: WLP }

/** Conteúdo-semente (modelo). AS: [disc, aula, tema, pags, nomeQuestoes, nomeTEC]; WLP[semana][j]. */
export const CONTEUDO_SEED: Conteudo = seed as unknown as Conteudo

export const ESSENCIAIS = ['Direito Administrativo', 'Direito Constitucional', 'Direito Civil', 'Direito Financeiro', 'Processo Civil', 'Direito Tributário', 'Direito Ambiental', 'Direito do Trabalho', 'Processo do Trabalho']
export const COMPLEMENTARES = ['Direito Agrário', 'Direito do Consumidor', 'Direito Econômico', 'Direito Empresarial', 'Direito Penal', 'Processo Penal', 'Legislação Penal Especial', 'Direito Previdenciário', 'Direito Previdenciário Público', 'Direito Urbanístico']
export const AGU: string[][] = [['Direito Eleitoral'], ['Direito Internacional', 'Direito Internacional Privado'], ['Legislação de Ensino'], ['Legislação da AGU']]
export const TODAS = [...ESSENCIAIS, ...COMPLEMENTARES, ...AGU.flat()]

/** Cor por disciplina (hex do modelo). No front é mapeada p/ token de marca quando possível. */
export const COR: Record<string, string> = {
  'Direito Administrativo': '#2f6fe0', 'Direito Agrário': '#2f9e4f', 'Direito Ambiental': '#1f7a44', 'Direito Civil': '#7c4ae0',
  'Direito Econômico': '#c27c0e', 'Direito Empresarial': '#0f84b8', 'Direito Financeiro': '#13958a', 'Direito Penal': '#c4264f',
  'Direito Previdenciário': '#6a9a18', 'Direito Previdenciário Público': '#4c7316', 'Direito Tributário': '#b5651d', 'Direito Urbanístico': '#3b5f9a',
  'Direito do Consumidor': '#d23f8a', 'Direito do Trabalho': '#8a4fd8', 'Legislação Penal Especial': '#b52c2c', 'Processo Civil': '#3d57d8',
  'Processo Penal': '#a3264a', 'Processo do Trabalho': '#6c3fc4', 'Direito Eleitoral': '#a8552b', 'Direito Internacional': '#2a5c9e',
  'Direito Internacional Privado': '#3d72b8', 'Legislação de Ensino': '#6b4fa8', 'Legislação da AGU': '#9c3a6f', 'Direito Constitucional': '#5e3ab8',
}

export interface TipoDef { nome: string; c: string; cs: string; desc: string; parte?: boolean; rev?: boolean }
export const TIPOS: Record<string, TipoDef> = {
  pf: { nome: 'PDFULL', c: 'var(--pf)', cs: 'var(--pf-soft)', desc: 'Aula nova, um por dia de estudo' },
  fl: { nome: 'Revisão', c: 'var(--fl)', cs: 'var(--fl-soft)', desc: 'Meta de revisão: você retoma o tema da aula 1 semana depois, no mesmo dia da semana, para fixar o conteúdo antes das questões. Dura 1h.' },
  qu: { nome: 'Questões', c: 'var(--qu)', cs: 'var(--qu-soft)', desc: 'Resolução 2 semanas depois, no mesmo dia · 30min' },
  lp: { nome: 'LegProc', c: 'var(--lp)', cs: 'var(--lp-soft)', desc: 'Lei seca da semana · 45min por bloco' },
  pp: { nome: 'PDFULL', c: 'var(--pf)', cs: 'var(--pf-soft)', desc: 'Parte de um PDFULL dividido entre dias', parte: true },
  rf: { nome: 'Revisão', c: 'var(--fl)', cs: 'var(--fl-soft)', desc: 'Revisão do tema na semana de revisão · 1h', rev: true },
  rq: { nome: 'Questões', c: 'var(--qu)', cs: 'var(--qu-soft)', desc: 'Questões do tema em revisão · 30min', rev: true },
}

export const MODREV: Record<string, { nome: string; curto: string; desc: string }> = {
  pdflash: { nome: 'PDFlash', curto: 'PDFlash', desc: 'Resumo da aula em poucas páginas, feito pelo Revisão.' },
  flashcard: { nome: 'Flashcards', curto: 'Flashcards', desc: 'Perguntas e respostas da aula. Você vira cada carta e marca se acertou.' },
  grifos: { nome: 'Meus grifos', curto: 'Meus grifos', desc: 'Só os trechos que você marcou no PDF e no LegProc, por cor.' },
}

export const ARR: Record<string, { nome: string; desc: string; obs: string }> = {
  pdf: { nome: 'Priorizar PDFulls', desc: 'PDFULL em todos os dias de estudo. Depois dele, nesta ordem: LegProc, revisão e questões.', obs: 'Dias com menos de 2h de estudo não recebem PDFULL: priorizam as questões da semana anterior.' },
  equilibrado: { nome: 'Equilibrado', desc: 'PDFULL em todos os dias menos um. O último dia de estudo da semana fica para revisões e questões que não entraram ao longo da semana; sobrando tempo, LegProc.', obs: 'Precisa de pelo menos 3 dias de estudo na semana.' },
  constancia: { nome: 'Constância', desc: 'Dias 1 a 4 da semana: PDFULL + LegProc. Dias 5 e 6: revisões + questões, 2 de cada por dia.', obs: 'Com 3 a 5 dias de estudo, só o último dia fica para revisões e questões.' },
}

export const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
export const DIAS3 = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']
export const CENTRAL = 'central@revisaoej.com.br'
export const REV_OPCOES = [4, 6, 8, 10, 12]
export const REV_PADRAO = 12
export const VID_MIN = 60

export const EXTRAS_META = [{ k: 'vd', nome: 'Videoaulas', desc: 'As videoaulas são um recurso complementar, abordando somente os temas mais complexos e importantes daquele assunto. Elas não substituem o estudo pelo PDFull nem nenhuma outra meta do cronograma.', nota: 'Ocupa até 1h por aula, descontada das horas de estudo do dia.' }]

export const ehRevisao = (tp: string) => tp === 'fl' || tp === 'rf'
export const ehMetaRev = (t: string) => t === 'rf' || t === 'rq'
export const ehPdf = (t: string) => t === 'pf' || t === 'pp'
export const tipoBase = (t: string) => (t === 'rf' ? 'fl' : t === 'rq' ? 'qu' : t)

export function conteudoSeed(): Conteudo { return CONTEUDO_SEED }
export function aulasPorDisc(AS: AS): Record<string, number> {
  const out: Record<string, number> = {}
  AS.forEach((a) => { out[a[0]] = (out[a[0]] || 0) + 1 })
  return out
}
