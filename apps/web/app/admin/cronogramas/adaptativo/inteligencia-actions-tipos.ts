/** Tipos das server actions da aba Inteligência (arquivo irmão de `inteligencia-actions.ts`: 'use server' só exporta funções async). */
import type { ImpactoPlano, ResumoTrava, DiffEventos, EventoMini } from '@/lib/cronograma/adaptativo/impacto-regras'
import type { ArquivoRegras, ResultadoImportacao } from '@/lib/cronograma/adaptativo/regras-io'

export type { ImpactoPlano, ResumoTrava, DiffEventos, EventoMini, ArquivoRegras, ResultadoImportacao }

export type CriterioAmostra = 'recentes' | 'aleatoria' | 'faixa'
export interface ParamsAmostra { tamanho: number; criterio: CriterioAmostra; seed: string }
export const AMOSTRA_MIN = 5
export const AMOSTRA_MAX = 200
export const AMOSTRA_PADRAO = 30
/** planos simulados por chamada (cada plano roda o motor até 3 vezes). */
export const LOTE_PADRAO = 5
export const LOTE_MAX = 10

export interface RespostaAcao<T = undefined> { ok: boolean; error?: string; erros?: string[]; dados?: T }

export interface LinhaImpacto {
  planoId: string
  titulo: string | null
  aluno: string
  faixa: number | null
  /** violações do plano gerado com as regras vigentes. */
  violacoesVigente: number
  erroVigente?: string
  /** vigente × padrão (ausente quando o hash é igual ao vigente). */
  padrao: ImpactoPlano | null
  /** vigente × rascunho (ausente sem rascunho). */
  rascunho: ImpactoPlano | null
}
export interface LoteImpacto {
  total: number
  lote: number
  lotes: number
  hashes: { vigente: string; padrao: string; rascunho: string | null }
  linhas: LinhaImpacto[]
  /** planos do lote que não puderam ser carregados. */
  ignorados: number
}

export interface MudancaMeta { id: string; rotulo: string; de: string; para: string | null }
export interface ResultadoLab {
  aluno: { id: string; nome: string; email: string }
  planos: Array<{ id: string; titulo: string | null; fixado: boolean }>
  planoId: string
  titulo: string | null
  hoje: string
  hashes: { vigente: string; alterada: string }
  /** campos alterados (rótulo/de/para) entre vigente e alterada. */
  campos: Array<{ path: string; rotulo: string; de: string; para: string }>
  vigente: { fim: number; violacoes: number; eventos: number; erro?: string }
  alterada: { fim: number; violacoes: number; eventos: number; erro?: string }
  impacto: ImpactoPlano
  eventos: DiffEventos
  mudancas: MudancaMeta[]
  mudancasTotal: number
}

export interface AlteracaoCampo { path: string; texto: string }

export type ResultadoTrava =
  | { ok: true; versao: number; hash: string; avisos?: string[]; resumo: ResumoTrava; parcial: boolean }
  | { ok: false; exigeConfirmacao: true; resumo: ResumoTrava; parcial: boolean; error?: undefined; conflito?: undefined; erros?: undefined }
  | { ok: false; exigeConfirmacao?: false; error: string; erros?: string[]; conflito?: boolean; resumo?: undefined; parcial?: undefined }
