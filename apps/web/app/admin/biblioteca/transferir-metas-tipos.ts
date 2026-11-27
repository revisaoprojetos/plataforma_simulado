import type { ContagensTransferencia, DocResumo, ItensTransferencia } from '@/lib/conteudo/transferir-metas-pura'

export type LadoTransferencia = DocResumo & {
  /** resumo textual dos vínculos (ex.: "12 metas, 3 grifos") */
  resumo: string
  planosAtivos: number
  porTipo: Record<string, number>
}

export type PreviaTransferencia = {
  ok: boolean
  error?: string
  origem?: LadoTransferencia
  destino?: LadoTransferencia | null
  contagens?: ContagensTransferencia
  /** do destino: planos ativos que já o têm, definições ativas e vínculos meta_conteudo */
  destinoContagens?: { planos: number; defs: number; metaConteudo: number }
  bloqueios?: string[]
  avisos?: string[]
}

export type OpcoesTransferencia = {
  motivo?: string
  itens: ItensTransferencia
  /** arquiva a origem depois de transferir (sem as 4 confirmações: o pop-up já confirmou) */
  arquivarOrigem: boolean
}

export type ResultadoTransferencia = {
  ok: boolean
  error?: string
  planos?: number
  metas?: number
  metaConteudo?: number
  arquivou?: boolean
  mensagem?: string
}
