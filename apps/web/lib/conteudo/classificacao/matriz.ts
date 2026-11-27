// Matriz de classificação da Biblioteca (Fase 5) — PURO (sem I/O). Resolve a classificação EFETIVA de cada documento
// (documento → pasta mais próxima → 'comportamento atual' pdfull → pendência), monta os filtros SQL e sugere tipos.
// Reusa heranca.ts (resolverClassificacaoDoc) e o modelo `origemTipoId` de metas-pasta-heranca.ts.
import { calcularHeranca, type PastaHeranca } from '@/lib/admin/metas-pasta-heranca'
import { resolverClassificacaoDoc, type ItemCatalogo } from './heranca'

export interface ItemCat extends ItemCatalogo {
  slug: string
  nome: string
  cor?: string | null
  ativo?: boolean
  /** formato de leitura padrão da classificação (`exibicao.formato_leitura`). */
  formatoLeitura?: string | null
}

export type PastaMatriz = PastaHeranca & { nome: string }

export interface InfoPasta {
  /** classificacao_id efetivo da pasta (via slug `cronograma_tipo_material` → catálogo). null = nenhum. */
  classificacaoId: string | null
  /** pasta que originou a classificação (ela mesma ou ancestral). */
  origemClassificacaoPastaId: string | null
  disciplinaId: string | null
  origemDisciplinaPastaId: string | null
}

/** Mapa pasta → classificação/disciplina efetivas (herança por pai_id). Slug fora do catálogo é ignorado. */
export function mapaHerancaPastas(pastas: readonly PastaMatriz[], catalogo: readonly ItemCat[]): Map<string, InfoPasta> {
  const idPorSlug = new Map(catalogo.map((c) => [c.slug, c.id] as const))
  const her = calcularHeranca(pastas.map(({ id, paiId, disciplinaId, tipoMaterial }) => ({ id, paiId, disciplinaId, tipoMaterial })), new Set(idPorSlug.keys()))
  const out = new Map<string, InfoPasta>()
  for (const p of pastas) {
    const h = her.get(p.id)
    const origem = h?.origemTipoId ?? null
    out.set(p.id, {
      classificacaoId: origem ? idPorSlug.get(h!.tipoEfetivo) ?? null : null,
      origemClassificacaoPastaId: origem,
      disciplinaId: h?.disciplinaId ?? null,
      origemDisciplinaPastaId: h?.origemDisciplinaId ?? null,
    })
  }
  return out
}

export type OrigemEfetiva = 'definida' | 'herdada' | 'legado' | 'nenhuma'

export interface Efetiva {
  classificacao: ItemCat | null
  origem: OrigemEfetiva
  /** pasta de onde herdou (origem 'herdada'). */
  pastaOrigemId: string | null
  /** true = 'sem classificação' (pendência). */
  pendente: boolean
  /** true = valor exibido é só o que o motor de hoje faria (fallback pdfull), não uma classificação gravada. */
  comportamentoAtual: boolean
}

export function resolverEfetiva(args: {
  docClassId: string | null | undefined
  pastaId: string | null | undefined
  mapa: ReadonlyMap<string, InfoPasta>
  catalogo: readonly ItemCat[]
  /** só para exibir o que o motor de hoje faria (slug 'pdfull'); null/omitido = pendência pura. */
  fallbackLegado?: ItemCat | null
}): Efetiva {
  const { docClassId, pastaId, mapa, catalogo, fallbackLegado } = args
  const info = pastaId ? mapa.get(pastaId) : undefined
  const anc = info?.classificacaoId && info.origemClassificacaoPastaId
    ? [{ id: info.origemClassificacaoPastaId, classificacaoId: info.classificacaoId }] : []
  const r = resolverClassificacaoDoc<ItemCat>({ docClassId, pastasAncestrais: anc, catalogo, fallbackLegado: fallbackLegado ?? null })
  if (r.origem === 'documento') return { classificacao: r.classificacao, origem: 'definida', pastaOrigemId: null, pendente: false, comportamentoAtual: false }
  if (r.origem.startsWith('pasta:')) return { classificacao: r.classificacao, origem: 'herdada', pastaOrigemId: r.origem.slice(6), pendente: false, comportamentoAtual: false }
  if (r.origem === 'legado') return { classificacao: r.classificacao, origem: 'legado', pastaOrigemId: null, pendente: true, comportamentoAtual: true }
  return { classificacao: null, origem: 'nenhuma', pastaOrigemId: null, pendente: true, comportamentoAtual: false }
}

/** Formato de leitura efetivo: do documento > da classificação efetiva > nenhum. */
export function formatoEfetivo(docFormato: string | null | undefined, efetiva: Efetiva): { formato: string | null; origem: 'documento' | 'classificacao' | 'nenhum' } {
  if (docFormato) return { formato: docFormato, origem: 'documento' }
  const f = efetiva.classificacao?.formatoLeitura
  if (f && !efetiva.comportamentoAtual) return { formato: f, origem: 'classificacao' }
  return { formato: null, origem: 'nenhum' }
}

/** Pastas com / sem classificação efetiva — base dos filtros 'herdando' e 'sem classificação' no SQL. */
export function conjuntosPastas(mapa: ReadonlyMap<string, InfoPasta>): { comClasse: string[]; semClasse: string[] } {
  const comClasse: string[] = []; const semClasse: string[] = []
  for (const [id, i] of mapa) (i.classificacaoId ? comClasse : semClasse).push(id)
  return { comClasse, semClasse }
}

/** Ids da pasta + descendentes cuja disciplina efetiva = `disciplinaId`, restritos (opcional) a `dentro`. */
export function pastasDaDisciplina(mapa: ReadonlyMap<string, InfoPasta>, disciplinaId: string, dentro?: readonly string[] | null): string[] {
  const permitido = dentro ? new Set(dentro) : null
  const out: string[] = []
  for (const [id, i] of mapa) if (i.disciplinaId === disciplinaId && (!permitido || permitido.has(id))) out.push(id)
  return out
}

// ───────────── Filtros / SQL ─────────────
export const FILTROS_MATRIZ = ['todos', 'sem_classificacao', 'herdando', 'definida', 'sem_pasta', 'sem_paginas', 'conversao'] as const
export type FiltroMatriz = (typeof FILTROS_MATRIZ)[number]
export const ROTULO_FILTRO: Record<FiltroMatriz, string> = {
  todos: 'Todos', sem_classificacao: 'Sem classificação', herdando: 'Herdando da pasta', definida: 'Definida no documento',
  sem_pasta: 'Sem pasta', sem_paginas: 'Sem páginas', conversao: 'Conversão a revisar',
}
export const filtroValido = (v: unknown): FiltroMatriz => (FILTROS_MATRIZ as readonly string[]).includes(String(v)) ? (String(v) as FiltroMatriz) : 'todos'
/** Filtros que dependem de JOIN com a versão atual ou de conjuntos de pastas (exigem SQL direto). */
export const FILTRO_EXIGE_SQL: ReadonlySet<FiltroMatriz> = new Set(['sem_classificacao', 'herdando', 'sem_paginas', 'conversao'])

export const SORTS_MATRIZ = ['titulo', 'paginas', 'conversao'] as const
export type SortMatriz = (typeof SORTS_MATRIZ)[number]

export interface ConsultaMatriz {
  tenantId: string
  filtro: FiltroMatriz
  q?: string
  /** restringe a estas pastas (subárvore e/ou disciplina). null/undefined = sem restrição. */
  pastaIds?: readonly string[] | null
  /** pastas com classificação efetiva (de `conjuntosPastas`). 'herdando' = nelas; 'sem classificação' = fora delas. */
  comClasse: readonly string[]
  sort?: SortMatriz
  dir?: 'asc' | 'desc'
  limite: number
  offset: number
}

const esc = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c)

/** SELECT paginado (count(*) OVER()) da matriz. Valores sempre parametrizados; sort/dir vêm de listas fechadas. */
export function montarSqlMatriz(c: ConsultaMatriz): { text: string; params: unknown[] } {
  const params: unknown[] = [c.tenantId]
  const p = (v: unknown) => { params.push(v); return `$${params.length}` }
  const w: string[] = ['d.tenant_id = $1', 'd.deletado = false']
  const q = (c.q ?? '').trim().slice(0, 80)
  if (q) w.push(`d.titulo ILIKE ${p(`%${esc(q)}%`)}`)
  if (c.pastaIds) w.push(`d.pasta_id = ANY(${p([...c.pastaIds])}::uuid[])`)
  switch (c.filtro) {
    case 'sem_classificacao':
      w.push(`d.classificacao_id IS NULL AND (d.pasta_id IS NULL OR NOT (d.pasta_id = ANY(${p([...c.comClasse])}::uuid[])))`); break
    case 'herdando':
      w.push(`d.classificacao_id IS NULL AND d.pasta_id = ANY(${p([...c.comClasse])}::uuid[])`); break
    case 'definida': w.push('d.classificacao_id IS NOT NULL'); break
    case 'sem_pasta': w.push('d.pasta_id IS NULL'); break
    case 'sem_paginas': w.push('v.paginas IS NULL'); break
    case 'conversao': w.push(`v.status_conversao IS NOT NULL AND v.status_conversao <> 'ok'`); break
    default: break
  }
  const dir = c.dir === 'desc' ? 'DESC' : 'ASC'
  const col = c.sort === 'paginas' ? 'v.paginas' : c.sort === 'conversao' ? 'v.status_conversao' : 'd.titulo'
  const lim = Math.max(1, Math.min(1000, Math.floor(c.limite) || 1))
  const off = Math.max(0, Math.floor(c.offset) || 0)
  const text = `SELECT d.id::text AS id, d.titulo, d.status, d.pasta_id::text AS pasta_id, d.classificacao_id::text AS classificacao_id,
       d.formato_leitura, d.versao_atual_id::text AS versao_atual_id, v.paginas, v.status_conversao, count(*) OVER()::int AS total
  FROM simulado_conteudo_documentos d
  LEFT JOIN simulado_conteudo_versoes v ON v.id = d.versao_atual_id
 WHERE ${w.join(' AND ')}
 ORDER BY ${col} ${dir} NULLS LAST, d.titulo ASC, d.id ASC
 LIMIT ${lim} OFFSET ${off}`
  return { text, params }
}

// ───────────── Sugestão de classificação ─────────────
export interface Sugestao {
  slug: string
  motivo: 'titulo' | 'pasta'
  /** trecho que casou (para mostrar ao admin). */
  evidencia: string
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const TOKENS: { re: RegExp; slug: string; rotulo: string }[] = [
  // "PDF" + "Fight/Flash/Full" compartilham o F (PDFight = PDF-ight); aceita também com F dobrado e separador.
  { re: /\bpdf[\s_-]?f?ight\b/, slug: 'pdfight', rotulo: 'PDFight' },
  { re: /\bpdf[\s_-]?f?lash\b/, slug: 'pdflash', rotulo: 'PDFlash' },
  { re: /\bpdf[\s_-]?f?ull\b/, slug: 'pdfull', rotulo: 'PDFull' },
]
const TOKENS_PASTA = [
  ...TOKENS,
  { re: /\bleg[\s_-]?proc\b/, slug: 'legproc', rotulo: 'LegProc' },
  { re: /\bjuris[\s_-]?club\b/, slug: 'jurisclub', rotulo: 'JurisClub' },
]

/**
 * Sugere o slug de uma classificação para um documento SEM tipo: 1º pelo título (PDFIGHT/PDFLASH/PDFULL), 2º pelo nome
 * da pasta e ancestrais (mais próxima primeiro). Só SUGERE — quem aplica é o admin. Slug fora de `disponiveis` é descartado.
 */
export function sugerirClassificacao(args: { titulo: string; nomesPasta?: readonly string[]; disponiveis?: ReadonlySet<string> }): Sugestao | null {
  const ok = (slug: string) => !args.disponiveis || args.disponiveis.has(slug)
  const t = norm(args.titulo ?? '')
  for (const k of TOKENS) if (k.re.test(t) && ok(k.slug)) return { slug: k.slug, motivo: 'titulo', evidencia: k.rotulo }
  for (const nome of args.nomesPasta ?? []) {
    const n = norm(nome ?? '')
    for (const k of TOKENS_PASTA) if (k.re.test(n) && ok(k.slug)) return { slug: k.slug, motivo: 'pasta', evidencia: `${k.rotulo} em "${nome}"` }
  }
  return null
}

/** Nomes da pasta e ancestrais (mais próxima primeiro), tolerante a ciclo. */
export function nomesCaminhoPasta(pastaId: string | null | undefined, pastas: ReadonlyMap<string, { nome: string; paiId: string | null }>): string[] {
  const out: string[] = []; const visto = new Set<string>()
  let cur = pastaId ?? null
  while (cur && !visto.has(cur) && out.length < 64) {
    visto.add(cur)
    const p = pastas.get(cur); if (!p) break
    out.push(p.nome); cur = p.paiId
  }
  return out
}
