'use server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import type { VersaoDoc } from '@/lib/admin-revisao/biblioteca-tipos'

// Biblioteca (Plataforma Revisão). Só async exportadas ('use server'). Visibilidade, troca de arquivo e exclusão
// REUSAM as actions já existentes da Biblioteca (definirVisibilidadeConteudo / publicarNovaVersao / removerDocumento),
// chamadas direto do client — aqui só o que faltava: o histórico de versões.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function listarVersoesDocAction(documentoId: string): Promise<{ ok: boolean; error?: string; versoes?: VersaoDoc[] }> {
  if (!(await checkPermission('configuracoes:view'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  if (!UUID.test(documentoId)) return { ok: false, error: 'Documento inválido.' }
  const svc = createAdminClient()
  const [doc, vers] = await Promise.all([
    svc.from('simulado_conteudo_documentos').select('versao_atual_id').eq('tenant_id', access.tenantId).eq('id', documentoId).maybeSingle(),
    svc.from('simulado_conteudo_versoes').select('id, numero, origem, criada_em, paginas').eq('tenant_id', access.tenantId).eq('documento_id', documentoId).order('numero', { ascending: false }).limit(50),
  ])
  if (vers.error) return { ok: false, error: vers.error.message }
  const atual = (doc.data as any)?.versao_atual_id ?? null
  return {
    ok: true,
    versoes: ((vers.data ?? []) as any[]).map((v) => ({ numero: v.numero, origem: v.origem, criadaEm: v.criada_em, paginas: v.paginas ?? null, atual: v.id === atual })),
  }
}
