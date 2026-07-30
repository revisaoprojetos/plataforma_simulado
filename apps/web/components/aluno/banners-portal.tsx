'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X, Megaphone } from 'lucide-react'

export type BannerPortal = {
  id: string; tipo: 'banner' | 'popup'; titulo: string | null; mensagem: string | null
  imagem_url: string | null; link: string | null; cor: string | null
}

/** Renderiza os banners (faixa dispensável) e o pop-up (modal 1x por navegador) do portal do aluno. */
export function BannersPortal({ banners }: { banners: BannerPortal[] }) {
  const [dispensados, setDispensados] = useState<Set<string>>(new Set())
  const [popup, setPopup] = useState<BannerPortal | null>(null)

  useEffect(() => {
    // Banners dispensados (persistente) + primeiro pop-up ainda não visto (1x por navegador).
    const disp = new Set<string>()
    for (const b of banners) if (b.tipo === 'banner' && localStorage.getItem('banner-dispensado-' + b.id)) disp.add(b.id)
    setDispensados(disp)
    const pop = banners.find((b) => b.tipo === 'popup' && !localStorage.getItem('popup-visto-' + b.id))
    if (pop) setPopup(pop)
  }, [banners])

  function dispensar(id: string) {
    localStorage.setItem('banner-dispensado-' + id, '1')
    setDispensados((s) => new Set([...s, id]))
  }
  function fecharPopup() {
    if (popup) localStorage.setItem('popup-visto-' + popup.id, '1')
    setPopup(null)
  }

  const faixas = banners.filter((b) => b.tipo === 'banner' && !dispensados.has(b.id))

  return (
    <>
      {faixas.length > 0 && (
        <div className="mb-4 space-y-2">
          {faixas.map((b) => {
            const cor = b.cor ?? '#6366f1'
            const conteudo = (
              <div className="flex items-center gap-3 rounded-2xl border p-3 shadow-sm" style={{ background: cor + '14', borderColor: cor + '33' }}>
                {b.imagem_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.imagem_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: cor + '22', color: cor }}><Megaphone className="h-5 w-5" /></span>
                )}
                <div className="min-w-0 flex-1">
                  {b.titulo && <p className="truncate text-sm font-semibold">{b.titulo}</p>}
                  {b.mensagem && <p className="truncate text-xs text-muted-foreground">{b.mensagem}</p>}
                </div>
              </div>
            )
            return (
              <div key={b.id} className="relative">
                {b.link ? <Link href={b.link} className="block transition hover:opacity-90">{conteudo}</Link> : conteudo}
                <button type="button" onClick={() => dispensar(b.id)} aria-label="Dispensar"
                  className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {popup && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={fecharPopup}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            {popup.imagem_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={popup.imagem_url} alt="" className="max-h-56 w-full object-cover" />
            )}
            <div className="space-y-3 p-5">
              <div className="flex items-start gap-2">
                <span className="h-1 w-10 rounded-full" style={{ background: popup.cor ?? '#6366f1' }} />
                <button type="button" onClick={fecharPopup} className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              {popup.titulo && <h3 className="text-lg font-bold tracking-tight">{popup.titulo}</h3>}
              {popup.mensagem && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{popup.mensagem}</p>}
              <div className="flex justify-end gap-2 pt-1">
                {popup.link && <Link href={popup.link} onClick={fecharPopup} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">Ver mais</Link>}
                <button type="button" onClick={fecharPopup} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Fechar</button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
