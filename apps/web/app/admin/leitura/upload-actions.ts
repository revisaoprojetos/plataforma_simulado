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
 * Núcleo: sanitiza o HTML e grava no RASCUNHO (nunca sobrescreve a versão publicada
 * imutável — A2). Se ainda não há rascunho separado da publicada, forka um novo
 * (max(versao)+1) copiando a publicada. Tolerante: sem a migração A2, cai no
 * comportamento antigo (upsert na versão vigente).
 */
async function salvarConteudo(tenantId: string, atorId: string | null, documentoId: string, htmlBruto: string) {
  const { html, texto, artigos } = sanitizarDocumento(htmlBruto)
  if (!html.replace(/<[^>]+>/g, '').trim()) return { ok: false as const, error: 'O conteúdo ficou vazio após a limpeza. Verifique o HTML.' }

  const svc = createAdminClient()
  // Detecta os ponteiros de versão (A2). Sem eles, fallback ao caminho antigo.
  let sel = await svc.from('simulado_documentos').select('versao, versao_publicada, versao_rascunho').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
  if (sel.error && /versao_publicada|versao_rascunho|column/i.test(String(sel.error.message))) sel = await svc.from('simulado_documentos').select('versao').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle() as any
  const doc: any = sel.data
  if (!doc) return { ok: false as const, error: 'Documento não encontrado.' }

  const temVers = doc.versao_publicada != null || doc.versao_rascunho != null
  let versaoAlvo = doc.versao ?? 1
  if (temVers) {
    const pub = doc.versao_publicada ?? doc.versao ?? 1
    let rasc = doc.versao_rascunho ?? pub
    if (rasc <= pub) {
      // aloca rascunho separado da publicada (não muta a imutável).
      const { data: mx } = await svc.from('simulado_documento_conteudos').select('versao').eq('documento_id', documentoId).order('versao', { ascending: false }).limit(1).maybeSingle()
      rasc = ((mx as any)?.versao ?? pub) + 1
      await svc.from('simulado_documentos').update({ versao_rascunho: rasc }).eq('id', documentoId).eq('tenant_id', tenantId)
    }
    versaoAlvo = rasc
  }

  const texto_hash = createHash('sha1').update(texto).digest('hex')
  const rowA2: Record<string, unknown> = { tenant_id: tenantId, documento_id: documentoId, versao: versaoAlvo, html, texto_hash, artigos, estado: 'rascunho', plain_text: texto }
  let { error } = await svc.from('simulado_documento_conteudos').upsert(rowA2, { onConflict: 'documento_id,versao' })
  if (error && /estado|plain_text|column/i.test(error.message)) {
    ;({ error } = await svc.from('simulado_documento_conteudos').upsert({ tenant_id: tenantId, documento_id: documentoId, versao: versaoAlvo, html, texto_hash, artigos }, { onConflict: 'documento_id,versao' }))
  }
  if (error) return { ok: false as const, error: error.message }
  await svc.from('simulado_documentos').update({ atualizado_em: new Date().toISOString() }).eq('id', documentoId).eq('tenant_id', tenantId)
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_documento_conteudos', entidadeId: documentoId, depois: { versao: versaoAlvo, artigos, rascunho: temVers }, atorId, tenantId })
  revalidatePath(`/admin/leitura/${documentoId}`)
  return { ok: true as const, artigos, versao: versaoAlvo }
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
