'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { rebuildCacheTenant } from '@/lib/gamificacao/cache'
import { DEFAULT_CONFIG, type XpRegras, type NivelCurva, type LigaDef, type MissaoDef, type ConquistaDef } from '@/lib/gamificacao/config'

const SEM_TENANT = '00000000-0000-0000-0000-000000000000'

// Carrega a config atual (ou os defaults) e faz merge das colunas alteradas, preservando o resto.
async function salvarSlice(patch: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }> {
  if (!(await checkPermission('gamificacao:manage'))) return { error: 'Você não tem permissão para gerenciar a gamificação.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido.' }
  const svc = createAdminClient()

  const { data: antes } = await svc.from('simulado_gamificacao_config').select('*').eq('tenant_id', tenantId).maybeSingle()
  const base: any = antes ?? { tenant_id: tenantId, ...DEFAULT_CONFIG }
  const row: any = { ...base, ...patch, tenant_id: tenantId }
  delete row.id; delete row.created_at; delete row.updated_at

  const { error } = await svc.from('simulado_gamificacao_config').upsert(row, { onConflict: 'tenant_id' })
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_gamificacao_config', entidadeId: tenantId, antes, depois: row })
  revalidatePath('/admin/gamificacao')
  return { ok: true }
}

// Lê o xp_regras atual (p/ merge nested — XP&Níveis e Regras gerais editam fatias diferentes dele).
async function xpRegrasAtual(svc: any, tenantId: string): Promise<XpRegras> {
  const { data } = await svc.from('simulado_gamificacao_config').select('xp_regras').eq('tenant_id', tenantId).maybeSingle()
  return { ...DEFAULT_CONFIG.xp_regras, ...(data?.xp_regras ?? {}) }
}

export async function salvarXpNiveis(d: { simulado: XpRegras['simulado']; pratica: XpRegras['pratica']; nivel_curva: NivelCurva }) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido.' }
  const xp = await xpRegrasAtual(createAdminClient(), tenantId)
  return salvarSlice({ xp_regras: { ...xp, simulado: d.simulado, pratica: d.pratica }, nivel_curva: d.nivel_curva })
}

export async function salvarRegrasGerais(d: { ativo: boolean; timezone: string; streak: XpRegras['streak']; chest: XpRegras['chest'] }) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido.' }
  const xp = await xpRegrasAtual(createAdminClient(), tenantId)
  return salvarSlice({ ativo: d.ativo, timezone: d.timezone, xp_regras: { ...xp, streak: d.streak, chest: d.chest } })
}

export async function salvarLigas(ligas: LigaDef[]) {
  return salvarSlice({ ligas: [...ligas].sort((a, b) => a.xp_min - b.xp_min) })
}

export async function salvarConquistas(conquistas_def: ConquistaDef[]) {
  return salvarSlice({ conquistas_def })
}

export async function salvarMissoes(missoes_def: MissaoDef[]) {
  return salvarSlice({ missoes_def })
}

// Recalcula nível/liga de TODOS os alunos a partir do ledger (usar após mudar limites de liga/curva).
export async function rebuildGamificacao(): Promise<{ ok?: boolean; error?: string; atualizados?: number }> {
  if (!(await checkPermission('gamificacao:manage'))) return { error: 'Você não tem permissão para gerenciar a gamificação.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const n = await rebuildCacheTenant(svc, tenantId)
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_gamificacao_config', entidadeId: tenantId, depois: { rebuild: n } })
  revalidatePath('/admin/gamificacao')
  return { ok: true, atualizados: n }
}
