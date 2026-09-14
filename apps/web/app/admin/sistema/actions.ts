'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { normalizarManutencao, type ManutencaoSistema } from '@/lib/sistema/manutencao'
import {
  normalizarManutencaoAreas, normalizarMapaAreas, normalizarLiberados,
  AREAS_MANUTENCAO, AREAS_MANUTENCAO_ALUNO, type ManutencaoAreas, type ManutencaoLiberados,
} from '@/lib/sistema/manutencao-areas'

/** Salva a manutenção da plataforma em tenants.tema.manutencao_sistema (merge, sem apagar o tema). */
export async function salvarManutencaoSistema(input: ManutencaoSistema) {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('configuracoes:manage'))) {
    return { error: 'Sem permissão para alterar a manutenção do sistema.' }
  }

  const svc = createAdminClient()
  // SEM fallback p/ "1º ativo" — poderia gravar no tenant errado. Sem tenant → aborta.
  const tenantId = access.tenantId
  if (!tenantId) return { error: 'Tenant não resolvido — recarregue a página.' }

  const { data: anterior } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
  const temaAnterior = (anterior?.tema as Record<string, unknown>) ?? {}
  const cfg = normalizarManutencao(input)
  const merged = { ...temaAnterior, manutencao_sistema: cfg }

  const { error } = await svc.from('simulado_tenants').update({ tema: merged }).eq('id', tenantId)
  if (error) return { error: `Erro ao salvar: ${error.message}` }

  await registrarAudit({
    operacao: cfg.ativo ? 'BLOQUEAR' : 'LIBERAR',
    entidade: 'simulado_tenants',
    entidadeId: tenantId,
    antes: { manutencao_sistema: (temaAnterior as Record<string, unknown>).manutencao_sistema ?? null },
    depois: { manutencao_sistema: cfg },
    tenantId,
  })

  revalidatePath('/', 'layout')
  revalidatePath('/admin/sistema')
  return { ok: true }
}

/**
 * Salva o mapa de áreas do ADMIN em manutenção + o allowlist (admins liberados) em
 * tenants.tema.manutencao_areas / .manutencao_areas_liberados (merge, sem apagar o tema).
 */
export async function salvarManutencaoAreas(input: ManutencaoAreas, liberados?: ManutencaoLiberados) {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('configuracoes:manage'))) {
    return { error: 'Sem permissão para alterar a manutenção do sistema.' }
  }

  const svc = createAdminClient()
  const tenantId = access.tenantId
  if (!tenantId) return { error: 'Tenant não resolvido — recarregue a página.' }

  const { data: anterior } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
  const temaAnterior = (anterior?.tema as Record<string, unknown>) ?? {}
  const cfg = normalizarManutencaoAreas(input)
  const lib = normalizarLiberados(liberados ?? (temaAnterior.manutencao_areas_liberados as unknown), AREAS_MANUTENCAO)
  const merged = { ...temaAnterior, manutencao_areas: cfg, manutencao_areas_liberados: lib }

  const { error } = await svc.from('simulado_tenants').update({ tema: merged }).eq('id', tenantId)
  if (error) return { error: `Erro ao salvar: ${error.message}` }

  const algumBloqueado = Object.values(cfg).some(Boolean)
  await registrarAudit({
    operacao: algumBloqueado ? 'BLOQUEAR' : 'LIBERAR',
    entidade: 'simulado_tenants',
    entidadeId: tenantId,
    antes: { manutencao_areas: (temaAnterior as Record<string, unknown>).manutencao_areas ?? null },
    depois: { manutencao_areas: cfg, manutencao_areas_liberados: lib },
    tenantId,
  })

  revalidatePath('/', 'layout')
  revalidatePath('/admin/sistema')
  return { ok: true }
}

/**
 * Salva o mapa de áreas do ALUNO em manutenção + o allowlist (estudantes liberados) em
 * tenants.tema.manutencao_aluno / .manutencao_aluno_liberados (merge, sem apagar o tema).
 */
export async function salvarManutencaoAluno(input: ManutencaoAreas, liberados: ManutencaoLiberados) {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('configuracoes:manage'))) {
    return { error: 'Sem permissão para alterar a manutenção do sistema.' }
  }

  const svc = createAdminClient()
  const tenantId = access.tenantId
  if (!tenantId) return { error: 'Tenant não resolvido — recarregue a página.' }

  const { data: anterior } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
  const temaAnterior = (anterior?.tema as Record<string, unknown>) ?? {}
  const cfg = normalizarMapaAreas(input, AREAS_MANUTENCAO_ALUNO)
  const lib = normalizarLiberados(liberados, AREAS_MANUTENCAO_ALUNO)
  const merged = { ...temaAnterior, manutencao_aluno: cfg, manutencao_aluno_liberados: lib }

  const { error } = await svc.from('simulado_tenants').update({ tema: merged }).eq('id', tenantId)
  if (error) return { error: `Erro ao salvar: ${error.message}` }

  const algumBloqueado = Object.values(cfg).some(Boolean)
  await registrarAudit({
    operacao: algumBloqueado ? 'BLOQUEAR' : 'LIBERAR',
    entidade: 'simulado_tenants',
    entidadeId: tenantId,
    antes: { manutencao_aluno: (temaAnterior as Record<string, unknown>).manutencao_aluno ?? null },
    depois: { manutencao_aluno: cfg, manutencao_aluno_liberados: lib },
    tenantId,
  })

  revalidatePath('/', 'layout')
  revalidatePath('/admin/sistema')
  return { ok: true }
}

export type PessoaLiberada = { id: string; nome: string; email: string | null }

/** Resolve nome/email dos ADMINS (user_ids) para os chips do allowlist. */
export async function resolverNomesAdmins(ids: string[]): Promise<PessoaLiberada[]> {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('configuracoes:view'))) return []
  const limpos = [...new Set(ids.filter(Boolean))]
  if (!limpos.length) return []
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_users').select('id, nome, email').in('id', limpos)
  return (data ?? []).map((u: any) => ({ id: u.id, nome: u.nome ?? u.email ?? 'Administrador', email: u.email ?? null }))
}

/** Busca estudantes (nome/e-mail) p/ o allowlist de manutenção — guardada por permissão de CONFIGURAÇÕES. */
export async function buscarEstudantesLiberacao(busca: string): Promise<PessoaLiberada[]> {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('configuracoes:manage') || access.permissions.includes('configuracoes:view'))) return []
  const tenantId = access.tenantId
  if (!tenantId) return []
  const svc = createAdminClient()
  const safe = busca.replace(/[,()%*]/g, ' ').trim()
  let q = svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', tenantId).eq('deletado', false)
  if (safe) q = q.or(`nome.ilike.%${safe}%,email.ilike.%${safe}%`)
  const { data } = await q.order('nome', { ascending: true }).limit(40)
  return (data ?? []).map((e: any) => ({ id: e.id, nome: e.nome ?? 'Estudante', email: e.email ?? null }))
}

/** Resolve nome/email dos ESTUDANTES (estudante_ids) para os chips do allowlist. */
export async function resolverNomesEstudantes(ids: string[]): Promise<PessoaLiberada[]> {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('configuracoes:view'))) return []
  const tenantId = access.tenantId
  const limpos = [...new Set(ids.filter(Boolean))]
  if (!limpos.length || !tenantId) return []
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', tenantId).in('id', limpos)
  return (data ?? []).map((e: any) => ({ id: e.id, nome: e.nome ?? e.email ?? 'Estudante', email: e.email ?? null }))
}
