import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember } from '@/lib/cache/relatorio-cache'
import { recursoAusente, marcarAusente, marcarSeAusente } from '@/lib/db/recurso-ausente'
import { carregarConteudoBanco } from './conteudo-banco'
import { dParse, dDow, semDe } from './motor28'
import { chavesUnicas } from './catalogo-override'
import { carregarInfoDocs } from './relink-documento-server'
import { normalizarTituloDoc } from './relink-documento'
import { rotuloMeta, semanaOrigemDaMeta, sanearDetalhes } from './meta-ids'
import { rotuloTipo, ordemTipo } from './tipos-meta'
import type { Detalhe } from './motor28'

/**
 * ESPELHO RELACIONAL da grade do plano: uma LINHA POR META em `simulado_cronograma_adaptativo_plano_meta`
 * (tipo, disciplina, aula, título, documento, semana, dia, data, horas, ordem, criado_em) — como o cronograma normal.
 * A fonte continua sendo o JSON `plano.plano` gerado pelo motor; aqui só se sincroniza (best-effort, nunca derruba o plano).
 * Tolerante: sem a migração 20261105050000 nada acontece.
 */

const T_PLANO = 'simulado_cronograma_adaptativo_plano'
const T_PM = 'simulado_cronograma_adaptativo_plano_meta'
/** false depois que o banco recusar as colunas de snapshot (migração 20261125020000 pendente) — evita tentar de novo a cada lote. */
const SNAP_COLS = true

export interface LinhaPlanoMeta {
  tenant_id: string; estudante_id: string; plano_id: string
  meta_id: string; tipo: string; tipo_nome: string | null; parte: number | null
  disciplina: string | null; aula: string | null; titulo: string | null; documento_id: string | null; aula_key: string | null
  semana: number; dia: number; data_prevista: string; horas: number | null; ordem: number
  detalhes: Record<string, unknown> | null; semana_origem: number | null
  /** SNAPSHOT do documento no momento do espelho (migração 20261125020000; opcionais: o código segue sem as colunas) */
  doc_titulo?: string | null; doc_titulo_norm?: string | null; doc_pasta_id?: string | null
}

/** O que precisa do conteúdo p/ descrever as metas (enxuto e serializável → cacheável). */
export interface ConteudoDescricao {
  AS: Array<[string, string, string, string | null, string]>                          // disciplina, nº da aula, tema, documento, chave estável
  LP: Array<{ id: string; disc: string; lei: string; texto: string; doc: string | null }>
  WLP: string[][]; WLPdoc: Array<Array<string | null>>
  /** metas próprias gx (tipos personalizados com geraMeta): id → dados p/ descrever */
  GX?: Array<{ id: string; nomeTipo: string; disc: string; titulo: string; doc: string | null }>
  /** snapshot por documento: t = título, n = título normalizado, p = pasta (opcional → sem snapshot) */
  DOCS?: Record<string, { t: string; n: string; p: string | null }>
}

async function conteudoParaDescricao(svc: SupabaseClient, tenantId: string): Promise<ConteudoDescricao> {
  return remember<ConteudoDescricao>(`crono-adapt:plano-meta-conteudo:${tenantId}`, 120, async () => {
    const c = await carregarConteudoBanco(svc, tenantId)
    const chaves = chavesUnicas(c.AS ?? []) // chave estável da aula (d:<doc> · t:disc|tema) — independe da posição
    const AS = (c.AS ?? []).map((a, i) => [String(a[0] ?? ''), String(a[1] ?? ''), String(a[2] ?? ''), (a[6] as string | undefined) ?? null, chaves[i]] as ConteudoDescricao['AS'][number])
    const LP = (c.LP ?? []).map((x) => ({ id: x.id, disc: x.disc, lei: x.lei, texto: x.texto, doc: x.doc ?? null }))
    const WLPdoc = (c.WLPdoc ?? []) as Array<Array<string | null>>
    // SNAPSHOT do nome do documento (best-effort: falha → sem snapshot, o espelho segue igual)
    const DOCS: NonNullable<ConteudoDescricao['DOCS']> = {}
    try {
      const ids = new Set<string>()
      for (const a of AS) if (uuidOu(a[3])) ids.add(a[3] as string)
      for (const l of LP) if (uuidOu(l.doc)) ids.add(l.doc as string)
      for (const r of WLPdoc) for (const d of r ?? []) if (uuidOu(d)) ids.add(d as string)
      for (const x of c.GX ?? []) if (uuidOu(x.doc)) ids.add(x.doc as string)
      for (const [id, d] of await carregarInfoDocs(svc, tenantId, [...ids])) DOCS[id] = { t: d.titulo ?? '', n: d.titulo_norm || normalizarTituloDoc(d.titulo), p: d.pasta_id ?? null }
    } catch { /* sem snapshot */ }
    const GX = (c.GX ?? []).map((x) => ({ id: x.id, nomeTipo: x.nomeTipo, disc: x.disc, titulo: x.titulo, doc: x.doc ?? null }))
    return { AS, LP, WLP: c.WLP ?? [], WLPdoc, DOCS, ...(GX.length ? { GX } : {}) }
  })
}

const uuidOu = (v: unknown): string | null => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null)

/** Descreve UMA meta (id do motor) a partir do conteúdo. Meta desconhecida → só o tipo.
 *  Entende: pf|fl:i:revisao:s · pf|fl:i:reforco:s · qu:i:hist:s (aula i) · rf:s:i · pp:i:k · lp:* · jp:s. */
export function descrever(id: string, c: ConteudoDescricao) {
  const p = id.split(':')
  const tipo = p[0]
  const base = { tipo, tipo_nome: rotuloMeta(id) ?? rotuloTipo(tipo), parte: null as number | null, disciplina: null as string | null, aula: null as string | null, titulo: null as string | null, documento_id: null as string | null, aula_key: null as string | null }
  const porAula = (i: number) => { const a = c.AS[i]; return a ? { disciplina: a[0] || null, aula: a[1] || null, titulo: a[2] || null, documento_id: uuidOu(a[3]), aula_key: a[4] } : {} }
  if (tipo === 'gx') {
    const it = c.GX?.find((x) => x.id === id)
    return it ? { ...base, tipo_nome: it.nomeTipo || base.tipo_nome, disciplina: it.disc || null, titulo: it.titulo || null, documento_id: uuidOu(it.doc) } : base
  }
  if (tipo === 'jp') return { ...base, titulo: 'Jurisprudência' } // 2.19: meta semanal, sem aula/documento
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

async function sincronizarCfg(svc: SupabaseClient, row: { id: string; tenant_id: string; cfg: Record<string, unknown> | null; extras: unknown; pausa: unknown }): Promise<boolean> {
  try {
    const c = row.cfg ?? {}
    const m = obj(c.metas), rev = obj(c.revisao)
    const { error } = await svc.from(T_PLANO).update({
      start_data: iso(c.start), arranjo: txt(c.arranjo), rev_ativa: bool(rev.ativa), rev_cada: num(rev.cada) != null ? Math.trunc(num(rev.cada) as number) : null,
      rev_modelo: txt(c.revModelo), vel: num(c.vel), vel_seg: num(c.velSeg), vel_fonte: txt(c.velFonte), mais_pdfull: bool(c.maisPDFull),
      ja_estuda_revisao: bool(c.jaEstudaRevisao), sem_data: bool(c.semData), motor: txt(c.motor), catalogo: txt(c.catalogo),
      metas_pf: bool(m.pf), metas_fl: bool(m.fl), metas_qu: bool(m.qu), metas_lp: bool(m.lp), metas_vd: bool(m.vd), pausa_desde: iso(obj(row.pausa).desde),
    }).eq('id', row.id)
    if (error) return false // migração 20261105060000 pendente (colunas ausentes) → sem sincronizar as filhas
    const filhas = filhasDoCfg(row.tenant_id, row.id, c, row.extras)
    let ok = true
    for (const [nome, linhas] of Object.entries(filhas)) {
      const tabela = `simulado_cronograma_adaptativo_plano_${nome}`
      const del = await svc.from(tabela).delete().eq('plano_id', row.id)
      if (del.error) { ok = false; continue }
      for (let k = 0; k < linhas.length; k += 500) {
        const ins = await svc.from(tabela).insert(linhas.slice(k, k + 500))
        if (ins.error) { ok = false; console.error('[adaptativo] filha', nome, ins.error.message); break }
      }
    }
    return ok // false → o hash NÃO é gravado e o próximo espelho tenta de novo
  } catch { return false }
}

/** Puro: transforma a grade { meta_id: [data, horas] } em linhas (ordenadas por data e, no dia, pela mesma ordem da tela). */
export function linhasDaGrade(
  ids: { tenantId: string; estudanteId: string; planoId: string },
  grade: Record<string, unknown>, start: string, conteudo: ConteudoDescricao, detalhes: Record<string, Record<string, unknown>> = {},
): LinhaPlanoMeta[] {
  const itens: Array<{ id: string; data: string; horas: number | null }> = []
  for (const [id, v] of Object.entries(grade || {})) {
    if (!Array.isArray(v) || typeof v[0] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v[0])) continue
    itens.push({ id, data: v[0], horas: typeof v[1] === 'number' && Number.isFinite(v[1]) ? Math.round(v[1] * 100) / 100 : null })
  }
  const col = new Intl.Collator('en', { numeric: true })
  itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : ordemTipo(a.id.split(':')[0]) - ordemTipo(b.id.split(':')[0]) || col.compare(a.id, b.id)))
  const ordemNoDia = new Map<string, number>()
  return itens.map((it) => {
    const n = ordemNoDia.get(it.data) ?? 0; ordemNoDia.set(it.data, n + 1)
    const d = descrever(it.id, conteudo)
    const det = detalhes[it.id] ?? null
    const sd = d.documento_id ? conteudo.DOCS?.[d.documento_id] : undefined
    return {
      tenant_id: ids.tenantId, estudante_id: ids.estudanteId, plano_id: ids.planoId, meta_id: it.id, ...d,
      ...(sd ? { doc_titulo: sd.t, doc_titulo_norm: sd.n, doc_pasta_id: sd.p } : {}),
      detalhes: det, semana_origem: semanaOrigemDaMeta(it.id, det),
      semana: start ? semDe(start, it.data) : 1, dia: dDow(it.data), data_prevista: it.data, horas: it.horas, ordem: n,
    }
  })
}

/** Mapa { meta_id: detalhe } do plano (coluna `detalhes_metas`). Migração pendente / erro → {} (nunca lança). */
export async function lerDetalhesMetas(svc: SupabaseClient, planoId: string): Promise<Record<string, Detalhe>> {
  if (recursoAusente('col:plano.detalhes_metas')) return {}
  try {
    const { data, error } = await svc.from(T_PLANO).select('detalhes_metas').eq('id', planoId).maybeSingle()
    if (error) { marcarSeAusente('col:plano.detalhes_metas', error.message); return {} }
    const d = (data as { detalhes_metas?: unknown } | null)?.detalhes_metas
    return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, Detalhe>) : {}
  } catch { return {} }
}

/** Grava o mapa de detalhes do plano (best-effort: sem a migração 20261110020000 não faz nada). Só mantém ids que existem na grade. */
export async function gravarDetalhesMetas(svc: SupabaseClient, planoId: string, detalhes: Record<string, unknown>, grade?: Record<string, unknown> | null): Promise<boolean> {
  try {
    const limpo = sanearDetalhes(detalhes)
    if (!limpo || recursoAusente('col:plano.detalhes_metas')) return false
    if (grade) for (const id of Object.keys(limpo)) if (!(id in grade)) delete limpo[id]
    const { error } = await svc.from(T_PLANO).update({ detalhes_metas: limpo }).eq('id', planoId)
    if (error) marcarSeAusente('col:plano.detalhes_metas', error.message)
    return !error
  } catch { return false }
}

function hashGrade(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(36) + ':' + s.length
}

/** stringify estável (chaves ordenadas; undefined→null) — compara jsonb independentemente da ordem das chaves. */
function estavel(v: unknown): string {
  if (v === undefined || v === null) return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? String(Number(v)) : 'null'
  if (Array.isArray(v)) return '[' + v.map(estavel).join(',') + ']'
  if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + estavel(o[k])).join(',') + '}' }
  return JSON.stringify(v)
}

/**
 * Puro: devolve só as linhas NOVAS ou DIFERENTES das existentes (por meta_id). Compara apenas as chaves presentes na linha
 * existente (colunas de migrações pendentes não vêm do banco → não forçam upsert). `atualizado_em`/`criado_em` são ignorados.
 */
export function linhasDiferentes<L extends { meta_id: string }>(linhas: L[], existentes: Map<string, Record<string, unknown>>): L[] {
  return linhas.filter((l) => {
    const ex = existentes.get(l.meta_id)
    if (!ex) return true
    for (const k of Object.keys(ex)) {
      if (k === 'atualizado_em' || k === 'criado_em' || k === 'id') continue
      if (!(k in l)) continue
      if (estavel((l as Record<string, unknown>)[k]) !== estavel(ex[k])) return true
    }
    return false
  })
}

/** Hashes do espelho. `linhas` = só o que afeta as linhas espelhadas (grade + detalhes + data de início do cfg); `cfg` = só o que sincronizarCfg grava (cfg/extras/pausa). */
export function hashesEspelho(row: { cfg: Record<string, unknown> | null; extras: unknown; pausa: unknown; plano: Record<string, unknown> | null }, detalhes: unknown): { linhas: string; cfg: string } {
  const linhas = hashGrade(JSON.stringify(['k3', String(row.cfg?.start ?? ''), row.plano ?? {}, detalhes]))
  const cfg = hashGrade(JSON.stringify(['c1', row.cfg ?? {}, row.extras ?? [], row.pausa ?? null]))
  return { linhas, cfg }
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
    const detalhes = (sanearDetalhes(await lerDetalhesMetas(svc, row.id)) ?? {}) as Record<string, Record<string, unknown>>
    const hs = hashesEspelho(row, detalhes)
    const hash = `${hs.linhas}|${hs.cfg}` // grade_espelhada_hash = "<hash das linhas>|<hash do cfg>" (formato antigo sem '|' → re-espelha 1x)
    if (row.grade_espelhada_hash === hash) return { ok: true, pulado: true }
    const [hLinhasAnt, hCfgAnt] = (row.grade_espelhada_hash ?? '').split('|')
    const linhasMudaram = hLinhasAnt !== hs.linhas
    const cfgMudou = hCfgAnt !== hs.cfg

    // Só cfg/extras/pausa mudaram (grade e detalhes iguais): NÃO recalcula/reenvia as linhas — só sincroniza cfg → colunas + filhas.
    if (!linhasMudaram) {
      const ok = await sincronizarCfg(svc, row)
      if (ok) await svc.from(T_PLANO).update({ grade_espelhada_hash: hash, grade_espelhada_em: new Date().toISOString() }).eq('id', row.id)
      return { ok: true, pulado: true, motivo: ok ? 'so_cfg' : 'cfg_pendente' }
    }

    const conteudo = await conteudoParaDescricao(svc, row.tenant_id)
    const cfgOk = cfgMudou ? await sincronizarCfg(svc, row) : true // cfg/extras/pausa → colunas + tabelas filhas (best-effort); inalterado → não refaz o delete+insert das 12 filhas
    const linhas = linhasDaGrade({ tenantId: row.tenant_id, estudanteId: row.estudante_id, planoId: row.id }, grade, String(row.cfg?.start ?? ''), conteudo, detalhes)

    // 1º caminho: função TRANSACIONAL (migração 20261106040000) — tudo ou nada, nunca deixa a grade pela metade
    const rpc = await svc.rpc('cron_adapt_espelhar_grade', { p_plano: row.id, p_linhas: linhas })
    if (!rpc.error) {
      if (cfgOk) await svc.from(T_PLANO).update({ grade_espelhada_hash: hash, grade_espelhada_em: new Date().toISOString() }).eq('id', row.id)
      return { ok: true, linhas: linhas.length }
    }
    if (!/cron_adapt_espelhar_grade|schema cache|does not exist/i.test(rpc.error.message)) {
      console.error('[adaptativo] espelho transacional falhou', row.id, rpc.error.message)
      return { ok: false, motivo: rpc.error.message }
    }

    // fallback (função ainda não aplicada): apaga o que saiu da grade e grava (upsert) o resto — o `criado_em` das linhas que continuam é preservado
    const existentesMap = new Map<string, Record<string, unknown>>()
    for (let from = 0; ; from += 1000) {
      const { data, error: e2 } = await svc.from(T_PM).select('*').eq('plano_id', row.id).order('meta_id', { ascending: true }).range(from, from + 999)
      if (e2) return { ok: false, motivo: /does not exist|schema cache/i.test(e2.message) ? 'migracao_pendente' : e2.message }
      for (const r of (data ?? []) as Array<Record<string, unknown>>) existentesMap.set(String(r.meta_id), r)
      if (!data || data.length < 1000) break
    }
    const existentes = new Set(existentesMap.keys())
    const novas = new Set(linhas.map((l) => l.meta_id))
    const sairam = [...existentes].filter((m) => !novas.has(m))
    for (let k = 0; k < sairam.length; k += 150) await svc.from(T_PM).delete().eq('plano_id', row.id).in('meta_id', sairam.slice(k, k + 150))
    const agora = new Date().toISOString()
    const aGravar = linhasDiferentes(linhas, existentesMap) // upsert só do que mudou (comparado com o existente)
    for (let k = 0; k < aGravar.length; k += 500) {
      // colunas opcionais de migrações pendentes (snapshot do doc: 20261125020000; aula_key: 20261129000000; detalhes/semana_origem: 20261110020000):
      // a ausência é memorizada 10 min (recursoAusente) → não se tenta o upsert com a coluna a cada espelhamento.
      const montar = (sn: boolean, dt: boolean, au: boolean) => aGravar.slice(k, k + 500).map(({ doc_titulo, doc_titulo_norm, doc_pasta_id, detalhes, semana_origem, aula_key, ...l }) => ({
        ...l, ...(sn ? { doc_titulo, doc_titulo_norm, doc_pasta_id } : {}), ...(dt ? { detalhes, semana_origem } : {}), ...(au ? { aula_key } : {}), atualizado_em: agora,
      }))
      let sn = SNAP_COLS && !recursoAusente('col:pm.doc_titulo'), dt = !recursoAusente('col:pm.detalhes'), au = !recursoAusente('col:pm.aula_key')
      let { error: e3 } = await svc.from(T_PM).upsert(montar(sn, dt, au), { onConflict: 'plano_id,meta_id' })
      for (let t = 0; t < 3 && e3; t++) {
        if (sn && /doc_titulo|doc_pasta_id/i.test(e3.message)) { sn = false; marcarAusente('col:pm.doc_titulo') }
        else if (au && /aula_key/i.test(e3.message)) { au = false; marcarAusente('col:pm.aula_key') }
        else if (dt && /detalhes|semana_origem/i.test(e3.message)) { dt = false; marcarAusente('col:pm.detalhes') }
        else break
        ;({ error: e3 } = await svc.from(T_PM).upsert(montar(sn, dt, au), { onConflict: 'plano_id,meta_id' }))
      }
      if (e3) return { ok: false, motivo: e3.message }
    }
    if (cfgOk) await svc.from(T_PLANO).update({ grade_espelhada_hash: hash, grade_espelhada_em: agora }).eq('id', row.id)
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
// Coalescência por plano (por processo): salvar várias vezes seguidas (iframe edita a cada ação) disparava 1 espelho (RPC pesada, ~575ms) por save.
// Se já há um espelho do plano em andamento, apenas marca "sujo"; ao terminar roda UMA vez mais (lê o plano atual) → estado final idêntico, menos chamadas.
const espelhoEmAndamento = new Map<string, { sujo: boolean }>()
export function espelharEmSegundoPlano(svc: SupabaseClient, planoId: string | null | undefined): void {
  if (!planoId) return
  const atual = espelhoEmAndamento.get(planoId)
  if (atual) { atual.sujo = true; return }
  const est = { sujo: false }
  espelhoEmAndamento.set(planoId, est)
  void (async () => {
    try {
      do { est.sujo = false; await espelharPlanoMetas(svc, planoId).catch(() => {}) } while (est.sujo)
    } finally { espelhoEmAndamento.delete(planoId) }
  })()
}
