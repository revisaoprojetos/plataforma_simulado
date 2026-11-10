'use server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { normalizarMetadados, type VideoDoc } from '@/lib/conteudo/metadados'
import { embedDeLink } from '@/lib/conteudo/video-leitura'

// Vídeo da leitura (aba "Vídeo" do gerenciamento do conteúdo). Só exporta funções async (regra do 'use server').
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function guard(acao: 'view' | 'update') {
  if (!(await checkPermission(acao === 'view' ? 'configuracoes:view' : 'configuracoes:update'))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

export async function carregarVideoAction(documentoId: string): Promise<{ ok: true; video: VideoDoc | null; videos: { id: string; titulo: string }[] } | { ok: false; error: string }> {
  const g = await guard('view'); if (!g.ok) return g
  if (!UUID.test(documentoId)) return { ok: false, error: 'Documento inválido.' }
  const svc = createAdminClient()
  const [d, vids] = await Promise.all([
    svc.from('simulado_conteudo_documentos').select('metadados').eq('tenant_id', g.tenantId).eq('id', documentoId).maybeSingle(),
    svc.from('simulado_conteudo_documentos').select('id, titulo').eq('tenant_id', g.tenantId).eq('tipo_origem', 'video').eq('deletado', false).in('categoria', ['conteudo', 'jurisclub']).order('titulo', { ascending: true }).limit(500),
  ])
  if (d.error) return { ok: false, error: /metadados|column|schema/i.test(d.error.message) ? 'Aplique a migração dos metadados (20261106000000) no banco.' : d.error.message }
  return { ok: true, video: normalizarMetadados((d.data as any)?.metadados).video ?? null, videos: ((vids.data as any[]) ?? []).map((v) => ({ id: v.id, titulo: String(v.titulo ?? '') })) }
}

export async function salvarVideoAction(documentoId: string, entrada: { tipo: 'nenhum' | 'link' | 'plataforma'; url?: string; doc_id?: string; titulo?: string }): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  if (!UUID.test(documentoId)) return { ok: false, error: 'Documento inválido.' }
  const titulo = String(entrada.titulo ?? '').trim().slice(0, 120)
  let video: VideoDoc | null = null
  if (entrada.tipo === 'link') {
    const url = String(entrada.url ?? '').trim()
    if (!embedDeLink(url)) return { ok: false, error: 'Link não suportado. Use um link https do YouTube, do Vimeo ou de um arquivo de vídeo (.mp4, .webm, .m3u8).' }
    video = { tipo: 'link', url, ...(titulo ? { titulo } : {}) }
  } else if (entrada.tipo === 'plataforma') {
    if (!UUID.test(String(entrada.doc_id ?? ''))) return { ok: false, error: 'Escolha um vídeo da plataforma.' }
    video = { tipo: 'plataforma', doc_id: String(entrada.doc_id), ...(titulo ? { titulo } : {}) }
  }
  const svc = createAdminClient()
  const atual = await svc.from('simulado_conteudo_documentos').select('metadados').eq('tenant_id', g.tenantId).eq('id', documentoId).maybeSingle()
  if (atual.error || !atual.data) return { ok: false, error: atual.error?.message ?? 'Documento não encontrado.' }
  const meta: Record<string, unknown> = { ...(((atual.data as any).metadados as Record<string, unknown>) ?? {}) }
  if (video) meta.video = video; else delete meta.video
  const up = await svc.from('simulado_conteudo_documentos').update({ metadados: meta, atualizado_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).eq('id', documentoId)
  if (up.error) return { ok: false, error: up.error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_conteudo_documentos', entidadeId: documentoId, atorId: g.atorId, tenantId: g.tenantId, depois: { video: video ?? null } }).catch(() => {})
  return { ok: true }
}
