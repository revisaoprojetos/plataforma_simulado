// Caderno (beta) — INSERIR BLOCO DO LEITOR (fase 2): lógica PURA (schema do corpo, validação do bloco, anexar ao fim do doc).
// A lista branca de nós/attrs vem de notebook-server.ts (sanitizarDoc) — aqui só se reutiliza.
import { z } from 'zod'
import { sanitizarDoc } from '@/lib/aluno/notebook-server'
import { uuidSchema, type DocJson } from '@/lib/aluno/notebook-tipos'

export const TIPOS_BLOCO = ['grifoSnapshot', 'questaoRef', 'anotacaoRef'] as const
export type TipoBloco = (typeof TIPOS_BLOCO)[number]

export const TITULO_PAGINA_LEITOR = 'Do leitor'
export const NOME_SECAO_PADRAO = 'Geral'
/** Tentativas de PATCH otimista em conflito de versão. */
export const TENTATIVAS_CONFLITO = 3

export const blocoSchema = z.object({
  tipo: z.enum(TIPOS_BLOCO),
  attrs: z.record(z.string(), z.unknown()),
})

export const blocoCriarSchema = z.object({
  client_op_id: uuidSchema,
  bloco: blocoSchema,
  /** Destino 1: página existente. */
  pagina_id: uuidSchema.optional(),
  /** Destino 2: seção (manual) onde cai a página 'Do leitor'. Sem nenhum dos dois: seção 'Geral'. */
  secao_id: uuidSchema.optional(),
}).refine((b) => !(b.pagina_id && b.secao_id), 'informe pagina_id OU secao_id')

export type BlocoEntrada = z.infer<typeof blocoSchema>
export type ResultadoBloco = { ok: true; no: Record<string, any> } | { ok: false; erro: string }

/** Valida o bloco contra a lista branca (via sanitizarDoc) e devolve o nó limpo. */
export function validarBloco(b: BlocoEntrada): ResultadoBloco {
  const r = sanitizarDoc({ type: 'doc', content: [{ type: b.tipo, attrs: b.attrs }] })
  if (!r.ok) return { ok: false, erro: r.erro }
  const no = r.doc.content[0]
  if (!no || no.type !== b.tipo) return { ok: false, erro: 'bloco inválido' }
  return { ok: true, no }
}

const ehParagrafoVazio = (n: any) => n?.type === 'paragraph' && (!Array.isArray(n.content) || n.content.length === 0)
const ATOMOS_BLOCO = new Set<string>(TIPOS_BLOCO)

/**
 * Anexa o bloco ao FIM do doc, sem mutar a entrada. Doc "vazio" (só parágrafo vazio) é substituído; o doc sempre
 * termina em parágrafo vazio para o aluno continuar digitando depois do bloco.
 */
export function anexarBloco(doc: unknown, no: Record<string, any>): DocJson {
  const base: any[] = Array.isArray((doc as any)?.content) ? (doc as any).content : []
  let conteudo = base.length === 1 && ehParagrafoVazio(base[0]) ? [] : [...base]
  conteudo = [...conteudo, JSON.parse(JSON.stringify(no))]
  if (ATOMOS_BLOCO.has(conteudo[conteudo.length - 1]?.type)) conteudo.push({ type: 'paragraph' })
  return { type: 'doc', content: conteudo }
}

/** Anexa + sanitiza o resultado inteiro (limites de nós/bytes). */
export function anexarEValidar(doc: unknown, no: Record<string, any>): { ok: true; doc: DocJson } | { ok: false; erro: string } {
  const r = sanitizarDoc(anexarBloco(doc, no))
  return r.ok ? { ok: true, doc: r.doc } : { ok: false, erro: r.erro }
}
