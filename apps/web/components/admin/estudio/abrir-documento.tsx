'use client'

/**
 * Abrir documento (Estúdio › Materiais) — REUSA os fluxos reais da Biblioteca de produção:
 *  - EDITAR (.docx): `abrirEdicaoDocx` → /admin/biblioteca/editar/[versaoId]?origem=<página atual> (OnlyOffice; "Voltar" retorna ao Estúdio).
 *  - VISUALIZAR: mesma prévia fiel da Biblioteca — `pdfPreviewDocumento` (PDF do documento inteiro) com a capa
 *    (`thumbDocumento`) enquanto converte; vídeo/áudio tocam pela URL assinada (`urlDownloadDocumento`).
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Pencil, Download } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { abrirEdicaoDocx, pdfPreviewDocumento, thumbDocumento, urlDownloadDocumento } from '@/app/admin/biblioteca/actions'
import { GRAD_PRIMARY } from '@/components/admin/estudio/lista-ui'

/** Abre o editor real (docx). Outros tipos não têm editor → devolve false para o chamador visualizar. */
export async function editarDocumento(id: string, tipoOrigem: string): Promise<boolean> {
  if (tipoOrigem !== 'docx') return false
  const t = toast.loading('Abrindo o editor…')
  try {
    const r = await abrirEdicaoDocx(id)
    toast.dismiss(t)
    if (!r.ok || !r.versaoId) { toast.error(r.error || 'Não foi possível abrir o editor.'); return true }
    window.location.href = `/admin/biblioteca/editar/${r.versaoId}?origem=${encodeURIComponent(window.location.pathname + window.location.search)}`
  } catch (e: any) {
    toast.dismiss(t)
    toast.error('Falha ao abrir o editor: ' + (e?.message || 'erro desconhecido'))
  }
  return true
}

export async function baixarDocumento(id: string) {
  const r = await urlDownloadDocumento(id)
  if (!r.ok || !r.url) { toast.error(r.error || 'Não foi possível gerar o link.'); return }
  window.open(r.url, '_blank', 'noopener')
}

export function VisualizarDocumento({
  open, onClose, documentoId, titulo, tipoOrigem,
}: { open: boolean; onClose: () => void; documentoId: string; titulo: string; tipoOrigem: string }) {
  const midia = tipoOrigem === 'video' || tipoOrigem === 'audio'
  const [pdf, setPdf] = useState<string | null>(null)
  const [capa, setCapa] = useState<string | null>(null)
  const [midiaUrl, setMidiaUrl] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (!open) return
    let vivo = true
    setPdf(null); setCapa(null); setMidiaUrl(null); setFalhou(false)
    if (midia) {
      urlDownloadDocumento(documentoId).then((r) => { if (!vivo) return; r.ok && r.url ? setMidiaUrl(r.url) : setFalhou(true) }).catch(() => { if (vivo) setFalhou(true) })
    } else {
      thumbDocumento(documentoId).then((r) => { if (vivo && r.url) setCapa(r.url) }).catch(() => {})
      pdfPreviewDocumento(documentoId).then((r) => { if (!vivo) return; r.ok && r.url ? setPdf(r.url) : setFalhou(true) }).catch(() => { if (vivo) setFalhou(true) })
    }
    return () => { vivo = false }
  }, [open, documentoId, midia])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="flex h-[88vh] w-[min(1100px,96vw)] max-w-none flex-col gap-3 p-4 sm:max-w-none">
        <div className="flex items-center justify-between gap-3 pr-8">
          <DialogTitle className="min-w-0 truncate text-[15px] font-extrabold">{titulo}</DialogTitle>
          <div className="flex shrink-0 items-center gap-2">
            {tipoOrigem === 'docx' && (
              <button type="button" disabled={ocupado} style={GRAD_PRIMARY}
                onClick={async () => { setOcupado(true); await editarDocumento(documentoId, tipoOrigem); setOcupado(false) }}
                className="inline-flex h-9 items-center gap-2 rounded-[11px] px-3 text-[12.5px] font-extrabold text-primary-foreground disabled:opacity-60"><Pencil className="h-[15px] w-[15px]" />Editar documento</button>
            )}
            <button type="button" onClick={() => baixarDocumento(documentoId)}
              className="inline-flex h-9 items-center gap-2 rounded-[11px] border px-3 text-[12.5px] font-bold hover:bg-muted"><Download className="h-[15px] w-[15px] text-primary" />Baixar</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-muted/30">
          {midia ? (
            midiaUrl
              ? (tipoOrigem === 'video'
                ? <video src={midiaUrl} controls className="h-full w-full bg-black" />
                : <div className="flex h-full items-center justify-center p-6"><audio src={midiaUrl} controls className="w-full max-w-xl" /></div>)
              : <Estado falhou={falhou} />
          ) : pdf ? (
            <iframe src={pdf} title={titulo} className="h-full w-full border-0 bg-neutral-200 dark:bg-neutral-900" />
          ) : capa ? (
            <div className="flex h-full flex-col items-center overflow-auto bg-neutral-200 p-6 dark:bg-neutral-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={capa} alt="Primeira página" className="h-auto w-full rounded-md shadow-lg" style={{ maxWidth: 820 }} />
              {!falhou && <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando o documento completo…</div>}
            </div>
          ) : <Estado falhou={falhou} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Estado({ falhou }: { falhou: boolean }) {
  return falhou
    ? <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">Não foi possível gerar a visualização. Use “Baixar” para abrir o arquivo.</div>
    : <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando prévia…</div>
}
