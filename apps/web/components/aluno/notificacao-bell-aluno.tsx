'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NotifItem { id: string; tipo: string; titulo: string; mensagem: string | null; link: string | null; lida: boolean; criado_em: string }

function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  return `${Math.floor(h / 24)} d`
}

/** Sino de notificações do aluno — lê /api/aluno/notificacoes (estado `lida` real, persistido). */
export function NotificacaoBellAluno() {
  const [items, setItems] = useState<NotifItem[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!aberto) return
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [aberto])

  async function marcarTodasLidas() {
    setItems((prev) => prev.map((i) => ({ ...i, lida: true })))
    setNaoLidas(0)
    await fetch('/api/aluno/notificacoes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {})
  }

  function toggle() {
    const abrindo = !aberto
    setAberto(abrindo)
    if (abrindo && naoLidas > 0) marcarTodasLidas()
  }

  function abrir(i: NotifItem) {
    setAberto(false)
    if (i.link) router.push(i.link)
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} aria-label="Notificações" className="relative flex h-9 w-9 items-center justify-center rounded-full outline-none hover:bg-[color:var(--sidebar-accent)] focus-visible:ring-2 focus-visible:ring-ring">
        <Bell className="h-[1.15rem] w-[1.15rem]" />
        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{naoLidas > 9 ? '9+' : naoLidas}</span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notificações</span>
            <button onClick={marcarTodasLidas} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><CheckCheck className="h-3.5 w-3.5" /> Marcar lidas</button>
          </div>
          <div className="max-h-96 overflow-auto">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhuma notificação.</p>
            ) : (
              items.map((i) => (
                <button key={i.id} onClick={() => abrir(i)} className={cn('flex w-full gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/50', !i.lida && 'bg-primary/5')}>
                  <div className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', !i.lida ? 'bg-primary' : 'bg-transparent')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.titulo}</p>
                    {i.mensagem && <p className="truncate text-xs text-muted-foreground">{i.mensagem}</p>}
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{tempoRelativo(i.criado_em)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
