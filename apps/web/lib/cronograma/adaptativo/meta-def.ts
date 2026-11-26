import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { carregarConteudoBanco } from './conteudo-banco'
import { chaveBaseAula } from './catalogo-override'
import { carregarInfoDocs } from './relink-documento-server'
import { normalizarTituloDoc } from './relink-documento'
import { sanearBusca } from '@/lib/seguranca/postgrest-safe'
import { sqlQuery } from '@/lib/data/sql'
import { remember } from '@/lib/cache/relatorio-cache'

/**
 * DEFINIÇÃO DAS METAS (visão do admin, por plataforma). Tabela `simulado_cronograma_adaptativo_meta_def`:
 * uma linha por AULA (gera PDFull/PDFlash/Questões/Revisão) e uma por META DE LEI SECA (LegProc), a partir do conteúdo EFETIVO
 * (catálogo + Biblioteca + edições do admin). A análise por meta está na visão `…_meta_def_analise`.
 * Tolerante: sem a migração 20261105070000 devolve `migracao_pendente`.
 */

const T = 'simulado_cronograma_adaptativo_meta_def'
const V = 'simulado_cronograma_adaptativo_meta_def_analise'
const uuidOu = (v: unknown): string | null => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null)

export interface DefLinha {
  tenant_id: string; tipo: 'aula' | 'legproc'; chave: string; ref_pos: number | null
  disciplina: string | null; numero: string | null; titulo: string | null; texto: string | null
  paginas: number | null; minutos: number | null; link_qc: string | null; link_tec: string | null
  documento_id: string | null; ordem: number | null; ativa: boolean; origem: string
  aula_key?: string | null // chave estável da aula (= chave, só p/ tipo aula) — independe de ref_pos
  /** SNAPSHOT do documento (migração 20261125020000; opcional) */
  doc_titulo?: string | null; doc_titulo_norm?: string | null; doc_pasta_id?: string | null
}

/** Puro (sem banco): as definições a partir do conteúdo efetivo. */
export function definicoesDoConteudo(tenantId: string, c: { AS: Array<Array<unknown>>; ordem?: number[]; LP?: Array<{ id: string; disc: string; lei: string; texto: string; doc?: string | null; min?: number }>; docs?: Record<string, { t: string; n: string; p: string | null }> }): DefLinha[] {
  const snap = (doc: string | null): Partial<DefLinha> => { const d = doc ? c.docs?.[doc] : undefined; return d ? { doc_titulo: d.t, doc_titulo_norm: d.n, doc_pasta_id: d.p } : {} }
  const out: DefLinha[] = []
  const posOrdem = new Map<number, number>()
  ;(c.ordem ?? []).forEach((i, k) => { if (!posOrdem.has(i)) posOrdem.set(i, k) })
  const temOrdem = (c.ordem ?? []).length > 0
  const chavesVistas = new Map<string, number>()
  c.AS.forEach((a, i) => {
    const base = chaveBaseAula(a as Parameters<typeof chaveBaseAula>[0])
    const n = (chavesVistas.get(base) ?? 0) + 1; chavesVistas.set(base, n)
    const doc = uuidOu(a[6])
    out.push({
      tenant_id: tenantId, tipo: 'aula', chave: n > 1 ? `${base}#${n}` : base, aula_key: n > 1 ? `${base}#${n}` : base, ref_pos: i,
      disciplina: String(a[0] ?? '') || null, numero: String(a[1] ?? '') || null, titulo: String(a[2] ?? '') || null, texto: null,
      paginas: typeof a[3] === 'number' && Number.isFinite(a[3]) ? Math.trunc(a[3]) : null, minutos: null,
      link_qc: String(a[4] ?? '') || null, link_tec: String(a[5] ?? '') || null, documento_id: doc,
      ordem: posOrdem.has(i) ? (posOrdem.get(i) as number) : null, ativa: temOrdem ? posOrdem.has(i) : true, origem: doc ? 'biblioteca' : 'catalogo',
      ...snap(doc),
    })
  })
  ;(c.LP ?? []).forEach((l, k) => {
    out.push({
      tenant_id: tenantId, tipo: 'legproc', chave: l.id, ref_pos: null, disciplina: l.disc || null, numero: null, titulo: l.lei || null,
      texto: l.texto || null, paginas: null, minutos: typeof l.min === 'number' ? Math.trunc(l.min) : null, link_qc: null, link_tec: null,
      documento_id: uuidOu(l.doc), ordem: k, ativa: true, origem: uuidOu(l.doc) ? 'biblioteca' : 'catalogo',
      ...snap(uuidOu(l.doc)),
    })
  })
  return out
}

/** Sincroniza o cadastro: upsert por (tenant, tipo, chave) preservando `criado_em`; o que saiu do conteúdo fica `ativa=false`. */
export async function sincronizarMetaDef(svc: SupabaseClient, tenantId: string): Promise<{ ok: boolean; motivo?: string; aulas?: number; legprocs?: number; desativadas?: number }> {
  try {
    const conteudo = await carregarConteudoBanco(svc, tenantId)
    let docs: Record<string, { t: string; n: string; p: string | null }> | undefined
    try { // snapshot do nome do documento (best-effort)
      const ids = [...conteudo.AS.map((a) => uuidOu((a as unknown as unknown[])[6])), ...(conteudo.LP ?? []).map((l) => uuidOu(l.doc))].filter(Boolean) as string[]
      docs = {}
      for (const [id, d] of await carregarInfoDocs(svc, tenantId, ids)) docs[id] = { t: d.titulo ?? '', n: d.titulo_norm || normalizarTituloDoc(d.titulo), p: d.pasta_id ?? null }
    } catch { docs = undefined }
    const defs = definicoesDoConteudo(tenantId, { AS: conteudo.AS as unknown as Array<Array<unknown>>, ordem: conteudo.ordem, LP: conteudo.LP, docs })
    const agora = new Date().toISOString()
    for (let k = 0; k < defs.length; k += 400) {
      const lote = defs.slice(k, k + 400).map((d) => ({ ...d, atualizado_em: agora }))
      let { error } = await svc.from(T).upsert(lote, { onConflict: 'tenant_id,tipo,chave' })
      // colunas opcionais ausentes (aula_key: 20261106030000; snapshot do documento: 20261125020000) → regrava sem elas
      let atual: Array<Record<string, unknown>> = lote
      for (let t = 0; t < 2 && error; t++) {
        if (/doc_titulo|doc_pasta_id/i.test(error.message)) atual = atual.map(({ doc_titulo: _a, doc_titulo_norm: _b, doc_pasta_id: _c, ...r }) => r)
        else if (/aula_key/i.test(error.message)) atual = atual.map(({ aula_key: _k, ...r }) => r)
        else break
        ;({ error } = await svc.from(T).upsert(atual, { onConflict: 'tenant_id,tipo,chave' }))
      }
      if (error) return { ok: false, motivo: /does not exist|schema cache/i.test(error.message) ? 'migracao_pendente' : error.message }
    }
    // o que existia e não está mais no conteúdo → inativa (não apaga: preserva histórico/análise)
    const vivas = new Set(defs.map((d) => `${d.tipo}|${d.chave}`))
    const ids: string[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await svc.from(T).select('id, tipo, chave, ativa').eq('tenant_id', tenantId).order('id', { ascending: true }).range(from, from + 999)
      for (const r of (data ?? []) as Array<{ id: string; tipo: string; chave: string; ativa: boolean }>) if (r.ativa && !vivas.has(`${r.tipo}|${r.chave}`)) ids.push(r.id)
      if (!data || data.length < 1000) break
    }
    for (let k = 0; k < ids.length; k += 150) await svc.from(T).update({ ativa: false, atualizado_em: agora }).in('id', ids.slice(k, k + 150))
    return { ok: true, aulas: defs.filter((d) => d.tipo === 'aula').length, legprocs: defs.filter((d) => d.tipo === 'legproc').length, desativadas: ids.length }
  } catch (e) {
    return { ok: false, motivo: (e as Error)?.message || 'erro' }
  }
}

export interface FiltroDef { busca?: string; tipo?: 'aula' | 'legproc' | ''; disciplina?: string; situacao?: 'ativa' | 'inativa' | ''; ordenar?: string; dir?: 'asc' | 'desc'; pagina?: number; porPagina?: number }
export interface DefAnalise extends DefLinha {
  id: string; criado_em: string; atualizado_em: string
  planos: number; alunos: number; metas_nos_planos: number; concluidas: number; nao_realizadas: number; tempo_total_seg: number; questoes_resolvidas: number; questoes_erradas: number
}
const COLUNAS_ORDEM = new Set(['disciplina', 'numero', 'titulo', 'tipo', 'ordem', 'criado_em', 'alunos', 'planos', 'concluidas', 'tempo_total_seg', 'paginas'])

const COLUNAS_ORDEM_AGREGADA = new Set(['alunos', 'planos', 'concluidas', 'tempo_total_seg'])
const ZERO_AGG = { planos: 0, alunos: 0, metas_nos_planos: 0, concluidas: 0, nao_realizadas: 0, tempo_total_seg: 0, questoes_resolvidas: 0, questoes_erradas: 0 }

/**
 * Agregados (planos/alunos/concluídas/tempo/questões) de SÓ as definições da página: a mesma conta da visão `…_meta_def_analise`,
 * mas sem agregar as ~1,6 mi linhas de plano_meta de TODAS as ~1000 definições (a visão levava 8–18 s por página; aqui ~1 s).
 * `null` = SQL direto indisponível → o chamador cai na visão.
 */
async function agregadosDasDefs(tenantId: string, ids: string[]): Promise<Map<string, typeof ZERO_AGG> | null> {
  if (!ids.length) return new Map()
  const rows = await sqlQuery<Record<string, unknown>>(
    `WITH alvo AS (SELECT id, tipo, ref_pos, chave, tenant_id FROM ${T} WHERE tenant_id = $1 AND id = ANY($2::uuid[])),
     mp AS (
       SELECT d.id AS def_id, pm.plano_id, pm.estudante_id, pm.meta_id FROM alvo d
         JOIN simulado_cronograma_adaptativo_plano_meta pm ON pm.tenant_id = d.tenant_id AND pm.ref_aula = d.ref_pos WHERE d.tipo = 'aula'
       UNION ALL
       SELECT d.id, pm.plano_id, pm.estudante_id, pm.meta_id FROM alvo d
         JOIN simulado_cronograma_adaptativo_plano_meta pm ON pm.tenant_id = d.tenant_id AND pm.meta_id = d.chave WHERE d.tipo = 'legproc')
     SELECT mp.def_id::text AS id, count(DISTINCT mp.plano_id)::int AS planos, count(DISTINCT mp.estudante_id)::int AS alunos, count(*)::int AS metas_nos_planos,
            count(*) FILTER (WHERE m.estado = 'done')::int AS concluidas, count(*) FILTER (WHERE m.estado = 'missed')::int AS nao_realizadas,
            coalesce(sum(m.tempo_seg), 0)::bigint AS tempo_total_seg, coalesce(sum(m.res), 0)::bigint AS questoes_resolvidas, coalesce(sum(m.err), 0)::bigint AS questoes_erradas
       FROM mp LEFT JOIN simulado_cronograma_adaptativo_meta m ON m.plano_id = mp.plano_id AND m.meta_id = mp.meta_id
      GROUP BY mp.def_id`, [tenantId, ids])
  if (!rows) return null
  return new Map(rows.map((r) => [String(r.id), {
    planos: Number(r.planos), alunos: Number(r.alunos), metas_nos_planos: Number(r.metas_nos_planos), concluidas: Number(r.concluidas), nao_realizadas: Number(r.nao_realizadas),
    tempo_total_seg: Number(r.tempo_total_seg), questoes_resolvidas: Number(r.questoes_resolvidas), questoes_erradas: Number(r.questoes_erradas),
  }]))
}

type ListaDef = { ok: boolean; motivo?: string; itens: DefAnalise[]; total: number; disciplinas: string[] }

export async function listarMetaDef(svc: SupabaseClient, tenantId: string, f: FiltroDef): Promise<ListaDef> {
  const por = Math.min(100, Math.max(5, f.porPagina ?? 25)), pag = Math.max(1, f.pagina ?? 1)
  const col = COLUNAS_ORDEM.has(f.ordenar ?? '') ? (f.ordenar as string) : 'disciplina'
  // Caminho rápido: filtra/ordena/pagina a TABELA de definições (barata) e calcula os agregados só das linhas da página.
  // Ordenar por coluna agregada (alunos/planos/concluídas/tempo) precisa da visão inteira → caminho antigo.
  if (COLUNAS_ORDEM_AGREGADA.has(col)) return listarBase(svc, V, tenantId, f, col, por, pag)
  const r = await listarBase(svc, T, tenantId, f, col, por, pag)
  if (!r.ok || !r.itens.length) return r
  const agg = await agregadosDasDefs(tenantId, r.itens.map((i) => i.id))
  if (!agg) return listarBase(svc, V, tenantId, f, col, por, pag) // sem SQL direto: caminho antigo (visão)
  return { ...r, itens: r.itens.map((i) => ({ ...i, ...(agg.get(i.id) ?? ZERO_AGG) })) }
}

async function listarBase(svc: SupabaseClient, fonte: string, tenantId: string, f: FiltroDef, col: string, por: number, pag: number): Promise<ListaDef> {
  let q = svc.from(fonte).select('*', { count: 'exact' }).eq('tenant_id', tenantId)
  if (f.tipo) q = q.eq('tipo', f.tipo)
  if (f.disciplina) q = q.eq('disciplina', f.disciplina)
  if (f.situacao === 'ativa') q = q.eq('ativa', true)
  if (f.situacao === 'inativa') q = q.eq('ativa', false)
  const b = sanearBusca(f.busca ?? '').replace(/_/g, ' ')
  if (b) q = q.or(`titulo.ilike.%${b}%,disciplina.ilike.%${b}%,numero.ilike.%${b}%,texto.ilike.%${b}%`)
  q = q.order(col, { ascending: (f.dir ?? 'asc') === 'asc', nullsFirst: false }).order('ordem', { ascending: true, nullsFirst: false }).order('id', { ascending: true })
  const [{ data, count, error }, { data: ds }] = await Promise.all([
    q.range((pag - 1) * por, pag * por - 1),
    svc.from(T).select('disciplina').eq('tenant_id', tenantId).not('disciplina', 'is', null).order('disciplina', { ascending: true }).limit(2000),
  ])
  if (error) return { ok: false, motivo: /does not exist|schema cache/i.test(error.message) ? 'migracao_pendente' : error.message, itens: [], total: 0, disciplinas: [] }
  const disciplinas = [...new Set(((ds ?? []) as Array<{ disciplina: string }>).map((r) => r.disciplina))]
  return { ok: true, itens: (data ?? []) as unknown as DefAnalise[], total: count ?? 0, disciplinas }
}

export type ResumoDef = { definicoes: number; aulas: number; legprocs: number; ativas: number; semAluno: number; atualizadoEm: string | null }
export const chaveResumoMetaDef = (tenantId: string) => `crono-metadef-resumo:${tenantId}`

/**
 * Resumo das definições. Antes lia a visão inteira (todas as definições × 1,6 mi de linhas ≈ 18 s) só para contar; agora conta na tabela
 * ("sem aluno" = definição ativa sem NENHUMA linha de plano_meta, pelos índices (tenant, ref_aula)/(tenant, meta_id)). Cache 10 min; a sincronização invalida.
 */
export async function resumoMetaDef(svc: SupabaseClient, tenantId: string): Promise<ResumoDef | null> {
  try {
    return await remember<ResumoDef>(chaveResumoMetaDef(tenantId), 600, async () => {
      const rows = await sqlQuery<Record<string, unknown>>(
        `SELECT count(*)::int AS definicoes, count(*) FILTER (WHERE tipo = 'aula')::int AS aulas, count(*) FILTER (WHERE tipo = 'legproc')::int AS legprocs,
                count(*) FILTER (WHERE ativa)::int AS ativas,
                count(*) FILTER (WHERE ativa AND NOT EXISTS (SELECT 1 FROM simulado_cronograma_adaptativo_plano_meta pm WHERE pm.tenant_id = d.tenant_id
                  AND ((d.tipo = 'aula' AND pm.ref_aula = d.ref_pos) OR (d.tipo = 'legproc' AND pm.meta_id = d.chave))))::int AS sem_aluno,
                max(atualizado_em) AS atualizado_em
           FROM ${T} d WHERE d.tenant_id = $1`, [tenantId])
      if (!rows) return resumoMetaDefViaVisao(svc, tenantId)
      const r = rows[0] ?? {}
      return {
        definicoes: Number(r.definicoes ?? 0), aulas: Number(r.aulas ?? 0), legprocs: Number(r.legprocs ?? 0), ativas: Number(r.ativas ?? 0), semAluno: Number(r.sem_aluno ?? 0),
        atualizadoEm: r.atualizado_em ? new Date(r.atualizado_em as string).toISOString() : null,
      }
    })
  } catch { return null }
}

async function resumoMetaDefViaVisao(svc: SupabaseClient, tenantId: string): Promise<ResumoDef> {
  const { data, error } = await svc.from(V).select('tipo, ativa, alunos, atualizado_em').eq('tenant_id', tenantId).limit(5000)
  if (error) throw new Error(error.message)
  const r = (data ?? []) as Array<{ tipo: string; ativa: boolean; alunos: number; atualizado_em: string }>
  return {
    definicoes: r.length, aulas: r.filter((x) => x.tipo === 'aula').length, legprocs: r.filter((x) => x.tipo === 'legproc').length,
    ativas: r.filter((x) => x.ativa).length, semAluno: r.filter((x) => x.ativa && !x.alunos).length,
    atualizadoEm: r.map((x) => x.atualizado_em).sort().pop() ?? null,
  }
}
