import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { sqlQuery } from '@/lib/data/sql'
import { registrarAudit } from '@/lib/audit'
import { invalidarCachesPaginas } from './paginas-sync'
import {
  resolverFaixa, resolverPartes, validarPartes, medirParte, rotuloDoTrecho,
  type TrechoParte, type ResolucaoFaixa, type MedidaParte, type ErroParte,
} from './partes'

// PARTES de documento (Fase 4) — camada server. Tolerante a tabela ausente (migração 16 pendente), isolada por tenant
// (service role + .eq('tenant_id')), nunca apaga (arquivar), audita e invalida os caches do tenant.

const T_PARTES = 'simulado_conteudo_partes'
const T_SELECAO = 'simulado_conteudo_selecao_meta'
const T_DOC = 'simulado_conteudo_documentos'
const T_TR = 'simulado_conteudo_trechos'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CHUNK = 80
const MSG_AUSENTE = 'Recurso de partes ainda não disponível (migração pendente).'

type Svc = ReturnType<typeof createAdminClient>
const tabelaAusente = (e?: { code?: string; message?: string } | null) => !!e && /42P01|PGRST205|does not exist|schema cache/i.test(`${e.code ?? ''} ${e.message ?? ''}`)

export interface ParteRow {
  id: string; tenant_id: string; documento_id: string; nome: string; ordem: number
  trecho_ini_uid: string; trecho_fim_uid: string; rotulo_ini: string | null; rotulo_fim: string | null
  arquivada: boolean; criado_por: string | null; criado_em: string; atualizado_em: string
}
const COLS = 'id, tenant_id, documento_id, nome, ordem, trecho_ini_uid, trecho_fim_uid, rotulo_ini, rotulo_fim, arquivada, criado_por, criado_em, atualizado_em'

export type ParteComStatus = ParteRow & {
  /** metas (selecao_meta.parte_id) que usam a parte → aviso "em uso". */
  metasEmUso: number
  resolucao: { ok: boolean; motivo: ResolucaoFaixa['motivo']; indices: [number, number] | null; recuperadoPorRotulo: { ini: boolean; fim: boolean } } | null
  medida: MedidaParte | null
}

export type Falha = { ok: false; error: string; codigo: 'tabela_ausente' | 'nao_encontrado' | 'invalido' | 'conflito' | 'erro'; erros?: ErroParte[] }
export const MSG_PARTES_AUSENTE = MSG_AUSENTE

// ── Trechos da versão atual ─────────────────────────────────────────────────────────────────────────────────────────

export async function carregarTrechosVersaoAtual(
  svc: Svc, tenantId: string, documentoId: string,
): Promise<{ titulo: string; versaoId: string; trechos: TrechoParte[] } | null> {
  const { data: doc } = await (svc as any).from(T_DOC).select('id, titulo, versao_atual_id, deletado').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
  if (!doc || doc.deletado || !doc.versao_atual_id) return null
  const trechos: TrechoParte[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await (svc as any).from(T_TR).select('uid, tipo, rotulo, texto').eq('versao_id', doc.versao_atual_id)
      .order('ordem', { ascending: true }).range(off, off + 999)
    if (error || !data) break
    trechos.push(...(data as TrechoParte[]))
    if (data.length < 1000) break
  }
  return { titulo: String(doc.titulo ?? ''), versaoId: String(doc.versao_atual_id), trechos }
}

// ── Contagem de uso ─────────────────────────────────────────────────────────────────────────────────────────────────

/** parte_id → nº de metas que a usam. Tabela ausente = vazio. Falha de leitura propaga (aviso "em uso" não pode mentir). */
export async function contarMetasPorParte(svc: Svc, tenantId: string, parteIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(parteIds.filter((x) => UUID.test(x)))]
  const out = new Map<string, number>()
  if (!ids.length) return out
  const rows = await sqlQuery<{ id: string; n: number }>(
    `SELECT parte_id::text AS id, count(*)::int AS n FROM ${T_SELECAO} WHERE tenant_id = $1 AND parte_id = ANY($2::uuid[]) GROUP BY 1`, [tenantId, ids])
  if (rows) { for (const r of rows) out.set(r.id, Number(r.n)); return out }
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await (svc as any).from(T_SELECAO).select('parte_id').eq('tenant_id', tenantId).in('parte_id', ids.slice(i, i + CHUNK)).limit(10000)
    if (error) { if (tabelaAusente(error)) return out; throw new Error(error.message) }
    for (const r of (data ?? []) as { parte_id: string }[]) out.set(r.parte_id, (out.get(r.parte_id) ?? 0) + 1)
  }
  return out
}

// ── Leitura ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function listarPartes(
  tenantId: string, documentoId: string, opc: { incluirArquivadas?: boolean; comStatus?: boolean } = {},
): Promise<{ ok: true; partes: ParteComStatus[]; versaoId: string | null; totalTrechos: number } | Falha> {
  if (!UUID.test(documentoId)) return { ok: false, error: 'Documento inválido.', codigo: 'invalido' }
  const svc = createAdminClient()
  let q = (svc as any).from(T_PARTES).select(COLS).eq('tenant_id', tenantId).eq('documento_id', documentoId)
  if (!opc.incluirArquivadas) q = q.eq('arquivada', false)
  const { data, error } = await q.order('ordem', { ascending: true }).order('id', { ascending: true }).limit(1000)
  if (error) return tabelaAusente(error) ? { ok: false, error: MSG_AUSENTE, codigo: 'tabela_ausente' } : { ok: false, error: error.message, codigo: 'erro' }
  const rows = (data ?? []) as ParteRow[]

  let usos = new Map<string, number>()
  try { usos = await contarMetasPorParte(svc, tenantId, rows.map((r) => r.id)) } catch (e) { return { ok: false, error: (e as Error).message, codigo: 'erro' } }

  let ctx: Awaited<ReturnType<typeof carregarTrechosVersaoAtual>> = null
  if (opc.comStatus !== false && rows.length) ctx = await carregarTrechosVersaoAtual(svc, tenantId, documentoId)
  const res = ctx ? resolverPartes(ctx.trechos, rows.map((r) => ({ iniUid: r.trecho_ini_uid, fimUid: r.trecho_fim_uid, rotuloIni: r.rotulo_ini, rotuloFim: r.rotulo_fim }))) : null

  const partes = rows.map((r, i): ParteComStatus => ({
    ...r,
    metasEmUso: usos.get(r.id) ?? 0,
    resolucao: res ? { ok: res[i].resolucao.ok, motivo: res[i].resolucao.motivo, indices: res[i].resolucao.indices, recuperadoPorRotulo: res[i].resolucao.recuperadoPorRotulo } : null,
    medida: res ? res[i].medida : null,
  }))
  return { ok: true, partes, versaoId: ctx?.versaoId ?? null, totalTrechos: ctx?.trechos.length ?? 0 }
}

// ── Escrita ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface EntradaParte {
  nome: string; iniUid: string; fimUid: string
  rotuloIni?: string | null; rotuloFim?: string | null; ordem?: number
}

/** Valida a faixa contra a versão atual + as demais partes ATIVAS do documento. */
async function validarContraDocumento(
  svc: Svc, tenantId: string, documentoId: string,
  alvo: { id?: string; nome: string; iniUid: string; fimUid: string; rotuloIni?: string | null; rotuloFim?: string | null; arquivada: boolean },
): Promise<{ ok: true; iniUid: string; fimUid: string; rotuloIni: string | null; rotuloFim: string | null } | Falha> {
  const ctx = await carregarTrechosVersaoAtual(svc, tenantId, documentoId)
  if (!ctx) return { ok: false, error: 'Documento não encontrado, excluído ou sem versão atual.', codigo: 'nao_encontrado' }
  if (!ctx.trechos.length) return { ok: false, error: 'O documento não tem trechos (ex.: PDF) — não é possível definir partes por faixa.', codigo: 'invalido' }
  const r = resolverFaixa(ctx.trechos, alvo)
  if (!r.ok || !r.indices || !r.ini || !r.fim) return { ok: false, error: `Faixa não resolvida na versão atual (${r.motivo}).`, codigo: 'invalido' }

  const { data, error } = await (svc as any).from(T_PARTES).select(COLS).eq('tenant_id', tenantId).eq('documento_id', documentoId).eq('arquivada', false).limit(1000)
  if (error) return tabelaAusente(error) ? { ok: false, error: MSG_AUSENTE, codigo: 'tabela_ausente' } : { ok: false, error: error.message, codigo: 'erro' }
  const outras = ((data ?? []) as ParteRow[]).filter((p) => p.id !== alvo.id)
  const resOutras = resolverPartes(ctx.trechos, outras.map((p) => ({ ...p, iniUid: p.trecho_ini_uid, fimUid: p.trecho_fim_uid, rotuloIni: p.rotulo_ini, rotuloFim: p.rotulo_fim })))
  const lista = [
    ...resOutras.filter((x) => x.resolucao.indices).map((x) => ({ id: x.parte.id, nome: x.parte.nome, ini: x.resolucao.indices![0], fim: x.resolucao.indices![1] })),
    { id: alvo.id, nome: alvo.nome, ini: r.indices[0], fim: r.indices[1], arquivada: alvo.arquivada },
  ]
  const v = validarPartes(lista)
  if (!v.ok) return { ok: false, error: v.erros.map((e) => e.mensagem).join(' '), codigo: 'conflito', erros: v.erros }
  return { ok: true, iniUid: r.ini.uid, fimUid: r.fim.uid, rotuloIni: alvo.rotuloIni ?? rotuloDoTrecho(r.ini), rotuloFim: alvo.rotuloFim ?? rotuloDoTrecho(r.fim) }
}

/** Invalida os caches do tenant que embutem conteúdo/partes (cronograma). Best-effort. */
export async function invalidarPartesCache(tenantId: string): Promise<void> {
  await invalidarCachesPaginas(tenantId).catch(() => {})
}

export async function criarParte(tenantId: string, atorId: string | null, documentoId: string, e: EntradaParte): Promise<{ ok: true; parte: ParteRow } | Falha> {
  if (!UUID.test(documentoId)) return { ok: false, error: 'Documento inválido.', codigo: 'invalido' }
  const nome = (e.nome ?? '').trim()
  if (!nome || !e.iniUid || !e.fimUid) return { ok: false, error: 'Informe nome, trecho inicial e trecho final.', codigo: 'invalido' }
  const svc = createAdminClient()
  const v = await validarContraDocumento(svc, tenantId, documentoId, { nome, iniUid: e.iniUid, fimUid: e.fimUid, rotuloIni: e.rotuloIni, rotuloFim: e.rotuloFim, arquivada: false })
  if (!v.ok) return v
  let ordem = e.ordem
  if (!Number.isInteger(ordem)) {
    const { data } = await (svc as any).from(T_PARTES).select('ordem').eq('tenant_id', tenantId).eq('documento_id', documentoId).order('ordem', { ascending: false }).limit(1)
    ordem = ((data?.[0]?.ordem as number | undefined) ?? -1) + 1
  }
  const { data, error } = await (svc as any).from(T_PARTES).insert({
    tenant_id: tenantId, documento_id: documentoId, nome, ordem, trecho_ini_uid: v.iniUid, trecho_fim_uid: v.fimUid,
    rotulo_ini: v.rotuloIni, rotulo_fim: v.rotuloFim, criado_por: atorId,
  }).select(COLS).single()
  if (error) {
    if (tabelaAusente(error)) return { ok: false, error: MSG_AUSENTE, codigo: 'tabela_ausente' }
    if ((error as any).code === '23505') return { ok: false, error: `Já existe uma parte ativa chamada “${nome}”.`, codigo: 'conflito' }
    return { ok: false, error: error.message, codigo: 'erro' }
  }
  await registrarAudit({ operacao: 'INSERT', entidade: T_PARTES, entidadeId: data.id, tenantId, atorId, depois: { documento_id: documentoId, nome, ini: v.iniUid, fim: v.fimUid, rotulo_ini: v.rotuloIni, rotulo_fim: v.rotuloFim } }).catch(() => {})
  await invalidarPartesCache(tenantId)
  return { ok: true, parte: data as ParteRow }
}

export interface PatchParte {
  nome?: string; ordem?: number; iniUid?: string; fimUid?: string; rotuloIni?: string | null; rotuloFim?: string | null
  /** false = restaurar uma parte arquivada (revalida a faixa e o nome). */
  arquivada?: boolean
}

export async function atualizarParte(tenantId: string, atorId: string | null, id: string, p: PatchParte): Promise<{ ok: true; parte: ParteRow; metasEmUso: number } | Falha> {
  if (!UUID.test(id)) return { ok: false, error: 'Parte inválida.', codigo: 'invalido' }
  const svc = createAdminClient()
  const { data: atual, error: e0 } = await (svc as any).from(T_PARTES).select(COLS).eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  if (e0) return tabelaAusente(e0) ? { ok: false, error: MSG_AUSENTE, codigo: 'tabela_ausente' } : { ok: false, error: e0.message, codigo: 'erro' }
  if (!atual) return { ok: false, error: 'Parte não encontrada.', codigo: 'nao_encontrado' }
  const a = atual as ParteRow

  const nome = p.nome !== undefined ? p.nome.trim() : a.nome
  const arquivada = p.arquivada ?? a.arquivada
  const mudouFaixa = p.iniUid !== undefined || p.fimUid !== undefined || p.rotuloIni !== undefined || p.rotuloFim !== undefined
  const upd: Record<string, unknown> = {}
  if (p.ordem !== undefined) { if (!Number.isInteger(p.ordem)) return { ok: false, error: 'Ordem inválida.', codigo: 'invalido' }; upd.ordem = p.ordem }
  if (p.arquivada !== undefined) upd.arquivada = arquivada
  if (!nome) return { ok: false, error: 'O nome não pode ser vazio.', codigo: 'invalido' }
  if (nome !== a.nome) upd.nome = nome

  // Reavalia faixa/nome quando algo que afeta a validade mudou (e sempre ao restaurar).
  if (!arquivada && (mudouFaixa || nome !== a.nome || a.arquivada)) {
    const v = await validarContraDocumento(svc, tenantId, a.documento_id, {
      id, nome, arquivada: false,
      iniUid: p.iniUid ?? a.trecho_ini_uid, fimUid: p.fimUid ?? a.trecho_fim_uid,
      rotuloIni: p.rotuloIni !== undefined ? p.rotuloIni : a.rotulo_ini, rotuloFim: p.rotuloFim !== undefined ? p.rotuloFim : a.rotulo_fim,
    })
    if (!v.ok) return v
    upd.trecho_ini_uid = v.iniUid; upd.trecho_fim_uid = v.fimUid; upd.rotulo_ini = v.rotuloIni; upd.rotulo_fim = v.rotuloFim
  }
  if (!Object.keys(upd).length) return { ok: true, parte: a, metasEmUso: 0 }

  const { data, error } = await (svc as any).from(T_PARTES).update(upd).eq('tenant_id', tenantId).eq('id', id).select(COLS).single()
  if (error) {
    if ((error as any).code === '23505') return { ok: false, error: `Já existe uma parte ativa chamada “${nome}”.`, codigo: 'conflito' }
    return { ok: false, error: error.message, codigo: 'erro' }
  }
  let metasEmUso = 0
  try { metasEmUso = (await contarMetasPorParte(svc, tenantId, [id])).get(id) ?? 0 } catch { /* aviso best-effort */ }
  await registrarAudit({ operacao: 'UPDATE', entidade: T_PARTES, entidadeId: id, tenantId, atorId, antes: pick(a), depois: pick(data as ParteRow) }).catch(() => {})
  await invalidarPartesCache(tenantId)
  return { ok: true, parte: data as ParteRow, metasEmUso }
}

/** DELETE da API = ARQUIVAR (nunca apaga: FK RESTRICT das seleções e histórico). Devolve quantas metas ainda a usam. */
export async function arquivarParte(tenantId: string, atorId: string | null, id: string): Promise<{ ok: true; parte: ParteRow; metasEmUso: number } | Falha> {
  return atualizarParte(tenantId, atorId, id, { arquivada: true })
}

const pick = (r: ParteRow) => ({ nome: r.nome, ordem: r.ordem, ini: r.trecho_ini_uid, fim: r.trecho_fim_uid, rotulo_ini: r.rotulo_ini, rotulo_fim: r.rotulo_fim, arquivada: r.arquivada })

export { medirParte }
