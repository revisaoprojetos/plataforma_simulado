import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember } from '@/lib/cache/relatorio-cache'
import { carregarConteudoBanco } from './conteudo-banco'
import { dParse, dDow, semDe } from './motor28'

/**
 * ESPELHO RELACIONAL da grade do plano: uma LINHA POR META em `simulado_cronograma_adaptativo_plano_meta`
 * (tipo, disciplina, aula, título, documento, semana, dia, data, horas, ordem, criado_em) — como o cronograma normal.
 * A fonte continua sendo o JSON `plano.plano` gerado pelo motor; aqui só se sincroniza (best-effort, nunca derruba o plano).
 * Tolerante: sem a migração 20261105050000 nada acontece.
 */

const T_PLANO = 'simulado_cronograma_adaptativo_plano'
const T_PM = 'simulado_cronograma_adaptativo_plano_meta'
const TIPO_NOME: Record<string, string> = { pf: 'PDFull', pp: 'PDFull (parte)', fl: 'PDFlash', qu: 'Questões', lp: 'LegProc', rf: 'Revisão PDFlash', rq: 'Revisão Questões' }
const ORDEM_TIPO: Record<string, number> = { pp: 0, pf: 0, fl: 1, qu: 2, lp: 3, rf: 4, rq: 4 }

export interface LinhaPlanoMeta {
  tenant_id: string; estudante_id: string; plano_id: string
  meta_id: string; tipo: string; tipo_nome: string | null; parte: number | null
  disciplina: string | null; aula: string | null; titulo: string | null; documento_id: string | null
  semana: number; dia: number; data_prevista: string; horas: number | null; ordem: number
}

/** O que precisa do conteúdo p/ descrever as metas (enxuto e serializável → cacheável). */
interface ConteudoDescricao {
  AS: Array<[string, string, string, string | null]>                                  // disciplina, nº da aula, tema, documento
  LP: Array<{ id: string; disc: string; lei: string; texto: string; doc: string | null }>
  WLP: string[][]; WLPdoc: Array<Array<string | null>>
}

async function conteudoParaDescricao(svc: SupabaseClient, tenantId: string): Promise<ConteudoDescricao> {
  return remember<ConteudoDescricao>(`crono-adapt:plano-meta-conteudo:${tenantId}`, 120, async () => {
    const c = await carregarConteudoBanco(svc, tenantId)
    return {
      AS: (c.AS ?? []).map((a) => [String(a[0] ?? ''), String(a[1] ?? ''), String(a[2] ?? ''), (a[6] as string | undefined) ?? null]),
      LP: (c.LP ?? []).map((x) => ({ id: x.id, disc: x.disc, lei: x.lei, texto: x.texto, doc: x.doc ?? null })),
      WLP: c.WLP ?? [], WLPdoc: (c.WLPdoc ?? []) as Array<Array<string | null>>,
    }
  })
}

const uuidOu = (v: unknown): string | null => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null)

/** Descreve UMA meta (id do motor) a partir do conteúdo. Meta desconhecida → só o tipo. */
function descrever(id: string, c: ConteudoDescricao) {
  const p = id.split(':')
  const tipo = p[0]
  const base = { tipo, tipo_nome: TIPO_NOME[tipo] ?? null, parte: null as number | null, disciplina: null as string | null, aula: null as string | null, titulo: null as string | null, documento_id: null as string | null }
  const porAula = (i: number) => { const a = c.AS[i]; return a ? { disciplina: a[0] || null, aula: a[1] || null, titulo: a[2] || null, documento_id: uuidOu(a[3]) } : {} }
  if (tipo === 'pf' || tipo === 'fl' || tipo === 'qu') return { ...base, ...porAula(+p[1]) }
  if (tipo === 'pp') return { ...base, parte: Number.isFinite(+p[2]) ? +p[2] : null, ...porAula(+p[1]) }
  if (tipo === 'rf' || tipo === 'rq') return { ...base, ...porAula(+p[2]) } // rf:<semana>:<aula>
  if (tipo === 'lp') {
    const it = c.LP.find((x) => x.id === id)
    if (it) return { ...base, disciplina: it.disc || null, titulo: it.lei || it.texto || null, aula: null, documento_id: uuidOu(it.doc) }
    const s = +p[1], j = +p[2] // lp:<semana>:<n> (LegProc semanal antigo)
    if (Number.isFinite(s) && Number.isFinite(j) && c.WLP[s]?.[j]) return { ...base, titulo: String(c.WLP[s][j]).slice(0, 300), documento_id: uuidOu(c.WLPdoc[s]?.[j]) }
  }
  return base
}

// ── cfg / extras / pausa → colunas do plano + tabelas filhas (dual-write; o JSON segue sendo a fonte lida pelo motor) ──
const ISO = /^\d{4}-\d{2}-\d{2}$/
const iso = (v: unknown): string | null => (typeof v === 'string' && ISO.test(v) ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const txt = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

export function filhasDoCfg(tenantId: string, planoId: string, cfg: Record<string, unknown>, extras: unknown): Record<string, Array<Record<string, unknown>>> {
  const base = { tenant_id: tenantId, plano_id: planoId }
  const out: Record<string, Array<Record<string, unknown>>> = {}
  out.horas = arr(cfg.horas).slice(0, 7).flatMap((h, i) => (num(h) != null ? [{ ...base, dia: i, horas: num(h) }] : []))
  out.rotina = arr(cfg.rotinas).flatMap((r) => { const o = obj(r); const d = iso(o.desde); return d ? [{ ...base, desde: d, horas: arr(o.horas).map((x) => num(x) ?? 0) }] : [] })
  out.recesso = arr(cfg.recessos).flatMap((r) => { const o = obj(r); const a = iso(o.ini), b = iso(o.fim); return a && b ? [{ ...base, ini: a, fim: b, motivo: txt(o.motivo) }] : [] })
  out.hora_pontual = Object.entries(obj(cfg.horasPontuais)).flatMap(([d, h]) => (iso(d) && num(h) != null ? [{ ...base, data: d, horas: num(h) }] : []))
  out.disciplina = arr(cfg.discs).flatMap((d, i) => (typeof d === 'string' ? [{ ...base, ordem: i, disciplina: d }] : []))
  out.ultimo_tema = Object.entries(obj(cfg.ultimosTemas)).flatMap(([d, n]) => (num(n) != null ? [{ ...base, disciplina: d, posicao: Math.trunc(n as number) }] : []))
  out.pagina_lida = [
    ...Object.entries(obj(cfg.paginasLidas)).flatMap(([k, n]) => (num(n) != null ? [{ ...base, tipo: 'paginas', aula_ref: k, quantidade: num(n) }] : [])),
    ...Object.entries(obj(cfg.partesLidas)).flatMap(([k, n]) => (num(n) != null ? [{ ...base, tipo: 'partes', aula_ref: k, quantidade: num(n) }] : [])),
  ]
  out.sobra = Object.entries(obj(cfg.sobras)).flatMap(([k, n]) => (num(n) != null ? [{ ...base, meta_id: k, minutos: num(n) }] : []))
  out.remanejada = Object.entries(obj(cfg.remanejadas)).map(([k, v]) => { const o = obj(v); return { ...base, meta_id: k, desde: iso(o.desde), minutos: num(o.minutos), detalhe: o.detalhe ?? null } })
  out.lp_ignorar = arr(cfg.lpIgnorar).flatMap((m) => (typeof m === 'string' ? [{ ...base, meta_id: m }] : []))
  out.lp_legado = Object.entries(obj(cfg.lpLegado)).map(([k, v]) => { const o = obj(v); return { ...base, meta_id: k, disciplina: txt(o.disc), lei: txt(o.lei), texto: txt(o.texto), documento_id: txt(o.doc) } })
  out.extra = arr(extras).map((x) => { const o = obj(x); return { ...base, ext_id: txt(o.id), data: iso(o.data), minutos: num(o.min) != null ? Math.trunc(num(o.min) as number) : null, disciplina: txt(o.disc), tipo: txt(o.tipo), nota: txt(o.nota), em_ms: num(o.em) != null ? Math.trunc(num(o.em) as number) : null } })
  return out
}

async function sincronizarCfg(svc: SupabaseClient, row: { id: string; tenant_id: string; cfg: Record<string, unknown> | null; extras: unknown; pausa: unknown }): Promise<void> {
  try {
    const c = row.cfg ?? {}
    const m = obj(c.metas), rev = obj(c.revisao)
    const { error } = await svc.from(T_PLANO).update({
      start_data: iso(c.start), arranjo: txt(c.arranjo), rev_ativa: bool(rev.ativa), rev_cada: num(rev.cada) != null ? Math.trunc(num(rev.cada) as number) : null,
      rev_modelo: txt(c.revModelo), vel: num(c.vel), vel_seg: num(c.velSeg), vel_fonte: txt(c.velFonte), mais_pdfull: bool(c.maisPDFull),
      ja_estuda_revisao: bool(c.jaEstudaRevisao), sem_data: bool(c.semData), motor: txt(c.motor), catalogo: txt(c.catalogo),
      metas_pf: bool(m.pf), metas_fl: bool(m.fl), metas_qu: bool(m.qu), metas_lp: bool(m.lp), metas_vd: bool(m.vd), pausa_desde: iso(obj(row.pausa).desde),
    }).eq('id', row.id)
    if (error) return // migração 20261105060000 pendente (colunas ausentes) → sem sincronizar as filhas
    const filhas = filhasDoCfg(row.tenant_id, row.id, c, row.extras)
    for (const [nome, linhas] of Object.entries(filhas)) {
      const tabela = `simulado_cronograma_adaptativo_plano_${nome}`
      const del = await svc.from(tabela).delete().eq('plano_id', row.id)
      if (del.error) continue
      for (let k = 0; k < linhas.length; k += 500) await svc.from(tabela).insert(linhas.slice(k, k + 500))
    }
  } catch { /* best-effort */ }
}

/** Puro: transforma a grade { meta_id: [data, horas] } em linhas (ordenadas por data e, no dia, pela mesma ordem da tela). */
export function linhasDaGrade(
  ids: { tenantId: string; estudanteId: string; planoId: string },
  grade: Record<string, unknown>, start: string, conteudo: ConteudoDescricao,
): LinhaPlanoMeta[] {
  const itens: Array<{ id: string; data: string; horas: number | null }> = []
  for (const [id, v] of Object.entries(grade || {})) {
    if (!Array.isArray(v) || typeof v[0] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v[0])) continue
    itens.push({ id, data: v[0], horas: typeof v[1] === 'number' && Number.isFinite(v[1]) ? Math.round(v[1] * 100) / 100 : null })
  }
  const col = new Intl.Collator('en', { numeric: true })
  itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (ORDEM_TIPO[a.id.split(':')[0]] ?? 9) - (ORDEM_TIPO[b.id.split(':')[0]] ?? 9) || col.compare(a.id, b.id)))
  const ordemNoDia = new Map<string, number>()
  return itens.map((it) => {
    const n = ordemNoDia.get(it.data) ?? 0; ordemNoDia.set(it.data, n + 1)
    const d = descrever(it.id, conteudo)
    return {
      tenant_id: ids.tenantId, estudante_id: ids.estudanteId, plano_id: ids.planoId, meta_id: it.id, ...d,
      semana: start ? semDe(start, it.data) : 1, dia: dDow(it.data), data_prevista: it.data, horas: it.horas, ordem: n,
    }
  })
}

function hashGrade(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(36) + ':' + s.length
}

/**
 * Sincroniza as linhas de UM plano com a grade JSON. Pula se a grade não mudou (hash). Best-effort.
 * Retorna quantas linhas ficaram, ou `pulado`/`motivo`.
 */
export async function espelharPlanoMetas(svc: SupabaseClient, planoId: string): Promise<{ ok: boolean; linhas?: number; pulado?: boolean; motivo?: string }> {
  try {
    const { data: p, error } = await svc.from(T_PLANO).select('id, tenant_id, estudante_id, cfg, plano, extras, pausa, grade_espelhada_hash').eq('id', planoId).maybeSingle()
    if (error) return { ok: false, motivo: /column|schema cache/i.test(error.message) ? 'migracao_pendente' : error.message }
    if (!p) return { ok: false, motivo: 'plano_inexistente' }
    const row = p as { id: string; tenant_id: string; estudante_id: string; cfg: Record<string, unknown> | null; plano: Record<string, unknown> | null; extras: unknown; pausa: unknown; grade_espelhada_hash: string | null }
    const grade = row.plano ?? {}
    const hash = hashGrade(JSON.stringify([row.cfg ?? {}, row.extras ?? [], row.pausa ?? null, grade])) // cfg inteiro: mudança de horas/recessos/etc. também ressincroniza
    if (row.grade_espelhada_hash === hash) return { ok: true, pulado: true }

    const conteudo = await conteudoParaDescricao(svc, row.tenant_id)
    await sincronizarCfg(svc, row) // cfg/extras/pausa → colunas + tabelas filhas (best-effort)
    const linhas = linhasDaGrade({ tenantId: row.tenant_id, estudanteId: row.estudante_id, planoId: row.id }, grade, String(row.cfg?.start ?? ''), conteudo)

    // sincroniza: apaga o que saiu da grade e grava (upsert) o resto — o `criado_em` das linhas que continuam é preservado
    const existentes = new Set<string>()
    for (let from = 0; ; from += 1000) {
      const { data, error: e2 } = await svc.from(T_PM).select('meta_id').eq('plano_id', row.id).order('meta_id', { ascending: true }).range(from, from + 999)
      if (e2) return { ok: false, motivo: /does not exist|schema cache/i.test(e2.message) ? 'migracao_pendente' : e2.message }
      for (const r of (data ?? []) as Array<{ meta_id: string }>) existentes.add(r.meta_id)
      if (!data || data.length < 1000) break
    }
    const novas = new Set(linhas.map((l) => l.meta_id))
    const sairam = [...existentes].filter((m) => !novas.has(m))
    for (let k = 0; k < sairam.length; k += 150) await svc.from(T_PM).delete().eq('plano_id', row.id).in('meta_id', sairam.slice(k, k + 150))
    const agora = new Date().toISOString()
    for (let k = 0; k < linhas.length; k += 500) {
      const { error: e3 } = await svc.from(T_PM).upsert(linhas.slice(k, k + 500).map((l) => ({ ...l, atualizado_em: agora })), { onConflict: 'plano_id,meta_id' })
      if (e3) return { ok: false, motivo: e3.message }
    }
    await svc.from(T_PLANO).update({ grade_espelhada_hash: hash, grade_espelhada_em: agora }).eq('id', row.id)
    return { ok: true, linhas: linhas.length }
  } catch (e) {
    return { ok: false, motivo: (e as Error)?.message || 'erro' }
  }
}

/** Preenchimento em LOTE: espelha os planos ainda não espelhados (ou com grade alterada). `limite` por chamada. */
export async function espelharLote(svc: SupabaseClient, tenantId: string, limite = 20): Promise<{ ok: boolean; processados: number; linhas: number; restantes: number; motivo?: string }> {
  const { data, error } = await svc.from(T_PLANO).select('id, grade_espelhada_hash').eq('tenant_id', tenantId).eq('exemplo', false).order('id', { ascending: true }).limit(5000)
  if (error) return { ok: false, processados: 0, linhas: 0, restantes: 0, motivo: /column|schema cache/i.test(error.message) ? 'migracao_pendente' : error.message }
  const pend = ((data ?? []) as Array<{ id: string; grade_espelhada_hash: string | null }>).filter((r) => !r.grade_espelhada_hash)
  let processados = 0, linhas = 0, falhas = 0
  for (const r of pend.slice(0, limite)) {
    const x = await espelharPlanoMetas(svc, r.id)
    if (x.ok) { processados++; linhas += x.linhas ?? 0; continue }
    if (x.motivo === 'migracao_pendente') return { ok: false, processados, linhas, restantes: pend.length - processados, motivo: x.motivo }
    falhas++
  }
  return { ok: true, processados, linhas, restantes: Math.max(0, pend.length - processados - falhas) }
}

/** Dispara o espelho sem bloquear a resposta (o servidor Node segue rodando a promise). Nunca lança. */
export function espelharEmSegundoPlano(svc: SupabaseClient, planoId: string | null | undefined): void {
  if (!planoId) return
  void espelharPlanoMetas(svc, planoId).then(() => {}, () => {})
}
