// Gestão da CLASSIFICAÇÃO (puro, sem I/O): áreas, validações das rotas, regra de apagar e patch de regras de uso.
// Usado pelas rotas /api/admin/biblioteca/classificacao/{tipos,regras-uso}, pelas telas e pelos testes.
import { z } from 'zod'
import { PAPEIS_TIPO, SLUG_RE, SLUGS_SISTEMA } from '@/lib/cronograma/tipos-conteudo-tipos'
import { ExibicaoClassificacaoSchema, MetaSchema, TempoSchema, lerRegrasParciais, type RegrasOverride } from './esquema'

// ───────────── Áreas ─────────────
/** Áreas que consomem classificações (colunas da matriz de regras). Para incluir outra área, basta acrescentar aqui. */
export const AREAS_CLASSIFICACAO = [
  { id: 'adaptativo', nome: 'Cronograma Adaptativo', desc: 'Metas geradas pelo motor adaptativo.' },
  { id: 'gerador', nome: 'Cronograma Gerador', desc: 'Planilha/cronograma gerado pelo Gerador.' },
  { id: 'biblioteca', nome: 'Biblioteca / Leitura', desc: 'Leitor e estimativa de tempo de leitura na Biblioteca.' },
] as const
export type AreaClassificacao = (typeof AREAS_CLASSIFICACAO)[number]['id']
export const IDS_AREAS = AREAS_CLASSIFICACAO.map((a) => a.id) as [AreaClassificacao, ...AreaClassificacao[]]
export const areaValida = (a: unknown): a is AreaClassificacao => typeof a === 'string' && (IDS_AREAS as string[]).includes(a)

/** Padrão do MOTOR de cada área (degrau antes do padrão interno). Só referência de exibição ("herdado"). */
export const PADRAO_MOTOR_POR_AREA: Record<AreaClassificacao, RegrasOverride> = {
  adaptativo: { tempo: { modo: 'por_palavras', palavras_por_min: 200 }, meta: {} },
  gerador: { tempo: { modo: 'por_pagina', min_por_pagina: 2 }, meta: {} },
  biblioteca: { tempo: { modo: 'por_palavras', palavras_por_min: 200 }, meta: {} },
}

// ───────────── Cor por token ─────────────
export const TOKENS_COR = ['primary', 'secondary', 'accent', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'destructive', 'muted-foreground'] as const
/** Aceita `var(--token)` de um token conhecido, ou o valor legado já gravado (preservado se reenviado igual). undefined = inválida. */
export function corValida(cor: unknown, atual?: string | null): string | null | undefined {
  if (cor === undefined) return undefined
  if (cor === null || cor === '') return null
  if (typeof cor !== 'string') return undefined
  const t = cor.trim()
  if (atual && t === atual) return t
  const m = /^var\(--([a-z0-9-]+)\)$/.exec(t)
  if (m && (TOKENS_COR as readonly string[]).includes(m[1])) return t
  return undefined
}

// ───────────── Slug ─────────────
export function slugDeNome(nome: string): string {
  const s = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '')
  return s.length >= 2 ? s : `classe-${s || 'x'}`.slice(0, 40)
}
/** Primeiro slug livre: base, base-2, base-3… (até 40 caracteres; nunca um slug de sistema). */
export function slugLivre(base: string, usados: ReadonlySet<string>): string {
  let s = base.slice(0, 40)
  for (let i = 2; usados.has(s) || SLUGS_SISTEMA.includes(s); i++) { const suf = `-${i}`; s = `${base.slice(0, 40 - suf.length)}${suf}` }
  return s
}

// ───────────── Entradas (zod) ─────────────
const PAPEIS = PAPEIS_TIPO.map((p) => p.v) as [string, ...string[]]
const textoOpc = (max: number) => z.string().trim().max(max).nullable().optional()

export const EdicaoTipoSchema = z.object({
  nome: z.string().trim().min(1).max(60).optional(),
  nomeAluno: textoOpc(60),
  descricao: textoOpc(300),
  cor: z.string().trim().max(40).nullable().optional(),
  papel: z.enum(PAPEIS).optional(),
  prioridade: z.number().int().min(-1000).max(100000).optional(),
  ordem: z.number().int().min(-1000).max(100000).optional(),
  ativo: z.boolean().optional(),
  geraMeta: z.boolean().optional(),
  exibicao: ExibicaoClassificacaoSchema.partial().optional(),
}).strict()
export type EdicaoTipo = z.infer<typeof EdicaoTipoSchema>

export const CriarTipoSchema = z.object({
  nome: z.string().trim().min(1).max(60),
  slug: z.string().regex(SLUG_RE).optional(),
  /** slug de um tipo existente (modelo-base ou outro) do qual copiar papel/exibição/descrição. */
  modelo: z.string().regex(SLUG_RE).optional(),
  duplicarDe: z.string().uuid().optional(),
  papel: z.enum(PAPEIS).optional(),
  nomeAluno: textoOpc(60),
  descricao: textoOpc(300),
  cor: z.string().trim().max(40).nullable().optional(),
}).strict()
export type CriarTipo = z.infer<typeof CriarTipoSchema>

export const ReordenarSchema = z.object({
  itens: z.array(z.object({ id: z.string().uuid(), ordem: z.number().int().min(-1000).max(100000) })).min(1).max(200),
}).strict()

export const FILTROS_TIPO = ['todas', 'ativas', 'arquivadas', 'sistema', 'personalizadas'] as const
export type FiltroTipo = (typeof FILTROS_TIPO)[number]
export const filtroTipoValido = (f: unknown): FiltroTipo => ((FILTROS_TIPO as readonly string[]).includes(String(f)) ? (f as FiltroTipo) : 'todas')
export const ROTULO_FILTRO_TIPO: Record<FiltroTipo, string> = {
  todas: 'Todas', ativas: 'Ativas', arquivadas: 'Arquivadas', sistema: 'Modelo-base (sistema)', personalizadas: 'Personalizadas',
}

export const ORDENS_TIPO = ['nome', 'ordem', 'prioridade', 'papel', 'slug'] as const
export type OrdemTipo = (typeof ORDENS_TIPO)[number]
export const ordemTipoValida = (s: unknown): OrdemTipo => ((ORDENS_TIPO as readonly string[]).includes(String(s)) ? (s as OrdemTipo) : 'ordem')

// ───────────── Apagar × arquivar ─────────────
export interface UsoClassificacao { documentos: number; pastas: number; metas: number; regras: number }
export type DecisaoApagar = { ok: true; avisoRegras: number } | { ok: false; motivo: string }

/** Só personalizada SEM uso (documentos/pastas/metas) apaga; regras de uso caem junto (CASCADE) e só são avisadas. */
export function podeApagar(t: { sistema: boolean }, uso: UsoClassificacao | null): DecisaoApagar {
  if (t.sistema) return { ok: false, motivo: 'Classificações do sistema (modelo-base) não podem ser apagadas — arquive (desative) se não quiser usar.' }
  if (!uso) return { ok: false, motivo: 'Não foi possível verificar o uso agora. Arquive em vez de apagar, ou tente de novo.' }
  const partes: string[] = []
  if (uso.documentos > 0) partes.push(`${uso.documentos} documento(s) com esta classificação`)
  if (uso.pastas > 0) partes.push(`${uso.pastas} pasta(s) marcada(s) com ela`)
  if (uso.metas > 0) partes.push(`${uso.metas} meta(s)/seleção(ões) que a usam`)
  if (partes.length) return { ok: false, motivo: `Em uso: ${partes.join('; ')}. Reclassifique esses vínculos ou arquive (desative) em vez de apagar.` }
  return { ok: true, avisoRegras: uso.regras }
}

// ───────────── Regras de uso: patch e merge ─────────────
const anulavel = (shape: Record<string, z.ZodTypeAny>) =>
  z.object(Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v.nullable().optional()]))).strict().optional()

export const PatchRegrasSchema = z.object({
  tempo: anulavel(TempoSchema.shape),
  meta: anulavel(MetaSchema.shape),
}).strict()
export type PatchRegras = { tempo?: Record<string, unknown>; meta?: Record<string, unknown> }

export const AlteracaoRegrasSchema = z.object({
  area: z.enum(IDS_AREAS),
  classificacaoId: z.string().uuid(),
  /** campo: valor = define; campo: null = volta a herdar. */
  patch: PatchRegrasSchema.optional(),
  /** remove todas as regras da célula (tudo herdado). */
  limpar: z.boolean().optional(),
}).strict()
export type AlteracaoRegras = z.infer<typeof AlteracaoRegrasSchema>

export const SalvarRegrasSchema = z.object({
  alteracoes: z.array(AlteracaoRegrasSchema).min(1).max(500),
  dryRun: z.boolean().optional(),
  /** Medidas de um documento de exemplo para a pré-visualização do tempo (calculado no servidor). */
  medidas: z.object({
    paginas: z.number().min(0).max(100000).nullable().optional(),
    palavras: z.number().min(0).max(10000000).nullable().optional(),
    artigos: z.number().min(0).max(100000).nullable().optional(),
    caracteres: z.number().min(0).max(100000000).nullable().optional(),
  }).strict().optional(),
}).strict()

/** Aplica o patch sobre as regras gravadas (parciais). `null` remove o campo; resultado vazio = célula 100% herdada. */
export function aplicarPatchRegras(atual: unknown, patch: PatchRegras | undefined, limpar = false): RegrasOverride {
  if (limpar) return { tempo: {}, meta: {} }
  const base = lerRegrasParciais(atual)
  const out: RegrasOverride = { ...(base.versao ? { versao: base.versao } : {}), tempo: { ...base.tempo }, meta: { ...base.meta } }
  for (const g of ['tempo', 'meta'] as const) {
    const p = patch?.[g]
    if (!p) continue
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined) continue
      if (v === null) delete (out[g] as Record<string, unknown>)[k]
      else (out[g] as Record<string, unknown>)[k] = v
    }
  }
  return out
}
export const regrasVazias = (r: RegrasOverride): boolean => Object.keys(r.tempo).length === 0 && Object.keys(r.meta).length === 0

type AltBruta = { area: string; classificacaoId: string; patch?: PatchRegras; limpar?: boolean }
/** Compõe, na ordem, várias alterações do mesmo alvo (área × classificação) numa só. */
export function agruparAlteracoes(lista: AltBruta[]): Map<string, { area: string; classificacaoId: string; patch: PatchRegras; limpar: boolean }> {
  const m = new Map<string, { area: string; classificacaoId: string; patch: PatchRegras; limpar: boolean }>()
  for (const a of lista) {
    const k = `${a.area}:${a.classificacaoId}`
    const cur = m.get(k) ?? { area: a.area, classificacaoId: a.classificacaoId, patch: {}, limpar: false }
    if (a.limpar) { cur.limpar = true; cur.patch = {} }
    for (const g of ['tempo', 'meta'] as const) {
      if (a.patch?.[g]) cur.patch = { ...cur.patch, [g]: { ...(cur.patch[g] ?? {}), ...a.patch[g] } }
    }
    m.set(k, cur)
  }
  return m
}
