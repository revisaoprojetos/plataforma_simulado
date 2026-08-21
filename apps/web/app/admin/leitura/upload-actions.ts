'use server'

import { createHash } from 'crypto'
import { revalidatePath } from 'next/cache'
import mammoth from 'mammoth'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { sanitizarDocumento } from '@/lib/leitura/sanitize'
import { validateFile, PRESETS } from '@/lib/storage/validate'

async function guard() {
  if (!(await checkPermission('leitura:update'))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/**
 * Núcleo: sanitiza o HTML (allowlist + âncoras de artigo) e grava/atualiza a versão
 * vigente do conteúdo (upsert por documento+versão — sem explodir versões durante a
 * edição; o bump de versão fica p/ a Fase 1b, quando anotações se prendem à versão).
 */
async function salvarConteudo(tenantId: string, atorId: string | null, documentoId: string, htmlBruto: string) {
  const { html, texto, artigos } = sanitizarDocumento(htmlBruto)
  if (!html.replace(/<[^>]+>/g, '').trim()) return { ok: false as const, error: 'O conteúdo ficou vazio após a limpeza. Verifique o HTML.' }

  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_documentos').select('versao').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
  if (!doc) return { ok: false as const, error: 'Documento não encontrado.' }
  const versao = (doc as any).versao ?? 1
  const texto_hash = createHash('sha1').update(texto).digest('hex')

  const { error } = await svc.from('simulado_documento_conteudos').upsert(
    { tenant_id: tenantId, documento_id: documentoId, versao, html, texto_hash, artigos },
    { onConflict: 'documento_id,versao' },
  )
  if (error) return { ok: false as const, error: error.message }
  await svc.from('simulado_documentos').update({ atualizado_em: new Date().toISOString() }).eq('id', documentoId).eq('tenant_id', tenantId)
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_documento_conteudos', entidadeId: documentoId, depois: { versao, artigos }, atorId, tenantId })
  revalidatePath(`/admin/leitura/${documentoId}`)
  return { ok: true as const, artigos, versao }
}

/** Conteúdo colado / do editor rico (HTML bruto → sanitizado). */
export async function salvarConteudoHtml(documentoId: string, htmlBruto: string): Promise<{ ok: boolean; artigos?: number; error?: string }> {
  const g = await guard(); if (!g.ok) return { ok: false, error: g.error }
  if ((htmlBruto ?? '').length > 5 * 1024 * 1024) return { ok: false, error: 'HTML muito grande (máx. ~5 MB).' }
  return salvarConteudo(g.tenantId, g.atorId, documentoId, htmlBruto ?? '')
}

/** Importa um .docx (base64) → Word→HTML (mammoth) → sanitizado. */
export async function importarDocx(documentoId: string, base64: string, _nome?: string): Promise<{ ok: boolean; artigos?: number; error?: string }> {
  const g = await guard(); if (!g.ok) return { ok: false, error: g.error }
  const dado = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  let buf: Buffer
  try { buf = Buffer.from(dado, 'base64') } catch { return { ok: false, error: 'Arquivo inválido.' } }
  if (!buf.length) return { ok: false, error: 'Arquivo vazio.' }
  if (buf.length > 10 * 1024 * 1024) return { ok: false, error: 'Documento muito grande (máx. ~10 MB).' }
  // .docx é ZIP (assinatura PK..) — valida por magic bytes.
  const v = validateFile(buf, 'application/zip', PRESETS.docx)
  if (!v.ok) return { ok: false, error: 'O arquivo não parece um .docx válido.' }

  let html: string
  try {
    const res = await mammoth.convertToHtml({ buffer: buf }, { styleMap: ['u => u', 'strike => s'] })
    html = res.value ?? ''
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao converter o Word.' }
  }
  if (!html.trim()) return { ok: false, error: 'O Word não produziu conteúdo legível.' }
  return salvarConteudo(g.tenantId, g.atorId, documentoId, html)
}
