import 'server-only'
// Loader servidor do catálogo de tipos de conteúdo (cache 30 s por tenant, tolerante a tabela ausente).
import type { SupabaseClient } from '@supabase/supabase-js'
import { esquecer, remember } from '@/lib/cache/relatorio-cache'
import { sqlQuery } from '@/lib/data/sql'
import { colunaClassificacaoIdExiste } from '@/lib/conteudo/classificacao/coluna-doc-server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { mesclarCatalogo, slugsGeraMeta, tipoMaterialCompat, type LinhaTipoConteudo } from './tipos-conteudo'
import type { TipoConteudo, UsoTipoConteudo } from './tipos-conteudo-tipos'

const TTL_SEG = 30
const chaveCat = (tenantId: string) => `crono-tipos:cat:${tenantId}`

/** Tabela/coluna ausente (migração pendente). */
export function tabelaTiposAusente(e: { message?: string; code?: string } | null | undefined): boolean {
  if (!e) return false
  return ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(String(e.code)) || /does not exist|could not find the (table|'.*' column)/i.test(e.message ?? '')
}

/** Linhas cruas do banco (inclui `versao`); [] se a tabela não existe. */
export async function lerLinhasTipos(svc: SupabaseClient, tenantId: string): Promise<LinhaTipoConteudo[]> {
  const cols = 'slug, nome, nome_aluno, cor, papel, duracao_padrao_min, prioridade, ordem, ativo, sistema, descricao, versao'
  const ler = (sel: string) => fetchAll<LinhaTipoConteudo>(() =>
    svc.from('simulado_conteudo_tipos').select(sel).eq('tenant_id', tenantId).order('slug', { ascending: true }) as never)
  try {
    return await ler(`${cols}, gera_meta`)
  } catch (e) {
    if (!tabelaTiposAusente(e as { message?: string; code?: string })) throw e
    // coluna gera_meta ausente (migração 20261126010000 pendente): relê sem ela; tabela ausente → []
    try { return await ler(cols) } catch (e2) {
      if (tabelaTiposAusente(e2 as { message?: string; code?: string })) return []
      throw e2
    }
  }
}

/** Catálogo efetivo do tenant (sistema + personalizados), cache 30 s. */
export async function listarCatalogoTipos(svc: SupabaseClient, tenantId: string): Promise<TipoConteudo[]> {
  return remember<TipoConteudo[]>(chaveCat(tenantId), TTL_SEG, async () => mesclarCatalogo(await lerLinhasTipos(svc, tenantId)))
}

const chaveUso = (t: string) => `crono-tipos:uso:${t}`

export async function esquecerCatalogoTipos(tenantId: string): Promise<void> {
  await Promise.all([esquecer(chaveCat(tenantId)), esquecer(chaveUso(tenantId))])
}

/**
 * Mapa slug personalizado → slug do vocabulário antigo (pelo PAPEL). Só contém slugs FORA dos 6 de sistema;
 * usado pelo carregamento de conteúdo para tratar tipos personalizados como o papel correspondente.
 */
export async function mapaCompatTipos(svc: SupabaseClient, tenantId: string): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  try {
    const cat = await listarCatalogoTipos(svc, tenantId)
    for (const t of cat) if (!t.sistema) { const c = tipoMaterialCompat(t.slug, cat); if (c) m.set(t.slug, c) }
  } catch { /* sem catálogo: só os 6 antigos */ }
  return m
}

/** Slug → tipo do catálogo, só dos PERSONALIZADOS que GERAM META própria (gx). Vazio se nenhum / sem catálogo / coluna ausente. */
export async function mapaGeraMeta(svc: SupabaseClient, tenantId: string): Promise<Map<string, TipoConteudo>> {
  const m = new Map<string, TipoConteudo>()
  try {
    const cat = await listarCatalogoTipos(svc, tenantId)
    const ok = slugsGeraMeta(cat)
    for (const t of cat) if (ok.has(t.slug)) m.set(t.slug, t)
  } catch { /* sem catálogo: nada gera meta */ }
  return m
}

const T_PM = 'simulado_cronograma_adaptativo_plano_meta'
const T_PLANO = 'simulado_cronograma_adaptativo_plano'

// O uso por slug varre plano_meta (1,6 mi linhas; ≈ 8 s medidos): cache de 10 min + dedupe de chamadas simultâneas.
// Invalidado ao mudar o catálogo (esquecerCatalogoTipos) e ao salvar a configuração de pasta (metas-pasta-actions).
const emVooUso = new Map<string, Promise<UsoTipoConteudo[]>>()

/** Uso por slug: pastas marcadas, documentos na subárvore e planos ativos que usam esses documentos. Cacheado. */
export async function usoDosTipos(svc: SupabaseClient, tenantId: string): Promise<UsoTipoConteudo[]> {
  const chave = chaveUso(tenantId)
  const voo = emVooUso.get(chave)
  if (voo) return voo
  const p = remember<UsoTipoConteudo[]>(chave, 600, () => calcularUsoDosTipos(svc, tenantId)).finally(() => { emVooUso.delete(chave) })
  emVooUso.set(chave, p)
  return p
}

async function calcularUsoDosTipos(svc: SupabaseClient, tenantId: string): Promise<UsoTipoConteudo[]> {
  type LinhaUso = { slug: string; pastas: number; documentos: number; planos: number }
  const comColuna = await colunaClassificacaoIdExiste()
  // Com a coluna classificacao_id: o doc com classificação PRÓPRIA conta no slug dela (não no da pasta). Com NULL em todo lugar = idêntico ao antigo.
  const rows = await sqlQuery<LinhaUso>(
    `WITH RECURSIVE cl AS (
       SELECT id AS raiz, id AS cur, cronograma_tipo_material AS tipo FROM simulado_pastas
        WHERE tenant_id = $1 AND folder_area = 'conteudo' AND deletado = false AND cronograma_tipo_material IS NOT NULL
       UNION
       SELECT cl.raiz, p.id, cl.tipo FROM cl JOIN simulado_pastas p ON p.pai_id = cl.cur AND p.tenant_id = $1 AND p.deletado = false)
     SELECT cl.tipo AS slug, count(DISTINCT cl.raiz)::int AS pastas, count(DISTINCT d.id)::int AS documentos, count(DISTINCT pl.id)::int AS planos
       FROM cl
       LEFT JOIN simulado_conteudo_documentos d ON d.pasta_id = cl.cur AND d.tenant_id = $1 AND d.deletado = false${comColuna ? ' AND d.classificacao_id IS NULL' : ''}
       LEFT JOIN ${T_PM} pm ON pm.documento_id = d.id AND pm.tenant_id = $1
       LEFT JOIN ${T_PLANO} pl ON pl.id = pm.plano_id AND pl.arquivada = false
      GROUP BY cl.tipo`, [tenantId])
  if (rows && comColuna) {
    // docs com classificação própria: contam no slug da classificação (somados; disjuntos dos da pasta). Falha = mantém só o da pasta.
    const proprios = await sqlQuery<LinhaUso>(
      `SELECT ct.slug, 0::int AS pastas, count(DISTINCT d.id)::int AS documentos, count(DISTINCT pl.id)::int AS planos
         FROM simulado_conteudo_documentos d
         JOIN simulado_conteudo_tipos ct ON ct.id = d.classificacao_id AND ct.tenant_id = $1
         LEFT JOIN ${T_PM} pm ON pm.documento_id = d.id AND pm.tenant_id = $1
         LEFT JOIN ${T_PLANO} pl ON pl.id = pm.plano_id AND pl.arquivada = false
        WHERE d.tenant_id = $1 AND d.deletado = false AND d.classificacao_id IS NOT NULL
        GROUP BY ct.slug`, [tenantId])
    for (const r of proprios ?? []) {
      const ex = rows.find((x) => x.slug === r.slug)
      if (ex) { ex.documentos = Number(ex.documentos) + Number(r.documentos); ex.planos = Number(ex.planos) + Number(r.planos) }
      else rows.push(r)
    }
  }
  if (rows) return rows.map((r) => ({ slug: r.slug, pastas: Number(r.pastas), documentos: Number(r.documentos), planosAtivos: Number(r.planos) }))

  // Fallback PostgREST (em memória; .in() em chunks via fetchAllByIn).
  let pastas: { id: string; pai_id: string | null; cronograma_tipo_material: string | null }[] = []
  try {
    pastas = await fetchAll(() => svc.from('simulado_pastas').select('id, pai_id, cronograma_tipo_material')
      .eq('tenant_id', tenantId).eq('folder_area', 'conteudo').eq('deletado', false).order('id') as never)
  } catch { return [] }
  const filhos = new Map<string, string[]>()
  for (const p of pastas) if (p.pai_id) filhos.set(p.pai_id, [...(filhos.get(p.pai_id) ?? []), p.id])
  const raizesPorSlug = new Map<string, string[]>()
  for (const p of pastas) if (p.cronograma_tipo_material) raizesPorSlug.set(p.cronograma_tipo_material, [...(raizesPorSlug.get(p.cronograma_tipo_material) ?? []), p.id])
  const subarvore = (raiz: string) => {
    const vis = new Set<string>([raiz]); const pilha = [raiz]
    while (pilha.length) for (const f of filhos.get(pilha.pop()!) ?? []) if (!vis.has(f)) { vis.add(f); pilha.push(f) }
    return vis
  }
  const docs = await fetchAll<{ id: string; pasta_id: string }>(() => svc.from('simulado_conteudo_documentos').select('id, pasta_id')
    .eq('tenant_id', tenantId).eq('deletado', false).not('pasta_id', 'is', null).order('id') as never)
  const pms = await fetchAllByIn<{ id: string; documento_id: string; plano_id: string }>(docs.map((d) => d.id), (c) =>
    svc.from(T_PM).select('id, documento_id, plano_id').eq('tenant_id', tenantId).in('documento_id', c).order('id') as never)
  const ativos = new Set((await fetchAllByIn<{ id: string }>([...new Set(pms.map((m) => m.plano_id))], (c) =>
    svc.from(T_PLANO).select('id').eq('tenant_id', tenantId).eq('arquivada', false).in('id', c).order('id') as never)).map((r) => r.id))
  const planosDoc = new Map<string, Set<string>>()
  for (const m of pms) if (ativos.has(m.plano_id)) planosDoc.set(m.documento_id, (planosDoc.get(m.documento_id) ?? new Set()).add(m.plano_id))
  const out: UsoTipoConteudo[] = []
  for (const [slug, raizes] of raizesPorSlug) {
    const pastaSet = new Set<string>(); raizes.forEach((r) => subarvore(r).forEach((x) => pastaSet.add(x)))
    const ds = docs.filter((d) => pastaSet.has(d.pasta_id))
    const planos = new Set<string>()
    for (const d of ds) planosDoc.get(d.id)?.forEach((x) => planos.add(x))
    out.push({ slug, pastas: raizes.length, documentos: ds.length, planosAtivos: planos.size })
  }
  return out
}
