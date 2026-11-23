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
  nivelMax: 2,
  lixeiraDias: 60,
  imagemBytesMax: 5 * 1024 * 1024,
  anexoBytesMax: 10 * 1024 * 1024,
  anexoNomeMax: 200,
  ordenarMax: 1000,       // máx. de páginas lidas por seção quando ordenar_por != 'manual' (ordenação em memória)
  ocorrenciasMax: 30,     // máx. de trechos devolvidos na busca com escopo 'pagina'
  paginasPorNotebookMax: 2000, // teto de páginas VIVAS por notebook (criar/copiar/restaurar/importar bloco)
  cotaArquivosBytes: 200 * 1024 * 1024, // cota de storage por aluno (tabela simulado_aluno_notebook_arquivos; sem a tabela só vale o limite por requisição)
  cotaArquivosQtd: 300,
} as const

// ---------------------------------------------------------------- Fase 2 OneNote: aparência, níveis, ordenação
/** Paleta FIXA de fundo de página (~16 cores claras, amigáveis a texto escuro). `fundo=null` = branco. A UI mapeia chave -> token CSS. */
export const PALETA_FUNDO = [
  { chave: 'amarelo', rotulo: 'Amarelo' },
  { chave: 'creme', rotulo: 'Creme' },
  { chave: 'pessego', rotulo: 'Pêssego' },
  { chave: 'laranja', rotulo: 'Laranja claro' },
  { chave: 'salmao', rotulo: 'Salmão' },
  { chave: 'rosa', rotulo: 'Rosa' },
  { chave: 'lilas', rotulo: 'Lilás' },
  { chave: 'lavanda', rotulo: 'Lavanda' },
  { chave: 'azul', rotulo: 'Azul claro' },
  { chave: 'azul_ceu', rotulo: 'Azul céu' },
  { chave: 'turquesa', rotulo: 'Turquesa' },
  { chave: 'menta', rotulo: 'Menta' },
  { chave: 'verde', rotulo: 'Verde claro' },
  { chave: 'lima', rotulo: 'Lima' },
  { chave: 'areia', rotulo: 'Areia' },
  { chave: 'cinza', rotulo: 'Cinza claro' },
] as const
export type ChaveFundo = (typeof PALETA_FUNDO)[number]['chave']
export const CHAVES_FUNDO = PALETA_FUNDO.map((c) => c.chave) as [ChaveFundo, ...ChaveFundo[]]

/** Linhas de régua / grade da página (null = sem régua). */
export const REGUAS = ['estreita', 'media', 'larga', 'extra', 'grade_p', 'grade_m', 'grade_g'] as const
export type Regua = (typeof REGUAS)[number]

/** Como a árvore ordena as páginas de uma seção (subpáginas sempre agrupadas sob a página-pai). */
export const ORDENAR_POR = ['manual', 'criacao', 'modificacao', 'titulo'] as const
export type OrdenarPor = (typeof ORDENAR_POR)[number]

export interface PaginaArvore {
  id: string
  secao_id: string
  titulo: string
  tipo_pagina: string
  ordem: number
  /** 0 = página, 1 = subpágina, 2 = sub-subpágina. Sem a migração fase 2 => sempre 0. */
  nivel: number
  criado_em: string | null
  atualizado_em: string
  /** chave de PALETA_FUNDO; null = branco */
  fundo: string | null
  /** chave de REGUAS; null = sem régua */
  regua: string | null
}

export interface SecaoArvore {
  id: string
  nome: string
  cor: string | null
  ordem: number
  tipo: string
  qtd_paginas: number
  /** Sem a migração fase 2 => 'manual'. */
  ordenar_por: OrdenarPor
}

/** Item da lixeira (página ou seção apagada nos últimos 60 dias). */
export interface ItemLixeiraPagina {
  id: string
  titulo: string
  secao_id: string
  secao_nome: string | null
  /** true => a seção de origem também está apagada (restaurar a seção primeiro). */
  secao_deletada: boolean
  deletado_em: string
}
export interface ItemLixeiraSecao { id: string; nome: string; cor: string | null; deletado_em: string; qtd_paginas: number }
export interface Lixeira {
  paginas: ItemLixeiraPagina[]
  secoes: ItemLixeiraSecao[]
  total_paginas: number
  total_secoes: number
  dias: number
}

/** Nós permitidos (StarterKit + tabela + tarefas + 3 nós custom). Qualquer outro => 422. */
export const NOS_PERMITIDOS = [
  'doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'blockquote',
  'codeBlock', 'hardBreak', 'horizontalRule', 'table', 'tableRow', 'tableCell', 'tableHeader', 'text',
  'questaoRef', 'grifoSnapshot', 'anotacaoRef',
  'image', 'anexo',
] as const

/** Nós "atom" (nunca têm content). */
export const NOS_ATOMICOS = new Set(['hardBreak', 'horizontalRule', 'questaoRef', 'grifoSnapshot', 'anotacaoRef', 'image', 'anexo', 'text'])

/** Marks permitidos. `highlight` foi incluído por constar no contrato (cor = token, nunca hex). */
export const MARKS_PERMITIDOS = ['bold', 'italic', 'underline', 'strike', 'code', 'link', 'highlight', 'subscript', 'superscript', 'textStyle'] as const

// ---------------------------------------------------------------- Onda 2a: texto rico, marcas, imagem e anexo
/** Marcas na margem do parágrafo (atributo `marca`). 'A Fazer' NÃO está aqui: é um taskItem. */
export const MARCAS_PARAGRAFO = ['importante', 'pergunta', 'lembrar', 'definicao'] as const
export type MarcaParagrafo = (typeof MARCAS_PARAGRAFO)[number]
export const ALINHAMENTOS = ['left', 'center', 'right', 'justify'] as const
/** Estilo especial de parágrafo (atributo `estilo`): 'Título da Página'. */
export const ESTILOS_PARAGRAFO = ['titulo_pagina'] as const
export const RECUO_MAX = 8
export const TAMANHO_FONTE = { min: 6, max: 200 } as const
/** Imagem: largura em px gravada no nó. */
export const IMAGEM_LARGURA = { min: 24, max: 2000 } as const
/** Rota autenticada que serve imagens/anexos do caderno (única origem aceita em `image.src`/`anexo.arquivo`). */
export const ROTA_ARQUIVOS_NOTEBOOK = '/api/aluno/notebook/arquivos'
export const EXT_IMAGEM = ['png', 'jpg', 'webp', 'gif'] as const
export const EXT_ANEXO = ['pdf', 'docx', 'xlsx', 'pptx', 'txt'] as const

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

export const ordenarPorSchema = z.enum(ORDENAR_POR)
export const fundoSchema = z.enum(CHAVES_FUNDO)
export const reguaSchema = z.enum(REGUAS)
export const nivelSchema = z.number().int().min(0).max(LIMITES.nivelMax)

export const secaoEditarSchema = z.object({
  nome: z.string().trim().min(1).max(LIMITES.secaoNomeMax).optional(),
  cor: corSchema.nullish(),
  ordem: ordemSchema.optional(),
  entre: entreSchema.optional(),
  ordenar_por: ordenarPorSchema.optional(),
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
  /** criação otimista: o front escolhe o id da nova página (uuid). Repetir com o mesmo client_op_id devolve a existente. */
  id: uuidSchema.optional(),
  /** posiciona a nova página imediatamente ANTES desta (mesma seção; ponto médio). Ignorado se `ordem` vier. */
  antes_de_id: uuidSchema.optional(),
  /** nível de recuo (0..2), com o mesmo clamp do PATCH (<= nível da página anterior + 1). */
  nivel: z.number().int().min(0).max(2).optional(),
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
  /** Fase 2: nível de subpágina (0..2; o servidor faz clamp pela página anterior). */
  nivel: nivelSchema.optional(),
  /** Fase 2: fundo (chave de PALETA_FUNDO) ou null = branco. */
  fundo: fundoSchema.nullable().optional(),
  /** Fase 2: régua/grade ou null = sem régua. */
  regua: reguaSchema.nullable().optional(),
}).refine((b) => ['doc', 'tinta', 'titulo', 'secao_id', 'ordem', 'entre', 'arquivada', 'nivel', 'fundo', 'regua'].some((k) => (b as Record<string, unknown>)[k] !== undefined), 'nada para alterar')

export const paginacaoSchema = z.object({
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(30),
})

export const ESCOPOS_BUSCA = ['pagina', 'secao', 'caderno'] as const
export type EscopoBusca = (typeof ESCOPOS_BUSCA)[number]

export const buscaSchema = z.object({
  q: z.string().trim().min(2).max(100),
  secao_id: uuidSchema.optional(),
  pagina_id: uuidSchema.optional(),
  escopo: z.enum(ESCOPOS_BUSCA).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  limit: z.coerce.number().int().min(1).max(LIMITES.buscaLimiteMax).default(20),
})

export type DocJson = { type: 'doc'; content: any[] }

/** POST /paginas/:id/mover — `antes_de_id`: página (da seção destino) que ficará DEPOIS da movida; ausente = vai para o fim. */
export const moverPaginaSchema = z.object({
  secao_id: uuidSchema,
  antes_de_id: uuidSchema.nullish(),
})

/** POST /paginas/:id/copiar — client_op_id obrigatório (idempotente, como a criação). */
export const copiarPaginaSchema = z.object({
  secao_id: uuidSchema,
  client_op_id: uuidSchema,
})

export const lixeiraSchema = z.object({
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})
