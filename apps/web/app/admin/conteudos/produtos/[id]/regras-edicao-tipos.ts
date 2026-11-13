// Tipos (client-safe) da EDIÇÃO dentro da aba Regras do Produto. Os arquivos 'use server' só exportam funções async.
import type { Disponibilidade } from '@/lib/produtos/curriculo'

/** Como o público enxerga o módulo/aula (visibilidade por segmento/grupo). */
export type ModoVisibilidade = 'liberar' | 'mostrar' | 'ocultar' | 'cadeado'

export type OperacaoRegra =
  | { tipo: 'disponibilidade'; disponibilidade: Disponibilidade; prioridade?: number }
  | { tipo: 'visibilidade'; modo: ModoVisibilidade; /** só em "mostrar": o que os DEMAIS veem */ semAcesso?: 'oculto' | 'bloqueado_cadeado' }
  | { tipo: 'excecao'; acao: 'liberar' | 'bloquear'; motivo: string; /** AAAA-MM-DD ou '' (sem validade) */ validade: string }
  | { tipo: 'remover'; camadas: Array<'disponibilidade' | 'visibilidade' | 'excecao'> }

/** Alvos (ids de módulo/aula) por público (chave: todos | grupo:<id> | segmento:<id>). */
export interface ParPublico { publico: string; alvos: string[] }

export interface PedidoLote { pares: ParPublico[]; operacoes: OperacaoRegra[] }

export interface ItemLote {
  publico: string
  publicoNome: string
  operacao: string
  /** Prévia: aplicável. Execução: concluído sem erro. */
  ok: boolean
  /** Quantos módulos/aulas foram (ou seriam) tocados. */
  alvos: number
  /** Quantas regras existentes seriam/foram substituídas ou removidas. */
  substitui: number
  mensagem: string
}

export interface ResultadoLote {
  itens: ItemLote[]
  alvos: number
  publicos: number
  pares: number
  ok: number
  erros: number
  avisos: string[]
}

export interface EstadoCelula {
  /** Regra própria vigente para este público (segmento/grupo) ou, em "Todos", a base do módulo/aula. */
  disp: Disponibilidade | null
  dispOrigem: 'segmento' | 'base' | null
  visibilidade: ModoVisibilidade
  excecao: { acao: 'liberar' | 'bloquear'; motivo: string; validade: string } | null
  /** Existe segmento de grupo (grupos): sem ele a 1ª regra cria um. */
  segmentoId: string | null
  tipoAlvo: 'modulo' | 'aula'
}

export interface PublicosProduto {
  grupos: Array<{ id: string; nome: string; membros: number | null }>
  acessoGratuito: boolean
  segmentos: Array<{ id: string; nome: string; regras: number; grupoId: string | null }>
}
