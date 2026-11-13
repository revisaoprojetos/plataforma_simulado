// Tipos/constantes PUROS (sem server-only) do REGISTRO DE ATUALIZAÇÕES / PONTOS DE VERSÃO de materiais.
// Compartilhado por: server actions, loaders (lib/conteudo/atualizacoes-registro.ts), dialog admin e telas do aluno.
import type { TipoAtualizacao } from '@/lib/admin-revisao/biblioteca-tipos'

export type { TipoAtualizacao }
export type StatusAtualizacao = 'rascunho' | 'publicado'
export const STATUS_ATUALIZACAO: { id: StatusAtualizacao; nome: string }[] = [
  { id: 'publicado', nome: 'Publicado' },
  { id: 'rascunho', nome: 'Rascunho' },
]

/** Uma alteração dentro do ponto de versão (ex.: "Art. 5º atualizado pela Lei 15.000/2026"). */
export interface ItemAlteracao { texto: string; tipo?: TipoAtualizacao | null; local?: string | null }

export const LIMITES_ATUALIZACAO = { resumo: 2000, rotulo: 120, itens: 50, itemTexto: 500, itemLocal: 120, documentos: 200 } as const

/** Linha da lista admin (Produto › Atualizações, Biblioteca). */
export interface LinhaAtualizacao {
  id: string
  loteId: string | null
  documentoId: string
  material: string
  produtoId: string | null
  tipo: TipoAtualizacao
  rotulo: string | null
  texto: string
  itens: ItemAlteracao[]
  ocorridaEm: string
  status: StatusAtualizacao
  visivelAluno: boolean
  avisarAlunos: boolean
  criadoEm: string
  versaoId: string | null
}

export interface FiltroAtualizacoes {
  q?: string
  tipo?: TipoAtualizacao | ''
  status?: StatusAtualizacao | ''
  /** YYYY-MM-DD (Brasília), inclusivo. */
  de?: string
  ate?: string
  sort?: 'ocorrida_em' | 'rotulo' | 'tipo' | 'status' | 'criado_em'
  dir?: 'asc' | 'desc'
  page?: number
  pp?: number
  documentoId?: string | null
  produtoId?: string | null
}

/** Item que o aluno vê (já filtrado: publicado + visível + não excluído). */
export interface AtualizacaoAluno {
  id: string
  documentoId: string
  material: string
  produtoId: string | null
  produtoNome: string | null
  tipo: TipoAtualizacao
  rotulo: string | null
  texto: string
  itens: ItemAlteracao[]
  ocorridaEm: string
}

/** Normaliza/valida a lista de itens vinda do cliente (nunca confiar no payload). */
export function normalizarItens(brutos: unknown): ItemAlteracao[] {
  if (!Array.isArray(brutos)) return []
  const tipos = ['legislacao', 'jurisprudencia', 'correcao', 'conteudo_novo']
  const out: ItemAlteracao[] = []
  for (const b of brutos.slice(0, LIMITES_ATUALIZACAO.itens)) {
    const texto = String((b as any)?.texto ?? '').trim().slice(0, LIMITES_ATUALIZACAO.itemTexto)
    if (!texto) continue
    const tipo = tipos.includes((b as any)?.tipo) ? ((b as any).tipo as TipoAtualizacao) : null
    const local = String((b as any)?.local ?? '').trim().slice(0, LIMITES_ATUALIZACAO.itemLocal) || null
    out.push({ texto, tipo, local })
  }
  return out
}
