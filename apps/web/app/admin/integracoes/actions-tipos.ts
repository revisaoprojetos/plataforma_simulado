// Tipos exportados de integracoes/actions.ts
// Separados para compatibilidade com 'use server' + export type no Next.js

export interface ConfigDTO {
  provider: string
  ativo: boolean
  baseUrl: string
  camposPreenchidos: string[]
  webhookToken: string | null
  cripto: boolean
}

export interface MapeamentoDTO {
  id: string
  fonteRef: string
  fonteNome: string | null
  classificacao: string | null
  grupoId: string | null
  pastaId: string | null
  simuladoId: string | null
  ativo: boolean
}

export interface EventoDTO {
  id: string
  eventId: string
  tipo: string | null
  status: string
  comprador: string | null
  produto: string | null
  produtoCodigo?: string | null
  recebidoEm: string
  processadoEm: string | null
  erro: string | null
}

export interface EventoDetalhe {
  eventId: string
  tipo: string | null
  status: string
  erro: string | null
  recebidoEm: string
  processadoEm: string | null
  headers: unknown
  query: unknown
  body: unknown
}

export interface ReconciliacaoDTO {
  ativo: boolean
  intervaloMin: number
  grupos: number[]
  sincronizar: boolean
  ultimaExecucao: string | null
  ultimoResultado: any | null
}

export interface MapaConfigDTO {
  mapa: Record<string, string>
  ultimoPayload: unknown | null
}

export interface AssinaturaGuruDTO {
  pessoaExternalId: string
  entExternalId: string
  nome: string
  email: string | null
  cpf: string | null
  telefone: string | null
  produtoRef: string
  produtoNome: string | null
  status: string
  jaNoSistema: boolean
  temMapeamento: boolean
}

export interface AssinaturasResult {
  ok: boolean
  error?: string
  itens?: AssinaturaGuruDTO[]
  sincronizadoEm?: string | null
  total?: number
  page?: number
  totalPages?: number
  nuncaSync?: boolean
}

export interface InboxDTO {
  id: string
  metodo: string
  statusResp: number | null
  resultado: string | null
  comprador: string | null
  produto: string | null
  produtoCodigo?: string | null
  ip: string | null
  recebidoEm: string
}

export interface RecebidoDTO {
  id: string
  provider: string
  fonte: string | null
  metodo: string
  statusResp: number | null
  resultado: string | null
  comprador: string | null
  produto: string | null
  ip: string | null
  recebidoEm: string
}

export interface InboxDetalhe {
  metodo: string
  statusResp: number | null
  resultado: string | null
  ip: string | null
  recebidoEm: string
  tokenMasc: string | null
  headers: unknown
  query: unknown
  body: unknown
  bodyRaw: string | null
  resumo?: string[]
}

export interface FiltroEventos { busca?: string; status?: string; tipo?: string; periodo?: 'hoje' | '7d' | '30d' | 'todos'; pag?: number; pps?: number }
