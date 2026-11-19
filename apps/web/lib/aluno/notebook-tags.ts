// Caderno (beta) — TAGS (fase 2): lógica PURA (schemas zod, normalização, diff). Sem I/O.
import { z } from 'zod'
import { paginacaoSchema, uuidSchema } from '@/lib/aluno/notebook-tipos'

export const LIMITES_TAGS = {
  nomeMax: 40,
  tagsPorNotebook: 100,
  tagsPorPagina: 20,
  paginasIdsMax: 80,
} as const

/** Chaves de paleta aceitas (a UI resolve por CSS var; nunca hex). */
export const PALETA_TAGS = ['primaria', 'vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'roxo', 'rosa', 'cinza'] as const
export type CorTag = (typeof PALETA_TAGS)[number]

/** Nome: trim + espaços internos colapsados. */
export function normalizarNomeTag(nome: string): string {
  return nome.replace(/\s+/g, ' ').trim()
}
/** Chave de unicidade (espelha lower(nome) do índice). */
export const chaveNomeTag = (nome: string): string => normalizarNomeTag(nome).toLowerCase()

const nomeSchema = z.string().transform(normalizarNomeTag).pipe(z.string().min(1).max(LIMITES_TAGS.nomeMax))
const corSchema = z.enum(PALETA_TAGS)

export const tagCriarSchema = z.object({ nome: nomeSchema, cor: corSchema.optional() })
export const tagEditarSchema = z.object({ nome: nomeSchema.optional(), cor: corSchema.optional() })
  .refine((b) => b.nome !== undefined || b.cor !== undefined, 'nada para alterar')

/** Remove duplicatas preservando a ordem. */
export const unicos = <T,>(a: T[]): T[] => [...new Set(a)]

export const paginaTagsSchema = z.object({
  pagina_id: uuidSchema,
  tag_ids: z.array(uuidSchema).max(LIMITES_TAGS.tagsPorPagina).transform((a) => unicos(a.map((x) => x.toLowerCase()))),
})

/** GET paginas-tags?pagina_ids=a,b,c (até 80). */
export function parsePaginaIds(raw: string | null): string[] | null {
  if (!raw) return null
  const ids = unicos(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
  if (ids.length === 0 || ids.length > LIMITES_TAGS.paginasIdsMax) return null
  return ids.every((i) => uuidSchema.safeParse(i).success) ? ids : null
}

export const buscaTagsSchema = z.object({
  tag_id: uuidSchema,
  q: z.string().trim().min(2).max(100).optional(),
}).merge(paginacaoSchema.extend({ limit: z.coerce.number().int().min(1).max(30).default(20) }))

export interface DiffTags { adicionar: string[]; remover: string[] }
/** O que inserir/remover para `atual` virar `desejado`. */
export function diffTags(atual: string[], desejado: string[]): DiffTags {
  const a = new Set(atual), d = new Set(desejado)
  return { adicionar: [...d].filter((x) => !a.has(x)), remover: [...a].filter((x) => !d.has(x)) }
}

export function emChunks<T>(arr: T[], tam = 80): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += tam) out.push(arr.slice(i, i + tam))
  return out
}

/** Agrupa linhas {pagina_id, tag_id} em {pagina_id: tag_id[]} (todas as páginas pedidas presentes). */
export function agruparPorPagina(paginaIds: string[], linhas: { pagina_id: string; tag_id: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = Object.fromEntries(paginaIds.map((id) => [id, []]))
  for (const l of linhas) (out[l.pagina_id] ??= []).push(l.tag_id)
  return out
}
