import type { CfgLiberacao, MotivoLiberacao } from '@/lib/cronograma/adaptativo/liberacao'
import type { CatalogoOverride } from '@/lib/cronograma/adaptativo/catalogo-override'
import type { ParamsAdaptativo } from '@/lib/cronograma/adaptativo/params'

export interface PainelLiberacao {
  cfg: CfgLiberacao
  hoje: string
  conteudo: { aulas: number; legproc: number; materiais: number }
  alunosComPlano: number
  grupos: { id: string; nome: string }[]
  alunosExcecao: { id: string; nome: string; email: string | null }[]
}

export interface EditorAulaBase {
  key: string; idx: number; disc: string; num: string; tema: string; pags: number; qc: string; tec: string
  docId: string | null; ativaBase: boolean
  mat: { pdflashPaginas: number | null; pdfightPaginas: number | null; videoaula: string | null; atualizacao: string | null } | null
  origem: { arquivo?: string; aba?: string; linha?: number } | null
}

export interface EditorLpBase { id: string; disc: string; leiNome: string; trecho: string; doc: string | null; origem: { arquivo?: string; aba?: string; linha?: number } | null }

export interface EditorCatalogo {
  versao: number
  atualizadoEm: string | null
  tabelaOk: boolean
  disciplinas: string[]
  aulas: EditorAulaBase[]
  /** ordem de distribuição do catálogo-base (só aulas ativas nele), por chave. */
  ordemBase: string[]
  lp: EditorLpBase[]
  override: CatalogoOverride
  alunosComPlano: number
  fonteCatalogo: string
}

export interface PainelMetas {
  params: ParamsAdaptativo
  padrao: ParamsAdaptativo
  atualizadoEm: string | null
  alunosComPlano: number
}

export interface SimulacaoAluno {
  total: number
  liberados: number
  bloqueados: number
  motivo: MotivoLiberacao | null
  proximas: Array<{ titulo: string; liberaEm: string }>
}

export interface EstadoEspelho { ok: boolean; error?: string; migrado: boolean; planos: number; espelhados: number; linhas: number }
