import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cfg, DataISO, Plano } from './engine'
import { gerarPlano, dISO } from './engine'
import { type Estado, type ProgMeta } from './estado'
import { carregarConteudo, carregarConteudoBanco } from './conteudo-banco'
import { VERSAO_MOTOR } from './motor28'
import { construirSnapshot, type AdaptativoSnapshot } from './snapshot'

// Camada server do Cronograma Adaptativo. Backend-first: a página chama `carregarAdaptativo`
// e recebe o snapshot pronto. Mutações via estas funções (expostas por rotas /api, pois
// server actions quebram em domínio custom — landmine conhecido).
//
// Conteúdo (AS/WLP): hoje vem do SEED (conteúdo real do Revisão, 269 aulas). Quando houver
// cadastro de catálogo no admin, trocar `conteudoSeed()` pelo loader de banco por tenant.

const T_PLANO = 'simulado_cronograma_adaptativo_plano'
const T_META = 'simulado_cronograma_adaptativo_meta'

export interface MetaRow {
  meta_id: string
  estado: 'done' | 'missed' | null
  parcial_v: string | null
  parcial_em: string | null
  grau: number | null
  estrelas: number | null
  res: number | null
  err: number | null
  tempo_seg: number
  modo: string | null
  nota: string | null
}
export interface PlanoRow {
  id: string
  titulo: string | null
  cfg: Cfg
  plano: Plano
  fim: number
  revs: Record<number, Array<[string, DataISO]>>
  pausa: { desde: DataISO } | null
  exemplo: boolean
}

/** Monta o Estado do motor a partir das linhas do banco. */
function montarEstado(plano: PlanoRow, metas: MetaRow[]): Estado {
  const prog: Record<string, ProgMeta> = {}
  const notas: Estado['notas'] = {}
  for (const m of metas) {
    const p: ProgMeta = {}
    if (m.estado) p.s = m.estado
    if (m.tempo_seg) p.t = m.tempo_seg
    if (m.parcial_v) p.parou = { v: m.parcial_v, em: (m.parcial_em || '') as DataISO }
    if (m.modo) p.modo = m.modo
    if (Object.keys(p).length) prog[m.meta_id] = p
    const n: { grau?: number; res?: number; err?: number; diff?: number } = {}
    if (m.grau != null) n.grau = m.grau
    if (m.res != null) n.res = m.res
    if (m.err != null) n.err = m.err
    if (m.estrelas != null) n.diff = m.estrelas
    if (Object.keys(n).length) notas[m.meta_id] = n
  }
  return {
    v: 2, cfg: plano.cfg, plano: plano.plano || {}, fim: plano.fim || 1,
    prog, notas, revs: plano.revs || {}, pausa: plano.pausa || null, exemplo: !!plano.exemplo,
  }
}

const COLS_PLANO = 'id,titulo,cfg,plano,fim,revs,pausa,exemplo'
// Lê UM plano do aluno. Com planoId → aquele plano (validado por tenant+estudante).
// Sem planoId → o FIXADO (foco); se não houver fixado, cai no mais recente não-arquivado.
async function lerPlanoRow(svc: SupabaseClient, tenantId: string, estId: string, planoId?: string | null): Promise<PlanoRow | null> {
  if (planoId) {
    const { data } = await svc.from(T_PLANO).select(COLS_PLANO)
      .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('id', planoId).maybeSingle()
    return (data as unknown as PlanoRow) || null
  }
  const { data: fx } = await svc.from(T_PLANO).select(COLS_PLANO)
    .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('arquivada', false).eq('fixado', true).maybeSingle()
  if (fx) return fx as unknown as PlanoRow
  const { data: rec } = await svc.from(T_PLANO).select(COLS_PLANO)
    .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('arquivada', false)
    .order('criado_em', { ascending: false }).limit(1).maybeSingle()
  return (rec as unknown as PlanoRow) || null
}
async function lerMetas(svc: SupabaseClient, tenantId: string, planoId: string): Promise<MetaRow[]> {
  const { data } = await svc.from(T_META).select('meta_id,estado,parcial_v,parcial_em,grau,estrelas,res,err,tempo_seg,modo,nota')
    .eq('tenant_id', tenantId).eq('plano_id', planoId)
  return (data as unknown as MetaRow[]) || []
}

// ── Cronograma Adaptativo 2.8: o que NÃO se move ao recalcular + migração automática ───────────────
/** Data de hoje no calendário do aluno (Brasília/Fortaleza, UTC−3 sem horário de verão). */
export function hojeCal(): DataISO { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date()) }

/**
 * Metas que ficam FIXAS num recálculo a partir de `ancora`: concluídas, de dias anteriores à âncora
 * (histórico/atrasos — "organizar atrasos" é ação própria) e qualquer meta com progresso registrado
 * (tempo, ponto de parada, anotação, dificuldade, questões). Garante que conclusões, tempo e anotações
 * nunca "somem" do plano (§8 invariantes).
 */
export function fixosPreservados(plano: Plano, metas: MetaRow[], ancora: DataISO | null): Plano {
  const comDado = new Set(metas.filter((m) => m.estado === 'done' || (m.tempo_seg || 0) > 0 || m.parcial_v || m.nota || m.grau != null || m.res != null || m.estrelas != null).map((m) => m.meta_id))
  const out: Plano = {}
  for (const [id, v] of Object.entries(plano || {})) {
    if (!Array.isArray(v)) continue
    if (comDado.has(id) || (ancora && v[0] < ancora)) out[id] = v
  }
  return out
}

const ehLpAntigo = (id: string) => /^lp:\d+:\d+$/.test(id)

/**
 * MIGRAÇÃO para o motor 2.8 (uma vez por plano, ao carregar). Recalcula a partir de HOJE com as
 * regras 2.8, mantendo fixas as metas de `fixosPreservados` (nada concluído/estudado/anotado se perde;
 * as linhas de simulado_cronograma_adaptativo_meta — tempo/notas — continuam com os mesmos ids).
 * LegProc antigo (1 lei inteira por semana, "lp:s:j"): os já concluídos/estudados ficam no histórico
 * com o id antigo e a 1ª meta nova daquela lei conta como lida (lpIgnorar), sem pedir de novo.
 * Backup do plano anterior em storage (cronograma/backup-28/<planoId>.json) antes de gravar.
 */
async function migrarPara28(svc: SupabaseClient, tenantId: string, row: PlanoRow): Promise<PlanoRow> {
  const cfg = (row.cfg || {}) as Cfg & { motor?: string; maisPDFull?: boolean; lpIgnorar?: string[] }
  if (row.exemplo || cfg.motor === VERSAO_MOTOR || !row.plano || !Object.keys(row.plano).length) return row
  try {
    const banco = await carregarConteudoBanco(svc, tenantId)
    const conteudo = banco.vazio ? await carregarConteudo(svc, tenantId) : banco
    const metas = await lerMetas(svc, tenantId, row.id)
    const hoje = hojeCal()
    const fixos = fixosPreservados(row.plano, metas, hoje)
    // LegProc antigo já lido → 1ª meta nova da mesma lei conta como lida
    const lpIgnorar = new Set(cfg.lpIgnorar || [])
    const feitosLp = new Set(metas.filter((m) => m.estado === 'done' && ehLpAntigo(m.meta_id)).map((m) => m.meta_id))
    for (const id of feitosLp) {
      const [, s, j] = id.split(':'); const doc = banco.WLPdoc?.[+s]?.[+j]
      if (doc) lpIgnorar.add(`lp:${doc.replace(/-/g, '').slice(0, 12)}:1`)
    }
    const cfg2 = { ...cfg, motor: VERSAO_MOTOR, maisPDFull: cfg.maisPDFull ?? true, lpIgnorar: [...lpIgnorar] } as Cfg
    const r = gerarPlano(cfg2, conteudo.AS, conteudo.WLP, fixos, hoje, conteudo.LP)
    try {
      const corpo = new Blob([JSON.stringify({ planoId: row.id, em: new Date().toISOString(), cfg: row.cfg, plano: row.plano, fim: row.fim })], { type: 'application/json' })
      await svc.storage.from('pdfs').upload(`cronograma/backup-28/${tenantId}/${row.id}.json`, corpo, { upsert: false, contentType: 'application/json' })
    } catch { /* backup best-effort (já existe = migrado antes) */ }
    const { error } = await svc.from(T_PLANO)
      .update({ cfg: cfg2 as unknown as Record<string, unknown>, plano: r.plano as unknown as Record<string, unknown>, fim: r.fim, atualizado_em: new Date().toISOString() })
      .eq('id', row.id).filter('cfg->>motor', 'is', null) // concorrência: só migra se ninguém migrou antes
    if (error) return row
    return { ...row, cfg: cfg2, plano: r.plano, fim: r.fim }
  } catch {
    return row // falha na migração não derruba o cronograma do aluno (segue no plano antigo)
  }
}

export interface CargaAdaptativo {
  temPlano: boolean
  planoId: string | null
  titulo: string | null
  snapshot: AdaptativoSnapshot | null
}

/** Carga principal (backend-first): devolve o snapshot pronto ou temPlano=false (primeiro acesso). */
export async function carregarAdaptativo(svc: SupabaseClient, tenantId: string, estId: string, hoje: DataISO = dISO(new Date())): Promise<CargaAdaptativo> {
  const row0 = await lerPlanoRow(svc, tenantId, estId)
  if (!row0) return { temPlano: false, planoId: null, titulo: null, snapshot: null }
  const row = await migrarPara28(svc, tenantId, row0)
  const metas = await lerMetas(svc, tenantId, row.id)
  const est = montarEstado(row, metas)
  const conteudo = await carregarConteudo(svc, tenantId)
  const snapshot = construirSnapshot(est, conteudo, hoje)
  return { temPlano: true, planoId: row.id, titulo: row.titulo, snapshot }
}

/** Gera (ou recalcula) o plano a partir do cfg e persiste. ancora => redistribui o não-feito a partir dela. */
export async function gerarAdaptativo(
  svc: SupabaseClient, tenantId: string, estId: string,
  cfg: Cfg, opc: { titulo?: string; ancora?: DataISO | null; novo?: boolean } = {},
): Promise<{ ok: boolean; planoId?: string; error?: string }> {
  const conteudo = await carregarConteudo(svc, tenantId)
  // `novo` => cria OUTRO cronograma (e fixa). Senão => recalcula o plano em FOCO (fixado).
  const alvo = opc.novo ? null : await lerPlanoRow(svc, tenantId, estId)
  // fixos = metas concluídas (não se movem), lidas do plano alvo se existir
  // fixos = concluídas + passadas + com progresso (tempo/notas/parada) — nada estudado se perde (2.8 §8)
  let fixos: Record<string, [DataISO, number]> = {}
  if (alvo && opc.ancora) fixos = fixosPreservados(alvo.plano || {}, await lerMetas(svc, tenantId, alvo.id), opc.ancora)
  cfg = { ...cfg, motor: VERSAO_MOTOR } as Cfg
  const r = gerarPlano(cfg, conteudo.AS, conteudo.WLP, fixos, opc.ancora || null, conteudo.LP)
  const campos = {
    titulo: opc.titulo ?? alvo?.titulo ?? 'Meu cronograma',
    cfg: cfg as unknown as Record<string, unknown>,
    plano: r.plano as unknown as Record<string, unknown>,
    fim: r.fim, revs: {}, exemplo: false,
    atualizado_em: new Date().toISOString(),
  }
  if (alvo) {
    // Recalcula o plano em foco (preserva id, metas e foco).
    const { error } = await svc.from(T_PLANO).update(campos).eq('id', alvo.id)
    if (error) return { ok: false, error: error.message }
    return { ok: true, planoId: alvo.id }
  }
  // Novo plano: desfixa os demais e cria já fixado (vira o foco).
  await svc.from(T_PLANO).update({ fixado: false }).eq('tenant_id', tenantId).eq('estudante_id', estId).eq('fixado', true)
  const { data, error } = await svc.from(T_PLANO)
    .insert({ tenant_id: tenantId, estudante_id: estId, fixado: true, ...campos })
    .select('id').maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, planoId: (data as { id?: string } | null)?.id }
}

export interface PlanoResumo {
  id: string
  titulo: string | null
  fixado: boolean
  criado_em: string
  atualizado_em: string
}

/** Lista os cronogramas (não-arquivados) do aluno — fixado primeiro, depois por recência. */
export async function listarPlanosAdaptativo(svc: SupabaseClient, tenantId: string, estId: string): Promise<PlanoResumo[]> {
  const { data } = await svc.from(T_PLANO).select('id,titulo,fixado,criado_em,atualizado_em')
    .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('arquivada', false)
    .order('fixado', { ascending: false }).order('criado_em', { ascending: false })
  return ((data as unknown as PlanoResumo[]) || [])
}

/** Fixa um plano como foco do aluno (desfixa os demais). */
export async function fixarPlanoAdaptativo(svc: SupabaseClient, tenantId: string, estId: string, planoId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: ok } = await svc.from(T_PLANO).select('id')
    .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('id', planoId).eq('arquivada', false).maybeSingle()
  if (!ok) return { ok: false, error: 'nao_encontrado' }
  await svc.from(T_PLANO).update({ fixado: false }).eq('tenant_id', tenantId).eq('estudante_id', estId).eq('fixado', true)
  const { error } = await svc.from(T_PLANO).update({ fixado: true, atualizado_em: new Date().toISOString() }).eq('id', planoId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Arquiva (ou desarquiva) um cronograma. Se arquivar o fixado, promove o mais recente restante. */
export async function arquivarPlanoAdaptativo(svc: SupabaseClient, tenantId: string, estId: string, planoId: string, arquivar = true): Promise<{ ok: boolean; error?: string }> {
  const { data: row } = await svc.from(T_PLANO).select('id,fixado')
    .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('id', planoId).maybeSingle()
  if (!row) return { ok: false, error: 'nao_encontrado' }
  const eraFixado = !!(row as { fixado?: boolean }).fixado
  const { error } = await svc.from(T_PLANO)
    .update({ arquivada: arquivar, fixado: arquivar ? false : eraFixado, atualizado_em: new Date().toISOString() })
    .eq('id', planoId)
  if (error) return { ok: false, error: error.message }
  if (arquivar && eraFixado) {
    const { data: prox } = await svc.from(T_PLANO).select('id')
      .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('arquivada', false)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle()
    if (prox) await svc.from(T_PLANO).update({ fixado: true }).eq('id', (prox as { id: string }).id)
  }
  return { ok: true }
}

/** Renomeia um cronograma. */
export async function renomearPlanoAdaptativo(svc: SupabaseClient, tenantId: string, estId: string, planoId: string, titulo: string): Promise<{ ok: boolean; error?: string }> {
  const nome = (titulo || '').trim().slice(0, 80) || 'Meu cronograma'
  const { error } = await svc.from(T_PLANO).update({ titulo: nome, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('id', planoId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Patch no progresso/notas de uma meta (concluir/faltou/parcial/grau/estrelas/res·err/modo/nota). */
export async function patchMetaAdaptativo(
  svc: SupabaseClient, tenantId: string, estId: string,
  metaId: string, patch: Partial<Omit<MetaRow, 'meta_id'>>,
): Promise<{ ok: boolean; error?: string }> {
  const row = await lerPlanoRow(svc, tenantId, estId)
  if (!row) return { ok: false, error: 'sem_plano' }
  const payload: Record<string, unknown> = {
    tenant_id: tenantId, estudante_id: estId, plano_id: row.id, meta_id: metaId,
    atualizado_em: new Date().toISOString(), ...patch,
  }
  const { error } = await svc.from(T_META).upsert(payload, { onConflict: 'plano_id,meta_id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Soma tempo (segundos) ao acumulado da meta (modo foco). Lê-soma-grava. */
export async function somarTempoMeta(svc: SupabaseClient, tenantId: string, estId: string, metaId: string, segAdd: number): Promise<{ ok: boolean; tempoSeg?: number; error?: string }> {
  const row = await lerPlanoRow(svc, tenantId, estId)
  if (!row) return { ok: false, error: 'sem_plano' }
  const { data: cur } = await svc.from(T_META).select('tempo_seg').eq('tenant_id', tenantId).eq('plano_id', row.id).eq('meta_id', metaId).maybeSingle()
  const base = (cur as { tempo_seg?: number } | null)?.tempo_seg || 0
  const novo = Math.max(0, base + Math.round(segAdd))
  const { error } = await svc.from(T_META).upsert(
    { tenant_id: tenantId, estudante_id: estId, plano_id: row.id, meta_id: metaId, tempo_seg: novo, atualizado_em: new Date().toISOString() },
    { onConflict: 'plano_id,meta_id' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true, tempoSeg: novo }
}

/** Pausar / retomar. Ao retomar, redistribui o não-feito a partir de hoje (ancora). */
export async function pausarAdaptativo(svc: SupabaseClient, tenantId: string, estId: string, pausar: boolean, hoje: DataISO = dISO(new Date())): Promise<{ ok: boolean; error?: string }> {
  const row = await lerPlanoRow(svc, tenantId, estId)
  if (!row) return { ok: false, error: 'sem_plano' }
  if (pausar) {
    const { error } = await svc.from(T_PLANO).update({ pausa: { desde: hoje }, atualizado_em: new Date().toISOString() }).eq('id', row.id)
    return error ? { ok: false, error: error.message } : { ok: true }
  }
  // retomar: recalcula a partir de hoje preservando as metas feitas, limpa pausa
  const g = await gerarAdaptativo(svc, tenantId, estId, row.cfg, { ancora: hoje })
  if (!g.ok) return g
  const { error } = await svc.from(T_PLANO).update({ pausa: null, atualizado_em: new Date().toISOString() }).eq('id', row.id)
  return error ? { ok: false, error: error.message } : { ok: true }
}

// ── Ponte de persistência (iframe porte-fiel) ────────────────────────────────
// O modelo salva/carrega 3 "docs": estado / progresso / notas. A ponte troca o
// destino (localStorage/NUVEM) por estas funções. Formato IDÊNTICO ao modelo.

export interface DocsModelo {
  estado: { cfg: Cfg; plano: Plano; fim: number; revs: Record<number, Array<[string, DataISO]>>; pausa: { desde: DataISO } | null; exemplo: boolean; titulo?: string | null; extras?: unknown[] } | null
  progresso: { prog: Record<string, ProgMeta>; extras: unknown[] } | null
  notas: { notas: Record<string, { grau?: number; res?: number; err?: number; diff?: number }> } | null
}

/** Lê os 3 docs do modelo a partir das tabelas (ou nulls se não há plano). */
export async function carregarDocs(svc: SupabaseClient, tenantId: string, estId: string): Promise<DocsModelo & { extras: unknown[] }> {
  const row0 = await lerPlanoRow(svc, tenantId, estId)
  if (!row0) return { estado: null, progresso: null, notas: null, extras: [] }
  const row = await migrarPara28(svc, tenantId, row0)
  const { data: raw } = await svc.from(T_PLANO).select('extras').eq('id', row.id).maybeSingle()
  const extras = ((raw as { extras?: unknown[] } | null)?.extras) || []
  const metas = await lerMetas(svc, tenantId, row.id)
  const prog: Record<string, ProgMeta> = {}
  const notas: Record<string, { grau?: number; res?: number; err?: number; diff?: number }> = {}
  for (const m of metas) {
    const p: ProgMeta = {}
    if (m.estado) p.s = m.estado
    if (m.tempo_seg) p.t = m.tempo_seg
    if (m.parcial_v) p.parou = { v: m.parcial_v, em: (m.parcial_em || '') as DataISO }
    if (m.modo) p.modo = m.modo
    if (Object.keys(p).length) prog[m.meta_id] = p
    const n: { grau?: number; res?: number; err?: number; diff?: number } = {}
    if (m.grau != null) n.grau = m.grau
    if (m.res != null) n.res = m.res
    if (m.err != null) n.err = m.err
    if (m.estrelas != null) n.diff = m.estrelas
    if (Object.keys(n).length) notas[m.meta_id] = n
  }
  return {
    estado: { cfg: row.cfg, plano: row.plano || {}, fim: row.fim || 1, revs: row.revs || {}, pausa: row.pausa || null, exemplo: !!row.exemplo, titulo: row.titulo ?? null, extras },
    progresso: { prog, extras },
    notas: { notas },
    extras,
  }
}

/** Grava um doc do modelo. parte ∈ 'estado'|'progresso'|'notas'. */
export async function sincronizarDoc(svc: SupabaseClient, tenantId: string, estId: string, parte: string, doc: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  if (parte === 'estado') {
    const cfg = doc.cfg as Cfg
    if (!cfg || !cfg.start) return { ok: false, error: 'cfg_invalido' }
    // Nome dado na criação (iframe). Vazio => não sobrescreve o título existente num recálculo.
    const tituloDoc = typeof doc.titulo === 'string' ? doc.titulo.trim().slice(0, 80) : ''
    const campos = {
      cfg: cfg as unknown as Record<string, unknown>,
      plano: (doc.plano || {}) as Record<string, unknown>,
      fim: (doc.fim as number) || 1,
      revs: (doc.revs || {}) as Record<string, unknown>,
      pausa: (doc.pausa ?? null) as Record<string, unknown> | null,
      exemplo: !!doc.exemplo,
      atualizado_em: new Date().toISOString(),
    }
    // O iframe edita o plano em FOCO (fixado). Se ainda não há plano, cria já fixado.
    const alvo = await lerPlanoRow(svc, tenantId, estId)
    if (alvo) {
      const upd = tituloDoc ? { ...campos, titulo: tituloDoc } : campos
      const { error } = await svc.from(T_PLANO).update(upd).eq('id', alvo.id)
      return error ? { ok: false, error: error.message } : { ok: true }
    }
    await svc.from(T_PLANO).update({ fixado: false }).eq('tenant_id', tenantId).eq('estudante_id', estId).eq('fixado', true)
    const { error } = await svc.from(T_PLANO)
      .insert({ tenant_id: tenantId, estudante_id: estId, fixado: true, titulo: tituloDoc || 'Meu cronograma', ...campos })
    return error ? { ok: false, error: error.message } : { ok: true }
  }
  const row = await lerPlanoRow(svc, tenantId, estId)
  if (!row) return { ok: false, error: 'sem_plano' }
  if (parte === 'progresso') {
    const prog = (doc.prog || {}) as Record<string, ProgMeta>
    const entradas = Object.entries(prog)
    const temProg = (p: ProgMeta) => !!(p && (p.s || p.t || p.parou || p.modo))
    const rows = entradas.filter(([, p]) => temProg(p)).map(([meta_id, p]) => ({
      tenant_id: tenantId, estudante_id: estId, plano_id: row.id, meta_id,
      estado: p.s ?? null, tempo_seg: p.t || 0,
      parcial_v: p.parou?.v ?? null, parcial_em: p.parou?.em || null, modo: p.modo ?? null,
      atualizado_em: new Date().toISOString(),
    }))
    if (rows.length) { const { error } = await svc.from(T_META).upsert(rows, { onConflict: 'plano_id,meta_id' }); if (error) return { ok: false, error: error.message } }
    // Metas que o aluno DESMARCOU chegam como objeto vazio ({}) no doc. Sem zerar aqui, a coluna
    // `estado` ('done'/'missed') antiga permanecia no banco e a meta "voltava marcada" ao recarregar.
    // Zera SÓ as colunas de progresso — a MESMA linha guarda as notas (grau/estrelas/res/err), que ficam.
    const limpar = entradas.filter(([, p]) => !temProg(p)).map(([meta_id]) => meta_id)
    for (let k = 0; k < limpar.length; k += 150) {
      const { error } = await svc.from(T_META)
        .update({ estado: null, tempo_seg: 0, parcial_v: null, parcial_em: null, modo: null, atualizado_em: new Date().toISOString() })
        .eq('tenant_id', tenantId).eq('plano_id', row.id).in('meta_id', limpar.slice(k, k + 150))
      if (error) return { ok: false, error: error.message }
    }
    if (Array.isArray(doc.extras)) await svc.from(T_PLANO).update({ extras: doc.extras }).eq('id', row.id)
    return { ok: true }
  }
  if (parte === 'notas') {
    const notas = (doc.notas || {}) as Record<string, { grau?: number; res?: number; err?: number; diff?: number }>
    const rows = Object.entries(notas).filter(([, n]) => n && (n.grau != null || n.res != null || n.err != null || n.diff != null)).map(([meta_id, n]) => ({
      tenant_id: tenantId, estudante_id: estId, plano_id: row.id, meta_id,
      grau: n.grau ?? null, res: n.res ?? null, err: n.err ?? null, estrelas: n.diff ?? null,
      atualizado_em: new Date().toISOString(),
    }))
    if (rows.length) { const { error } = await svc.from(T_META).upsert(rows, { onConflict: 'plano_id,meta_id' }); if (error) return { ok: false, error: error.message } }
    return { ok: true }
  }
  return { ok: false, error: 'parte_desconhecida' }
}

/** Para o DOCX/relatório: devolve Estado + snapshot cru. */
export async function estadoParaRender(svc: SupabaseClient, tenantId: string, estId: string, hoje: DataISO = dISO(new Date())) {
  const row = await lerPlanoRow(svc, tenantId, estId)
  if (!row) return null
  const metas = await lerMetas(svc, tenantId, row.id)
  const est = montarEstado(row, metas)
  const conteudo = await carregarConteudo(svc, tenantId)
  return { estado: est, snapshot: construirSnapshot(est, conteudo, hoje), titulo: row.titulo }
}
