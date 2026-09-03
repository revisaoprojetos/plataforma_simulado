'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { remember, esquecer, chaveRelatorio } from '@/lib/cache/relatorio-cache'
import { unificarDisciplinas } from './disciplinas-actions'
import { CFG_TAX as CFG, type TipoTaxonomia, type ItemTax } from './taxonomia-tipos'

// As contagens varrem as questões — cacheia por (tenant, tipo) p/ não recomputar a cada troca de aba.
// Invalidado ao unificar. TTL curto; em dev sem Redis o fallback em memória limita a ~2 min.
const TTL_TAX = 300

// Unificação GENÉRICA de taxonomias (mescla duplicatas que poluem os filtros). Espelha a lógica de
// disciplinas-actions.ts, mas cobre todos os tipos. Dois formatos (ver taxonomia-tipos.ts):
//   • ENTIDADE (tabela própria + FK em simulado_questoes): disciplina, assunto, banca, órgão. Mesclar =
//     repontar a FK das questões para a canônica e apagar as linhas duplicadas.
//   • VALOR (coluna texto/número em simulado_questoes, sem tabela): cargo, assunto específico
//     (assunto_detalhe), ano. Mesclar = trocar o valor nas questões (não há linha p/ apagar).
// Disciplina é DELEGADA ao unificarDisciplinas (mantém a RPC atômica + "Desfazer"). Os demais tipos
// usam confirmação + auditoria (sem desfazer), conforme decidido.

async function acesso(acao: 'view' | 'update') {
  const a = await getCurrentAccess()
  const permitido = a.isAdmin || a.permissions.includes('*') || a.permissions.includes(`questoes:${acao}`)
  if (!a.tenantId || !permitido) return null
  return { tenantId: a.tenantId, userId: a.userId ?? null }
}

/** Itens da taxonomia + nº de questões (e, na disciplina, nº de assuntos). Alimenta a unificação.
 *  Resultado CACHEADO por (tenant, tipo) — evita revarrer as questões a cada troca de aba. */
export async function listarTaxonomia(tipo: TipoTaxonomia): Promise<{ ok: boolean; itens?: ItemTax[]; error?: string }> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  try {
    const itens = await remember(chaveRelatorio(g.tenantId, 'taxonomia', tipo), TTL_TAX, () => computarTaxonomia(tipo, g.tenantId))
    return { ok: true, itens }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Erro ao carregar.' }
  }
}

/** Computação pesada (varre as questões p/ contar). Roda só no cache-miss. */
async function computarTaxonomia(tipo: TipoTaxonomia, tenantId: string): Promise<ItemTax[]> {
  const cfg = CFG[tipo]
  const svc = createAdminClient()

  if (cfg.kind === 'entidade') {
    const { data: rows, error } = await svc.from(cfg.tabela).select('id, nome').eq('tenant_id', tenantId).order('nome')
    if (error) throw new Error(error.message)
    const qCount = new Map<string, number>()
    const qs = await fetchAll<any>(() => svc.from('simulado_questoes').select(cfg.fk).eq('tenant_id', tenantId).eq('deletado', false).not(cfg.fk, 'is', null))
    for (const r of qs) { const id = r[cfg.fk]; if (id) qCount.set(id, (qCount.get(id) ?? 0) + 1) }
    const extraCount = new Map<string, number>()
    if (cfg.extra) {
      const ex = await fetchAll<any>(() => svc.from(cfg.extra!.tabela).select(cfg.extra!.col).eq('tenant_id', tenantId).not(cfg.extra!.col, 'is', null))
      for (const r of ex) { const id = r[cfg.extra!.col]; if (id) extraCount.set(id, (extraCount.get(id) ?? 0) + 1) }
    }
    return (rows ?? []).map((d: any) => ({ id: d.id, nome: d.nome, questoes: qCount.get(d.id) ?? 0, extra: cfg.extra ? (extraCount.get(d.id) ?? 0) : undefined }))
  }

  // Valor: distinct dos valores da coluna (com contagem).
  const rows = await fetchAll<any>(() => svc.from('simulado_questoes').select(cfg.col).eq('tenant_id', tenantId).eq('deletado', false).not(cfg.col, 'is', null))
  const tally = new Map<string, number>()
  for (const r of rows) {
    const raw = r[cfg.col]
    if (raw === null || raw === undefined || raw === '') continue
    const val = String(raw).trim()
    if (!val) continue
    tally.set(val, (tally.get(val) ?? 0) + 1)
  }
  return [...tally.entries()]
    .map(([val, n]) => ({ id: val, nome: val, questoes: n }))
    .sort((a, b) => cfg.numerico ? Number(b.nome) - Number(a.nome) : a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Impacto exato (nº de questões) da unificação — para a confirmação no cliente. */
export async function previewUnificacaoTax(tipo: TipoTaxonomia, dups: string[]): Promise<{ ok: boolean; questoes?: number; error?: string }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const cfg = CFG[tipo]
  const d = [...new Set((dups ?? []).filter(Boolean))]
  if (!d.length) return { ok: true, questoes: 0 }
  const svc = createAdminClient()
  const col = cfg.kind === 'entidade' ? cfg.fk : cfg.col
  const vals: any[] = cfg.kind === 'valor' && cfg.numerico ? d.map(Number).filter((n) => Number.isFinite(n)) : d
  const { count } = await svc.from('simulado_questoes').select('*', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('deletado', false).in(col, vals)
  return { ok: true, questoes: count ?? 0 }
}

/**
 * Unifica os itens DUPLICADOS na CANÔNICA. Disciplina delega ao fluxo dedicado (RPC + desfazer). Os
 * demais tipos: entidade → repointa a FK das questões e apaga as linhas dup; valor → troca o valor nas
 * questões. Sempre valida o tenant e registra auditoria.
 */
export async function unificarTaxonomia(tipo: TipoTaxonomia, canonicaId: string, duplicadaIds: string[]): Promise<{ ok: boolean; error?: string; questoes?: number; removidas?: number; mantida?: string }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const invalidarCache = () => esquecer(chaveRelatorio(g.tenantId, 'taxonomia', tipo))

  // Disciplina mantém o fluxo dedicado (RPC atômica + "Desfazer"); só invalida o cache no fim.
  if (tipo === 'disciplina') {
    const r = await unificarDisciplinas(canonicaId, duplicadaIds)
    if (r.ok) await invalidarCache()
    return r
  }
  const cfg = CFG[tipo]
  const dups = [...new Set((duplicadaIds ?? []).filter((x) => x && x !== canonicaId))]
  if (!canonicaId || !dups.length) return { ok: false, error: 'Escolha o item a manter e ao menos um duplicado.' }
  const svc = createAdminClient()

  if (cfg.kind === 'entidade') {
    // Todos devem ser do tenant (defesa).
    const { data: donas } = await svc.from(cfg.tabela).select('id, nome').eq('tenant_id', g.tenantId).in('id', [canonicaId, ...dups])
    const validas = new Set((donas ?? []).map((x: any) => x.id))
    if (!validas.has(canonicaId) || dups.some((x) => !validas.has(x))) return { ok: false, error: 'Item inválido.' }

    const { count } = await svc.from('simulado_questoes').select('*', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('deletado', false).in(cfg.fk, dups)
    const up = await svc.from('simulado_questoes').update({ [cfg.fk]: canonicaId }).eq('tenant_id', g.tenantId).in(cfg.fk, dups)
    if (up.error) return { ok: false, error: up.error.message }
    const del = await svc.from(cfg.tabela).delete().eq('tenant_id', g.tenantId).in('id', dups)
    if (del.error) return { ok: false, error: del.error.message }
    const mantida = (donas ?? []).find((x: any) => x.id === canonicaId)?.nome as string | undefined
    await registrarAudit({ operacao: 'UPDATE', entidade: cfg.tabela, entidadeId: canonicaId, depois: { unificou: dups.length, questoes: count ?? 0, mantida } })
    await invalidarCache()
    revalidatePath('/admin/questoes')
    return { ok: true, questoes: count ?? 0, removidas: dups.length, mantida }
  }

  // Valor (texto/número): troca o valor nas questões (o "id" é o próprio valor).
  const canonVal: any = cfg.numerico ? Number(canonicaId) : canonicaId
  const dupVals: any[] = cfg.numerico ? dups.map(Number).filter((n) => Number.isFinite(n)) : dups
  if (cfg.numerico && !Number.isFinite(canonVal)) return { ok: false, error: 'Valor inválido.' }
  const { count } = await svc.from('simulado_questoes').select('*', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('deletado', false).in(cfg.col, dupVals)
  const up = await svc.from('simulado_questoes').update({ [cfg.col]: canonVal }).eq('tenant_id', g.tenantId).in(cfg.col, dupVals)
  if (up.error) return { ok: false, error: up.error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_questoes', entidadeId: String(canonVal), depois: { campo: cfg.col, unificou: dups.length, questoes: count ?? 0, mantida: canonicaId } })
  await invalidarCache()
  revalidatePath('/admin/questoes')
  return { ok: true, questoes: count ?? 0, removidas: dups.length, mantida: canonicaId }
}
