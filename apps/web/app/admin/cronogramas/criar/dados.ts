'use server'

/** Carregadores de referência para as etapas do assistente (categorias, tipos, disciplinas, plataformas, pacotes). */

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { listarTiposMeta } from '@/lib/cronograma/carregar-tipos'
import type { TipoMetaDef } from '@/lib/cronograma/tipos'

async function guard() {
  if (!(await checkPermission('cronogramas:view'))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId }
}

export async function dadosPersonalizar(): Promise<{ ok: boolean; categorias?: { id: string; nome: string }[]; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_cronograma_categorias')
    .select('id, nome')
    .eq('tenant_id', g.tenantId)
    .eq('ativo', true)
    .order('ordem')
    .order('nome')
  return { ok: true, categorias: (data ?? []) as { id: string; nome: string }[] }
}

export async function dadosMetas(): Promise<{
  ok: boolean
  tipos?: TipoMetaDef[]
  disciplinas?: { id: string; nome: string }[]
  error?: string
}> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const tipos = await listarTiposMeta(g.tenantId)
  const { data: disciplinas } = await svc
    .from('simulado_disciplinas')
    .select('id, nome')
    .eq('tenant_id', g.tenantId)
    .order('ordem')
    .order('nome')
  return { ok: true, tipos, disciplinas: (disciplinas ?? []) as { id: string; nome: string }[] }
}

export async function dadosLinks(): Promise<{
  ok: boolean
  plataformas?: { id: string; nome: string; slug: string }[]
  error?: string
}> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_cronograma_plataformas')
    .select('id, nome, slug')
    .eq('tenant_id', g.tenantId)
    .eq('ativo', true)
    .order('ordem')
    .order('nome')
  return { ok: true, plataformas: (data ?? []) as { id: string; nome: string; slug: string }[] }
}

export async function dadosAcessos(): Promise<{ ok: boolean; pacotes?: { id: string; nome: string }[]; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_cronograma_pacotes')
    .select('id, nome')
    .eq('tenant_id', g.tenantId)
    .eq('ativo', true)
    .order('ordem')
    .order('nome')
  return { ok: true, pacotes: (data ?? []) as { id: string; nome: string }[] }
}
