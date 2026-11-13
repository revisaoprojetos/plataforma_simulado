'use server'
import type { AlvoLote } from './visibilidade-actions-tipos'
import type { RegrasSegmentoAdmin, DispSegAdmin, CapaSegAdmin, PlanilhaLiberacaoInfo } from './segmento-regras-tipos'

// LIBERAÇÃO e CAPA por segmento dentro do produto (tabelas da migração 20261115010000):
//  · simulado_produto_disponibilidade_seg — módulo/aula com disponibilidade própria para quem está no segmento;
//  · simulado_produto_capas_seg — módulo com imagem/título/descrição próprios para quem está no segmento.
// Leitura: produtos:view · escrita: produtos:manage. Consultas em chunks de 80; uma auditoria por operação.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { registrarRegraLog } from '@/lib/produtos/regras-log'
import { invalidarMapaRegras } from '@/lib/produtos/mapa-regras-cache'
import { nomesDeRecursos } from '@/lib/produtos/estudio'
import { adicionarMembrosAction } from '@/app/admin/produtos/actions'
import { sanearBusca } from '@/lib/seguranca/postgrest-safe'

async function guard(manage = false) {
  const access = await getCurrentAccess()
  const ok = access.isAdmin || access.permissions.includes(manage ? 'produtos:manage' : 'produtos:view') || access.permissions.includes('produtos:manage')
  if (!ok) return { error: 'Sem permissão.' as const }
  if (!access.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  return { tenantId: access.tenantId, userId: access.userId }
}

const MIGRACAO = 'Recurso ainda não ativado no banco: aplique a migração 20261115010000_produto_regras_por_segmento.sql.'
const faltaTabela = (msg: string | undefined) => !!msg && /simulado_produto_disponibilidade_seg|simulado_produto_capas_seg|schema cache|does not exist/i.test(msg)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIPOS_DISP = ['na_matricula', 'data', 'intervalo', 'data_e_intervalo', 'dia_semana_e_intervalo', 'cronograma']
const chunks = <T,>(a: T[], n = 80): T[][] => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
const revalidar = (produtoId: string) => { void invalidarMapaRegras(produtoId); revalidatePath(`/admin/conteudos/produtos/${produtoId}`) }

/** Disponibilidade validada/normalizada (mesmo formato do configurador de disponibilidade; 'cronograma' = contrato fixo do motor do aluno). */
type DispNorm = { tipo: string; data: string | null; dias: number | null; diaSemana: number | null; antes: 'oculto' | 'bloqueado_cadeado' }
  | { tipo: 'cronograma'; sem_plano: 'planilha' | 'liberado' | 'atual'; com_plano: 'concluir_meta' | 'plano' | 'mais_cedo'; dias_antes: number; antes: 'bloqueado_cadeado' }
function normDisp(v: any): DispNorm | null {
  if (!v || typeof v !== 'object' || !TIPOS_DISP.includes(v.tipo)) return null
  if (v.tipo === 'cronograma') {
    if (!['planilha', 'liberado', 'atual'].includes(v.sem_plano) || !['concluir_meta', 'plano', 'mais_cedo'].includes(v.com_plano)) return null
    const n = Number(v.dias_antes ?? 0)
    if (!Number.isFinite(n) || n < 0 || n > 365) return null
    return { tipo: 'cronograma', sem_plano: v.sem_plano, com_plano: v.com_plano, dias_antes: Math.floor(n), antes: 'bloqueado_cadeado' }
  }
  const data = v.data ? new Date(v.data) : null
  if (v.data && (!data || isNaN(+data))) return null
  const dias = v.dias == null ? null : Math.max(0, Math.min(3650, Math.floor(Number(v.dias) || 0)))
  const dsem = v.diaSemana == null ? null : Math.max(0, Math.min(6, Math.floor(Number(v.diaSemana) || 0)))
  return { tipo: v.tipo, data: data ? data.toISOString() : null, dias, diaSemana: dsem, antes: v.antes === 'oculto' ? 'oculto' : 'bloqueado_cadeado' }
}

/** Estado da planilha de liberação de aulas do produto (somente leitura). Tolerante: sem a migração 20261117010000 → disponivel=false. */
export async function carregarPlanilhaLiberacaoAction(produtoId: string): Promise<{ ok: true; info: PlanilhaLiberacaoInfo } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!UUID.test(produtoId)) return { error: 'Produto inválido.' }
  const svc = createAdminClient()
  const base = () => svc.from('simulado_produto_liberacao_aulas').select('id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('ativo', true)
  const [t, v, c] = await Promise.all([
    base(),
    base().not('aula_id', 'is', null),
    svc.from('simulado_produto_liberacao_cfg').select('ativo').eq('produto_id', produtoId).eq('tenant_id', g.tenantId).maybeSingle(),
  ])
  if (t.error || v.error || c.error) {
    const msg = t.error?.message ?? v.error?.message ?? c.error?.message
    if (faltaTabela(msg) || /liberacao_aulas|liberacao_cfg/i.test(msg ?? '')) return { ok: true, info: { disponivel: false, total: 0, vinculadas: 0, cfgAtiva: null } }
    return { error: msg ?? 'Erro ao ler a planilha.' }
  }
  return { ok: true, info: { disponivel: true, total: t.count ?? 0, vinculadas: v.count ?? 0, cfgAtiva: c.data ? !!(c.data as any).ativo : null } }
}

export async function carregarRegrasSegmentoAction(produtoId: string): Promise<{ ok: true; disponivel: boolean; dados: RegrasSegmentoAdmin } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const svc = createAdminClient()
  const [d, c] = await Promise.all([
    svc.from('simulado_produto_disponibilidade_seg').select('id, segmento_id, alvo_tipo, alvo_id, disponibilidade, prioridade, ativo').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).order('prioridade', { ascending: true }).limit(5000),
    svc.from('simulado_produto_capas_seg').select('id, segmento_id, alvo_tipo, alvo_id, imagem_url, titulo, descricao, ocultar_titulo, prioridade, ativo').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).order('prioridade', { ascending: true }).limit(2000),
  ])
  if (d.error || c.error) {
    const msg = d.error?.message ?? c.error?.message
    return { ok: true, disponivel: !faltaTabela(msg), dados: { disp: [], capas: [] } }
  }
  return { ok: true, disponivel: true, dados: { disp: (d.data ?? []) as DispSegAdmin[], capas: (c.data ?? []) as CapaSegAdmin[] } }
}

/** Valida que os alvos (módulos/aulas) são DESTE produto/tenant. */
async function alvosValidos(svc: ReturnType<typeof createAdminClient>, tenantId: string, produtoId: string, alvos: AlvoLote[]) {
  const mods = [...new Set(alvos.filter((a) => a?.tipo === 'modulo' && UUID.test(a.id)).map((a) => a.id))]
  const aulas = [...new Set(alvos.filter((a) => a?.tipo === 'aula' && UUID.test(a.id)).map((a) => a.id))]
  const ok = async (tabela: string, ids: string[]) => {
    const out: string[] = []
    for (const c of chunks(ids)) {
      const { data } = await svc.from(tabela).select('id').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false).in('id', c)
      for (const r of (data ?? []) as any[]) out.push(r.id)
    }
    return out
  }
  const [m, a] = await Promise.all([ok('simulado_produto_modulos', mods), ok('simulado_produto_modulo_itens', aulas)])
  return [...m.map((id) => ({ tipo: 'modulo' as const, id })), ...a.map((id) => ({ tipo: 'aula' as const, id }))]
}

async function segmentoValido(svc: ReturnType<typeof createAdminClient>, tenantId: string, id: string) {
  if (!id || !UUID.test(id)) return false
  const { data } = await svc.from('simulado_segmentos').select('id').eq('id', id).eq('tenant_id', tenantId).eq('deletado', false).maybeSingle()
  return !!data
}

/** Define, para vários módulos/aulas, a disponibilidade própria de UM segmento (substitui a regra anterior do mesmo segmento no alvo). */
export async function aplicarLiberacaoSegmentoAction(produtoId: string, alvos: AlvoLote[], input: { segmento_id: string; disponibilidade: unknown; prioridade?: number }): Promise<{ ok: true; alvos: number; substituidas: number; regras: DispSegAdmin[] } | { error: string }> {
  const g = await guard(true); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!Array.isArray(alvos) || !alvos.length) return { error: 'Selecione ao menos um conteúdo.' }
  if (alvos.length > 3000) return { error: 'Selecione no máximo 3.000 itens por vez.' }
  const disp = normDisp(input.disponibilidade); if (!disp) return { error: 'Disponibilidade inválida.' }
  const svc = createAdminClient()
  if (!(await segmentoValido(svc, g.tenantId, input.segmento_id))) return { error: 'Segmento não encontrado.' }
  const ok = await alvosValidos(svc, g.tenantId, produtoId, alvos)
  if (!ok.length) return { error: 'Conteúdo não encontrado neste produto.' }
  const prioridade = Math.max(0, Math.min(999, Math.floor(Number(input.prioridade) || 0)))

  const ids: string[] = []
  for (const c of chunks(ok.map((a) => a.id))) {
    const { data, error } = await svc.from('simulado_produto_disponibilidade_seg').select('id').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('segmento_id', input.segmento_id).in('alvo_id', c)
    if (error) return { error: faltaTabela(error.message) ? MIGRACAO : error.message }
    for (const r of (data ?? []) as any[]) ids.push(r.id)
  }
  for (const c of chunks(ids)) {
    const { error } = await svc.from('simulado_produto_disponibilidade_seg').delete().eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', c)
    if (error) return { error: error.message }
  }
  const agora = new Date().toISOString()
  const linhas = ok.map((a) => ({ tenant_id: g.tenantId, produto_id: produtoId, segmento_id: input.segmento_id, alvo_tipo: a.tipo, alvo_id: a.id, disponibilidade: disp, prioridade, ativo: true, criado_por: g.userId, atualizado_em: agora }))
  const criadas: DispSegAdmin[] = []
  for (const c of chunks(linhas, 200)) {
    const { data, error } = await svc.from('simulado_produto_disponibilidade_seg').insert(c).select('id, segmento_id, alvo_tipo, alvo_id, disponibilidade, prioridade, ativo')
    if (error) return { error: faltaTabela(error.message) ? MIGRACAO : error.message }
    criadas.push(...((data ?? []) as DispSegAdmin[]))
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produto_disponibilidade_seg', entidadeId: produtoId, depois: { lote: true, segmento_id: input.segmento_id, disponibilidade: disp, prioridade, alvos: ok.map((a) => a.id) }, tenantId: g.tenantId })
  await registrarRegraLog({ tenantId: g.tenantId, produtoId, camada: 'disponibilidade_seg', acao: ids.length ? 'aplicada (substituindo)' : 'aplicada', alvoRotulo: `${ok.length} conteúdo(s) · segmento ${input.segmento_id.slice(0, 8)}`, antes: { substituidas: ids.length }, depois: { segmento_id: input.segmento_id, disponibilidade: disp, prioridade }, atorId: g.userId })
  revalidar(produtoId)
  return { ok: true, alvos: ok.length, substituidas: ids.length, regras: criadas }
}

export async function removerLiberacaoSegmentoAction(produtoId: string, ids: string[]): Promise<{ ok: true; removidas: number } | { error: string }> {
  const g = await guard(true); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const lista = [...new Set((ids ?? []).filter((i) => UUID.test(i)))]
  if (!lista.length) return { error: 'Nada selecionado.' }
  const svc = createAdminClient()
  for (const c of chunks(lista)) {
    const { error } = await svc.from('simulado_produto_disponibilidade_seg').delete().eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', c)
    if (error) return { error: error.message }
  }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_produto_disponibilidade_seg', entidadeId: produtoId, depois: { ids: lista }, tenantId: g.tenantId })
  await registrarRegraLog({ tenantId: g.tenantId, produtoId, camada: 'disponibilidade_seg', acao: 'removida', alvoRotulo: `${lista.length} regra(s) de segmento`, antes: { ids: lista.slice(0, 100) }, atorId: g.userId })
  revalidar(produtoId)
  return { ok: true, removidas: lista.length }
}

export async function alternarRegraSegmentoAction(produtoId: string, tabela: 'disp' | 'capa', id: string, ativo: boolean): Promise<{ ok: true } | { error: string }> {
  const g = await guard(true); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!UUID.test(id)) return { error: 'Regra inválida.' }
  const svc = createAdminClient()
  const { error } = await svc.from(tabela === 'disp' ? 'simulado_produto_disponibilidade_seg' : 'simulado_produto_capas_seg').update({ ativo: !!ativo, atualizado_em: new Date().toISOString() }).eq('id', id).eq('tenant_id', g.tenantId).eq('produto_id', produtoId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: ativo ? 'LIBERAR' : 'BLOQUEAR', entidade: tabela === 'disp' ? 'simulado_produto_disponibilidade_seg' : 'simulado_produto_capas_seg', entidadeId: id, depois: { ativo: !!ativo }, tenantId: g.tenantId })
  if (tabela === 'disp') await registrarRegraLog({ tenantId: g.tenantId, produtoId, camada: 'disponibilidade_seg', acao: ativo ? 'ativada' : 'desativada', alvoId: id, alvoRotulo: 'regra de segmento', depois: { ativo: !!ativo }, atorId: g.userId })
  revalidar(produtoId)
  return { ok: true }
}

/** Cria/edita a capa de um segmento para um módulo (alvo_id) ou para o produto (alvo_tipo 'produto'). */
export async function salvarCapaSegmentoAction(produtoId: string, input: {
  id?: string | null; segmento_id: string; alvo_tipo: 'produto' | 'modulo'; alvo_id?: string | null
  imagem_url?: string | null; titulo?: string | null; descricao?: string | null; ocultar_titulo?: boolean; prioridade?: number
}): Promise<{ ok: true; capa: CapaSegAdmin } | { error: string }> {
  const g = await guard(true); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!['produto', 'modulo'].includes(input.alvo_tipo)) return { error: 'Alvo inválido.' }
  const svc = createAdminClient()
  if (!(await segmentoValido(svc, g.tenantId, input.segmento_id))) return { error: 'Segmento não encontrado.' }
  const alvoId = input.alvo_tipo === 'produto' ? null : (input.alvo_id ?? null)
  if (input.alvo_tipo === 'modulo') {
    if (!alvoId || !UUID.test(alvoId)) return { error: 'Escolha o módulo.' }
    const v = await alvosValidos(svc, g.tenantId, produtoId, [{ tipo: 'modulo', id: alvoId }])
    if (!v.length) return { error: 'Módulo não encontrado neste produto.' }
  }
  const imagem = (input.imagem_url ?? '').trim() || null
  const titulo = (input.titulo ?? '').trim().slice(0, 250) || null
  const descricao = (input.descricao ?? '').trim().slice(0, 2000) || null
  if (!imagem && !titulo && !descricao) return { error: 'Informe ao menos a imagem, o título ou a descrição.' }
  const row = { segmento_id: input.segmento_id, alvo_tipo: input.alvo_tipo, alvo_id: alvoId, imagem_url: imagem, titulo, descricao, ocultar_titulo: !!input.ocultar_titulo, prioridade: Math.max(0, Math.min(999, Math.floor(Number(input.prioridade) || 0))), atualizado_em: new Date().toISOString() }
  // Uma capa por (segmento, alvo): se já existe, atualiza.
  let id = input.id ?? null
  if (!id) {
    let q = svc.from('simulado_produto_capas_seg').select('id').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('segmento_id', input.segmento_id).eq('alvo_tipo', input.alvo_tipo)
    q = alvoId ? q.eq('alvo_id', alvoId) : q.is('alvo_id', null)
    const { data } = await q.maybeSingle(); id = (data as any)?.id ?? null
  }
  const q = id
    ? svc.from('simulado_produto_capas_seg').update(row).eq('id', id).eq('tenant_id', g.tenantId).eq('produto_id', produtoId)
    : svc.from('simulado_produto_capas_seg').insert({ ...row, tenant_id: g.tenantId, produto_id: produtoId, ativo: true, criado_por: g.userId })
  const { data, error } = await q.select('id, segmento_id, alvo_tipo, alvo_id, imagem_url, titulo, descricao, ocultar_titulo, prioridade, ativo').maybeSingle()
  if (error) return { error: faltaTabela(error.message) ? MIGRACAO : error.message }
  if (!data) return { error: 'Capa não encontrada.' }
  await registrarAudit({ operacao: id ? 'UPDATE' : 'INSERT', entidade: 'simulado_produto_capas_seg', entidadeId: (data as any).id, depois: { produto_id: produtoId, ...row }, tenantId: g.tenantId })
  revalidar(produtoId)
  return { ok: true, capa: data as CapaSegAdmin }
}

export async function removerCapaSegmentoAction(produtoId: string, id: string): Promise<{ ok: true } | { error: string }> {
  const g = await guard(true); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!UUID.test(id)) return { error: 'Capa inválida.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_produto_capas_seg').delete().eq('id', id).eq('tenant_id', g.tenantId).eq('produto_id', produtoId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_produto_capas_seg', entidadeId: id, tenantId: g.tenantId })
  revalidar(produtoId)
  return { ok: true }
}

// ═══════════ Acesso do público escolhido ═══════════
// Uma regra por segmento (visibilidade "mostrar", liberação, capa) só tem efeito para quem JÁ tem acesso ao produto. Estas ações
// conferem se os grupos/alunos escolhidos têm esse acesso e, se faltar, vinculam direto: grupos → "Grupos de acesso" do produto
// (itens tipo 'grupo'); alunos específicos → acesso manual ao produto (mesmo caminho de "Adicionar membros").

export interface AcessoFaltando { grupos: { id: string; nome: string }[]; alunos: { email: string; nome: string }[] }

const emailsValidos = (l: unknown): string[] => [...new Set((Array.isArray(l) ? l : []).map((e) => String(e ?? '').trim().toLowerCase()).filter((e) => e.includes('@')))].slice(0, 500)
const idsValidos = (l: unknown): string[] => [...new Set((Array.isArray(l) ? l : []).map(String).filter((i) => UUID.test(i)))].slice(0, 500)

async function gruposVinculados(svc: ReturnType<typeof createAdminClient>, tenantId: string, produtoId: string): Promise<string[]> {
  const { data } = await svc.from('simulado_produto_itens').select('item_id').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('tipo_item', 'grupo').limit(5000)
  return ((data ?? []) as any[]).map((r) => r.item_id as string)
}

export async function verificarAcessoPublicoAction(produtoId: string, input: { grupoIds?: string[]; emails?: string[] }): Promise<{ ok: true; faltando: AcessoFaltando } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const svc = createAdminClient()
  const grupoIds = idsValidos(input.grupoIds), emails = emailsValidos(input.emails)
  const ligados = new Set(await gruposVinculados(svc, g.tenantId, produtoId))
  const faltamIds = grupoIds.filter((id) => !ligados.has(id))
  const nomes = faltamIds.length ? await nomesDeRecursos(g.tenantId, 'grupo', faltamIds) : {}
  const grupos = faltamIds.map((id) => ({ id, nome: nomes[id]?.nome ?? '(grupo)' }))

  // Alunos: têm acesso se há assinatura ativa do produto OU participação válida em algum grupo vinculado.
  const alunos: { email: string; nome: string }[] = []
  const agora = new Date().toISOString()
  for (const c of chunks(emails)) {
    const { data: ests } = await svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', g.tenantId).in('email', c)
    const lista = (ests ?? []) as any[]
    if (!lista.length) continue
    const ids = lista.map((e) => e.id as string)
    const com = new Set<string>()
    const { data: ass } = await svc.from('simulado_assinaturas').select('estudante_id, expira_em, status').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('status', 'ativo').in('estudante_id', ids)
    for (const a of (ass ?? []) as any[]) if (!a.expira_em || a.expira_em > agora) com.add(a.estudante_id)
    if (ligados.size) {
      const { data: gm } = await svc.from('simulado_grupo_membros').select('estudante_id, expira_em').eq('tenant_id', g.tenantId).in('grupo_id', [...ligados].slice(0, 200)).in('estudante_id', ids)
      for (const m of (gm ?? []) as any[]) if (!m.expira_em || m.expira_em > agora) com.add(m.estudante_id)
    }
    for (const e of lista) if (!com.has(e.id)) alunos.push({ email: String(e.email).toLowerCase(), nome: e.nome ?? e.email })
  }
  return { ok: true, faltando: { grupos, alunos } }
}

export async function vincularAcessoPublicoAction(produtoId: string, input: { grupoIds?: string[]; emails?: string[] }): Promise<{ ok: true; gruposVinculados: number; alunosAdicionados: number; naoEncontrados: string[] } | { error: string }> {
  const g = await guard(true); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const svc = createAdminClient()
  const grupoIds = idsValidos(input.grupoIds), emails = emailsValidos(input.emails)
  let gruposVinc = 0
  if (grupoIds.length) {
    const ligados = new Set(await gruposVinculados(svc, g.tenantId, produtoId))
    const novos = grupoIds.filter((id) => !ligados.has(id))
    // Só grupos DESTE tenant.
    const validos: string[] = []
    for (const c of chunks(novos)) { const { data } = await svc.from('simulado_grupos').select('id').eq('tenant_id', g.tenantId).in('id', c); for (const r of (data ?? []) as any[]) validos.push(r.id) }
    for (const c of chunks(validos, 200)) {
      const { error } = await svc.from('simulado_produto_itens').insert(c.map((item_id) => ({ tenant_id: g.tenantId, produto_id: produtoId, tipo_item: 'grupo', item_id, ativo: true })))
      if (error) return { error: error.message }
    }
    gruposVinc = validos.length
  }
  let alunosAdd = 0; let naoEncontrados: string[] = []
  if (emails.length) {
    const r = await adicionarMembrosAction(produtoId, emails.join('\n'))
    if ('error' in r && r.error) return { error: String(r.error) }
    if ('adicionados' in r) { alunosAdd = r.adicionados ?? 0; naoEncontrados = r.naoEncontrados ?? [] }
  }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_produto_itens', entidadeId: produtoId, depois: { vinculo_automatico: true, grupos: grupoIds, alunos_emails: emails.length }, tenantId: g.tenantId })
  revalidar(produtoId)
  return { ok: true, gruposVinculados: gruposVinc, alunosAdicionados: alunosAdd, naoEncontrados }
}

// ═══════════ Listas do seletor de público (pop-up grande) ═══════════
/** Grupos do tenant, paginados (100), com a marca de quais JÁ estão em "Grupos de acesso" deste produto. */
export async function listarGruposSelecaoAction(produtoId: string, q: string, page: number): Promise<{ ok: true; rows: { id: string; nome: string; noProduto: boolean }[]; total: number } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const svc = createAdminClient()
  const termo = sanearBusca(String(q ?? ''), 120).replace(/_/g, ' ')
  const pg = Math.max(1, Math.floor(Number(page)) || 1), pp = 100, from = (pg - 1) * pp
  let qq = svc.from('simulado_grupos').select('id, nome', { count: 'exact' }).eq('tenant_id', g.tenantId).eq('deletado', false)
  if (termo) qq = qq.ilike('nome', `%${termo}%`)
  const { data, count, error } = await qq.order('nome', { ascending: true }).order('id', { ascending: true }).range(from, from + pp - 1)
  if (error) return { error: error.message }
  const ligados = new Set(await gruposVinculados(svc, g.tenantId, produtoId))
  return { ok: true, total: count ?? 0, rows: ((data ?? []) as any[]).map((r) => ({ id: r.id, nome: r.nome ?? '—', noProduto: ligados.has(r.id) })) }
}

/** Alunos por nome/e-mail (40 por vez) — só quem tem e-mail (é por ele que o aluno entra no público). */
export async function buscarAlunosSelecaoAction(q: string): Promise<{ ok: true; rows: { id: string; nome: string; email: string }[] } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const termo = sanearBusca(String(q ?? ''), 120).replace(/_/g, ' ')
  if (termo.length < 2) return { ok: true, rows: [] }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', g.tenantId).eq('deletado', false)
    .not('email', 'is', null).or(`nome.ilike.%${termo}%,email.ilike.%${termo}%`).order('nome', { ascending: true }).limit(40)
  return { ok: true, rows: ((data ?? []) as any[]).filter((a) => a.email).map((a) => ({ id: a.id, nome: a.nome ?? a.email, email: String(a.email) })) }
}
