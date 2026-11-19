// Caderno (beta) — modelo OneNote do aluno: constantes, LISTA BRANCA do doc TipTap e schemas zod dos corpos das rotas.
// Arquivo PURO (sem server-only) para ser testável. A sanitização do doc em si está em notebook-server.ts.
import { z } from 'zod'

export const LIMITES = {
  tituloMax: 200,
  secaoNomeMax: 120,
  docBytesMax: 2 * 1024 * 1024,
  docNosMax: 5000,
  docProfundidadeMax: 20,
  textoBuscaMax: 200_000,
  textoNoMax: 100_000,
  grifoTextoMax: 2000,
  htmlLegadoMax: 100_000,
  anotacaoTextoMax: 20_000,
  rectsMax: 60,
  paginasPorSecaoArvore: 200,
  buscaLimiteMax: 30,
  secoesManuaisMax: 100,
  passoOrdem: 1024,
  gapMinOrdem: 1e-6,
} as const

/** Nós permitidos (StarterKit + tabela + tarefas + 3 nós custom). Qualquer outro => 422. */
export const NOS_PERMITIDOS = [
  'doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'blockquote',
  'codeBlock', 'hardBreak', 'horizontalRule', 'table', 'tableRow', 'tableCell', 'tableHeader', 'text',
  'questaoRef', 'grifoSnapshot', 'anotacaoRef',
] as const

/** Nós "atom" (nunca têm content). */
export const NOS_ATOMICOS = new Set(['hardBreak', 'horizontalRule', 'questaoRef', 'grifoSnapshot', 'anotacaoRef', 'text'])

/** Marks permitidos. `highlight` foi incluído por constar no contrato (cor = token, nunca hex). */
export const MARKS_PERMITIDOS = ['bold', 'italic', 'underline', 'strike', 'code', 'link', 'highlight'] as const

export const ANOTACAO_ORIGENS = ['simulado_conteudo_anotacoes', 'simulado_aluno_caderno_itens'] as const

export const DOC_VAZIO = { type: 'doc', content: [{ type: 'paragraph' }] } as const

// ---------------------------------------------------------------- schemas das rotas
export const uuidSchema = z.string().uuid()
const corSchema = z.string().regex(/^[a-z0-9_-]{1,20}$/, 'cor inválida (use a chave da paleta)')
const tituloSchema = z.string().trim().max(LIMITES.tituloMax)
/** O doc é validado estruturalmente por sanitizarDoc(); aqui só garante que é um objeto. */
export const docSchema = z.object({ type: z.literal('doc') }).passthrough()
const ordemSchema = z.number().finite().min(-1e12).max(1e12)
const entreSchema = z.object({
  antes_id: uuidSchema.nullish(),   // vizinho que fica ANTES do item movido
  depois_id: uuidSchema.nullish(),  // vizinho que fica DEPOIS
})

export const secaoCriarSchema = z.object({
  nome: z.string().trim().min(1).max(LIMITES.secaoNomeMax),
  cor: corSchema.nullish(),
  ordem: ordemSchema.optional(),
  client_op_id: uuidSchema.optional(),
})

export const secaoEditarSchema = z.object({
  nome: z.string().trim().min(1).max(LIMITES.secaoNomeMax).optional(),
  cor: corSchema.nullish(),
  ordem: ordemSchema.optional(),
  entre: entreSchema.optional(),
}).refine((b) => Object.keys(b).length > 0, 'nada para alterar')

/** Valores do check do banco: 'texto' | 'folha_livre'. A API também aceita o apelido 'folha' (normalizado aqui). */
export const TIPOS_PAGINA = ['texto', 'folha_livre'] as const
export type TipoPagina = (typeof TIPOS_PAGINA)[number]
export const tipoPaginaSchema = z.enum(['texto', 'folha', 'folha_livre']).transform((t): TipoPagina => (t === 'texto' ? 'texto' : 'folha_livre'))
/** A tinta (folha livre) é validada por validarFolha() (zod próprio + limite de 1 MB); aqui só garante objeto. */
export const tintaSchema = z.object({}).passthrough()

export const paginaCriarSchema = z.object({
  secao_id: uuidSchema,
  titulo: tituloSchema.optional(),
  tipo_pagina: tipoPaginaSchema.optional(),
  doc: docSchema.optional(),
  tinta: tintaSchema.optional(),
  ordem: ordemSchema.optional(),
  client_op_id: uuidSchema,
})

export const paginaEditarSchema = z.object({
  versao: z.number().int().min(1),
  client_op_id: uuidSchema,
  doc: docSchema.optional(),
  tinta: tintaSchema.optional(),
  titulo: tituloSchema.optional(),
  secao_id: uuidSchema.optional(),
  ordem: ordemSchema.optional(),
  entre: entreSchema.optional(),
  arquivada: z.boolean().optional(),
}).refine((b) => ['doc', 'tinta', 'titulo', 'secao_id', 'ordem', 'entre', 'arquivada'].some((k) => (b as Record<string, unknown>)[k] !== undefined), 'nada para alterar')

export const paginacaoSchema = z.object({
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(30),
})

export const buscaSchema = z.object({
  q: z.string().trim().min(2).max(100),
  secao_id: uuidSchema.optional(),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  limit: z.coerce.number().int().min(1).max(LIMITES.buscaLimiteMax).default(20),
})

export type DocJson = { type: 'doc'; content: any[] }
