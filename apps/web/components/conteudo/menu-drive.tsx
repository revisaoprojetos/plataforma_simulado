'use client'

// Menu de contexto estilo Google Drive (3 pontos) — COMPARTILHADO entre o admin e o aluno da Biblioteca.
// Extraído de app/admin/biblioteca/biblioteca-client.tsx para que o visual/animação/posicionamento sejam
// LITERALMENTE os mesmos nas duas áreas (mudar aqui afeta os dois). `MenuPortal` abre no anchor (flip p/
// cima se faltar espaço, fecha em clique-fora/scroll/resize) com animação; `ItemMenu` é a linha do menu.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, type LucideIcon } from 'lucide-react'

export function MenuPortal({ anchor, onClose, children, largura = 288 }: { anchor: HTMLElement | null; onClose: () => void; children: React.ReactNode; largura?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)
  useEffect(() => {
    if (!anchor) { setPos(null); return }
    const W = largura
    const r = anchor.getBoundingClientRect()
    const left = Math.min(Math.max(8, r.right - W), window.innerWidth - W - 8)
    const espacoAbaixo = window.innerHeight - r.bottom
    // Abre logo abaixo do botão (como o Drive); se faltar espaço embaixo e houver mais acima, abre pra cima.
    if (espacoAbaixo < 260 && r.top > espacoAbaixo) setPos({ bottom: window.innerHeight - r.top + 4, left })
    else setPos({ top: r.bottom + 4, left })
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose() }
    const onMove = () => onClose() // scroll/resize → fecha (evita o menu "soltar" do botão)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove) }
  }, [anchor, onClose, largura])
  if (!pos) return null
  return createPortal(
    <div ref={ref} style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: largura, maxHeight: '70vh', zIndex: 200 }} className="origin-top overflow-y-auto rounded-lg border bg-popover py-2 text-sm text-popover-foreground shadow-[0_2px_10px_rgba(0,0,0,0.12),0_12px_28px_rgba(0,0,0,0.12)] duration-100 animate-in fade-in-0 zoom-in-95" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  )
}

export function ItemMenu({ onClick, icon: Icone, children, destrutivo, atalho, submenu }: { onClick: () => void; icon: LucideIcon; children: React.ReactNode; destrutivo?: boolean; atalho?: string; submenu?: boolean }) {
  // Linha do menu no estilo Google Drive: espaçosa, ícone neutro à esquerda, atalho/chevron à direita.
  return (
    <button onClick={onClick} className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-[13.5px] transition-colors ${destrutivo ? 'text-destructive hover:bg-destructive/10' : 'text-popover-foreground hover:bg-accent'}`}>
      <Icone className={`h-[18px] w-[18px] shrink-0 ${destrutivo ? '' : 'text-muted-foreground'}`} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {atalho && <span className="shrink-0 text-xs text-muted-foreground">{atalho}</span>}
      {submenu && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
  )
}
