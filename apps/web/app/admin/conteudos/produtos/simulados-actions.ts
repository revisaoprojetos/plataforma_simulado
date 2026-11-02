'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softDelete } from '@/lib/soft-delete'
import { listarPastasSimulado, FOLDER_AREA_SIMULADO } from '@/lib/produtos/estudio'

// Pastas de SIMULADO (folder_area='simulado') no navegador do Estúdio. Espelha as de produto.
// Mover/excluir o simulado em si reusa as actions de /admin/simulados (importadas no client).

async function guard(manage = false) {
  const access = await getCurrentAccess()
  const ok = access.isAdmin
    || access.permissions.includes(manage ? 'simulados:update' : 'simulados:view')
    || access.permissions.includes('simulados:create')
  if (!ok) return { error: 'Sem permissão.' as const }
  if (!access.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  return { tenantId: access.tenantId }
}

const BASE = '/admin/conteudos/produtos'
function revalidar() { revalidatePath(BASE) }

export async function criarPastaSimuladoAction(nome: string, paiId: string | null = null) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const titulo = (nome ?? '').trim(); if (!titulo) return { error: 'Informe o nome da pasta.' }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_pastas')
    .insert({ tenant_id: g.tenantId, nome: titulo, is_folder: true, pai_id: paiId ?? null, folder_area: FOLDER_AREA_SIMULADO })
    .select('id').single()
  if (error || !data) return { error: error?.message || 'Falha ao criar pasta.' }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_pastas', entidadeId: data.id, depois: { nome: titulo, folder_area: FOLDER_AREA_SIMULADO }, tenantId: g.tenantId })
  revalidar(); return { ok: true as const, id: data.id }
}

export async function renomearPastaSimuladoAction(id: string, nome: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const titulo = (nome ?? '').trim(); if (!titulo) return { error: 'Informe o nome.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ nome: titulo }).eq('id', id).eq('tenant_id', g.tenantId).eq('folder_area', FOLDER_AREA_SIMULADO)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: id, depois: { nome: titulo }, tenantId: g.tenantId })
  revalidar(); return { ok: true as const }
}

export async function moverPastaSimuladoAction(id: string, paiId: string | null) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  if (id === paiId) return { error: 'Uma pasta não pode entrar em si mesma.' }
  const svc = createAdminClient()
  if (paiId) {
    const arvore = await listarPastasSimulado(g.tenantId)
    const paiDe = new Map(arvore.map((p) => [p.id, p.pai_id]))
    let cur: string | null | undefined = paiId
    const visto = new Set<string>()
    while (cur) {
      if (cur === id) return { error: 'Não dá para mover uma pasta para dentro dela mesma.' }
      if (visto.has(cur)) break
      visto.add(cur); cur = paiDe.get(cur) ?? null
    }
  }
  const { error } = await svc.from('simulado_pastas').update({ pai_id: paiId }).eq('id', id).eq('tenant_id', g.tenantId).eq('folder_area', FOLDER_AREA_SIMULADO)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: id, depois: { pai_id: paiId }, tenantId: g.tenantId })
  revalidar(); return { ok: true as const }
}

export async function excluirPastaSimuladoAction(id: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  // Solta subpastas e simulados para a raiz (não some com o conteúdo); a pasta vai p/ a Lixeira.
  await svc.from('simulado_pastas').update({ pai_id: null }).eq('pai_id', id).eq('tenant_id', g.tenantId).eq('folder_area', FOLDER_AREA_SIMULADO)
  try { await svc.from('simulado_simulados').update({ pasta_id: null }).eq('pasta_id', id).eq('tenant_id', g.tenantId) } catch { /* coluna ausente */ }
  const { error } = await softDelete('simulado_pastas', id)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_pastas', entidadeId: id, tenantId: g.tenantId })
  revalidar(); return { ok: true as const }
}
