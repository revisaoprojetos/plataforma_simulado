'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye } from 'lucide-react'

declare global { interface Window { DocsAPI?: any } }

const PLUGIN_GUID = 'asc.{C7A3F1E0-9B2D-4E6A-8F14-5D2B7C0A1E33}'

export function OnlyOfficeEditor({ id, onlyofficeUrl, wopiHost, preview = false, docVersao = '0' }: { id: string; onlyofficeUrl: string; wopiHost: string; preview?: boolean; docVersao?: string }) {
  const montado = useRef(false)
  const editorRef = useRef<any>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (montado.current) return
    montado.current = true
    const scriptSrc = `${onlyofficeUrl}/web-apps/apps/api/documents/api.js`
    // Config ESTÁTICA (url relativa, sem query) — a dinâmica com URL absoluta+query quebrava o handshake
    // do plugin (o editor não reconhecia o iframe e nunca chamava init). O doc-id vai por localStorage
    // (mesma origem do app → o iframe do plugin lê), pro modo prévia saber qual .docx consultar.
    const origin = window.location.origin
    const pluginConfig = `${origin}/oo-plugin/config.json`
    try { localStorage.setItem('teste_oo_docid', id) } catch { /* sem storage, prévia degrada */ }
    const criar = () => {
      try {
        if (!window.DocsAPI) { setErro('api.js carregou mas DocsAPI não existe.'); return }
        // Chave ESTÁVEL por versão (não muda a cada carregamento) → mesma sessão p/ a mesma versão.
        const key = `${id}_${preview ? 'pv_' : ''}${docVersao}`.replace(/[^a-z0-9_-]/gi, '')
        // PRÉVIA: abre o .docx PREENCHIDO (endpoint /preview) em modo LEITURA, sem plugin nem callback —
        // não toca no template editável. EDITOR: abre o template editável com o painel "Blocos & Variáveis".
        const editorConfig: any = { lang: 'pt', user: { id: 'admin', name: 'Admin (teste)' } }
        if (preview) {
          editorConfig.mode = 'view'
        } else {
          editorConfig.callbackUrl = `${wopiHost}/api/teste/onlyoffice/callback/${id}`
          editorConfig.plugins = { autostart: [PLUGIN_GUID], pluginsData: [pluginConfig] }
          // Salvamento MANUAL: desliga o autosave (que salvava direto, às vezes um estado vazio por cima)
          // e liga o botão Salvar / Ctrl+S (force-save). Você salva quando o conteúdo está pronto.
          editorConfig.customization = { autosave: false, forcesave: true }
        }
        editorRef.current = new window.DocsAPI.DocEditor('oo-placeholder', {
          documentType: 'word',
          document: {
            fileType: 'docx', key,
            title: preview ? `${id} · prévia (valores).docx` : `${id}.docx`,
            url: preview ? `${wopiHost}/api/teste/docs/${id}/preview` : `${wopiHost}/api/teste/docs/${id}`,
            permissions: { edit: !preview, download: true },
          },
          editorConfig,
          width: '100%', height: '100%',
        })
      } catch (e) { setErro((e as Error).message) }
    }
    const existente = document.querySelector(`script[src="${scriptSrc}"]`) as HTMLScriptElement | null
    if (existente && window.DocsAPI) { criar(); return }
    const s = document.createElement('script')
    s.src = scriptSrc; s.async = true
    s.onload = criar
    s.onerror = () => setErro(`Não carregou ${scriptSrc}. Suba o OnlyOffice e confira NEXT_PUBLIC_ONLYOFFICE_URL.`)
    document.body.appendChild(s)
  }, [id, onlyofficeUrl, wopiHost, preview, docVersao])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
        {preview ? (
          <>
            <Link href={`/admin/teste/onlyoffice/${id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar ao editor</Link>
            <span className="text-sm font-semibold">Prévia com valores · <span className="font-mono text-xs text-muted-foreground">{id}</span></span>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <Eye className="h-3.5 w-3.5" /> Somente leitura — não altera o template
            </span>
          </>
        ) : (
          <>
            <Link href="/admin/teste" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
            <span className="text-sm font-semibold">OnlyOffice · <span className="font-mono text-xs text-muted-foreground">{id}</span></span>
            <div className="ml-auto flex items-center gap-2">
              <a href={`/admin/teste/onlyoffice/${id}?preview=1`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors hover:border-primary hover:text-primary">
                <Eye className="h-4 w-4" /> Ver com valores
              </a>
            </div>
          </>
        )}
      </header>
      {erro ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            <p className="font-semibold">OnlyOffice não carregou.</p>
            <p className="mt-2 text-destructive/90">{erro}</p>
            <p className="mt-2 text-destructive/90">Suba: <code>docker compose -f docker-compose.teste.yml up -d onlyoffice</code>.</p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1"><div id="oo-placeholder" className="h-full w-full" /></div>
      )}
    </div>
  )
}
