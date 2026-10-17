'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, PanelLeftOpen } from 'lucide-react'

declare global { interface Window { DocsAPI?: any } }

const PLUGIN_GUID = 'asc.{C7A3F1E0-9B2D-4E6A-8F14-5D2B7C0A1E33}'

export function OnlyOfficeEditor({ id, onlyofficeUrl, wopiHost }: { id: string; onlyofficeUrl: string; wopiHost: string }) {
  const montado = useRef(false)
  const editorRef = useRef<any>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (montado.current) return
    montado.current = true
    const scriptSrc = `${onlyofficeUrl}/web-apps/apps/api/documents/api.js`
    // Config DINÂMICA: injeta o id do doc na URL do plugin (pro modo prévia saber qual .docx consultar).
    const origin = window.location.origin
    const pluginConfig = `${origin}/api/teste/oo-plugin-config?id=${encodeURIComponent(id)}&o=${encodeURIComponent(origin)}`
    const criar = () => {
      try {
        if (!window.DocsAPI) { setErro('api.js carregou mas DocsAPI não existe.'); return }
        const key = `${id}_${Date.now()}`.replace(/[^a-z0-9_-]/gi, '')
        editorRef.current = new window.DocsAPI.DocEditor('oo-placeholder', {
          documentType: 'word',
          document: { fileType: 'docx', key, title: `${id}.docx`, url: `${wopiHost}/api/teste/docs/${id}`, permissions: { edit: true } },
          editorConfig: {
            lang: 'pt', callbackUrl: `${wopiHost}/api/teste/onlyoffice/callback/${id}`, user: { id: 'admin', name: 'Admin (teste)' },
            // Painel lateral "Blocos & Variáveis" (nosso plugin) abre junto com o editor.
            plugins: { autostart: [PLUGIN_GUID], pluginsData: [pluginConfig] },
          },
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
  }, [id, onlyofficeUrl, wopiHost])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
        <Link href="/admin/teste" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <span className="text-sm font-semibold">OnlyOffice · <span className="font-mono text-xs text-muted-foreground">{id}</span></span>
        <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary sm:inline-flex">
          <PanelLeftOpen className="h-3.5 w-3.5" /> Painel “Blocos & Variáveis” abre à esquerda no editor
        </span>
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
