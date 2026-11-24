import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { registrarAudit } from '@/lib/audit'
import type { ContextoFluxo, DadosConstrutor, FluxoAdaptador, VersaoOverlay } from './adaptador'
import { hashOverlay, normalizarOverlay, overlayVazio, type OverlayFluxo } from './overlay'

/**
 * PERSISTÊNCIA DO OVERLAY DO FLUXO por tenant + adaptador (tabelas `simulado_fluxo_overlays` + `simulado_fluxo_overlay_versoes`, migração
 * 20261130000000). Versão otimista (como `config-regras.ts`), auditoria, hash, histórico das últimas 30 versões e restauração.
 * TOLERANTE À AUSÊNCIA DA TABELA: leitura devolve overlay vazio (`tabelaOk=false`) — o fluxo base segue funcionando e o motor roda sem regras do usuário.
 */
export const MAX_VERSOES_OVERLAY = 30
const kReg = (t: string, a: string) => `fluxo-overlay:${t}:${a}`

export interface RegistroOverlay { versao: number; overlay: OverlayFluxo; hash: string; motivo: string | null; atualizadoEm: string | null; atualizadoPor: string | null; tabelaOk: boolean }
const vazio = (tabelaOk: boolean): RegistroOverlay => ({ versao: 0, overlay: overlayVazio(), hash: hashOverlay(overlayVazio()), motivo: null, atualizadoEm: null, atualizadoPor: null, tabelaOk })
const tabelaAusente = (e: { code?: string; message?: string } | null | undefined): boolean => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache|could not find the table/i.test(e.message ?? ''))

/** Lê o overlay (cache 30 s; `salvarOverlay` invalida). Qualquer falha → overlay vazio. */
export async function lerRegistroOverlay(svc: SupabaseClient, tenantId: string, adaptadorId: string): Promise<RegistroOverlay> {
  return remember<RegistroOverlay>(kReg(tenantId, adaptadorId), 30, async () => {
    try {
      const { data, error } = await svc.from('simulado_fluxo_overlays').select('versao, overlay, hash, motivo, atualizado_em, atualizado_por').eq('tenant_id', tenantId).eq('adaptador', adaptadorId).maybeSingle()
      if (error) return vazio(!tabelaAusente(error))
      if (!data) return vazio(true)
      const r = data as { versao: number; overlay: unknown; hash: string | null; motivo: string | null; atualizado_em: string | null; atualizado_por: string | null }
      const overlay = normalizarOverlay(r.overlay)
      return { versao: Math.max(0, Math.trunc(Number(r.versao) || 0)), overlay, hash: hashOverlay(overlay), motivo: r.motivo, atualizadoEm: r.atualizado_em, atualizadoPor: r.atualizado_por, tabelaOk: true }
    } catch { return vazio(false) }
  })
}

export type ResultadoSalvarOverlay = { ok: true; versao: number; hash: string } | { ok: false; error: string; conflito?: boolean; tabelaAusente?: boolean }
const MSG_CONFLITO = 'O fluxo foi alterado por outra pessoa. Recarregue a página e refaça a alteração.'

/** Grava o overlay com checagem otimista (`versaoEsperada` = versão que o editor viu) e guarda o snapshot no histórico. O chamador já validou/normalizou. */
export async function salvarOverlay(svc: SupabaseClient, tenantId: string, adaptadorId: string, overlayBruto: unknown, versaoEsperada: number, atorId: string | null, motivo?: string | null): Promise<ResultadoSalvarOverlay> {
  const { data: atualRow, error: e1 } = await svc.from('simulado_fluxo_overlays').select('versao, hash').eq('tenant_id', tenantId).eq('adaptador', adaptadorId).maybeSingle()
  if (e1) return tabelaAusente(e1) ? { ok: false, error: 'A migração do construtor de fluxo ainda não foi aplicada.', tabelaAusente: true } : { ok: false, error: e1.message }
  const atual = Math.max(0, Math.trunc(Number((atualRow as { versao?: number } | null)?.versao) || 0))
  if (atual !== versaoEsperada) return { ok: false, error: MSG_CONFLITO, conflito: true }
  const overlay = normalizarOverlay(overlayBruto), hash = hashOverlay(overlay), versao = atual + 1, agora = new Date().toISOString()
  const linha = { tenant_id: tenantId, adaptador: adaptadorId, versao, overlay, hash, motivo: motivo?.slice(0, 300) || null, atualizado_em: agora, atualizado_por: atorId }
  if (atual === 0) {
    const { error } = await svc.from('simulado_fluxo_overlays').insert(linha)
    if (error) return error.code === '23505' ? { ok: false, error: MSG_CONFLITO, conflito: true } : { ok: false, error: error.message }
  } else {
    const { data: upd, error } = await svc.from('simulado_fluxo_overlays').update({ versao, overlay, hash, motivo: linha.motivo, atualizado_em: agora, atualizado_por: atorId }).eq('tenant_id', tenantId).eq('adaptador', adaptadorId).eq('versao', atual).select('versao')
    if (error) return { ok: false, error: error.message }
    if (!upd || upd.length === 0) return { ok: false, error: MSG_CONFLITO, conflito: true }
  }
  await svc.from('simulado_fluxo_overlay_versoes').insert({ tenant_id: tenantId, adaptador: adaptadorId, versao, overlay, hash, motivo: linha.motivo, criado_em: agora, criado_por: atorId }).then(() => null, () => null)
  await svc.from('simulado_fluxo_overlay_versoes').delete().eq('tenant_id', tenantId).eq('adaptador', adaptadorId).lte('versao', versao - MAX_VERSOES_OVERLAY).then(() => null, () => null)
  await esquecer(kReg(tenantId, adaptadorId)).catch(() => {})
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_fluxo_overlay', entidadeId: `${tenantId}:${adaptadorId}`, tenantId, atorId,
    antes: { versao: atual, hash: (atualRow as { hash?: string } | null)?.hash ?? null }, depois: { versao, hash, motivo: linha.motivo, adaptador: adaptadorId, nos: overlay.nos.length, arestas: overlay.arestas.length, diagramas: overlay.diagramas.length },
  }).catch(() => {})
  return { ok: true, versao, hash }
}

export async function listarVersoesOverlay(svc: SupabaseClient, tenantId: string, adaptadorId: string): Promise<VersaoOverlay[]> {
  try {
    const { data } = await svc.from('simulado_fluxo_overlay_versoes').select('versao, hash, motivo, criado_em, criado_por').eq('tenant_id', tenantId).eq('adaptador', adaptadorId).order('versao', { ascending: false }).limit(MAX_VERSOES_OVERLAY)
    return ((data ?? []) as Array<{ versao: number; hash: string; motivo: string | null; criado_em: string | null; criado_por: string | null }>).map((r) => ({ versao: r.versao, hash: r.hash, motivo: r.motivo, atualizadoEm: r.criado_em, atualizadoPor: r.criado_por }))
  } catch { return [] }
}

export async function obterVersaoOverlay(svc: SupabaseClient, tenantId: string, adaptadorId: string, versao: number): Promise<OverlayFluxo | null> {
  try {
    const { data } = await svc.from('simulado_fluxo_overlay_versoes').select('overlay').eq('tenant_id', tenantId).eq('adaptador', adaptadorId).eq('versao', Math.trunc(versao)).maybeSingle()
    return data ? normalizarOverlay((data as { overlay: unknown }).overlay) : null
  } catch { return null }
}

/** Monta `DadosFluxo.construtor` (genérico) para um adaptador que declara `construtor`. */
export async function carregarDadosConstrutor(svc: SupabaseClient, ctx: ContextoFluxo, ad: FluxoAdaptador): Promise<DadosConstrutor | undefined> {
  const c = ad.construtor
  if (!c) return undefined
  const [reg, historico] = await Promise.all([lerRegistroOverlay(svc, ctx.tenantId, ad.id), listarVersoesOverlay(svc, ctx.tenantId, ad.id)])
  const overlay = normalizarOverlay(reg.overlay, c.tiposNo)
  return { habilitado: ctx.podeEditar && reg.tabelaOk, executavel: c.executavel, tiposNo: c.tiposNo, overlay, versao: reg.versao, hash: reg.hash, historico, tabelaOk: reg.tabelaOk, catalogo: c.catalogo ?? null, escopo: c.escopo }
}
