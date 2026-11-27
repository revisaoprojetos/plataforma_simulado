'use server'

// TRANSFERIR METAS de um documento ORIGEM para um DESTINO da Biblioteca (com ou sem arquivar a origem).
// Fonte da verdade e estratégia: ver migração 20261210000000 (assinatura cfg.chavesAS dos planos ativos + remap por chave).
// Gravação = RPC transacional `transferir_metas_documento` (service_role). Leitura/prévia = SQL direto agregado (sem N+1).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { sqlQuery } from '@/lib/data/sql'
import { esquecer } from '@/lib/cache/relatorio-cache'
import { dependenciasDocumentos, resumoDependencias } from '@/lib/conteudo/dependencias-documento'
import { invalidarCachesPaginas } from '@/lib/conteudo/paginas-sync'
import { conteudoBancoCache } from '@/lib/cronograma/adaptativo/conteudo-cache'
import { sincronizarMetaDef, chaveResumoMetaDef } from '@/lib/cronograma/adaptativo/meta-def'
import {
  avaliarTransferencia, nadaATransferir, mensagemTransferida, CONTAGENS_VAZIAS,
  type ContagensTransferencia, type DocResumo,
} from '@/lib/conteudo/transferir-metas-pura'
import { arquivarConteudo } from './gestao-actions'
import type { LadoTransferencia, OpcoesTransferencia, PreviaTransferencia, ResultadoTransferencia } from './transferir-metas-tipos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const T_PLANO = 'simulado_cronograma_adaptativo_plano'
const T_PM = 'simulado_cronograma_adaptativo_plano_meta'
const TIPOS_AULA = `('pf','pp','fl','qu','rf','rq')`

async function guard() {
  if (!(await checkPermission('configuracoes:update'))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

type Svc = ReturnType<typeof createAdminClient>

async function carregarDoc(svc: Svc, tenantId: string, id: string): Promise<DocResumo | null> {
  const { data } = await (svc as any).from('simulado_conteudo_documentos').select('id, titulo, status, deletado, tipo_origem').eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  if (!data) return null
  const d = data as { id: string; titulo: string; status: string | null; deletado: boolean | null; tipo_origem: string | null }
  return { id: d.id, titulo: d.titulo, status: d.status, deletado: !!d.deletado, tipo: d.tipo_origem, emAulas: null }
}

/** Contagens agregadas (SQL direto, só leitura). `null` = SQL indisponível → falha fechada no chamador. */
async function contar(tenantId: string, origem: string, destino: string | null): Promise<{ c: ContagensTransferencia; destino: { planos: number; defs: number; metaConteudo: number } } | null> {
  const o = `d:${origem.toLowerCase()}`, d = destino ? `d:${destino.toLowerCase()}` : 'd:-'
  const planos = await sqlQuery<{ transf: number; conflito: number; orfas: number; dest: number }>(
    `SELECT count(*) FILTER (WHERE tem_o AND NOT tem_d)::int AS transf, count(*) FILTER (WHERE tem_o AND tem_d)::int AS conflito,
            count(*) FILTER (WHERE orfa_o)::int AS orfas, count(*) FILTER (WHERE tem_d)::int AS dest
       FROM (SELECT (cfg->'chavesAS' @> jsonb_build_array($2::text)) AS tem_o, (cfg->'chavesAS' @> jsonb_build_array($3::text)) AS tem_d,
                    coalesce((cfg->'orfas') ? $2::text, false) AS orfa_o
               FROM ${T_PLANO} WHERE tenant_id = $1 AND arquivada = false AND exemplo = false AND jsonb_typeof(cfg->'chavesAS') = 'array') x`, [tenantId, o, d])
  const metas = await sqlQuery<{ transf: number; concl: number; derivadas: number; legados: number }>(
    `SELECT count(*) FILTER (WHERE pm.tipo IN ${TIPOS_AULA} AND (p.cfg->'chavesAS' @> jsonb_build_array($2::text)) AND NOT (p.cfg->'chavesAS' @> jsonb_build_array($3::text)))::int AS transf,
            count(*) FILTER (WHERE pm.tipo IN ${TIPOS_AULA} AND (p.cfg->'chavesAS' @> jsonb_build_array($2::text)) AND NOT (p.cfg->'chavesAS' @> jsonb_build_array($3::text)) AND m.estado = 'done')::int AS concl,
            count(*) FILTER (WHERE pm.tipo NOT IN ${TIPOS_AULA})::int AS derivadas,
            count(DISTINCT p.id) FILTER (WHERE jsonb_typeof(p.cfg->'chavesAS') IS DISTINCT FROM 'array')::int AS legados
       FROM ${T_PM} pm JOIN ${T_PLANO} p ON p.id = pm.plano_id AND p.arquivada = false AND p.exemplo = false
       LEFT JOIN simulado_cronograma_adaptativo_meta m ON m.plano_id = pm.plano_id AND m.meta_id = pm.meta_id
      WHERE pm.tenant_id = $1 AND pm.documento_id = $4::uuid`, [tenantId, o, d, origem])
  if (!planos || !metas) return null
  // tabelas opcionais (migração pendente → erro → null → 0)
  const mc = async (id: string | null) => id ? Number((await sqlQuery<{ n: number }>(`SELECT count(*)::int AS n FROM simulado_cronograma_meta_conteudo WHERE tenant_id = $1 AND documento_id = $2::uuid`, [tenantId, id]))?.[0]?.n ?? 0) : 0
  const defs = async (id: string | null) => id ? Number((await sqlQuery<{ n: number }>(`SELECT count(*)::int AS n FROM simulado_cronograma_adaptativo_meta_def WHERE tenant_id = $1 AND ativa = true AND documento_id = $2::uuid`, [tenantId, id]))?.[0]?.n ?? 0) : 0
  const lp = (await sqlQuery<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${T_PLANO} p WHERE p.tenant_id = $1 AND p.arquivada = false AND p.exemplo = false AND jsonb_typeof(p.cfg->'lpLegado') = 'object'
        AND EXISTS (SELECT 1 FROM jsonb_each(p.cfg->'lpLegado') e WHERE e.value->>'doc' = $2::text)`, [tenantId, origem]))?.[0]?.n ?? 0
  const [mcO, mcD, dfO, dfD] = await Promise.all([mc(origem), mc(destino), defs(origem), defs(destino)])
  const p = planos[0] ?? { transf: 0, conflito: 0, orfas: 0, dest: 0 }, m = metas[0] ?? { transf: 0, concl: 0, derivadas: 0, legados: 0 }
  return {
    c: { ...CONTAGENS_VAZIAS, planosTransferiveis: Number(p.transf), planosConflito: Number(p.conflito), planosOrfas: Number(p.orfas), metasTransferiveis: Number(m.transf), metasConcluidas: Number(m.concl), metasDerivadas: Number(m.derivadas), planosLegados: Number(m.legados), metaConteudo: mcO, planosLpLegado: Number(lp), defsAtivas: dfO },
    destino: { planos: Number(p.dest), defs: dfD, metaConteudo: mcD },
  }
}

async function lado(svc: Svc, tenantId: string, doc: DocResumo, conteudoIds: Set<string> | null): Promise<LadoTransferencia> {
  const dep = (await dependenciasDocumentos(svc, tenantId, [doc.id])).get(doc.id)
  return {
    ...doc, emAulas: conteudoIds ? conteudoIds.has(doc.id) : null,
    resumo: dep ? resumoDependencias(dep) : '', planosAtivos: dep?.planosAtivos ?? 0, porTipo: { ...(dep?.porTipo ?? {}) } as Record<string, number>,
  }
}

/** Prévia (só leitura): o que a ORIGEM tem, o que o DESTINO já tem e quanto será transferido. `destinoId` opcional (antes de escolher o destino). */
export async function previaTransferenciaMetas(origemId: string, destinoId?: string | null): Promise<PreviaTransferencia> {
  const g = await guard(); if (!g.ok) return g
  if (!UUID.test(origemId ?? '')) return { ok: false, error: 'Documento de origem inválido.' }
  if (destinoId && !UUID.test(destinoId)) return { ok: false, error: 'Documento de destino inválido.' }
  try {
    const svc = createAdminClient()
    const [o, d] = await Promise.all([carregarDoc(svc, g.tenantId, origemId), destinoId ? carregarDoc(svc, g.tenantId, destinoId) : Promise.resolve(null)])
    if (!o) return { ok: false, error: 'Documento de origem não encontrado.' }
    if (destinoId && !d) return { ok: false, error: 'Documento de destino não encontrado neste tenant.' }
    const cont = await contar(g.tenantId, origemId, destinoId ?? null)
    if (!cont) return { ok: false, error: 'Não foi possível verificar os planos agora (SQL direto indisponível). Nada foi alterado.' }
    let ids: Set<string> | null = null
    try { const c = await conteudoBancoCache(svc as any, g.tenantId); ids = new Set((c.AS ?? []).map((a) => String((a as unknown as unknown[])[6] ?? '')).filter(Boolean)) } catch { ids = null }
    const [lo, ld] = await Promise.all([lado(svc, g.tenantId, o, ids), d ? lado(svc, g.tenantId, d, ids) : Promise.resolve(null)])
    const { bloqueios, avisos } = avaliarTransferencia(lo, ld, cont.c)
    return { ok: true, origem: lo, destino: ld, contagens: cont.c, destinoContagens: cont.destino, bloqueios, avisos }
  } catch (e: any) { return { ok: false, error: e?.message || 'Não foi possível montar a prévia.' } }
}

async function esquecerCaches(tenantId: string) {
  await Promise.all([
    invalidarCachesPaginas(tenantId),
    esquecer(`crono-adapt:docs-em-uso:${tenantId}`), esquecer(`crono-adapt:plano-meta-conteudo:${tenantId}`),
    esquecer(`crono-metas:planospasta:${tenantId}`), esquecer(chaveResumoMetaDef(tenantId)),
  ].map((p) => p.catch(() => {})))
}

/** Transfere as metas da origem para o destino (+ arquiva a origem, se pedido). Tudo auditado. */
export async function transferirMetas(origemId: string, destinoId: string, opts: OpcoesTransferencia): Promise<ResultadoTransferencia> {
  const g = await guard(); if (!g.ok) return g
  if (!UUID.test(origemId ?? '') || !UUID.test(destinoId ?? '')) return { ok: false, error: 'Documento inválido.' }
  if (origemId.toLowerCase() === destinoId.toLowerCase()) return { ok: false, error: 'A origem e o destino são o mesmo documento.' }
  const itens = opts?.itens ?? { planos: false, conteudoMeta: false, catalogo: false }
  if (!itens.planos && !itens.conteudoMeta && !itens.catalogo && !opts?.arquivarOrigem) return { ok: false, error: 'Marque pelo menos um item para transferir.' }
  const motivo = (opts?.motivo ?? '').trim().slice(0, 500)
  const svc = createAdminClient()

  const previa = await previaTransferenciaMetas(origemId, destinoId)
  if (!previa.ok || !previa.origem || !previa.destino || !previa.contagens) return { ok: false, error: previa.error || 'Não foi possível verificar os documentos.' }
  if (previa.bloqueios?.length) return { ok: false, error: previa.bloqueios[0] }
  if (nadaATransferir(previa.contagens, itens) && !opts.arquivarOrigem) return { ok: false, error: 'Não há nada a transferir com os itens marcados.' }

  let planos = 0, metas = 0, metaConteudo = 0, planoIds: string[] = []
  if (itens.planos || itens.conteudoMeta) {
    const { data, error } = await (svc as any).rpc('transferir_metas_documento', {
      p_tenant: g.tenantId, p_origem: origemId, p_destino: destinoId, p_ator: g.atorId,
      p_motivo: motivo || 'Transferência de metas', p_planos: !!itens.planos, p_meta_conteudo: !!itens.conteudoMeta,
    })
    if (error) return { ok: false, error: /does not exist|schema cache|Could not find/i.test(error.message) ? 'Rode a migração 20261210000000 (transferir metas de documento).' : error.message }
    const r = (data ?? {}) as { planos?: number; metas?: number; meta_conteudo?: number; plano_ids?: string[] }
    planos = Number(r.planos ?? 0); metas = Number(r.metas ?? 0); metaConteudo = Number(r.meta_conteudo ?? 0); planoIds = r.plano_ids ?? []
  }
  await esquecerCaches(g.tenantId)

  // Arquivar a origem (o pop-up já confirmou; metas transferidas). O catálogo (meta_def) é ressincronizado DEPOIS.
  let arquivou = false, avisoArquivar: string | undefined
  if (opts.arquivarOrigem) {
    const ar = await arquivarConteudo(origemId, { confirmado: true, motivo: motivo ? `Metas transferidas para “${previa.destino.titulo}”: ${motivo}` : `Metas transferidas para “${previa.destino.titulo}”` })
    arquivou = ar.ok
    if (!ar.ok) avisoArquivar = ar.error
    await esquecerCaches(g.tenantId)
  }
  if (itens.catalogo) await sincronizarMetaDef(svc as any, g.tenantId).catch(() => {})

  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_conteudo_documentos', entidadeId: origemId, tenantId: g.tenantId, atorId: g.atorId,
    antes: { documento: previa.origem.titulo, planos_ativos: previa.origem.planosAtivos, contagens: previa.contagens },
    depois: {
      transferencia_metas: true, destino_id: destinoId, destino_titulo: previa.destino.titulo, itens, motivo: motivo || null,
      planos, metas, meta_conteudo: metaConteudo, arquivou_origem: arquivou, plano_ids: planoIds.slice(0, 200),
      planos_conflito: previa.contagens.planosConflito, planos_legados: previa.contagens.planosLegados,
    },
  }).catch(() => {})
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_conteudo_documentos', entidadeId: destinoId, tenantId: g.tenantId, atorId: g.atorId,
    depois: { recebeu_metas_de: origemId, origem_titulo: previa.origem.titulo, planos, metas, meta_conteudo: metaConteudo, motivo: motivo || null },
  }).catch(() => {})

  revalidatePath('/admin/biblioteca'); revalidatePath('/admin/revisao/biblioteca')
  if (opts.arquivarOrigem && !arquivou) return { ok: false, error: `Metas transferidas, mas a origem NÃO foi arquivada: ${avisoArquivar ?? 'erro'}`, planos, metas, metaConteudo, arquivou: false }
  return { ok: true, planos, metas, metaConteudo, arquivou, mensagem: mensagemTransferida({ planos, metas, metaConteudo, arquivou }) }
}
