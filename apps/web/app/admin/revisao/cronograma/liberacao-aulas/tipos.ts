// Tipos (e constantes puras) da sub-aba "Liberação de aulas" do Gerador de Cronograma. Arquivo SEM 'use server'
// (actions.ts só pode exportar funções async).

export type SemPlano = 'planilha' | 'liberado' | 'atual'
export type ComPlano = 'concluir_meta' | 'plano' | 'mais_cedo'

export interface LiberacaoCfg { ativo: boolean; sem_plano: SemPlano; com_plano: ComPlano; dias_antes: number }
export const CFG_PADRAO: LiberacaoCfg = { ativo: false, sem_plano: 'planilha', com_plano: 'concluir_meta', dias_antes: 0 }

export interface ProdutoOpcao { id: string; nome: string; tipo: string }

export interface LinhaLiberacao {
  id: string
  ordem: number
  disciplina: string
  numeroAula: number | null
  titulo: string
  dataLiberacao: string // YYYY-MM-DD
  diaSemana: string
  cronogramas: string | null
  semana: number | null
  observacao: string | null
  dataOriginal: string | null
  moduloId: string | null
  aulaId: string | null
  aulaTitulo: string | null
  ativo: boolean
}

/** Aula (submódulo) do produto, para o seletor de vínculo. */
export interface AulaOpcao { id: string; titulo: string; moduloId: string; disciplina: string }

export interface FiltrosLiberacao {
  q?: string
  disc?: string
  vinc?: 'sim' | 'nao'
  de?: string
  ate?: string
  ativo?: 'sim' | 'nao'
  ord?: string
  dir?: 'asc' | 'desc'
}

export interface ResumoLiberacao { total: number; vinculadas: number; semVinculo: number; proxima: { data: string; titulo: string; disciplina: string } | null; jaLiberadas: number }

export interface EntradaLinha {
  id?: string
  disciplina: string
  numeroAula: number | null
  titulo: string
  dataLiberacao: string
  cronogramas?: string | null
  semana?: number | null
  observacao?: string | null
  aulaId: string | null
  ativo?: boolean
}

export type AcaoMassa =
  | { tipo: 'data'; data: string }
  | { tipo: 'deslocar'; dias: number }
  | { tipo: 'ativo'; ativo: boolean }
  | { tipo: 'vincular'; aulaId: string | null }
  | { tipo: 'excluir' }

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string }

// ── prévia da importação (resposta da rota de API) ──
export interface PreviaLinha {
  ordem: number
  disciplina: string
  numeroAula: number | null
  titulo: string
  dataLiberacao: string
  aulaId: string | null
  aulaTitulo: string | null
  metodo: 'numero' | 'titulo' | 'ordem' | 'nenhum'
  suspeito: boolean
  motivo?: string
}
export interface PreviaImportacao {
  total: number
  casadas: number
  semVinculo: number
  suspeitas: number
  invalidas: Array<{ linha: number; motivo: string }>
  existentes: number
  linhas: PreviaLinha[]
}

export const PPS_LIBERACAO = [10, 14, 25, 50, 100]
export const PP_PADRAO_LIBERACAO = 14

export const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
/** Dia da semana de uma data civil YYYY-MM-DD (sem fuso). */
export function diaSemanaDe(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? '' : DIAS_SEMANA[d.getUTCDay()]
}
/** DD/MM/AAAA a partir de YYYY-MM-DD. */
export const dataBr = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10)
}
