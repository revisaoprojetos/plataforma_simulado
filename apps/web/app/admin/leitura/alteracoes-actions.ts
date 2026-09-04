'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { diffDocumentos } from '@/lib/leitura/diff'
import type { DiffDoc, VersaoInfo } from '@/lib/leitura/diff-tipos'

async function guard() {
  if (!(await checkPermission('leitura:view'))) return { ok: false as const, error: 'Sem permissão.' }
  const a = await getCurrentAccess()
  if (!a.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: a.tenantId }
}

/** Todas as versões do conteúdo do documento (para os seletores antes/depois). */
export async function listarVersoesDocumento(
  documentoId: string,
): Promise<{ ok: boolean; versoes?: VersaoInfo[]; publicada?: number; rascunho?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: doc } = await svc
    .from('simulado_documentos')
    .select('versao, versao_publicada, versao_rascunho')
    .eq('id', documentoId)
    .eq('tenant_id', g.tenantId)
    .maybeSingle()
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  const pub = (doc as any).versao_publicada ?? (doc as any).versao ?? 1
  const rasc = (doc as any).versao_rascunho ?? pub
  const { data: conts } = await svc
    .from('simulado_documento_conteudos')
    .select('versao, estado, publicado_em')
    .eq('documento_id', documentoId)
    .eq('tenant_id', g.tenantId)
    .order('versao', { ascending: false })
  const versoes: VersaoInfo[] = (conts ?? []).map((c: any) => ({
    versao: c.versao,
    estado: c.estado ?? 'publicada',
    publicadoEm: c.publicado_em ?? null,
    atual: c.versao === pub,
    rascunho: c.versao === rasc && rasc > pub,
  }))
  return { ok: true, versoes, publicada: pub, rascunho: rasc }
}

/** Diff entre duas versões (HTML já sanitizado no banco). */
export async function carregarDiffDocumento(
  documentoId: string,
  vAntes: number,
  vDepois: number,
): Promise<{ ok: boolean; diff?: DiffDoc; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_documento_conteudos')
    .select('versao, html')
    .eq('documento_id', documentoId)
    .eq('tenant_id', g.tenantId)
    .in('versao', [...new Set([vAntes, vDepois])])
  const porV = new Map<number, string>((data ?? []).map((c: any) => [c.versao, (c.html ?? '') as string]))
  return { ok: true, diff: diffDocumentos(porV.get(vAntes) ?? '', porV.get(vDepois) ?? '') }
}
