import { registrarRegraLog } from '@/lib/produtos/regras-log'
import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'

// Guarda e log compartilhados das ações/rotas das abas Cronogramas e Regras (arquivo SEM 'use server').

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function guardTrilhas(perm: 'cronogramas:view' | 'cronogramas:update', produtoId: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  const tenantId = access.tenantId
  if (!tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  if (!UUID_RE.test(produtoId)) return { ok: false as const, error: 'Produto inválido.' }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_produtos').select('id').eq('tenant_id', tenantId).eq('id', produtoId).maybeSingle()
  if (!data) return { ok: false as const, error: 'Produto não encontrado.' }
  return { ok: true as const, svc, tenantId, atorId: access.userId ?? null }
}

/** Linha em simulado_liberacao_log (nunca interrompe a operação). */
export async function logarLiberacao(g: GuardTrilhas, produtoId: string, l: { origem?: 'manual' | 'automatico' | 'importacao'; acao: string; alvoTipo?: string; alvoId?: string | null; detalhe?: Record<string, unknown> }) {
  try {
    await g.svc.from('simulado_liberacao_log').insert({ tenant_id: g.tenantId, produto_id: produtoId, origem: l.origem ?? 'manual', acao: l.acao, alvo_tipo: l.alvoTipo ?? null, alvo_id: l.alvoId ?? null, detalhe: l.detalhe ?? {}, feito_por: g.atorId })
  } catch { /* log é best-effort */ }
  // Log unificado das regras do produto (aba Regras › Histórico) — só mudanças manuais de cronograma de referência.
  if ((l.origem ?? 'manual') === 'manual') {
    const d = l.detalhe ?? {}
    await registrarRegraLog({ tenantId: g.tenantId, produtoId, camada: 'cronograma', acao: l.acao.replace(/_/g, ' '), alvoRotulo: typeof d.nome === 'string' ? d.nome : l.alvoTipo ?? null, alvoId: l.alvoId ?? null, antes: (d as { antes?: unknown }).antes, depois: (d as { depois?: unknown }).depois ?? d, atorId: g.atorId })
  }
}


export type GuardTrilhas = Extract<Awaited<ReturnType<typeof guardTrilhas>>, { ok: true }>
