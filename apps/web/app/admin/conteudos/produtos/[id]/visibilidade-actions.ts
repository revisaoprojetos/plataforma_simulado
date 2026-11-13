'use server'
import type { SegmentoAdmin, AlvosProduto, AlvoNome, AlvoLote, AcaoVisibilidadeLote, VisibilidadeConteudo } from './visibilidade-actions-tipos'

// Aba VISIBILIDADE do produto: SEGMENTOS (públicos de alunos por condições) + REGRAS que aplicam os
// segmentos ao acesso do produto e aos conteúdos (módulos/aulas). Tabelas simulado_segmentos e
// simulado_produto_visibilidade (migração 20261103130000). Segmentos são do TENANT (reaproveitáveis
// em vários produtos); regras são por produto. Leitura: produtos:view · escrita: produtos:manage.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { registrarRegraLog } from '@/lib/produtos/regras-log'
import { invalidarMapaRegras } from '@/lib/produtos/mapa-regras-cache'
import { nomesDeRecursos, buscarRecursos } from '@/lib/produtos/estudio'
import { ContextoAluno, explicarRegra } from '@/lib/segmentos/avaliar'
import {
  normalizarRegra, validarRegra, refsDaRegra,
  type RegraSegmento, type Segmento, type RegraVisibilidade, type AlvoTipo, type Efeito, type SemAcesso, type RefTipo,
} from '@/lib/segmentos/tipos'
import { sanearBusca } from '@/lib/seguranca/postgrest-safe'

async function guard(manage = false) {
  const access = await getCurrentAccess()
  const ok = access.isAdmin
    || access.permissions.includes(manage ? 'produtos:manage' : 'produtos:view')
    || access.permissions.includes('produtos:manage')
  if (!ok) return { error: 'Sem permissão.' as const }
  if (!access.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  return { tenantId: access.tenantId, userId: access.userId }
}

const MIGRACAO = 'Recurso ainda não ativado no banco: aplique a migração 20261103130000_segmentos_visibilidade.sql.'
const faltaTabela = (msg: string | undefined) => !!msg && /simulado_segmentos|simulado_produto_visibilidade|schema cache|does not exist/i.test(msg)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i


function revalidar(produtoId: string) {
  void invalidarMapaRegras(produtoId) // mapa da aba Regras (cache 20 s)
  revalidatePath(`/admin/conteudos/produtos/${produtoId}`)
}

/** Nomes (grupo/produto/simulado) referenciados por uma lista de regras de segmento — p/ os resumos. */
async function nomesDasRefs(tenantId: string, regras: RegraSegmento[]): Promise<Record<string, string>> {
  const ids: Record<RefTipo, Set<string>> = { grupo: new Set(), produto: new Set(), simulado: new Set() }
  for (const r of regras) { const x = refsDaRegra(r); for (const k of ['grupo', 'produto', 'simulado'] as RefTipo[]) x[k].forEach((i) => ids[k].add(i)) }
  const out: Record<string, string> = {}
  const [g, s] = await Promise.all([
    nomesDeRecursos(tenantId, 'grupo', [...ids.grupo]),
    nomesDeRecursos(tenantId, 'simulado', [...ids.simulado]),
  ])
  for (const m of [g, s]) for (const v of Object.values(m)) out[v.id] = v.nome
  if (ids.produto.size) {
    const svc = createAdminClient()
    const { data } = await svc.from('simulado_produtos').select('id, nome').eq('tenant_id', tenantId).in('id', [...ids.produto].slice(0, 200))
    for (const p of (data ?? []) as any[]) out[p.id] = p.nome
  }
  return out
}

/** Nome de cada alvo (módulo/aula) REFERENCIADO por regras de conteúdo — resolve SÓ os ids citados,
 *  não a árvore inteira (evita baixar centenas de aulas só p/ mostrar o nome de 1-2 regras). */
async function resolverAlvosNomes(svc: ReturnType<typeof createAdminClient>, tenantId: string, produtoId: string, regras: RegraVisibilidade[]): Promise<Record<string, AlvoNome>> {
  const modIds = new Set<string>(), aulaIds = new Set<string>()
  for (const r of regras) { if (!r.alvo_id) continue; if (r.alvo_tipo === 'modulo') modIds.add(r.alvo_id); else if (r.alvo_tipo === 'aula') aulaIds.add(r.alvo_id) }
  if (!modIds.size && !aulaIds.size) return {}
  const out: Record<string, AlvoNome> = {}
  // Aulas referenciadas → título + módulo pai.
  const aulaRows = aulaIds.size ? ((await svc.from('simulado_produto_modulo_itens').select('id, titulo, modulo_id').eq('tenant_id', tenantId).eq('produto_id', produtoId).in('id', [...aulaIds])).data ?? []) as any[] : []
  // Módulos a resolver: os referenciados + os módulos-pai das aulas; depois os pais desses (p/ "Submódulo").
  const precisaMod = new Set<string>([...modIds, ...aulaRows.map((a) => a.modulo_id)])
  let modRows = precisaMod.size ? ((await svc.from('simulado_produto_modulos').select('id, titulo, pai_id').eq('tenant_id', tenantId).eq('produto_id', produtoId).in('id', [...precisaMod])).data ?? []) as any[] : []
  const faltamPais = [...new Set(modRows.map((m) => m.pai_id).filter(Boolean))].filter((p) => !modRows.some((m) => m.id === p)) as string[]
  if (faltamPais.length) modRows = [...modRows, ...(((await svc.from('simulado_produto_modulos').select('id, titulo, pai_id').eq('tenant_id', tenantId).eq('produto_id', produtoId).in('id', faltamPais)).data ?? []) as any[])]
  const modById = new Map(modRows.map((m) => [m.id, m]))
  for (const id of modIds) { const m = modById.get(id); if (m) out[id] = { titulo: m.titulo, sub: m.pai_id ? (modById.get(m.pai_id)?.titulo ?? null) : null } }
  for (const a of aulaRows) out[a.id] = { titulo: a.titulo, sub: modById.get(a.modulo_id)?.titulo ?? null }
  return out
}

/** Carga da aba (LEVE): segmentos do tenant (+ uso), regras deste produto, nomes dos alvos REFERENCIADOS
 *  e `temModulos` (count). A árvore completa de módulos/aulas é carregada só ao abrir o picker de conteúdo
 *  (carregarAlvosConteudoAction) — antes baixava 100s de aulas em TODA abertura, mesmo sem nenhuma regra. */
export async function carregarVisibilidadeAction(produtoId: string): Promise<
  | { ok: true; disponivel: boolean; segmentos: SegmentoAdmin[]; regras: RegraVisibilidade[]; alvosNomes: Record<string, AlvoNome>; temModulos: boolean; nomes: Record<string, string> }
  | { error: string }
> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const svc = createAdminClient()
  const [segR, regR, usoR, modCountR] = await Promise.all([
    svc.from('simulado_segmentos').select('id, nome, descricao, regra, atualizado_em').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome', { ascending: true }).limit(500),
    svc.from('simulado_produto_visibilidade').select('id, segmento_id, alvo_tipo, alvo_id, efeito, sem_acesso, ativo').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).order('criado_em', { ascending: true }).limit(2000),
    svc.from('simulado_produto_visibilidade').select('segmento_id').eq('tenant_id', g.tenantId).limit(5000),
    svc.from('simulado_produto_modulos').select('id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false),
  ])
  const temModulos = (modCountR.count ?? 0) > 0
  if (segR.error || regR.error) {
    return { ok: true, disponivel: !(faltaTabela(segR.error?.message) || faltaTabela(regR.error?.message)), segmentos: [], regras: [], alvosNomes: {}, temModulos, nomes: {} }
  }
  const uso = new Map<string, number>()
  for (const r of (usoR.data ?? []) as any[]) uso.set(r.segmento_id, (uso.get(r.segmento_id) ?? 0) + 1)
  const segmentos: SegmentoAdmin[] = ((segR.data ?? []) as any[]).map((s) => ({
    id: s.id, nome: s.nome, descricao: s.descricao ?? null, regra: normalizarRegra(s.regra), atualizado_em: s.atualizado_em ?? null, uso: uso.get(s.id) ?? 0,
  }))
  const regras: RegraVisibilidade[] = ((regR.data ?? []) as any[]).map((r) => ({
    id: r.id, segmento_id: r.segmento_id, alvo_tipo: r.alvo_tipo, alvo_id: r.alvo_id ?? null, efeito: r.efeito, sem_acesso: r.sem_acesso, ativo: r.ativo !== false,
  }))
  const [alvosNomes, nomes] = await Promise.all([
    resolverAlvosNomes(svc, g.tenantId, produtoId, regras),
    nomesDasRefs(g.tenantId, segmentos.map((s) => s.regra)),
  ])
  return { ok: true, disponivel: true, segmentos, regras, alvosNomes, temModulos, nomes }
}

/** Árvore de módulos/aulas do produto p/ o picker "Adicionar regra de conteúdo" — carregada SÓ quando o
 *  dialog de conteúdo abre (lazy), não na carga da aba. */
export async function carregarAlvosConteudoAction(produtoId: string): Promise<{ ok: true; alvos: AlvosProduto } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const svc = createAdminClient()
  const [modR, aulR] = await Promise.all([
    svc.from('simulado_produto_modulos').select('id, titulo, pai_id, ordem').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false).order('ordem', { ascending: true }).limit(2000),
    svc.from('simulado_produto_modulo_itens').select('id, titulo, modulo_id, ordem').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false).order('ordem', { ascending: true }).limit(5000),
  ])
  return {
    ok: true,
    alvos: {
      modulos: ((modR.data ?? []) as any[]).map((m) => ({ id: m.id, titulo: m.titulo, pai_id: m.pai_id ?? null })),
      aulas: ((aulR.data ?? []) as any[]).map((a) => ({ id: a.id, titulo: a.titulo, modulo_id: a.modulo_id })),
    },
  }
}

/** Cria/edita um segmento (nome ≤ 250, descrição ≤ 1000, regra validada). */
export async function salvarSegmentoAction(input: { id?: string | null; nome: string; descricao?: string | null; regra: RegraSegmento }): Promise<{ ok: true; segmento: Segmento; nomes: Record<string, string> } | { error: string }> {
  const g = await guard(true); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const nome = String(input.nome ?? '').trim()
  if (!nome) return { error: 'Dê um nome ao segmento.' }
  if (nome.length > 250) return { error: 'O nome pode ter até 250 caracteres.' }
  const descricao = String(input.descricao ?? '').trim() || null
  if (descricao && descricao.length > 1000) return { error: 'A descrição pode ter até 1000 caracteres.' }
  const regra = normalizarRegra(input.regra)
  const erro = validarRegra(regra)
  if (erro) return { error: erro }
  const svc = createAdminClient()
  const agora = new Date().toISOString()
  const q = input.id
    ? svc.from('simulado_segmentos').update({ nome, descricao, regra, atualizado_em: agora }).eq('id', input.id).eq('tenant_id', g.tenantId).eq('deletado', false)
    : svc.from('simulado_segmentos').insert({ tenant_id: g.tenantId, nome, descricao, regra, criado_por: g.userId })
  const { data, error } = await q.select('id, nome, descricao, regra, atualizado_em').maybeSingle()
  if (error) return { error: faltaTabela(error.message) ? MIGRACAO : error.message }
  if (!data) return { error: 'Segmento não encontrado.' }
  await registrarAudit({ operacao: input.id ? 'UPDATE' : 'INSERT', entidade: 'simulado_segmentos', entidadeId: (data as any).id, depois: { nome, descricao, regra } })
  const seg: Segmento = { id: (data as any).id, nome: (data as any).nome, descricao: (data as any).descricao ?? null, regra: normalizarRegra((data as any).regra), atualizado_em: (data as any).atualizado_em ?? null }
  return { ok: true, segmento: seg, nomes: await nomesDasRefs(g.tenantId, [seg.regra]) }
}

/** Duplica um segmento ("Cópia de …"). */
export async function duplicarSegmentoAction(id: string): Promise<{ ok: true; segmento: Segmento } | { error: string }> {
  const g = await guard(true); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const svc = createAdminClient()
  const { data: o } = await svc.from('simulado_segmentos').select('nome, descricao, regra').eq('id', id).eq('tenant_id', g.tenantId).eq('deletado', false).maybeSingle()
  if (!o) return { error: 'Segmento não encontrado.' }
  const nome = `Cópia de ${(o as any).nome}`.slice(0, 250)
  const { data, error } = await svc.from('simulado_segmentos').insert({ tenant_id: g.tenantId, nome, descricao: (o as any).descricao, regra: (o as any).regra, criado_por: g.userId })
    .select('id, nome, descricao, regra, atualizado_em').maybeSingle()
  if (error || !data) return { error: error?.message ?? 'Falha ao duplicar.' }
  return { ok: true, segmento: { id: (data as any).id, nome: (data as any).nome, descricao: (data as any).descricao ?? null, regra: normalizarRegra((data as any).regra), atualizado_em: (data as any).atualizado_em ?? null } }
}

/**
 * Exclui um segmento (soft delete) e APAGA as regras que o usam em todos os produtos — uma regra
 * "mostrar somente para" apontando a um segmento excluído esconderia o conteúdo de todos.
 */
export async function excluirSegmentoAction(id: string, produtoId: string): Promise<{ ok: true } | { error: string }> {
  const g = await guard(true); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_segmentos').update({ deletado: true, deletado_em: new Date().toISOString() }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { error: error.message }
  await svc.from('simulado_produto_visibilidade').delete().eq('tenant_id', g.tenantId).eq('segmento_id', id)
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_segmentos', entidadeId: id })
  revalidar(produtoId)
  return { ok: true }
}

/** Cria/edita uma regra de visibilidade deste produto. */
export async function salvarRegraVisibilidadeAction(produtoId: string, input: {
  id?: string | null; segmento_id: string; alvo_tipo: AlvoTipo; alvo_id?: string | null; efeito: Efeito; sem_acesso?: SemAcesso
}): Promise<{ ok: true; regra: RegraVisibilidade } | { error: string }> {
  const g = await guard(true); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const alvo = input.alvo_tipo
  if (!['produto', 'modulo', 'aula'].includes(alvo)) return { error: 'Alvo inválido.' }
  const efeito = input.efeito
  if (alvo === 'produto' ? !['liberar', 'bloquear'].includes(efeito) : !['mostrar', 'ocultar'].includes(efeito)) return { error: 'Efeito inválido para o alvo.' }
  if (!input.segmento_id || !UUID.test(input.segmento_id)) return { error: 'Escolha um segmento.' }
  const alvoId = alvo === 'produto' ? null : (input.alvo_id ?? null)
  if (alvo !== 'produto' && (!alvoId || !UUID.test(alvoId))) return { error: `Escolha ${alvo === 'modulo' ? 'o módulo' : 'a aula'}.` }
  const svc = createAdminClient()
  // O alvo precisa ser DESTE produto (e do tenant).
  if (alvoId) {
    const tabela = alvo === 'modulo' ? 'simulado_produto_modulos' : 'simulado_produto_modulo_itens'
    const { data: a } = await svc.from(tabela).select('id').eq('id', alvoId).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false).maybeSingle()
    if (!a) return { error: 'Conteúdo não encontrado neste produto.' }
  }
  const { data: seg } = await svc.from('simulado_segmentos').select('id').eq('id', input.segmento_id).eq('tenant_id', g.tenantId).eq('deletado', false).maybeSingle()
  if (!seg) return { error: 'Segmento não encontrado.' }
  const row = {
    segmento_id: input.segmento_id, alvo_tipo: alvo, alvo_id: alvoId, efeito,
    sem_acesso: input.sem_acesso === 'bloqueado_cadeado' ? 'bloqueado_cadeado' : 'oculto', atualizado_em: new Date().toISOString(),
  }
  const q = input.id
    ? svc.from('simulado_produto_visibilidade').update(row).eq('id', input.id).eq('tenant_id', g.tenantId).eq('produto_id', produtoId)
    : svc.from('simulado_produto_visibilidade').insert({ ...row, tenant_id: g.tenantId, produto_id: produtoId, criado_por: g.userId })
  const { data, error } = await q.select('id, segmento_id, alvo_tipo, alvo_id, efeito, sem_acesso, ativo').maybeSingle()
  if (error) return { error: faltaTabela(error.message) ? MIGRACAO : error.message }
  if (!data) return { error: 'Regra não encontrada.' }
  await registrarAudit({ operacao: input.id ? 'UPDATE' : 'INSERT', entidade: 'simulado_produto_visibilidade', entidadeId: (data as any).id, depois: { produto_id: produtoId, ...row } })
  await registrarRegraLog({ tenantId: g.tenantId, produtoId, camada: 'visibilidade', acao: input.id ? 'alterada' : 'criada', alvoTipo: alvo, alvoId, alvoRotulo: `${row.efeito} · segmento ${input.segmento_id.slice(0, 8)}`, depois: row, atorId: g.userId })
  revalidar(produtoId)
  const d = data as any
  return { ok: true, regra: { id: d.id, segmento_id: d.segmento_id, alvo_tipo: d.alvo_tipo, alvo_id: d.alvo_id ?? null, efeito: d.efeito, sem_acesso: d.sem_acesso, ativo: d.ativo !== false } }
}

export async function alternarRegraVisibilidadeAction(produtoId: string, id: string, ativo: boolean): Promise<{ ok: true } | { error: string }> {
  const g = await guard(true); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_produto_visibilidade').update({ ativo: !!ativo, atualizado_em: new Date().toISOString() })
    .eq('id', id).eq('tenant_id', g.tenantId).eq('produto_id', produtoId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: ativo ? 'LIBERAR' : 'BLOQUEAR', entidade: 'simulado_produto_visibilidade', entidadeId: id, depois: { ativo: !!ativo } })
  await registrarRegraLog({ tenantId: g.tenantId, produtoId, camada: 'visibilidade', acao: ativo ? 'ativada' : 'desativada', alvoId: id, alvoRotulo: 'regra de visibilidade', depois: { ativo: !!ativo }, atorId: g.userId })
  revalidar(produtoId)
  return { ok: true }
}

export async function excluirRegraVisibilidadeAction(produtoId: string, id: string): Promise<{ ok: true } | { error: string }> {
  const g = await guard(true); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_produto_visibilidade').delete().eq('id', id).eq('tenant_id', g.tenantId).eq('produto_id', produtoId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_produto_visibilidade', entidadeId: id })
  await registrarRegraLog({ tenantId: g.tenantId, produtoId, camada: 'visibilidade', acao: 'removida', alvoId: id, alvoRotulo: 'regra de visibilidade', atorId: g.userId })
  revalidar(produtoId)
  return { ok: true }
}

const chunks = <T,>(a: T[], n = 80): T[][] => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }

/** Carga LEVE p/ a aba Conteúdos: segmentos (id+nome) e só as regras de módulo/aula deste produto. */
export async function carregarVisibilidadeConteudoAction(produtoId: string): Promise<{ ok: true; disponivel: boolean; dados: VisibilidadeConteudo } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const svc = createAdminClient()
  const [segR, regR] = await Promise.all([
    svc.from('simulado_segmentos').select('id, nome, descricao, regra, atualizado_em').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome', { ascending: true }).limit(500),
    svc.from('simulado_produto_visibilidade').select('id, segmento_id, alvo_tipo, alvo_id, efeito, sem_acesso, ativo').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('alvo_tipo', ['modulo', 'aula']).limit(5000),
  ])
  if (segR.error || regR.error) {
    const msg = segR.error?.message ?? regR.error?.message
    return { ok: true, disponivel: !faltaTabela(msg), dados: { segmentos: [], regras: [], nomes: {} } }
  }
  const segmentos: Segmento[] = ((segR.data ?? []) as any[]).map((s) => ({ id: s.id, nome: s.nome, descricao: s.descricao ?? null, regra: normalizarRegra(s.regra), atualizado_em: s.atualizado_em ?? null }))
  return {
    ok: true, disponivel: true,
    dados: {
      segmentos, nomes: await nomesDasRefs(g.tenantId, segmentos.map((x) => x.regra)),
      regras: ((regR.data ?? []) as any[]).map((r) => ({ id: r.id, segmento_id: r.segmento_id, alvo_tipo: r.alvo_tipo, alvo_id: r.alvo_id ?? null, efeito: r.efeito, sem_acesso: r.sem_acesso, ativo: r.ativo !== false })),
    },
  }
}

/** Aplica UMA regra de visibilidade (mostrar somente para / ocultar para um segmento) a VÁRIOS módulos/aulas de uma vez —
 *  ou limpa as regras deles. Valida que os alvos são deste produto/tenant, troca as regras anteriores (mesmo segmento, ou todas
 *  se `substituir`) e audita UMA entrada com a lista. Consultas em chunks de 80. */
export async function aplicarVisibilidadeEmLoteAction(produtoId: string, alvos: AlvoLote[], acao: AcaoVisibilidadeLote): Promise<{ ok: true; alvos: number; criadas: number; removidas: number } | { error: string }> {
  const g = await guard(true); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!Array.isArray(alvos) || !alvos.length) return { error: 'Selecione ao menos um conteúdo.' }
  if (alvos.length > 3000) return { error: 'Selecione no máximo 3.000 itens por vez.' }
  const mods = [...new Set(alvos.filter((a) => a?.tipo === 'modulo' && UUID.test(a.id)).map((a) => a.id))]
  const aulas = [...new Set(alvos.filter((a) => a?.tipo === 'aula' && UUID.test(a.id)).map((a) => a.id))]
  if (!mods.length && !aulas.length) return { error: 'Conteúdos inválidos.' }
  const svc = createAdminClient()

  // Só os que são DESTE produto e do tenant.
  const validar = async (tabela: string, ids: string[]) => {
    const ok: string[] = []
    for (const c of chunks(ids)) {
      const { data } = await svc.from(tabela).select('id').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false).in('id', c)
      for (const r of (data ?? []) as any[]) ok.push(r.id)
    }
    return ok
  }
  const [modOk, aulaOk] = await Promise.all([validar('simulado_produto_modulos', mods), validar('simulado_produto_modulo_itens', aulas)])
  const alvosOk: { tipo: 'modulo' | 'aula'; id: string }[] = [...modOk.map((id) => ({ tipo: 'modulo' as const, id })), ...aulaOk.map((id) => ({ tipo: 'aula' as const, id }))]
  if (!alvosOk.length) return { error: 'Conteúdo não encontrado neste produto.' }

  // Regras já existentes desses alvos.
  const existentes: { id: string; alvo_id: string; segmento_id: string }[] = []
  for (const c of chunks(alvosOk.map((a) => a.id))) {
    const { data, error } = await svc.from('simulado_produto_visibilidade').select('id, alvo_id, segmento_id').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('alvo_tipo', ['modulo', 'aula']).in('alvo_id', c)
    if (error) return { error: faltaTabela(error.message) ? MIGRACAO : error.message }
    for (const r of (data ?? []) as any[]) existentes.push(r)
  }

  let aRemover: string[] = []
  const linhas: Record<string, unknown>[] = []
  if (acao.tipo === 'limpar') {
    aRemover = existentes.map((r) => r.id)
  } else {
    if (!['mostrar', 'ocultar'].includes(acao.efeito)) return { error: 'Efeito inválido.' }
    if (!acao.segmento_id || !UUID.test(acao.segmento_id)) return { error: 'Escolha um segmento.' }
    const { data: seg } = await svc.from('simulado_segmentos').select('id').eq('id', acao.segmento_id).eq('tenant_id', g.tenantId).eq('deletado', false).maybeSingle()
    if (!seg) return { error: 'Segmento não encontrado.' }
    aRemover = existentes.filter((r) => acao.substituir || r.segmento_id === acao.segmento_id).map((r) => r.id)
    const agora = new Date().toISOString()
    for (const a of alvosOk) linhas.push({
      tenant_id: g.tenantId, produto_id: produtoId, segmento_id: acao.segmento_id, alvo_tipo: a.tipo, alvo_id: a.id, efeito: acao.efeito,
      sem_acesso: acao.sem_acesso === 'bloqueado_cadeado' ? 'bloqueado_cadeado' : 'oculto', ativo: true, criado_por: g.userId, atualizado_em: agora,
    })
  }

  for (const c of chunks(aRemover)) {
    const { error } = await svc.from('simulado_produto_visibilidade').delete().eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', c)
    if (error) return { error: error.message }
  }
  let criadas = 0
  for (const c of chunks(linhas, 200)) {
    const { error } = await svc.from('simulado_produto_visibilidade').insert(c)
    if (error) return { error: faltaTabela(error.message) ? MIGRACAO : error.message }
    criadas += c.length
  }
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_produto_visibilidade', entidadeId: produtoId,
    depois: { lote: true, acao: acao.tipo, ...(acao.tipo === 'aplicar' ? { segmento_id: acao.segmento_id, efeito: acao.efeito, sem_acesso: acao.sem_acesso, substituir: acao.substituir } : {}), modulos: modOk, aulas: aulaOk, criadas, removidas: aRemover.length },
  })
  await registrarRegraLog({ tenantId: g.tenantId, produtoId, camada: 'visibilidade', acao: acao.tipo === 'limpar' ? 'limpeza em lote' : 'aplicada em lote', alvoRotulo: `${alvosOk.length} conteúdo(s)`, antes: { removidas: aRemover.length }, depois: acao.tipo === 'aplicar' ? { segmento_id: acao.segmento_id, efeito: acao.efeito, sem_acesso: acao.sem_acesso, criadas } : { criadas }, atorId: g.userId })
  revalidar(produtoId)
  return { ok: true, alvos: alvosOk.length, criadas, removidas: aRemover.length }
}

/** Busca de grupo / produto / simulado para as condições (20 por vez). */
export async function buscarRefsSegmentoAction(tipo: RefTipo, q: string): Promise<{ ok: true; rows: { id: string; nome: string }[] } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const termo = String(q ?? '').trim().slice(0, 120)
  if (tipo === 'produto') {
    const svc = createAdminClient()
    let qq = svc.from('simulado_produtos').select('id, nome').eq('tenant_id', g.tenantId)
    if (termo) qq = qq.ilike('nome', `%${termo.replace(/[%_,()]/g, ' ')}%`)
    const { data } = await qq.order('nome', { ascending: true }).limit(20)
    return { ok: true, rows: ((data ?? []) as any[]).map((p) => ({ id: p.id, nome: p.nome })) }
  }
  if (tipo !== 'grupo' && tipo !== 'simulado') return { error: 'Tipo inválido.' }
  const r = await buscarRecursos(g.tenantId, tipo, termo, 1, 20)
  return { ok: true, rows: r.rows.map((x) => ({ id: x.id, nome: x.nome })) }
}

/** Busca de alunos para o "Testar com um aluno" (nome ou e-mail, 10 por vez). */
export async function buscarAlunosSegmentoAction(q: string): Promise<{ ok: true; rows: { id: string; nome: string; email: string | null }[] } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const termo = sanearBusca(String(q ?? ''), 120).replace(/_/g, ' ')
  if (termo.length < 2) return { ok: true, rows: [] }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_estudantes').select('id, nome, email')
    .eq('tenant_id', g.tenantId).eq('deletado', false)
    .or(`nome.ilike.%${termo}%,email.ilike.%${termo}%`).order('nome', { ascending: true }).limit(10)
  return { ok: true, rows: ((data ?? []) as any[]).map((a) => ({ id: a.id, nome: a.nome, email: a.email ?? null })) }
}

/** Avalia uma regra (salva ou não) para UM aluno: resultado geral + de cada grupo/condição. */
export async function testarSegmentoAction(regra: RegraSegmento, estudanteId: string): Promise<
  { ok: true; corresponde: boolean; condicoes: Record<string, boolean>; grupos: Record<string, boolean> } | { error: string }
> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!UUID.test(String(estudanteId))) return { error: 'Aluno inválido.' }
  const svc = createAdminClient()
  const { data: est } = await svc.from('simulado_estudantes').select('id').eq('id', estudanteId).eq('tenant_id', g.tenantId).maybeSingle()
  if (!est) return { error: 'Aluno não encontrado.' }
  const r = await explicarRegra(normalizarRegra(regra), new ContextoAluno(svc, g.tenantId, estudanteId))
  return { ok: true, ...r }
}
