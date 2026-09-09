'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck, Search, Maximize2, Minimize2, X, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NotifItem {
  id: string
  nome: string
  email: string | null
  descricao: string
  em: string
  /** Link do admin (perfil do aluno naquele simulado/tentativa) — null se não aplicável. */
  href: string | null
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
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'todas' | 'naolidas'>('todas')
  const [expandido, setExpandido] = useState(false)
  // Snapshot do "última leitura" no momento em que o painel abriu — abrir marca tudo como lido (some
  // o badge), então guardamos esse marcador p/ ainda destacar/filtrar as que eram novas nesta abertura.
  const [marcador, setMarcador] = useState(0)
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
    // Poll a cada 5 min e SÓ com a aba visível (economia de egress). Ao voltar à aba, recarrega na hora.
    const t = setInterval(() => { if (!document.hidden) carregar() }, 300000)
    const onVis = () => { if (!document.hidden) carregar() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
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
    if (abrindo) {
      setMarcador(lastSeen)          // snapshot ANTES de marcar (p/ destacar/filtrar as novas)
      setBusca(''); setFiltro('todas')
      if (naoLidas > 0) marcarLidas()
    }
    setAberto(abrindo)
  }

  const ehNova = (i: NotifItem) => new Date(i.em).getTime() > marcador
  const q = busca.trim().toLowerCase()
  const visiveis = items.filter((i) =>
    (filtro === 'todas' || ehNova(i)) &&
    (!q || `${i.nome} ${i.email ?? ''} ${i.descricao}`.toLowerCase().includes(q)))
  const totalNovas = items.filter(ehNova).length

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
        // O sino fica no RODAPÉ da sidebar (canto inferior esquerdo) → abre pra CIMA e pra a DIREITA,
        // senão o painel saía pela borda esquerda/inferior da tela.
        <div className={cn('absolute bottom-full left-0 z-50 mb-2 flex max-w-[92vw] flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-xl ring-1 ring-black/5 transition-[width]', expandido ? 'w-[27rem]' : 'w-80')}>
          {/* Cabeçalho — selo da marca + contador + expandir + marcar lidas */}
          <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary"><Bell className="h-3.5 w-3.5" /></span>
              <span className="truncate text-sm font-semibold">Notificações</span>
              {totalNovas > 0 && <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">{totalNovas > 9 ? '9+' : totalNovas}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button onClick={marcarLidas} title="Marcar todas como lidas" className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-primary">
                <CheckCheck className="h-3.5 w-3.5" /> <span className={cn(expandido ? '' : 'hidden sm:inline')}>Marcar lidas</span>
              </button>
              <button onClick={() => setExpandido((v) => !v)} aria-label={expandido ? 'Recolher' : 'Expandir'} title={expandido ? 'Recolher' : 'Expandir'} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
                {expandido ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Busca + filtros */}
          <div className="space-y-2 border-b bg-muted/20 px-3 py-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar notificações…" className="h-8 w-full rounded-lg border bg-background pl-8 pr-7 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring" />
              {busca && <button onClick={() => setBusca('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <div className="flex gap-1">
              {([['todas', 'Todas', items.length], ['naolidas', 'Não lidas', totalNovas]] as const).map(([v, label, n]) => (
                <button key={v} onClick={() => setFiltro(v)} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition', filtro === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
                  {label}<span className={cn('rounded-full px-1 text-[10px] leading-none', filtro === v ? 'bg-primary-foreground/25' : 'bg-background/70')}>{n}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={cn('overflow-auto', expandido ? 'max-h-[70vh]' : 'max-h-96')}>
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Bell className="h-5 w-5" /></span>
                <p className="text-sm text-muted-foreground">Nenhuma atividade recente.</p>
              </div>
            ) : visiveis.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Search className="h-5 w-5" /></span>
                <p className="text-sm text-muted-foreground">{busca ? `Nada encontrado para “${busca}”.` : 'Nenhuma não lida.'}</p>
              </div>
            ) : (
              visiveis.map((i) => {
                const nova = ehNova(i)
                return (
                  // Item NÃO é link — assim dá pra selecionar/copiar nome e e-mail. Quem direciona é a seta ao lado da hora.
                  <div key={i.id} className={cn('relative flex items-start gap-3 border-b px-3.5 py-3 last:border-0', nova && 'bg-primary/[0.06]')}>
                    {nova && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary" />}
                    <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full text-xs font-bold', nova ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                      {(i.nome || '?').trim().charAt(0).toUpperCase() || '•'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm font-semibold leading-tight text-primary', expandido ? '' : 'truncate')}>{i.nome}</p>
                      {i.email && <p className={cn('text-[11px] leading-tight text-muted-foreground/80', expandido ? '' : 'truncate')}>{i.email}</p>}
                      <p className={cn('mt-0.5 text-xs leading-tight text-muted-foreground', expandido ? '' : 'truncate')}>{i.descricao}</p>
                    </div>
                    <div className="flex shrink-0 select-none flex-col items-end gap-1.5">
                      <span className="whitespace-nowrap text-[11px] text-muted-foreground">{tempoRelativo(i.em)}</span>
                      {i.href && (
                        <Link href={i.href} onClick={() => setAberto(false)} title="Ver desempenho do aluno neste simulado" aria-label="Ver desempenho do aluno neste simulado"
                          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
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
