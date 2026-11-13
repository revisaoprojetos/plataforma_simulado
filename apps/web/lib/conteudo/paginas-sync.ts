import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStorage } from '@/lib/storage'
import { resolverBucketConteudo } from '@/lib/conteudo/ingestao'
import { contarPaginasPdf } from '@/lib/cronograma/adaptativo/paginas-pdf'
import { esquecer, esquecerPrefixo } from '@/lib/cache/relatorio-cache'
import { emitirEvento } from '@/lib/conteudo/outbox'

/**
 * SINCRONIA DE PÁGINAS (fonte da verdade = simulado_conteudo_versoes.paginas da versão ATUAL do documento).
 * O Cronograma (Adaptativo e Revisão) mostra e calcula com esse número; ele precisa existir e acompanhar a edição:
 *  · PDF  → conta direto dos bytes (em memória quando o chamador já os tem; senão baixa do storage);
 *  · DOCX → conta o PDF convertido (gerarPdfDocumento já grava a contagem ao converter; aqui só completa o que faltar).
 * Idempotente (versão com contagem e sem `forcar` = no-op) e NUNCA lança. Quando a contagem muda, invalida os caches do
 * cronograma DO TENANT e (opt-in `emitir`) emite 'documento.atualizado' para o outbox.
 */

const T_DOC = 'simulado_conteudo_documentos'
const T_VER = 'simulado_conteudo_versoes'

/** Caches do cronograma que embutem páginas (só do tenant). Best-effort. */
export async function invalidarCachesPaginas(tenantId: string): Promise<void> {
  await Promise.all([
    esquecer(`crono-conteudo:${tenantId}`),
    esquecer(`crono-adapt:plano-meta-conteudo:${tenantId}`),
    esquecer(`crono-rev:bib:${tenantId}`),
    esquecer(`revisao-cron:aulas2:${tenantId}`),
    esquecerPrefixo(tenantId, 'crono-rev:conteudo:'),
  ]).catch(() => {})
}

export interface OpcoesSyncPaginas {
  /** recontar mesmo que a versão já tenha `paginas` */
  forcar?: boolean
  /** bytes do PDF já em memória (evita rebaixar do storage). Só vale para documentos PDF. */
  bytes?: Uint8Array
  /** emite 'documento.atualizado' quando a contagem mudou (use só onde o evento ainda não foi emitido) */
  emitir?: boolean
  /** o ponteiro da versão atual mudou (publicação): invalida os caches do cronograma mesmo sem recontar */
  invalidar?: boolean
}
export interface ResultadoSyncPaginas { ok: boolean; paginas: number | null; anterior: number | null; alterou: boolean; motivo?: string }

export async function sincronizarPaginasDocumento(svc: SupabaseClient, tenantId: string, docId: string, opts: OpcoesSyncPaginas = {}): Promise<ResultadoSyncPaginas> {
  const falha = (motivo: string, paginas: number | null = null, anterior: number | null = null): ResultadoSyncPaginas => ({ ok: false, paginas, anterior, alterou: false, motivo })
  try {
    const { data: doc } = await svc.from(T_DOC).select('tipo_origem, versao_atual_id').eq('tenant_id', tenantId).eq('id', docId).maybeSingle()
    const d = doc as { tipo_origem?: string; versao_atual_id?: string | null } | null
    if (!d?.versao_atual_id) return falha('sem_versao')
    if (d.tipo_origem !== 'pdf' && d.tipo_origem !== 'docx') return { ok: true, paginas: null, anterior: null, alterou: false, motivo: 'tipo_sem_paginas' }
    const lerVer = async () => ((await svc.from(T_VER).select('id, arquivo_key, paginas').eq('id', d.versao_atual_id as string).maybeSingle()).data ?? null) as { id: string; arquivo_key: string | null; paginas: number | null } | null
    const ver = await lerVer()
    if (!ver) return falha('versao_nao_encontrada')
    const anterior = ver.paginas ?? null
    if (anterior != null && !opts.forcar) { if (opts.invalidar) await invalidarCachesPaginas(tenantId); return { ok: true, paginas: anterior, anterior, alterou: false, motivo: 'ja_contado' } }

    let n: number | null = null
    if (d.tipo_origem === 'pdf') {
      let bytes: Uint8Array | null = opts.bytes ? new Uint8Array(opts.bytes) : null // cópia: o pdfjs pode desanexar o buffer
      if (!bytes) {
        if (!ver.arquivo_key) return falha('sem_arquivo', null, anterior)
        try { bytes = await getStorage().download(await resolverBucketConteudo(), ver.arquivo_key) } catch { bytes = null }
      }
      if (!bytes) return falha('download_falhou', null, anterior)
      n = await contarPaginasPdf(bytes)
    } else {
      // DOCX: gerarPdfDocumento converte (ou reaproveita o cache) e, ao converter, já grava versoes.paginas.
      const { gerarPdfDocumento } = await import('@/lib/conteudo/thumb')
      const url = await gerarPdfDocumento(tenantId, docId)
      if (!url) return falha('conversao_indisponivel', null, anterior)
      const depois = (await lerVer())?.paginas ?? null
      if (depois != null && depois !== anterior) n = depois // gravado pela própria conversão
      else {
        const r = await fetch(url)
        if (!r.ok) return falha('download_pdf_falhou', null, anterior)
        n = await contarPaginasPdf(new Uint8Array(await r.arrayBuffer()))
      }
    }
    if (!n || n < 1) return falha('contagem_indisponivel', null, anterior)

    const alterou = n !== anterior
    if (!alterou && opts.invalidar) await invalidarCachesPaginas(tenantId)
    if (alterou) {
      const { error } = await svc.from(T_VER).update({ paginas: n }).eq('id', ver.id)
      if (error) return falha(error.message, null, anterior)
      await invalidarCachesPaginas(tenantId)
      if (opts.emitir) await emitirEvento(svc, tenantId, 'documento.atualizado', { documento_id: docId, versao_id: ver.id, origem: 'paginas' })
    }
    return { ok: true, paginas: n, anterior, alterou }
  } catch (e) {
    return falha((e as Error)?.message || 'erro')
  }
}

/**
 * Backfill (cron/admin): versões ATUAIS de documentos publicados (PDF e DOCX) com `paginas` NULL.
 * PDF = barato (lote `limite`); DOCX = conversão (lote pequeno `limiteDocx`). Sequencial para não estourar memória/OnlyOffice.
 */
export async function sincronizarPaginasPendentes(svc: SupabaseClient, tenantId: string, limite = 40, limiteDocx = 3): Promise<{ medidos: number; falhas: number; docx: number }> {
  const out = { medidos: 0, falhas: 0, docx: 0 }
  try {
    const { data: docs } = await svc.from(T_DOC).select('id, tipo_origem, versao_atual_id')
      .eq('tenant_id', tenantId).eq('status', 'publicado').eq('deletado', false).in('tipo_origem', ['pdf', 'docx'])
      .not('versao_atual_id', 'is', null).order('id', { ascending: true }).limit(2000)
    const lista = (docs || []) as Array<{ id: string; tipo_origem: string; versao_atual_id: string }>
    const semPag = new Set<string>()
    for (let i = 0; i < lista.length; i += 80) {
      const { data: vs } = await svc.from(T_VER).select('id').is('paginas', null).in('id', lista.slice(i, i + 80).map((x) => x.versao_atual_id))
      for (const v of (vs || []) as Array<{ id: string }>) semPag.add(v.id)
    }
    const pend = lista.filter((x) => semPag.has(x.versao_atual_id))
    const pdfs = pend.filter((x) => x.tipo_origem === 'pdf').slice(0, limite)
    const docxs = pend.filter((x) => x.tipo_origem === 'docx').slice(0, limiteDocx)
    for (const x of [...pdfs, ...docxs]) {
      const r = await sincronizarPaginasDocumento(svc, tenantId, x.id)
      if (r.ok && r.paginas) { out.medidos++; if (x.tipo_origem === 'docx') out.docx++ } else out.falhas++
    }
  } catch { /* backfill best-effort */ }
  return out
}
