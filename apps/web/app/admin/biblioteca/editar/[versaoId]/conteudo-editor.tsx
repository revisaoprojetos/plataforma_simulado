'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye } from 'lucide-react'
import type { PaletaBlocos } from '@/lib/conteudo/blocos-palette'

declare global { interface Window { DocsAPI?: any } }

// MESMO editor do Teste (OnlyOffice + plugin "Blocos & Variáveis" + prévia "Ver com valores"). A única
// diferença é a FONTE do .docx: aqui é a versão da Biblioteca no storage (document.url assinada) e o
// callback/prévia batem em /api/conteudo/docs/[versaoId]/*. O plugin lê o doc-id via localStorage
// (teste_oo_docid), igual ao Teste — por isso Blocos/Variáveis e seleção de simulado funcionam igual.
const PLUGIN_GUID = 'asc.{C7A3F1E0-9B2D-4E6A-8F14-5D2B7C0A1E33}'

export function ConteudoEditor({ versaoId, titulo, documentUrl, onlyofficeUrl, wopiHost, chave, preview = false, palette }: {
  versaoId: string; titulo: string; documentUrl: string; onlyofficeUrl: string; wopiHost: string; chave: string; preview?: boolean; palette?: PaletaBlocos
}) {
  const montado = useRef(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (montado.current) return
    montado.current = true
    const scriptSrc = `${onlyofficeUrl}/web-apps/apps/api/documents/api.js`
    const origin = window.location.origin
    const pluginConfig = `${origin}/oo-plugin/config.json`
    try { localStorage.setItem('teste_oo_docid', versaoId) } catch { /* sem storage, prévia do plugin degrada */ }
    // Paleta dos blocos derivada da MARCA do tenant → o plugin usa estas cores (fallback = navy+dourado).
    try { if (palette) localStorage.setItem('oo_blocos_palette', JSON.stringify(palette)) } catch { /* mantém defaults */ }
    const criar = () => {
      try {
        if (!window.DocsAPI) { setErro('api.js carregou mas DocsAPI não existe.'); return }
        const key = `${versaoId}_${preview ? 'pv_' : ''}${chave}`.replace(/[^a-z0-9_-]/gi, '')
        const editorConfig: any = { lang: 'pt', user: { id: 'admin', name: 'Admin' } }
        if (preview) {
          editorConfig.mode = 'view'
        } else {
          editorConfig.callbackUrl = `${wopiHost}/api/conteudo/docs/${versaoId}/callback`
          editorConfig.plugins = { autostart: [PLUGIN_GUID], pluginsData: [pluginConfig] }
          editorConfig.customization = { autosave: false, forcesave: true }
        }
        new window.DocsAPI.DocEditor('oo-conteudo', {
          documentType: 'word',
          document: {
            fileType: 'docx', key,
            title: preview ? `${titulo} · prévia.docx` : `${titulo}.docx`,
            url: preview ? `${wopiHost}/api/conteudo/docs/${versaoId}/preview` : documentUrl,
            permissions: { edit: !preview, download: true },
          },
          editorConfig, width: '100%', height: '100%',
        })
      } catch (e) { setErro((e as Error).message) }
    }
    const existente = document.querySelector(`script[src="${scriptSrc}"]`) as HTMLScriptElement | null
    if (existente && window.DocsAPI) { criar(); return }
    const s = document.createElement('script')
    s.src = scriptSrc; s.async = true; s.onload = criar
    s.onerror = () => setErro(`Não carregou ${scriptSrc}. Suba o OnlyOffice e confira NEXT_PUBLIC_ONLYOFFICE_URL.`)
    document.body.appendChild(s)
  }, [versaoId, onlyofficeUrl, documentUrl, wopiHost, chave, titulo, preview])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
        {preview ? (
          <>
            <Link href={`/admin/biblioteca/editar/${versaoId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar ao editor</Link>
            <span className="text-sm font-semibold">{titulo} · prévia</span>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"><Eye className="h-3.5 w-3.5" /> Somente leitura — não altera o documento</span>
          </>
        ) : (
          <>
            <Link href="/admin/biblioteca" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Biblioteca</Link>
            <span className="text-sm font-semibold">{titulo}</span>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">Rascunho · salvar re-reconcilia os grifos</span>
            <a href={`/admin/biblioteca/editar/${versaoId}?preview=1`} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors hover:border-primary hover:text-primary"><Eye className="h-4 w-4" /> Ver com valores</a>
          </>
        )}
      </header>
      {erro ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"><p className="font-semibold">OnlyOffice não carregou.</p><p className="mt-2">{erro}</p></div>
        </div>
      ) : <div className="min-h-0 flex-1"><div id="oo-conteudo" className="h-full w-full" /></div>}
    </div>
  )
}
