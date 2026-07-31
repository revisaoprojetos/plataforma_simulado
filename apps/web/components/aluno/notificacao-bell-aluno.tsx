'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Bell, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NotifItem { id: string; tipo: string; titulo: string; mensagem: string | null; link: string | null; lida: boolean; criado_em: string }

/** Tempo relativo longo (estilo "há 2 horas", "ontem", "há 3 dias") — exibido em MAIÚSCULAS. */
function tempoRelativoLongo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} hora${h > 1 ? 's' : ''}`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ontem'
  if (d < 7) return `há ${d} dias`
  return new Date(iso).toLocaleDateString('pt-BR')
}

/** Sino de notificações do aluno — lê /api/aluno/notificacoes (estado `lida` real, persistido).
 *  Painel em PORTAL, ancorado ao sino (rodapé da sidebar), abre PARA CIMA com animação. */
export function NotificacaoBellAluno() {
  const [items, setItems] = useState<NotifItem[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [montado, setMontado] = useState(false) // presente no DOM (durante a animação)
  const [visivel, setVisivel] = useState(false)  // classe que dispara enter/exit
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const fecharTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/aluno/notificacoes')
      if (!res.ok) return
      const json = await res.json()
      setItems(Array.isArray(json.items) ? json.items : [])
      setNaoLidas(Number(json.naoLidas ?? 0))
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 60000)
    return () => clearInterval(t)
  }, [carregar])

  const fechar = useCallback(() => {
    setVisivel(false)
    if (fecharTimer.current) clearTimeout(fecharTimer.current)
    fecharTimer.current = setTimeout(() => setMontado(false), 200) // espera a animação de saída
  }, [])

  useEffect(() => {
    if (!montado) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return
      fechar()
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') fechar() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [montado, fechar])

  useEffect(() => () => { if (fecharTimer.current) clearTimeout(fecharTimer.current) }, [])

  async function marcarTodasLidas() {
    setItems((prev) => prev.map((i) => ({ ...i, lida: true })))
    setNaoLidas(0)
    await fetch('/api/aluno/notificacoes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {})
  }

  function abrir() {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    // Ancora à esquerda (junto à sidebar) e abre PARA CIMA a partir do sino.
    setPos({ left: Math.max(12, r.left - 8), bottom: window.innerHeight - r.top + 10 })
    if (fecharTimer.current) clearTimeout(fecharTimer.current)
    setMontado(true)
    // próximo frame: liga a classe visível → dispara a transição de entrada.
    requestAnimationFrame(() => requestAnimationFrame(() => setVisivel(true)))
  }

  function toggle() {
    if (montado && visivel) fechar()
    else abrir()
  }

  function irPara(i: NotifItem) {
    fechar()
    if (i.link) router.push(i.link)
  }

  return (
    <>
      <button ref={btnRef} onClick={toggle} aria-label="Notificações" className="relative flex h-9 w-9 items-center justify-center rounded-lg outline-none hover:bg-[color:var(--sidebar-accent)] focus-visible:ring-2 focus-visible:ring-ring">
        <Bell className="h-[1.15rem] w-[1.15rem]" />
        {naoLidas > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] animate-in zoom-in items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-[color:var(--sidebar)]">{naoLidas > 9 ? '9+' : naoLidas}</span>
        )}
      </button>

      {montado && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={{ left: pos.left, bottom: pos.bottom, background: 'var(--sidebar)', color: 'var(--sidebar-foreground)' }}
          className={cn(
            'fixed z-[120] flex max-h-[75vh] w-[340px] origin-bottom-left flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl transition-all duration-200 ease-out',
            visivel ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-3 scale-95 opacity-0',
          )}
        >
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <span className="text-base font-bold text-white">Notificações</span>
            <button onClick={fechar} aria-label="Fechar" className="rounded-md p-1 text-sidebar-foreground/60 transition-colors hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </header>

          <div className="min-h-0 flex-1 overflow-auto">
            {items.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-sidebar-foreground/50">Nenhuma notificação por aqui. ✨</p>
            ) : (
              items.map((i) => (
                <button key={i.id} onClick={() => irPara(i)} className={cn('flex w-full gap-3 border-b border-white/[0.06] px-5 py-4 text-left transition-colors last:border-0 hover:bg-white/5', i.link && 'cursor-pointer')}>
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: i.lida ? 'rgba(255,255,255,.18)' : 'var(--brand-accent)', boxShadow: i.lida ? undefined : '0 0 8px color-mix(in oklab, var(--brand-accent) 60%, transparent)' }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-white">{i.titulo}</p>
                    {i.mensagem && <p className="mt-0.5 text-[13px] leading-snug text-sidebar-foreground/60">{i.mensagem}</p>}
                    <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/40">{tempoRelativoLongo(i.criado_em)}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          {items.length > 0 && (
            <button onClick={marcarTodasLidas} className="shrink-0 border-t border-white/10 px-5 py-3.5 text-center text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-white/5 hover:text-white">
              Marcar todas como lidas
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
