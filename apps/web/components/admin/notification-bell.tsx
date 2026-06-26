'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NotifItem {
  id: string
  titulo: string
  descricao: string
  em: string
}

const LAST_SEEN_KEY = 'admin_notif_last_seen'

function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  return `${d} d`
}

export function NotificationBell() {
  const [items, setItems] = useState<NotifItem[]>([])
  const [lastSeen, setLastSeen] = useState<number>(0)
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/notificacoes')
      if (!res.ok) return
      const json = await res.json()
      setItems(Array.isArray(json.items) ? json.items : [])
    } catch {
      /* silencioso */
    }
  }, [])

  useEffect(() => {
    const ls = Number(localStorage.getItem(LAST_SEEN_KEY) ?? 0)
    setLastSeen(ls)
    carregar()
    const t = setInterval(carregar, 60000)
    return () => clearInterval(t)
  }, [carregar])

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [aberto])

  const naoLidas = items.filter((i) => new Date(i.em).getTime() > lastSeen).length

  function marcarLidas() {
    const agora = Date.now()
    localStorage.setItem(LAST_SEEN_KEY, String(agora))
    setLastSeen(agora)
  }

  function toggle() {
    const abrindo = !aberto
    setAberto(abrindo)
    if (abrindo && naoLidas > 0) marcarLidas()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notificações"
        className="relative flex h-9 w-9 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-[1.15rem] w-[1.15rem]" />
        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-lg border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notificações</span>
            <button
              onClick={marcarLidas}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Marcar lidas
            </button>
          </div>
          <div className="max-h-96 overflow-auto">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Nenhuma atividade recente.
              </p>
            ) : (
              items.map((i) => {
                const nova = new Date(i.em).getTime() > lastSeen
                return (
                  <div
                    key={i.id}
                    className={cn('flex gap-3 border-b px-3 py-2.5 last:border-0', nova && 'bg-primary/5')}
                  >
                    <div className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', nova ? 'bg-primary' : 'bg-transparent')} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{i.titulo}</p>
                      <p className="truncate text-xs text-muted-foreground">{i.descricao}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{tempoRelativo(i.em)}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
