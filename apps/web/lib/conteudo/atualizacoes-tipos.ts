// Tipos/constantes PUROS (sem server-only) do REGISTRO DE ATUALIZAÇÕES / PONTOS DE VERSÃO de materiais.
// Compartilhado por: server actions, loaders (lib/conteudo/atualizacoes-registro.ts), dialog admin e telas do aluno.
import type { TipoAtualizacao } from '@/lib/admin-revisao/biblioteca-tipos'
import { brtLocalParaIso, isoParaBrtLocal } from '../brt'

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
  /** O que o aluno vê (padrão: tudo). `exibicaoDisponivel=false` = migração 20261120010000 ainda não aplicada. */
  exibirData: boolean
  exibirHora: boolean
  exibirRotulo: boolean
  exibicaoDisponivel: boolean
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
  texto: string
  itens: ItemAlteracao[]
  /** Já montados no servidor com os interruptores de exibição (data/hora/rótulo); `null` = oculto. */
  tag: string | null
  rotuloExibido: string | null
}

export interface FlagsExibicao { exibirData: boolean; exibirHora: boolean; exibirRotulo: boolean }

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Data (YYYY-MM-DD) + hora opcional (HH:mm) em Brasília → ISO UTC. Hora vazia = 00:00. Inválido → null. */
export function combinarDataHoraBrt(data?: string | null, hora?: string | null): string | null {
  const d = (data ?? '').trim(), h = (hora ?? '').trim()
  if (!DATA_RE.test(d) || (h && !HORA_RE.test(h))) return null
  const iso = brtLocalParaIso(`${d}T${h || '00:00'}`)
  return iso && isoParaBrtLocal(iso).startsWith(d) ? iso : null // recusa dias inexistentes (31/02 viraria 03/03)
}

/** ISO UTC → { data: 'YYYY-MM-DD', hora: 'HH:mm' } em Brasília. 00:00 vira hora '' (campo vazio). */
export function separarDataHoraBrt(iso?: string | null): { data: string; hora: string } {
  const [data = '', hora = ''] = isoParaBrtLocal(iso).split('T')
  return { data, hora: hora === '00:00' ? '' : hora }
}

/**
 * Tag do registro (puro; usado no aluno, no aviso/notificação e na prévia do dialog).
 * data = DD/MM/AAAA se exibirData; hora = HH:mm se exibirHora (00:00 nunca é exibida); tag = "data hora" ou null (tudo oculto);
 * rotulo = rótulo só se exibirRotulo.
 */
export function montarTagAtualizacao(o: { ocorridaEm?: string | null; exibirData?: boolean; exibirHora?: boolean; exibirRotulo?: boolean; rotulo?: string | null }): { data: string | null; hora: string | null; tag: string | null; rotulo: string | null } {
  const { data: ymd, hora: hhmm } = separarDataHoraBrt(o.ocorridaEm)
  const [y, m, d] = ymd.split('-')
  const data = o.exibirData !== false && ymd ? `${d}/${m}/${y}` : null
  const hora = o.exibirHora !== false && hhmm ? hhmm : null
  const tag = [data, hora].filter(Boolean).join(' ') || null
  const rotulo = o.exibirRotulo !== false ? (o.rotulo ?? '').trim() || null : null
  return { data, hora, tag, rotulo }
}

/** "10/11/2026: texto" (ou só o texto quando a tag está oculta). */
export function prefixarTag(tag: string | null | undefined, texto: string): string {
  return tag ? (texto ? `${tag}: ${texto}` : tag) : texto
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

/** Erro de coluna ausente das flags de exibição (migração 20261120010000 pendente). */
export const COLUNA_FLAG = /exibir_(data|hora|rotulo)/i

/** Executa `run(true)` (com as colunas de exibição); se elas ainda não existem, repete `run(false)` (sem elas). Nunca 500. */
export async function comFallbackFlags<R extends { error: any }>(run: (flags: boolean) => PromiseLike<R>): Promise<R & { flags: boolean }> {
  const r = await run(true)
  if (r.error && COLUNA_FLAG.test(String(r.error.message ?? ''))) return { ...(await run(false)), flags: false }
  return { ...r, flags: true }
}
