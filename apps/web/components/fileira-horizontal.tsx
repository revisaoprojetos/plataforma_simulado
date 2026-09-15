'use client'

import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { SetaDegrade } from '@/components/seta-degrade'

/**
 * Fileira horizontal estilo Netflix (reutilizável admin + aluno): rola exatamente UM card por
 * clique; setas cinza com degradê que fundem na borda dos cards e expandem no hover. Os cards
 * (children) definem a própria largura — normalmente via `basis-[...]` para espiar o próximo.
 *
 * `setasFora`: setas FORA dos cards (nas laterais), sem degradê — os cards ficam ENTRE as 2 setas.
 */
export function FileiraHorizontal({ titulo, count, children, setasFora = false }: {
  titulo?: string; count?: number; children: React.ReactNode; setasFora?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [canL, setCanL] = useState(false)
  const [canR, setCanR] = useState(false)
  const atualiza = () => {
    const el = ref.current
    if (!el) return
    setCanL(el.scrollLeft > 4)
    setCanR(Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth - 4)
  }
  useEffect(() => {
    atualiza()
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', atualiza, { passive: true })
    window.addEventListener('resize', atualiza)
    // Roda do mouse VERTICAL → rola o carrossel na HORIZONTAL (só quando há overflow horizontal e o gesto
    // é predominantemente vertical; trackpad horizontal segue nativo). passive:false p/ poder preventDefault.
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 4) return
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    // Reavalia quando o conteúdo muda de tamanho (imagens carregando, etc.).
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(atualiza) : null
    ro?.observe(el)
    return () => { el.removeEventListener('scroll', atualiza); el.removeEventListener('wheel', onWheel); window.removeEventListener('resize', atualiza); ro?.disconnect() }
  }, [])
  // Rola exatamente UM card por vez (largura do 1º card + gap de 1rem).
  const rolar = (dir: -1 | 1) => {
    const el = ref.current
    if (!el) return
    const primeiro = el.firstElementChild as HTMLElement | null
    const passo = primeiro ? primeiro.offsetWidth + 16 : el.clientWidth
    el.scrollBy({ left: dir * passo, behavior: 'smooth' })
  }
  const Cabecalho = titulo ? (
    <h3 className="flex items-center gap-1.5 text-sm font-semibold">
      {titulo}{count != null && <span className="text-xs font-normal text-muted-foreground">({count})</span>}
    </h3>
  ) : null

  // Setas FORA: linha [seta ◀] [scroll dos cards] [seta ▶] — sem degradê, cards entre as setas.
  if (setasFora) {
    // Setas SEMPRE ativas (não "bloqueiam"): nas pontas o scroll só não anda (clamp), mas dá pra clicar.
    const setaCls = 'flex w-9 shrink-0 items-center justify-center self-stretch rounded-xl border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground'
    return (
      <section className="space-y-2">
        {Cabecalho}
        <div className="flex items-stretch gap-2">
          <button type="button" onClick={() => rolar(-1)} aria-label="Ver anteriores" className={setaCls}><ChevronLeft className="h-5 w-5" /></button>
          {/* rounded-2xl: as pontas cortadas dos cards seguem o cantinho arredondado (sem corte reto). */}
          <div ref={ref} className="-my-2 flex min-w-0 flex-1 gap-4 overflow-x-auto rounded-2xl px-0.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {children}
          </div>
          <button type="button" onClick={() => rolar(1)} aria-label="Ver próximos" className={setaCls}><ChevronRight className="h-5 w-5" /></button>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-2">
      {Cabecalho}
      <div className="group relative">
        {/* py-2 dá folga vertical: overflow-x-auto também recorta na vertical, então sem isso o
            card cortaria no topo ao subir no hover (-translate-y). O -my-2 mantém o alinhamento. */}
        <div ref={ref} className="-my-2 flex gap-4 overflow-x-auto px-0.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
        {/* Setas DEPOIS dos cards no DOM → a cascata de entrada dá índice ALTO (entram junto/depois dos
            cards, não antes). insetY inset-y-2 casa o degradê com a altura real dos cards (desconta o py-2). */}
        {canL && <SetaDegrade dir="left" onClick={() => rolar(-1)} label="Ver anteriores" insetY="inset-y-2" />}
        {canR && <SetaDegrade dir="right" onClick={() => rolar(1)} label="Ver próximos" insetY="inset-y-2" />}
      </div>
    </section>
  )
}
