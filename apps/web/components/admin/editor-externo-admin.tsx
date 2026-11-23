'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react'

/**
 * Editor externo (BookStack/AFFiNE) em TELA CHEIA, igual ao editor do OnlyOffice: cobre o shell do admin
 * (sem sidebar/menu da plataforma), só com uma barra fina de voltar. Sem secrets; só a URL pública.
 */
export function EditorExternoTelaCheia({ src, titulo, envUrl, voltar = '/admin/teste', loginAlternativo }: {
  src: string; titulo: string; envUrl: string; voltar?: string; loginAlternativo?: string
}) {
  const [carregou, setCarregou] = useState(false)
  const [demora, setDemora] = useState(false)
  const ref = useRef(false)
  ref.current = carregou

  useEffect(() => {
    if (!src) return
    setCarregou(false)
    setDemora(false)
    const t = setTimeout(() => { if (!ref.current) setDemora(true) }, 10000)
    return () => clearTimeout(t)
  }, [src])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
        <Link href={voltar} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <span className="text-sm font-semibold">{titulo}</span>
        {src && (
          <div className="ml-auto flex items-center gap-2">
            {loginAlternativo && (
              <a href={loginAlternativo} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors hover:border-primary hover:text-primary">
                Login de administrador <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <a href={src} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors hover:border-primary hover:text-primary">
              Abrir em nova aba <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </header>
      {!src ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            <p className="font-semibold">{titulo} não configurado.</p>
            <p className="mt-2 text-destructive/90">Defina <code>{envUrl}</code> (no local: <code>apps/web/.env.local</code>; em produção: Portainer) e reinicie.</p>
            <p className="mt-2 text-destructive/90">Guia: <code>docs/cadernos-externos-teste.md</code></p>
          </div>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          {!carregou && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando {titulo}…</span>
              {demora && <span className="max-w-md text-center text-xs">Está demorando. Confira se o serviço está no ar em <code>{src}</code> (ou se o navegador bloqueia cookies de terceiros em quadros).</span>}
            </div>
          )}
          <iframe
            src={src}
            title={titulo}
            onLoad={() => setCarregou(true)}
            className="absolute inset-0 h-full w-full border-0"
            allow="clipboard-read; clipboard-write; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
    </div>
  )
}
