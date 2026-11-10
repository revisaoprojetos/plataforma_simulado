// Tipos exportados por biblioteca/gestao-actions.ts — fora do 'use server' para não quebrar o next build.

import type { KindConteudo } from '@/lib/biblioteca/tipos-conteudo'

export interface ProtecaoConteudo {
  pode_ler_plataforma: boolean; pode_baixar: boolean; pode_grifar: boolean; marca_dagua: boolean; pode_imprimir: boolean
}
export interface GestaoBase {
  id: string; titulo: string; kind: KindConteudo; tipoOrigem: string
  ehModelo: boolean
  status: string; oculto: boolean; versaoNum: number | null; versoesCount: number
  publicadoEm: string | null; criadoEm: string | null; atualizadoEm: string | null
  liberadoDe: string | null; liberadoAte: string | null
  protecao: ProtecaoConteudo
  legendaCategorias: boolean
  leituraLegproc: boolean
  leituraLegprocAuto: boolean
  legendaTabelaOculta: boolean
  contagens: { origens: number; alunos: number; vinculos: number; pacotes: number }
  fonteMidia: { tipo: 'importado' | 'link'; servico: string | null } | null
  liberado: boolean
}
export interface OrigemAcesso {
  chave: string; tipo: 'grupo' | 'aluno'; refId: string; nome: string
  origem: 'avulsa' | 'individual' | 'via_pacote'
  perms: { ler: boolean; baixar: boolean; grifar: boolean }
  liberadoDe: string | null; liberadoAte: string | null; alunos: number
}
export interface AlunoAcesso {
  id: string; nome: string; email: string | null; cpfMasc: string; avatar: string | null; cor: string | null
  recebidoPor: { origem: 'avulsa' | 'individual' | 'via_pacote'; detalhe: string }
  situacao: 'nao_abriu' | 'lendo' | 'concluiu'
  ultimoAcesso: string | null; grifos: number
}
export interface EventoRegistro {
  tipo: 'primeiro' | 'abriu' | 'baixou' | 'grifou' | 'bloqueio' | 'audit'
  acao: string; detalhe: string | null; em: string; dispositivo: string | null; ipMasc: string | null
}
export interface VinculoConteudo {
  id: string; selo: string; categoria: string; nome: string; comoLigado: string; status: string
}
export interface VersaoHistorico { id: string; numero: number; origem: string; status: string; em: string; atual: boolean }
export interface EventoEntrega { operacao: string; titulo: string; em: string }
export interface GestaoDados {
  ok: boolean; error?: string
  base?: GestaoBase
  acesso?: { origens: OrigemAcesso[]; alcanceTotal: number }
  alunos?: { itens: AlunoAcesso[]; total: number }
  vinculos?: VinculoConteudo[]
  historico?: { versoes: VersaoHistorico[]; entregas: EventoEntrega[] }
}
