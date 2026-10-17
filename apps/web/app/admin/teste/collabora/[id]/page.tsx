import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

// Editor COLLABORA (LibreOffice). O host do app expõe o WOPI (/api/teste/wopi/files/:id); o Collabora
// edita o .docx e salva de volta por lá. A URL do editor vem do /hosting/discovery do Collabora.
async function urlDoEditor(collabora: string): Promise<string | null> {
  try {
    const r = await fetch(`${collabora}/hosting/discovery`, { cache: 'no-store' })
    if (!r.ok) return null
    const xml = await r.text()
    const m = xml.match(/urlsrc="([^"]*cool\.html\?[^"]*)"/i) // qualquer app aponta p/ o mesmo cool.html
    return m ? m[1] : null
  } catch { return null }
}

export default async function CollaboraEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const collabora = process.env.NEXT_PUBLIC_COLLABORA_URL || 'http://localhost:9980'
  const wopiHost = process.env.TESTE_WOPI_HOST || 'http://host.docker.internal:3000'
  const editor = await urlDoEditor(collabora)
  const wopiSrc = `${wopiHost}/api/teste/wopi/files/${id}`
  const src = editor ? `${editor}WOPISrc=${encodeURIComponent(wopiSrc)}&access_token=teste&lang=pt-BR` : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
        <Link href="/admin/teste" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <span className="text-sm font-semibold">Collabora · <span className="font-mono text-xs text-muted-foreground">{id}</span></span>
      </header>
      {src ? (
        <iframe src={src} title="Collabora" className="min-h-0 flex-1 border-0" allow="clipboard-read; clipboard-write" />
      ) : (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            <p className="font-semibold">Collabora não respondeu em <code>{collabora}</code>.</p>
            <p className="mt-2 text-destructive/90">Suba o serviço: <code>docker compose -f docker-compose.teste.yml up -d collabora</code> e confira <code>NEXT_PUBLIC_COLLABORA_URL</code> no .env.local.</p>
          </div>
        </div>
      )}
    </div>
  )
}
