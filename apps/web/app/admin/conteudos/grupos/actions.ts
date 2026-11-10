'use server'
import type { BancoVinculavel } from './actions-tipos'

/**
 * Estúdio de Conteúdo · Acesso & Comercial — ações da área Grupos de acesso.
 *
 * REUSO (não duplica): o CRUD de grupo e o gerenciamento de membros vivem em
 * `@/app/admin/grupos/actions` (criarGrupo, editarGrupo, salvarConfigGrupo, excluirGrupo,
 * adicionarMembros, importarMembros, removerMembro, buscarNaoMembros, engajamentoGrupo) — os
 * clientes importam-nos DIRETO. Aqui ficam só as ações NOVAS desta área:
 *   - validade por membro (`expira_em`) em lote — "Mudar validade";
 *   - lista de membros server-driven + export XLSX (rota /api/admin/conteudos/grupos/export);
 *   - vincular grupo a BANCOS (elo grupo→banco, reusa `propagarGrupoAosBancos`).
 *
 * Isolamento manual por tenant (service role bypassa RLS) + `registrarAudit` em toda escrita.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { formatBrt } from '@/lib/brt'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { propagarGrupoAosBancos } from '@/lib/simulado/propagar-grupo'
import { ehPastaBanco } from '@/lib/simulado/pasta-area'
import { consultarMembros, normalizarFiltros, type MembroLinha } from './membros-query'

async function guard() {
  const a = await getCurrentAccess()
  if (!a.tenantId || !(a.isAdmin || a.permissions.includes('grupos:view'))) return { ok: false as const, error: 'Sem permissão.' }
  return { ok: true as const, tenantId: a.tenantId }
}

/** Confirma que o grupo é do tenant do ator (o id vem do cliente). */
async function grupoDoTenant(svc: ReturnType<typeof createAdminClient>, tenantId: string, grupoId: string) {
  const { data } = await svc.from('simulado_grupos').select('id, nome').eq('id', grupoId).eq('tenant_id', tenantId).maybeSingle()
  return data as { id: string; nome: string } | null
}

// ───────────────────────── Validade por membro (em lote) ─────────────────────────

/**
 * Define/limpa a validade (`expira_em`) de membros do grupo em LOTE. `expiraEmIso = null` remove a
 * validade (vitalício no grupo). Tolerante: se a coluna não existe, pede a migração.
 */
export async function definirValidadeMembros(
  grupoId: string, estudanteIds: string[], expiraEmIso: string | null,
): Promise<{ ok: boolean; atualizados?: number; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  const ids = [...new Set((estudanteIds ?? []).filter(Boolean))]
  if (!ids.length) return { ok: false, error: 'Selecione ao menos um membro.' }
  if (expiraEmIso && isNaN(+new Date(expiraEmIso))) return { ok: false, error: 'Data de validade inválida.' }

  const svc = createAdminClient()
  const grp = await grupoDoTenant(svc, g.tenantId, grupoId)
  if (!grp) return { ok: false, error: 'Grupo não encontrado.' }

  let atualizados = 0
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300)
    const { data, error } = await svc.from('simulado_grupo_membros')
      .update({ expira_em: expiraEmIso }).eq('grupo_id', grupoId).eq('tenant_id', g.tenantId).in('estudante_id', chunk)
      .select('estudante_id')
    if (error) {
      if (/expira_em|column|does not exist|schema cache/i.test(error.message))
        return { ok: false, error: 'Validade por membro indisponível: aplique a migração 20261031040000_grupo_membro_validade.' }
      return { ok: false, error: error.message }
    }
    atualizados += data?.length ?? 0
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_grupos', entidadeId: grupoId, depois: { validade_alterada: atualizados, expira_em: expiraEmIso } })
  return { ok: true, atualizados }
}

// ───────────────────────── Lista de membros (server-driven) ─────────────────────────

/** Página de membros do grupo; busca/situação/entrou/ordenação/paginação aplicadas no servidor. */
export async function listarMembrosGrupo(
  grupoId: string, filtros: Record<string, unknown>,
): Promise<{ ok: boolean; rows?: MembroLinha[]; total?: number; error?: string }> {
  const g = await guard(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  if (!(await grupoDoTenant(svc, g.tenantId, grupoId))) return { ok: false, error: 'Grupo não encontrado.' }
  try {
    const r = await consultarMembros(g.tenantId, grupoId, normalizarFiltros(filtros))
    return { ok: true, rows: r.rows, total: r.total }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha ao listar membros.' }
  }
}

/** Export dos membros do grupo (CSV, respeitando os filtros atuais). Usado pelo botão "Exportar". */
export async function exportarMembrosCsv(
  grupoId: string, filtros?: Record<string, unknown>,
): Promise<{ ok: boolean; csv?: string; filename?: string; total?: number; error?: string }> {
  const g = await guard(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const grp = await grupoDoTenant(svc, g.tenantId, grupoId)
  if (!grp) return { ok: false, error: 'Grupo não encontrado.' }
  try {
    const { rows } = await consultarMembros(g.tenantId, grupoId, normalizarFiltros(filtros ?? {}), { todos: true })
    const esc = (v: string | null) => { const s = (v ?? '').replace(/"/g, '""'); return /[";\n\r]/.test(s) ? `"${s}"` : s }
    const dt = (iso: string | null) => (iso ? formatBrt(iso) ?? '' : '')
    const situacao = (e: string | null) => (!e ? 'Vitalício' : +new Date(e) > Date.now() ? 'Ativo' : 'Expirado')
    const head = ['Nome', 'E-mail', 'Classificação', 'Situação', 'Validade', 'Entrou em']
    const linhas = rows.map((m) => [m.nome, m.email, m.classificacao, situacao(m.expiraEm), dt(m.expiraEm), dt(m.entrouEm)].map(esc).join(';'))
    const csv = '﻿' + [head.join(';'), ...linhas].join('\r\n')
    const filename = (`membros_${grp.nome}`.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 60) || 'membros') + '.csv'
    return { ok: true, csv, filename, total: rows.length }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha ao exportar.' }
  }
}

/** Define/limpa a validade de TODOS os membros do grupo (ação "Tempo de acesso" da aba Informações). */
export async function definirValidadeTodosMembros(grupoId: string, expiraEmIso: string | null): Promise<{ ok: boolean; atualizados?: number; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  if (expiraEmIso && isNaN(+new Date(expiraEmIso))) return { ok: false, error: 'Data de validade inválida.' }
  const svc = createAdminClient()
  const grp = await grupoDoTenant(svc, g.tenantId, grupoId)
  if (!grp) return { ok: false, error: 'Grupo não encontrado.' }
  const { data, error } = await svc.from('simulado_grupo_membros')
    .update({ expira_em: expiraEmIso }).eq('grupo_id', grupoId).eq('tenant_id', g.tenantId).select('estudante_id')
  if (error) {
    if (/expira_em|column|does not exist|schema cache/i.test(error.message))
      return { ok: false, error: 'Validade por membro indisponível: aplique a migração 20261031040000_grupo_membro_validade.' }
    return { ok: false, error: error.message }
  }
  const n = data?.length ?? 0
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_grupos', entidadeId: grupoId, depois: { validade_alterada: n, expira_em: expiraEmIso, todos: true } })
  return { ok: true, atualizados: n }
}

// ───────────────────────── Vincular grupo a BANCOS (elo grupo→banco) ─────────────────────────


/** Lista os bancos de questões do tenant + marca quais já estão vinculados a este grupo. */
export async function buscarBancosVinculaveis(grupoId: string, opts?: { q?: string; soVinculados?: boolean }): Promise<{ ok: boolean; itens?: BancoVinculavel[]; total?: number; error?: string }> {
  const g = await guard(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  if (!(await grupoDoTenant(svc, g.tenantId, grupoId))) return { ok: false, error: 'Grupo não encontrado.' }

  // Bancos = pastas de área 'banco' (allowlist via ehPastaBanco), tolerante a is_folder/folder_area.
  let pastas: any[] = []
  try {
    pastas = await fetchAll<any>(() => svc.from('simulado_pastas').select('id, nome, folder_area, is_folder').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome', { ascending: true }))
  } catch {
    try { pastas = await fetchAll<any>(() => svc.from('simulado_pastas').select('id, nome, folder_area').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome', { ascending: true })) } catch { pastas = [] }
  }
  const bancos = pastas.filter((p) => (p.is_folder === false || p.is_folder == null) && ehPastaBanco(p.folder_area))

  const links = await fetchAll<{ pasta_id: string }>(() => svc.from('simulado_pasta_grupos').select('pasta_id').eq('grupo_id', grupoId).eq('tenant_id', g.tenantId).order('pasta_id', { ascending: true })).catch(() => [])
  const linked = new Set((links as any[]).map((l) => l.pasta_id))
  const todos = bancos.map((b) => ({ id: b.id, nome: b.nome as string, vinculado: linked.has(b.id) }))
  const q = (opts?.q ?? '').trim().toLowerCase()
  const itens = todos.filter((b) => (!q || b.nome.toLowerCase().includes(q)) && (!opts?.soVinculados || b.vinculado))
  return { ok: true, itens, total: todos.length }
}

/**
 * Aplica a seleção de bancos do grupo. ADICIONA vínculos novos (e propaga os membros ao banco via
 * `propagarGrupoAosBancos` → entra na pasta + matricula nos simulados que herdam). REMOÇÃO retira
 * apenas o VÍNCULO de auto-sync (`simulado_pasta_grupos`) — NÃO remove acesso já concedido, por
 * segurança (nunca tirar acesso de aluno em prova ao vivo; a limpeza de órfãos é da área de bancos).
 */
export async function vincularGrupoBancos(grupoId: string, bancoIdsSelecionados: string[]): Promise<{ ok: boolean; vinculados?: number; desvinculados?: number; membrosPropagados?: number; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  const svc = createAdminClient()
  const grp = await grupoDoTenant(svc, g.tenantId, grupoId)
  if (!grp) return { ok: false, error: 'Grupo não encontrado.' }

  // Só bancos válidos do tenant.
  const disp = await buscarBancosVinculaveis(grupoId)
  if (!disp.ok || !disp.itens) return { ok: false, error: disp.error ?? 'Falha ao listar bancos.' }
  const validos = new Set(disp.itens.map((b) => b.id))
  const atuais = new Set(disp.itens.filter((b) => b.vinculado).map((b) => b.id))
  const desejados = new Set((bancoIdsSelecionados ?? []).filter((id) => validos.has(id)))

  const adicionar = [...desejados].filter((id) => !atuais.has(id))
  const remover = [...atuais].filter((id) => !desejados.has(id))
  if (!adicionar.length && !remover.length) return { ok: true, vinculados: 0, desvinculados: 0, membrosPropagados: 0 }

  // Membros do grupo (para propagar aos bancos recém-vinculados).
  const membros = await fetchAll<{ estudante_id: string }>(() => svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', grupoId).eq('tenant_id', g.tenantId).order('estudante_id', { ascending: true }))
  const estIds = [...new Set(membros.map((m) => m.estudante_id).filter(Boolean))]

  let vinculados = 0
  for (const pastaId of adicionar) {
    const { error } = await svc.from('simulado_pasta_grupos').upsert({ tenant_id: g.tenantId, pasta_id: pastaId, grupo_id: grupoId }, { onConflict: 'pasta_id,grupo_id' })
    if (error) { if (/pasta_grupos|relation|does not exist/i.test(error.message)) return { ok: false, error: 'Rode a migration simulado_pasta_grupos no banco.' }; return { ok: false, error: error.message } }
    vinculados++
    if (estIds.length) await propagarGrupoAosBancos(svc, g.tenantId, grupoId, estIds)
  }

  let desvinculados = 0
  for (const pastaId of remover) {
    const { error } = await svc.from('simulado_pasta_grupos').delete().eq('tenant_id', g.tenantId).eq('pasta_id', pastaId).eq('grupo_id', grupoId)
    if (error) return { ok: false, error: error.message }
    desvinculados++
  }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_grupos', entidadeId: grupoId, depois: { bancos_vinculados: vinculados, bancos_desvinculados: desvinculados } })
  return { ok: true, vinculados, desvinculados, membrosPropagados: adicionar.length ? estIds.length : 0 }
}

// ───────────────────────── Duplicar / pastas / desvincular ─────────────────────────

/** Pastas (grupos mestre) do tenant — destinos válidos do "Mover". */
export async function listarPastasGrupo(): Promise<{ ok: boolean; itens?: { id: string; nome: string }[]; error?: string }> {
  const g = await guard(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_grupos').select('id, nome').eq('tenant_id', g.tenantId).eq('deletado', false).eq('is_mestre', true).order('nome', { ascending: true })
  if (error) return { ok: false, error: /is_mestre/i.test(error.message) ? 'Grupo mestre indisponível no banco.' : error.message }
  return { ok: true, itens: (data ?? []).map((r: any) => ({ id: r.id, nome: r.nome })) }
}

/** Duplica o grupo (nome "… (cópia)", mesma cor/pasta, e copia os membros com a validade). Não copia vínculos de bancos/integrações. */
export async function duplicarGrupo(grupoId: string): Promise<{ ok: boolean; id?: string; membros?: number; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  const svc = createAdminClient()
  const { data: orig } = await svc.from('simulado_grupos').select('*').eq('id', grupoId).eq('tenant_id', g.tenantId).eq('deletado', false).maybeSingle()
  if (!orig) return { ok: false, error: 'Grupo não encontrado.' }
  const o = orig as any
  const novo: any = { tenant_id: g.tenantId, nome: `${o.nome} (cópia)` }
  if (o.cor) novo.cor = o.cor
  if (o.descricao) novo.descricao = o.descricao
  if (o.pai_id) novo.pai_id = o.pai_id
  if (o.is_mestre) novo.is_mestre = true
  const ins = await svc.from('simulado_grupos').insert(novo).select('id').single()
  if (ins.error) return { ok: false, error: ins.error.message }
  const novoId = ins.data!.id as string
  let copiados = 0
  if (!o.is_mestre) {
    let ms: any[] = []
    try {
      ms = await fetchAll<any>(() => svc.from('simulado_grupo_membros').select('estudante_id, expira_em').eq('grupo_id', grupoId).eq('tenant_id', g.tenantId).order('estudante_id', { ascending: true }))
    } catch {
      ms = await fetchAll<any>(() => svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', grupoId).eq('tenant_id', g.tenantId).order('estudante_id', { ascending: true }))
    }
    for (let i = 0; i < ms.length; i += 300) {
      const chunk = ms.slice(i, i + 300).map((m) => ({ tenant_id: g.tenantId, grupo_id: novoId, estudante_id: m.estudante_id, ...(m.expira_em ? { expira_em: m.expira_em } : {}) }))
      const { error } = await svc.from('simulado_grupo_membros').insert(chunk)
      if (error) return { ok: false, id: novoId, error: `Grupo criado, mas falhou ao copiar membros: ${error.message}` }
      copiados += chunk.length
    }
  }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_grupos', entidadeId: novoId, depois: { duplicado_de: grupoId, membros_copiados: copiados } })
  return { ok: true, id: novoId, membros: copiados }
}

/** Remove só o VÍNCULO grupo→banco (não retira acesso já concedido). */
export async function desvincularGrupoBancos(grupoId: string, bancoIds: string[]): Promise<{ ok: boolean; desvinculados?: number; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  const ids = [...new Set((bancoIds ?? []).filter(Boolean))]
  if (!ids.length) return { ok: false, error: 'Selecione ao menos um produto.' }
  const svc = createAdminClient()
  if (!(await grupoDoTenant(svc, g.tenantId, grupoId))) return { ok: false, error: 'Grupo não encontrado.' }
  const { data, error } = await svc.from('simulado_pasta_grupos').delete().eq('tenant_id', g.tenantId).eq('grupo_id', grupoId).in('pasta_id', ids).select('pasta_id')
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_grupos', entidadeId: grupoId, depois: { bancos_desvinculados: data?.length ?? 0 } })
  return { ok: true, desvinculados: data?.length ?? 0 }
}
