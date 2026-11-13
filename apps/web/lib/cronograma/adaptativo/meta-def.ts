import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { carregarConteudoBanco } from './conteudo-banco'
import { chaveBaseAula } from './catalogo-override'
import { sanearBusca } from '@/lib/seguranca/postgrest-safe'

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
}

/** Puro (sem banco): as definições a partir do conteúdo efetivo. */
export function definicoesDoConteudo(tenantId: string, c: { AS: Array<Array<unknown>>; ordem?: number[]; LP?: Array<{ id: string; disc: string; lei: string; texto: string; doc?: string | null; min?: number }> }): DefLinha[] {
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
    })
  })
  ;(c.LP ?? []).forEach((l, k) => {
    out.push({
      tenant_id: tenantId, tipo: 'legproc', chave: l.id, ref_pos: null, disciplina: l.disc || null, numero: null, titulo: l.lei || null,
      texto: l.texto || null, paginas: null, minutos: typeof l.min === 'number' ? Math.trunc(l.min) : null, link_qc: null, link_tec: null,
      documento_id: uuidOu(l.doc), ordem: k, ativa: true, origem: uuidOu(l.doc) ? 'biblioteca' : 'catalogo',
    })
  })
  return out
}

/** Sincroniza o cadastro: upsert por (tenant, tipo, chave) preservando `criado_em`; o que saiu do conteúdo fica `ativa=false`. */
export async function sincronizarMetaDef(svc: SupabaseClient, tenantId: string): Promise<{ ok: boolean; motivo?: string; aulas?: number; legprocs?: number; desativadas?: number }> {
  try {
    const conteudo = await carregarConteudoBanco(svc, tenantId)
    const defs = definicoesDoConteudo(tenantId, { AS: conteudo.AS as unknown as Array<Array<unknown>>, ordem: conteudo.ordem, LP: conteudo.LP })
    const agora = new Date().toISOString()
    for (let k = 0; k < defs.length; k += 400) {
      const lote = defs.slice(k, k + 400).map((d) => ({ ...d, atualizado_em: agora }))
      let { error } = await svc.from(T).upsert(lote, { onConflict: 'tenant_id,tipo,chave' })
      // migração 20261106030000 (aula_key) ainda não aplicada → grava sem a coluna
      if (error && /aula_key/i.test(error.message)) ({ error } = await svc.from(T).upsert(lote.map(({ aula_key: _k, ...r }) => r), { onConflict: 'tenant_id,tipo,chave' }))
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

export async function listarMetaDef(svc: SupabaseClient, tenantId: string, f: FiltroDef): Promise<{ ok: boolean; motivo?: string; itens: DefAnalise[]; total: number; disciplinas: string[] }> {
  const por = Math.min(100, Math.max(5, f.porPagina ?? 25)), pag = Math.max(1, f.pagina ?? 1)
  let q = svc.from(V).select('*', { count: 'exact' }).eq('tenant_id', tenantId)
  if (f.tipo) q = q.eq('tipo', f.tipo)
  if (f.disciplina) q = q.eq('disciplina', f.disciplina)
  if (f.situacao === 'ativa') q = q.eq('ativa', true)
  if (f.situacao === 'inativa') q = q.eq('ativa', false)
  const b = sanearBusca(f.busca ?? '').replace(/_/g, ' ')
  if (b) q = q.or(`titulo.ilike.%${b}%,disciplina.ilike.%${b}%,numero.ilike.%${b}%,texto.ilike.%${b}%`)
  const col = COLUNAS_ORDEM.has(f.ordenar ?? '') ? (f.ordenar as string) : 'disciplina'
  q = q.order(col, { ascending: (f.dir ?? 'asc') === 'asc', nullsFirst: false }).order('ordem', { ascending: true, nullsFirst: false }).order('id', { ascending: true })
  const { data, count, error } = await q.range((pag - 1) * por, pag * por - 1)
  if (error) return { ok: false, motivo: /does not exist|schema cache/i.test(error.message) ? 'migracao_pendente' : error.message, itens: [], total: 0, disciplinas: [] }
  const { data: ds } = await svc.from(T).select('disciplina').eq('tenant_id', tenantId).not('disciplina', 'is', null).order('disciplina', { ascending: true }).limit(2000)
  const disciplinas = [...new Set(((ds ?? []) as Array<{ disciplina: string }>).map((r) => r.disciplina))]
  return { ok: true, itens: (data ?? []) as DefAnalise[], total: count ?? 0, disciplinas }
}

export async function resumoMetaDef(svc: SupabaseClient, tenantId: string): Promise<{ definicoes: number; aulas: number; legprocs: number; ativas: number; semAluno: number; atualizadoEm: string | null } | null> {
  const { data, error } = await svc.from(V).select('tipo, ativa, alunos, atualizado_em').eq('tenant_id', tenantId).limit(5000)
  if (error) return null
  const r = (data ?? []) as Array<{ tipo: string; ativa: boolean; alunos: number; atualizado_em: string }>
  return {
    definicoes: r.length, aulas: r.filter((x) => x.tipo === 'aula').length, legprocs: r.filter((x) => x.tipo === 'legproc').length,
    ativas: r.filter((x) => x.ativa).length, semAluno: r.filter((x) => x.ativa && !x.alunos).length,
    atualizadoEm: r.map((x) => x.atualizado_em).sort().pop() ?? null,
  }
}
