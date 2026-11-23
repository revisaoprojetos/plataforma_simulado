/** Tipos das server actions de regras do motor (arquivo irmão de `regras-actions.ts`: 'use server' só exporta funções async). */
import type { RegrasMotor } from '@/lib/cronograma/adaptativo/regras'
import type { Cfg } from '@/lib/cronograma/adaptativo/engine'
import type { DiffSim, ResumoSim } from '@/lib/cronograma/adaptativo/simular-regras'

export type DiffSimulacao = DiffSim
export type ResumoPlano = ResumoSim

export interface VersaoRegras {
  versao: number
  hash: string
  atualizadoEm: string | null
  atualizadoPor: string | null
  /** Campos que diferem do padrão nesta versão (o resto = padrão). */
  delta: Record<string, unknown>
  motivo?: string | null
}
export interface RegistroRegras {
  versao: number
  hash: string
  regras: RegrasMotor
  padrao: RegrasMotor
  atualizadoEm: string | null
  atualizadoPor: string | null
  /** true = nenhuma regra personalizada (comportamento padrão). */
  ehPadrao: boolean
}
export interface ResultadoRegras<T = undefined> { ok: boolean; error?: string; erros?: string[]; /** avisos não bloqueantes (ex.: conflito detectável entre restrições). */ avisos?: string[]; conflito?: boolean; dados?: T }

/** cfg mínima de exemplo para a simulação (horas por dia da semana, disciplinas, metas ligadas). */
export type CfgExemplo = Pick<Cfg, 'start' | 'horas' | 'discs' | 'metas'> & Partial<Cfg>
