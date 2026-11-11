'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

// Videoteca (Plataforma Revisão). Só async exportadas. Visibilidade reusa definirVisibilidadeConteudo (Biblioteca).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Guarda a duração (min) do vídeo em simulado_conteudo_documentos.metadados.duracao_min (doc-vídeo ou PDFull com vídeo por link). */
export async function definirDuracaoVideoAction(documentoId: string, minutos: number | null): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('configuracoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  if (!UUID.test(documentoId)) return { ok: false, error: 'Documento inválido.' }
  const m = minutos == null ? null : Math.round(Number(minutos))
  if (m != null && !(m >= 1 && m <= 1440)) return { ok: false, error: 'Informe a duração em minutos (1 a 1.440).' }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_conteudo_documentos').select('metadados').eq('tenant_id', access.tenantId).eq('id', documentoId).maybeSingle()
  if (error || !data) return { ok: false, error: error?.message ?? 'Documento não encontrado.' }
  const meta: Record<string, unknown> = { ...(((data as any).metadados as Record<string, unknown>) ?? {}) }
  if (m == null) delete meta.duracao_min; else meta.duracao_min = m
  const up = await svc.from('simulado_conteudo_documentos').update({ metadados: meta, atualizado_em: new Date().toISOString() }).eq('tenant_id', access.tenantId).eq('id', documentoId)
  if (up.error) return { ok: false, error: up.error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_conteudo_documentos', entidadeId: documentoId, atorId: access.userId ?? null, tenantId: access.tenantId, depois: { duracao_min: m } }).catch(() => {})
  revalidatePath('/admin/revisao/videoteca')
  return { ok: true }
}
