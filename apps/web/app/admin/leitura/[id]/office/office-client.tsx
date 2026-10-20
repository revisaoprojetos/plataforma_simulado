'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import { importarLeituraDoOffice } from './office-actions'

declare global { interface Window { DocsAPI?: any } }

// Editor OnlyOffice BETA da Leitura (opcional). Edita um docx; "Importar" traz de volta ao RASCUNHO via
// mammoth (lossy). Não toca no editor HTML atual da Leitura.
export function LeituraOfficeClient({ documentoId, titulo, documentUrl, onlyofficeUrl, callbackUrl, chave }: {
  documentoId: string; titulo: string; documentUrl: string; onlyofficeUrl: string; callbackUrl: string; chave: string
}) {
  const montado = useRef(false)
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)

  useEffect(() => {
    if (montado.current) return
    montado.current = true
    const scriptSrc = `${onlyofficeUrl}/web-apps/apps/api/documents/api.js`
    const criar = () => {
      try {
        if (!window.DocsAPI) { setErro('api.js carregou mas DocsAPI não existe.'); return }
        new window.DocsAPI.DocEditor('oo-leitura', {
          documentType: 'word',
          document: { fileType: 'docx', key: chave.replace(/[^a-z0-9_-]/gi, ''), title: `${titulo}.docx`, url: documentUrl, permissions: { edit: true, download: true } },
          editorConfig: { lang: 'pt', user: { id: 'admin', name: 'Admin' }, callbackUrl, customization: { autosave: false, forcesave: true } },
          width: '100%', height: '100%',
        })
      } catch (e) { setErro((e as Error).message) }
    }
    const existente = document.querySelector(`script[src="${scriptSrc}"]`) as HTMLScriptElement | null
    if (existente && window.DocsAPI) { criar(); return }
    const s = document.createElement('script')
    s.src = scriptSrc; s.async = true; s.onload = criar
    s.onerror = () => setErro(`Não carregou ${scriptSrc}. Suba o OnlyOffice e confira NEXT_PUBLIC_ONLYOFFICE_URL.`)
    document.body.appendChild(s)
  }, [onlyofficeUrl, documentUrl, callbackUrl, chave, titulo])

  async function importar() {
    if (!(await confirmar({ titulo: 'Importar para a Leitura?', mensagem: 'Salve no OnlyOffice (Ctrl+S) antes. A importação é LOSSY — grifos, selos e dispositivos NÃO voltam. Vai para o rascunho (não publica).', confirmar: 'Importar ao rascunho' }))) return
    setImportando(true)
    const r = await importarLeituraDoOffice(documentoId)
    setImportando(false)
    if (!r.ok) return toast.error(r.error || 'Falha ao importar.')
    toast.success(`Importado para o rascunho (${r.artigos ?? 0} artigos). Revise antes de publicar.`)
    router.push(`/admin/leitura/${documentoId}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
        <button onClick={() => router.push(`/admin/leitura/${documentoId}`)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Leitura</button>
        <span className="text-sm font-semibold">{titulo}</span>
        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">OnlyOffice (beta · lossy)</span>
        <button onClick={importar} disabled={importando} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">{importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Importar para a Leitura</button>
      </header>
      {erro ? (
        <div className="flex flex-1 items-center justify-center p-8"><div className="max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"><p className="font-semibold">OnlyOffice não carregou.</p><p className="mt-2">{erro}</p></div></div>
      ) : <div className="min-h-0 flex-1"><div id="oo-leitura" className="h-full w-full" /></div>}
    </div>
  )
}
