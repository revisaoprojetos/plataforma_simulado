'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X, Megaphone, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type BannerPortal = {
  id: string; tipo: 'banner' | 'popup'; titulo: string | null; mensagem: string | null
  imagem_url: string | null; link: string | null; cor: string | null
}

/** Renderiza os banners (imagem cheia, FIXOS — sem opção de fechar) e o pop-up (modal 1x por navegador). */
export function BannersPortal({ banners }: { banners: BannerPortal[] }) {
  const [popup, setPopup] = useState<BannerPortal | null>(null)

  useEffect(() => {
    // Primeiro pop-up ainda não visto (1x por navegador). Banners são fixos (não dispensáveis).
    const pop = banners.find((b) => b.tipo === 'popup' && !localStorage.getItem('popup-visto-' + b.id))
    if (pop) setPopup(pop)
  }, [banners])

  function fecharPopup() {
    if (popup) localStorage.setItem('popup-visto-' + popup.id, '1')
    setPopup(null)
  }

  const faixas = banners.filter((b) => b.tipo === 'banner')

  return (
    <>
      {faixas.length > 0 && (
        // FULL-BLEED: cancela o padding do <main> (p-6) → ocupa até as laterais e cola no topo.
        <div className="-mx-6 -mt-6 mb-5">
          <FaixaRotativa banners={faixas} />
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

/** Carrossel de banners (estilo propaganda/Netflix): mostra UM por vez, auto-rotativo,
 *  com setas no hover e bolinhas. Largura total; altura = proporção do banner atual. */
function FaixaRotativa({ banners }: { banners: BannerPortal[] }) {
  const [i, setI] = useState(0)
  const n = banners.length
  const ir = (idx: number) => setI(((idx % n) + n) % n)

  useEffect(() => {
    if (n <= 1) return
    const t = setInterval(() => setI((p) => (p + 1) % n), 6000)
    return () => clearInterval(t)
  }, [n])

  const b = banners[Math.min(i, n - 1)]
  const cor = b.cor ?? '#6366f1'
  const conteudo = b.imagem_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={b.id} src={b.imagem_url} alt={b.titulo ?? ''} className="block w-full animate-in fade-in duration-700" />
  ) : (
    <div key={b.id} className="flex animate-in items-center gap-3 fade-in p-4 duration-500" style={{ background: cor + '14' }}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: cor + '22', color: cor }}><Megaphone className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        {b.titulo && <p className="text-sm font-semibold">{b.titulo}</p>}
        {b.mensagem && <p className="text-xs text-muted-foreground">{b.mensagem}</p>}
      </div>
    </div>
  )

  return (
    <div className="group relative w-full overflow-hidden">
      {b.link ? <Link href={b.link} className="block transition hover:opacity-95">{conteudo}</Link> : conteudo}

      {n > 1 && (
        <>
          <button type="button" onClick={() => ir(i - 1)} aria-label="Anterior"
            className="absolute left-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-0 backdrop-blur transition hover:bg-black/55 group-hover:opacity-100">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => ir(i + 1)} aria-label="Próximo"
            className="absolute right-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-0 backdrop-blur transition hover:bg-black/55 group-hover:opacity-100">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-1.5">
            {banners.map((bb, idx) => (
              <button key={bb.id} type="button" onClick={() => ir(idx)} aria-label={`Ir para ${idx + 1}`}
                className={cn('h-1.5 rounded-full bg-white/60 transition-all', idx === i ? 'w-6 bg-white' : 'w-1.5 hover:bg-white/80')} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
