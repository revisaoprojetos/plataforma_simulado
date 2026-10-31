'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { normalizarEmailsTestador } from '@/lib/sistema/testadores-globais'

/** Só admin/`configuracoes:manage` mexe na lista; sem tenant resolvido, aborta (não grava no tenant errado). */
async function guard() {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('configuracoes:manage'))) {
    return { error: 'Sem permissão para gerenciar testadores.' as const }
  }
  if (!access.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  return { tenantId: access.tenantId }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Lê a lista atual (caminho jsonb, sem puxar o tema inteiro). */
async function lerLista(tenantId: string): Promise<string[]> {
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_tenants').select('t:tema->testadores_globais').eq('id', tenantId).maybeSingle()
  return normalizarEmailsTestador((data as { t?: unknown } | null)?.t)
}

/** Grava a lista (merge no tema, sem apagar o resto) + auditoria + revalidação do portal. */
async function salvarLista(tenantId: string, emails: string[]) {
  const svc = createAdminClient()
  const { data: anterior } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
  const temaAnterior = (anterior?.tema as Record<string, unknown>) ?? {}
  const merged = { ...temaAnterior, testadores_globais: emails }
  const { error } = await svc.from('simulado_tenants').update({ tema: merged }).eq('id', tenantId)
  if (error) return { error: `Erro ao salvar: ${error.message}` }
  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_tenants',
    entidadeId: tenantId,
    antes: { testadores_globais: (temaAnterior as Record<string, unknown>).testadores_globais ?? null },
    depois: { testadores_globais: emails },
    tenantId,
  })
  // O gate do portal lê a lista do tema por request → revalida o layout p/ o acesso valer já.
  revalidatePath('/admin/testadores')
  revalidatePath('/', 'layout')
  return { ok: true as const, emails }
}

export async function listarTestadoresGlobaisAction() {
  const g = await guard()
  if ('error' in g) return { error: g.error }
  return { ok: true as const, emails: await lerLista(g.tenantId) }
}

export async function adicionarTestadorGlobalAction(emailBruto: string) {
  const g = await guard()
  if ('error' in g) return { error: g.error }
  const email = (emailBruto || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return { error: 'E-mail inválido.' }
  const atual = await lerLista(g.tenantId)
  if (atual.includes(email)) return { ok: true as const, emails: atual } // idempotente
  return salvarLista(g.tenantId, normalizarEmailsTestador([...atual, email]))
}

export async function removerTestadorGlobalAction(emailBruto: string) {
  const g = await guard()
  if ('error' in g) return { error: g.error }
  const email = (emailBruto || '').trim().toLowerCase()
  const atual = await lerLista(g.tenantId)
  return salvarLista(g.tenantId, atual.filter((e) => e !== email))
}
