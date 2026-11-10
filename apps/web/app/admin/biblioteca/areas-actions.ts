'use server'
import type { DadosAreas, EntradaRegra } from './areas-actions-tipos'

// ÁREAS DE VISIBILIDADE do documento (aba "Áreas" do gerenciamento). As áreas vêm do .docx (plugin do editor);
// aqui o admin define QUEM VÊ cada uma: regras "mostrar para"/"ocultar para" por produto, grupo, segmento ou aluno
// (várias por área), marca a área como expansiva e confere "como o aluno X vê". Autorização sempre no servidor.
// Só exporta funções async (regra do 'use server'); tipos ficam em lib/conteudo/areas.ts.

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import {
  T_AREAS, T_AREA_REGRAS, areasDoDocumento, regrasDoDocumento, resolverAreas, invalidarAreas, estiloExpPadraoDoTenant, salvarEstiloExpPadraoDoTenant, sanearEstiloExp,
  type AreaDoc, type RegraArea, type EstiloExp,
} from '@/lib/conteudo/areas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function guard(acao: 'view' | 'update') {
  if (!(await checkPermission(acao === 'view' ? 'configuracoes:view' : 'configuracoes:update'))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}
const MSG_MIGRACAO = 'Rode a migração das áreas de visibilidade (20261106020000).'
const ehMigracao = (m?: string) => /does not exist|schema cache|simulado_conteudo_area/i.test(m || '')

type Opcao = { id: string; nome: string }

export async function carregarAreasAction(documentoId: string): Promise<DadosAreas | { ok: false; error: string }> {
  const g = await guard('view'); if (!g.ok) return g
  if (!UUID.test(documentoId)) return { ok: false, error: 'Documento inválido.' }
  const svc = createAdminClient()
  const t = await svc.from(T_AREAS).select('id', { head: true, count: 'exact' }).eq('tenant_id', g.tenantId).eq('documento_id', documentoId)
  if (t.error) return { ok: false, error: ehMigracao(t.error.message) ? MSG_MIGRACAO : t.error.message }
  const [areas, regras, prod, seg, grp, estiloPadrao] = await Promise.all([
    areasDoDocumento(svc, g.tenantId, documentoId),
    regrasDoDocumento(svc, g.tenantId, documentoId),
    svc.from('simulado_produtos').select('id, nome').eq('tenant_id', g.tenantId).eq('ativo', true).order('nome', { ascending: true }).limit(300),
    svc.from('simulado_segmentos').select('id, nome').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome', { ascending: true }).limit(300),
    svc.from('simulado_grupos').select('id, nome').eq('tenant_id', g.tenantId).order('nome', { ascending: true }).limit(500),
    estiloExpPadraoDoTenant(svc, g.tenantId),
  ])
  const alunoIds = [...new Set(regras.filter((r) => r.publico_tipo === 'aluno' && r.publico_id).map((r) => r.publico_id as string))]
  const alunos: Record<string, string> = {}
  if (alunoIds.length) {
    const { data } = await svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', g.tenantId).in('id', alunoIds)
    for (const a of (data ?? []) as any[]) alunos[a.id] = `${a.nome ?? ''}${a.email ? ` · ${a.email}` : ''}`
  }
  const lista = (r: { data: any }) => ((r.data ?? []) as any[]).map((x) => ({ id: x.id as string, nome: String(x.nome ?? '') }))
  return { ok: true, areas, regras, produtos: lista(prod), segmentos: lista(seg), grupos: lista(grp), alunos, estiloPadrao }
}


export async function salvarRegraAreaAction(documentoId: string, input: EntradaRegra): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await guard('update'); if (!g.ok) return g
  if (!UUID.test(documentoId)) return { ok: false, error: 'Documento inválido.' }
  if (!['mostrar', 'ocultar'].includes(input.efeito)) return { ok: false, error: 'Efeito inválido.' }
  if (!['todos', 'segmento', 'grupo', 'aluno'].includes(input.publico_tipo)) return { ok: false, error: 'Público inválido.' }
  if (input.publico_tipo !== 'todos' && !(input.publico_id && UUID.test(input.publico_id))) return { ok: false, error: 'Escolha o público da regra.' }
  if (input.produto_id && !UUID.test(input.produto_id)) return { ok: false, error: 'Produto inválido.' }
  const svc = createAdminClient()
  const { data: area } = await svc.from(T_AREAS).select('area_key').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('area_key', input.area_key).maybeSingle()
  if (!area) return { ok: false, error: 'Área não encontrada neste documento.' }
  const campos = {
    efeito: input.efeito, produto_id: input.produto_id || null, publico_tipo: input.publico_tipo,
    publico_id: input.publico_tipo === 'todos' ? null : input.publico_id, atualizado_em: new Date().toISOString(),
  }
  const r = input.id && UUID.test(input.id)
    ? await svc.from(T_AREA_REGRAS).update(campos).eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('id', input.id)
    : await svc.from(T_AREA_REGRAS).insert({ ...campos, tenant_id: g.tenantId, documento_id: documentoId, area_key: input.area_key, ativo: true, ordem: Date.now() % 2147483000 })
  if (r.error) return { ok: false, error: ehMigracao(r.error.message) ? MSG_MIGRACAO : r.error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: T_AREA_REGRAS, entidadeId: documentoId, depois: { area: input.area_key, ...campos }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  await invalidarAreas(g.tenantId, documentoId)
  return { ok: true }
}

export async function alternarRegraAreaAction(documentoId: string, regraId: string, ativo: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await guard('update'); if (!g.ok) return g
  if (!UUID.test(documentoId) || !UUID.test(regraId)) return { ok: false, error: 'Dados inválidos.' }
  const svc = createAdminClient()
  const { error } = await svc.from(T_AREA_REGRAS).update({ ativo: !!ativo, atualizado_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('id', regraId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: T_AREA_REGRAS, entidadeId: regraId, depois: { ativo: !!ativo }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  await invalidarAreas(g.tenantId, documentoId)
  return { ok: true }
}

export async function excluirRegraAreaAction(documentoId: string, regraId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await guard('update'); if (!g.ok) return g
  if (!UUID.test(documentoId) || !UUID.test(regraId)) return { ok: false, error: 'Dados inválidos.' }
  const svc = createAdminClient()
  const { error } = await svc.from(T_AREA_REGRAS).delete().eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('id', regraId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: T_AREA_REGRAS, entidadeId: regraId, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  await invalidarAreas(g.tenantId, documentoId)
  return { ok: true }
}

/** Marca a área como EXPANSIVA (no modo texto vira bloco recolhível, com o nome da área como título). */
export async function definirAreaExpansivaAction(documentoId: string, areaKey: string, expansiva: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await guard('update'); if (!g.ok) return g
  if (!UUID.test(documentoId)) return { ok: false, error: 'Documento inválido.' }
  const svc = createAdminClient()
  const { error } = await svc.from(T_AREAS).update({ expansiva: !!expansiva, atualizado_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('area_key', areaKey)
  if (error) return { ok: false, error: /expansiva/i.test(error.message) ? MSG_MIGRACAO : error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: T_AREAS, entidadeId: documentoId, depois: { area: areaKey, expansiva: !!expansiva }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  await invalidarAreas(g.tenantId, documentoId)
  return { ok: true }
}

export async function buscarAlunosAreaAction(q: string): Promise<{ ok: true; rows: { id: string; nome: string; email: string | null }[] } | { ok: false; error: string }> {
  const g = await guard('view'); if (!g.ok) return g
  const termo = String(q ?? '').trim().replace(/[%,()]/g, ' ').slice(0, 60)
  if (termo.length < 2) return { ok: true, rows: [] }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', g.tenantId)
    .or(`nome.ilike.%${termo}%,email.ilike.%${termo}%`).order('nome', { ascending: true }).limit(8)
  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: ((data ?? []) as any[]).map((a) => ({ id: a.id, nome: a.nome ?? '', email: a.email ?? null })) }
}

/** "Ver como o aluno": quais áreas ele NÃO vê neste documento (por produto de origem, ou só regras globais). */
export async function verComoAlunoAction(documentoId: string, estudanteId: string, produtoId: string | null): Promise<{ ok: true; ocultas: string[] } | { ok: false; error: string }> {
  const g = await guard('view'); if (!g.ok) return g
  if (!UUID.test(documentoId) || !UUID.test(estudanteId)) return { ok: false, error: 'Dados inválidos.' }
  const svc = createAdminClient()
  const { data: est } = await svc.from('simulado_estudantes').select('id').eq('tenant_id', g.tenantId).eq('id', estudanteId).maybeSingle()
  if (!est) return { ok: false, error: 'Aluno não encontrado.' }
  const r = await resolverAreas(svc, g.tenantId, estudanteId, documentoId, { produtoId: produtoId && UUID.test(produtoId) ? produtoId : null })
  return { ok: true, ocultas: [...r.ocultas] }
}

/** Título e estilo de UM bloco expansível (do documento). `estilo = null` volta ao padrão do tenant; `titulo` vazio volta ao nome do documento. */
export async function salvarBlocoExpansivelAction(documentoId: string, areaKey: string, titulo: string, estilo: Partial<EstiloExp> | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await guard('update'); if (!g.ok) return g
  if (!UUID.test(documentoId)) return { ok: false, error: 'Documento inválido.' }
  const t = String(titulo ?? '').trim().slice(0, 200)
  const svc = createAdminClient()
  const campos: Record<string, unknown> = { titulo: t || null, estilo: estilo ? sanearEstiloExp(estilo) : null, atualizado_em: new Date().toISOString() }
  const { error } = await svc.from(T_AREAS).update(campos).eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('area_key', areaKey)
  if (error) return { ok: false, error: /titulo|estilo|tipo/i.test(error.message) ? MSG_MIGRACAO : error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: T_AREAS, entidadeId: documentoId, depois: { area: areaKey, titulo: t || null, estilo: !!estilo }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  await invalidarAreas(g.tenantId, documentoId)
  return { ok: true }
}

/** Estilo PADRÃO dos blocos expansíveis de TODOS os documentos do tenant (cartão branco/borda lilás/título roxo, se vazio). */
export async function salvarEstiloPadraoExpansivelAction(estilo: Partial<EstiloExp>): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const r = await salvarEstiloExpPadraoDoTenant(svc, g.tenantId, estilo)
  if (!r.ok) return { ok: false, error: r.error || 'Falha ao salvar.' }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_tenants', entidadeId: g.tenantId, depois: { expansor_estilo: sanearEstiloExp(estilo) }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  return { ok: true }
}
