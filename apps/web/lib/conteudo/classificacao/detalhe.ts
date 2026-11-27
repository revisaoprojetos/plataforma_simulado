// PÁGINA DA CLASSIFICAÇÃO (área interna) — lógica PURA (sem I/O): abas, SQL dos documentos da classificação, ações da rota,
// troca de ordem, clonagem de regras e resumo de diff da auditoria. Usado por detalhe-server.ts, pela rota
// /api/admin/biblioteca/classificacao/[id] e pelos testes.
import { z } from 'zod'
import { lerRegrasParciais, type RegrasOverride } from './esquema'
import { IDS_AREAS, regrasVazias, type AlteracaoRegras, type AreaClassificacao, type PatchRegras } from './gestao'

// ───────────── Abas ─────────────
export const ABAS_DETALHE = [
  { key: 'visao', label: 'Visão geral' },
  { key: 'exibicao', label: 'Exibição' },
  { key: 'regras', label: 'Regras de uso' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'pastas', label: 'Pastas' },
  { key: 'pendencias', label: 'Pendências' },
  { key: 'historico', label: 'Histórico' },
] as const
export type AbaDetalhe = (typeof ABAS_DETALHE)[number]['key']
export const abaDetalheValida = (a: unknown): AbaDetalhe => (ABAS_DETALHE.some((x) => x.key === a) ? (a as AbaDetalhe) : 'visao')

export const ORIGENS_DOC = ['todas', 'definida', 'herdada'] as const
export type OrigemDoc = (typeof ORIGENS_DOC)[number]
export const origemDocValida = (o: unknown): OrigemDoc => ((ORIGENS_DOC as readonly string[]).includes(String(o)) ? (o as OrigemDoc) : 'todas')
export const ROTULO_ORIGEM_DOC: Record<OrigemDoc, string> = { todas: 'Todas as origens', definida: 'Definida no documento', herdada: 'Herdada da pasta' }

export const SORTS_DOCS = ['titulo', 'paginas', 'pasta'] as const
export type SortDocs = (typeof SORTS_DOCS)[number]
export const sortDocsValido = (s: unknown): SortDocs => ((SORTS_DOCS as readonly string[]).includes(String(s)) ? (s as SortDocs) : 'titulo')

export const SUBABAS_PASTAS = ['pastas', 'metas'] as const
export type SubAbaPastas = (typeof SUBABAS_PASTAS)[number]
export const subAbaPastasValida = (s: unknown): SubAbaPastas => (s === 'metas' ? 'metas' : 'pastas')

export const MAX_LOTE_DETALHE = 5000

/** Slugs com atalho de "criar partes a partir das metas". */
export const SLUGS_PARTES_METAS = ['legproc', 'pdflash', 'pdfight'] as const
export const slugComPartesDasMetas = (slug: string): slug is (typeof SLUGS_PARTES_METAS)[number] => (SLUGS_PARTES_METAS as readonly string[]).includes(slug)

// ───────────── SQL: documentos com ESTA classificação efetiva ─────────────
export interface ConsultaDocsClasse {
  tenantId: string
  classificacaoId: string
  /** pastas cuja classificação efetiva (herança por pai_id) é esta. */
  pastasHerdam: readonly string[]
  origem: OrigemDoc
  q?: string
  /** só documentos desta pasta (exata). */
  pastaId?: string
  sort?: SortDocs
  dir?: 'asc' | 'desc'
  limite: number
  offset: number
}
const esc = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c)

/** Condição "efetiva = esta classificação": própria no documento OU (sem própria e em pasta que a herda). Parâmetros $1 tenant, $2 id, $3 pastas. */
export function condicaoDocsDaClasse(origem: OrigemDoc): string {
  const definida = 'd.classificacao_id = $2::uuid'
  const herdada = 'd.classificacao_id IS NULL AND d.pasta_id = ANY($3::uuid[])'
  return origem === 'definida' ? definida : origem === 'herdada' ? herdada : `(${definida} OR (${herdada}))`
}

export function montarSqlDocsDaClasse(c: ConsultaDocsClasse): { text: string; params: unknown[] } {
  const params: unknown[] = [c.tenantId, c.classificacaoId, [...c.pastasHerdam]]
  const w = ['d.tenant_id = $1', 'd.deletado = false', condicaoDocsDaClasse(c.origem)]
  const q = (c.q ?? '').trim().slice(0, 80)
  if (q) { params.push(`%${esc(q)}%`); w.push(`d.titulo ILIKE $${params.length}`) }
  if (c.pastaId && /^[0-9a-f-]{36}$/i.test(c.pastaId)) { params.push(c.pastaId); w.push(`d.pasta_id = $${params.length}::uuid`) }
  const dir = c.dir === 'desc' ? 'DESC' : 'ASC'
  const col = c.sort === 'paginas' ? 'v.paginas' : c.sort === 'pasta' ? 'p.nome' : 'd.titulo'
  const lim = Math.max(1, Math.min(1000, Math.floor(c.limite) || 1))
  const off = Math.max(0, Math.floor(c.offset) || 0)
  const text = `SELECT d.id::text AS id, d.titulo, d.status, d.pasta_id::text AS pasta_id, d.classificacao_id::text AS classificacao_id,
       d.versao_atual_id::text AS versao_atual_id, v.paginas, p.nome AS pasta_nome, count(*) OVER()::int AS total
  FROM simulado_conteudo_documentos d
  LEFT JOIN simulado_conteudo_versoes v ON v.id = d.versao_atual_id
  LEFT JOIN simulado_pastas p ON p.id = d.pasta_id
 WHERE ${w.join(' AND ')}
 ORDER BY ${col} ${dir} NULLS LAST, d.titulo ASC, d.id ASC
 LIMIT ${lim} OFFSET ${off}`
  return { text, params }
}

// ───────────── Ações da rota /[id] ─────────────
const uuid = z.string().uuid()
const FiltroDocsSchema = z.object({ origem: z.enum(ORIGENS_DOC).default('todas'), q: z.string().trim().max(80).optional(), pastaId: z.string().uuid().optional() }).strict()

export const AcaoDetalheSchema = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('mover'), delta: z.union([z.literal(-1), z.literal(1)]) }).strict(),
  z.object({
    acao: z.literal('clonar-regras'), origemId: uuid, modo: z.enum(['substituir', 'preencher']).default('preencher'),
    areas: z.array(z.enum(IDS_AREAS)).min(1).optional(), dryRun: z.boolean().optional(),
  }).strict(),
  // remover = tira a classificação PRÓPRIA dos documentos (voltam a herdar); trocar = define outra classificação neles.
  z.object({ acao: z.literal('remover-docs'), ids: z.array(uuid).min(1).max(MAX_LOTE_DETALHE).optional(), filtro: FiltroDocsSchema.optional() }).strict(),
  z.object({ acao: z.literal('trocar-docs'), para: uuid, ids: z.array(uuid).min(1).max(MAX_LOTE_DETALHE).optional(), filtro: FiltroDocsSchema.optional() }).strict(),
  z.object({ acao: z.literal('aplicar-pendencias'), ids: z.array(uuid).min(1).max(MAX_LOTE_DETALHE).optional() }).strict(),
])
export type AcaoDetalhe = z.infer<typeof AcaoDetalheSchema>

// ───────────── Ordem ─────────────
/** Troca a posição de `id` com o vizinho (lista já ordenada por ordem, slug). Empates: empurra 1 passo. [] = nada a fazer. */
export function trocarOrdem(lista: readonly { id: string; ordem: number }[], id: string, delta: -1 | 1): { id: string; ordem: number }[] {
  const i = lista.findIndex((x) => x.id === id)
  const v = lista[i + delta]
  if (i < 0 || !v) return []
  const l = lista[i]
  if (l.ordem === v.ordem) return [{ id: l.id, ordem: v.ordem + delta }]
  return [{ id: l.id, ordem: v.ordem }, { id: v.id, ordem: l.ordem }]
}

// ───────────── Clonar regras de outra classificação ─────────────
type Gravado = Partial<Record<AreaClassificacao, unknown>>

/**
 * Monta as alterações (para salvarRegrasLote) que levam as regras de `origem` para `destino`, por área.
 *  - 'preencher': copia só os campos que o destino NÃO define (nada que já existe é perdido);
 *  - 'substituir': o destino fica igual à origem (campos que só o destino tinha voltam a herdar).
 */
export function planoClonarRegras(destinoId: string, origem: Gravado, destino: Gravado, modo: 'substituir' | 'preencher', areas?: readonly AreaClassificacao[]): AlteracaoRegras[] {
  const out: AlteracaoRegras[] = []
  for (const area of areas ?? IDS_AREAS) {
    const o = lerRegrasParciais(origem[area]), d = lerRegrasParciais(destino[area])
    const patch: PatchRegras = {}
    for (const g of ['tempo', 'meta'] as const) {
      const og = o[g] as Record<string, unknown>, dg = d[g] as Record<string, unknown>
      const p: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(og)) if (modo === 'substituir' ? dg[k] !== v : !(k in dg)) p[k] = v
      if (modo === 'substituir') for (const k of Object.keys(dg)) if (!(k in og)) p[k] = null
      if (Object.keys(p).length) patch[g] = p
    }
    if (patch.tempo || patch.meta) out.push({ area, classificacaoId: destinoId, patch: patch as AlteracaoRegras['patch'] })
  }
  return out
}
export const temRegras = (r: unknown): boolean => !regrasVazias(lerRegrasParciais(r) as RegrasOverride)

// ───────────── Auditoria: resumo antes/depois ─────────────
export interface CampoDiff { campo: string; antes: string; depois: string }

function achatar(v: unknown, prefixo: string, out: Map<string, unknown>, nivel = 0): void {
  if (v && typeof v === 'object' && !Array.isArray(v) && nivel < 3) {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) achatar(x, prefixo ? `${prefixo}.${k}` : k, out, nivel + 1)
    return
  }
  out.set(prefixo, v)
}
const txt = (v: unknown): string => {
  if (v === undefined) return '—'
  if (v === null) return 'vazio'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 80 ? `${s.slice(0, 77)}…` : s
}

/** Campos que mudaram entre dois jsonb (achata até 3 níveis). Só os campos presentes em `depois` (ou removidos de `antes`). */
export function diffResumo(antes: unknown, depois: unknown, max = 12): CampoDiff[] {
  const a = new Map<string, unknown>(), d = new Map<string, unknown>()
  achatar(antes ?? {}, '', a); achatar(depois ?? {}, '', d)
  a.delete(''); d.delete('')
  const out: CampoDiff[] = []
  for (const k of new Set([...a.keys(), ...d.keys()])) {
    const x = a.get(k), y = d.get(k)
    if (JSON.stringify(x) === JSON.stringify(y)) continue
    out.push({ campo: k, antes: txt(x), depois: txt(y) })
    if (out.length >= max) break
  }
  return out
}
