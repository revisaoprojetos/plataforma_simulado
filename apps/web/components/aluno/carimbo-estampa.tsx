'use client'

import { cn } from '@/lib/utils'
import type { CarimboEstampa } from '@/lib/leitura/carimbos-tipos'
import type { CSSProperties } from 'react'

// eslint-disable-next-line @next/next/no-img-element
const ImgPop = ({ src }: { src: string }) => <img src={src} alt="" aria-hidden className="h-full w-full object-contain motion-safe:animate-[carimbo-pop_.45s_cubic-bezier(.34,1.56,.64,1)_both]" />

/**
 * Uma estampa. O WRAPPER carrega posição/rotação (não animada) — a animação vai na IMG. `sobreposicao`
 * define o z-index relativo ao CONTEÚDO (que fica em z-10): 'atras' = z-1 (atrás do texto/botões),
 * 'frente' = z-20. `recortar` embrulha num contêiner `inset-0 overflow-hidden` (clipe) com o formato da
 * área (nó = círculo, card = arredondado), então o que passa da borda some.
 */
function EstampaEl({ e, anchor, clip }: { e: CarimboEstampa; anchor: CSSProperties; clip: string }) {
  const z = e.sobreposicao === 'atras' ? 1 : 20
  const inner = <span aria-hidden className="pointer-events-none absolute" style={{ ...anchor, width: e.tamanho, height: e.tamanho }}><ImgPop src={e.url} /></span>
  if (e.recortar) return <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', clip)} style={{ zIndex: z }}>{inner}</div>
  return <span aria-hidden className="pointer-events-none absolute" style={{ ...anchor, width: e.tamanho, height: e.tamanho, zIndex: z }}><ImgPop src={e.url} /></span>
}

/** Estampas no NÓ/dia (deslocamento em px a partir do centro do nó). Recorte = círculo do nó. */
export function EstampasNo({ estampas, aulaId }: { estampas: CarimboEstampa[]; aulaId: string }) {
  const list = estampas.filter((e) => e.alvo === 'no' && e.aulaId === aulaId && e.url)
  if (!list.length) return null
  return <>{list.map((e) => <EstampaEl key={e.id} e={e} clip="rounded-full" anchor={{ left: '50%', top: '50%', transform: `translate(calc(-50% + ${e.x}px), calc(-50% + ${e.y}px)) rotate(${e.rotacao}deg)` }} />)}</>
}

/** Estampas no BALÃO DE CONTEÚDO (deslocamento em px a partir do canto sup. direito). Recorte = card. */
export function EstampasCard({ estampas, aulaId }: { estampas: CarimboEstampa[]; aulaId: string }) {
  const list = estampas.filter((e) => e.alvo === 'card' && e.aulaId === aulaId && e.url)
  if (!list.length) return null
  return <>{list.map((e) => <EstampaEl key={e.id} e={e} clip="rounded-2xl" anchor={{ right: 0, top: 0, transform: `translate(calc(50% + ${e.x}px), calc(-50% + ${e.y}px)) rotate(${e.rotacao}deg)` }} />)}</>
}
