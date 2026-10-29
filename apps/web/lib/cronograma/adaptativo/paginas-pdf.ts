import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStorage } from '@/lib/storage'
import { resolverBucketConteudo } from '@/lib/conteudo/ingestao'

// Contagem de PÁGINAS de PDF (automática): lê o arquivo e grava em
// simulado_conteudo_versoes.paginas. É o que alimenta a duração do PDFULL no
// Cronograma Adaptativo (duração = páginas ÷ ritmo). Usa pdfjs-dist (já é dep do web);
// se o pdfjs falhar (PDF estranho/cifrado), cai num contador por regex do /Type /Page.

/** Conta páginas a partir dos bytes do PDF. Retorna null se não for possível. */
export async function contarPaginasPdf(bytes: Uint8Array): Promise<number | null> {
  // 1) via pdfjs (preciso)
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as {
      getDocument: (opts: Record<string, unknown>) => { promise: Promise<{ numPages: number; destroy?: () => Promise<void> }> }
      GlobalWorkerOptions?: { workerSrc?: string }
    }
    try { if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = '' } catch { /* sem worker: roda na main thread */ }
    const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, useWorkerFetch: false, useSystemFonts: false })
    const doc = await task.promise
    const n = doc.numPages
    try { await doc.destroy?.() } catch { /* ignore */ }
    if (n && n > 0) return n
  } catch { /* cai no fallback */ }
  // 2) fallback por regex (aproximado): conta objetos /Type /Page (não /Pages)
  try {
    const txt = Buffer.from(bytes).toString('latin1')
    const m = txt.match(/\/Type\s*\/Page(?![s])/g)
    if (m && m.length) return m.length
    const c = txt.match(/\/Count\s+(\d+)/)
    if (c) return parseInt(c[1], 10) || null
  } catch { /* ignore */ }
  return null
}

const T_DOC = 'simulado_conteudo_documentos'
const T_VER = 'simulado_conteudo_versoes'

/** Mede e grava as páginas da VERSÃO ATUAL de um documento (se for PDF). */
export async function medirPaginasDocumento(svc: SupabaseClient, tenantId: string, documentoId: string): Promise<{ ok: boolean; paginas?: number | null; error?: string }> {
  const { data: doc } = await svc.from(T_DOC).select('id, tipo_origem, versao_atual_id').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
  const d = doc as { tipo_origem?: string; versao_atual_id?: string | null } | null
  if (!d || !d.versao_atual_id) return { ok: false, error: 'sem_versao' }
  if (d.tipo_origem !== 'pdf') return { ok: true, paginas: null }
  const { data: ver } = await svc.from(T_VER).select('id, arquivo_key').eq('id', d.versao_atual_id).maybeSingle()
  const v = ver as { id?: string; arquivo_key?: string } | null
  if (!v?.arquivo_key) return { ok: false, error: 'sem_arquivo' }
  let bytes: Uint8Array | null = null
  try { bytes = await getStorage().download(await resolverBucketConteudo(), v.arquivo_key) } catch { bytes = null }
  if (!bytes) return { ok: false, error: 'download_falhou' }
  const paginas = await contarPaginasPdf(bytes)
  const { error } = await svc.from(T_VER).update({ paginas }).eq('id', v.id as string)
  if (error) return { ok: false, error: error.message }
  return { ok: true, paginas }
}

/** Mede em lote os PDFs publicados sem contagem (versão atual com paginas NULL). */
export async function medirPaginasPendentes(svc: SupabaseClient, tenantId: string, limite = 50): Promise<{ medidos: number; falhas: number }> {
  // docs PDF publicados do tenant
  const { data: docs } = await svc.from(T_DOC)
    .select('id, versao_atual_id').eq('tenant_id', tenantId).eq('tipo_origem', 'pdf').eq('status', 'publicado').eq('deletado', false)
    .not('versao_atual_id', 'is', null).limit(500)
  const lista = (docs || []) as Array<{ id: string; versao_atual_id: string }>
  if (!lista.length) return { medidos: 0, falhas: 0 }
  const verIds = lista.map((d) => d.versao_atual_id)
  const { data: vers } = await svc.from(T_VER).select('id, paginas').in('id', verIds)
  const semPag = new Set((vers || []).filter((v: { paginas: number | null }) => v.paginas == null).map((v: { id: string }) => v.id))
  const pendentes = lista.filter((d) => semPag.has(d.versao_atual_id)).slice(0, limite)
  let medidos = 0, falhas = 0
  for (const d of pendentes) {
    const r = await medirPaginasDocumento(svc, tenantId, d.id)
    if (r.ok) medidos++; else falhas++
  }
  return { medidos, falhas }
}
