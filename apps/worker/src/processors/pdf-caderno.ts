import { Job } from 'bullmq'
import { createClient } from '@supabase/supabase-js'
import { urlParaPdf } from '../lib/gotenberg'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PDF_PUBLIC_BASE = process.env.PDF_PUBLIC_BASE // opcional; senão usa getPublicUrl

interface PdfCadernoData {
  jobId: string
  url: string
  tenantId: string
}

/**
 * Consome a fila `pdf-caderno`: pega a URL /imprimir (montada e assinada pelo web),
 * manda o Gotenberg renderizar, sobe o PDF no bucket `pdfs` e atualiza o job.
 */
export async function pdfCadernoProcessor(job: Job<PdfCadernoData>) {
  const { jobId, url, tenantId } = job.data
  console.log(`[pdf-caderno] job ${jobId} — renderizando via Gotenberg`)

  await supabase.from('simulado_pdf_jobs').update({ status: 'processando' }).eq('id', jobId)

  try {
    // 1. URL → PDF (Gotenberg/Chromium)
    // Margem 0: o HTML do caderno já define suas margens (padding + @page margin:0). A margem
    // padrão do Gotenberg (0.4") era SOMADA por cima → folha espremida (editor ≠ PDF). Zerar
    // alinha o PDF ao preview. Reverter sem redeploy: env CADERNO_PDF_MARGEM=0.4.
    const m = process.env.CADERNO_PDF_MARGEM != null ? Number(process.env.CADERNO_PDF_MARGEM) : 0
    const pdf = await urlParaPdf(url, { marginTop: m, marginBottom: m, marginLeft: m, marginRight: m })

    // 2. Upload no storage (bucket público `pdfs`)
    const path = `${tenantId}/${jobId}.pdf`
    const { error: upErr } = await supabase.storage
      .from('pdfs')
      .upload(path, pdf, { contentType: 'application/pdf', upsert: true })
    if (upErr) throw new Error(`Upload falhou: ${upErr.message}`)

    // 3. URL pública
    const publicUrl = PDF_PUBLIC_BASE
      ? `${PDF_PUBLIC_BASE}/${path}`
      : supabase.storage.from('pdfs').getPublicUrl(path).data.publicUrl

    // 4. Marca concluído
    await supabase
      .from('simulado_pdf_jobs')
      .update({ status: 'concluido', arquivo_path: path, arquivo_url: publicUrl, erro: null })
      .eq('id', jobId)

    console.log(`[pdf-caderno] job ${jobId} concluído: ${publicUrl}`)
    return { jobId, url: publicUrl }
  } catch (e) {
    const msg = (e as Error).message ?? 'erro desconhecido'
    console.error(`[pdf-caderno] job ${jobId} falhou:`, msg)
    await supabase.from('simulado_pdf_jobs').update({ status: 'erro', erro: msg }).eq('id', jobId)
    throw e // deixa o BullMQ tentar de novo (attempts/backoff)
  }
}
