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
 *  Painel em PORTAL, ancorado ao sino (rodapé da sidebar), abre PARA CIMA com animação.
 *  `diagonal` (sidebar recolhida): o balão de aviso fica na diagonal superior-DIREITA do sino,
 *  com a ponta diagonal apontando pro ícone — sem isso ele buga colado na borda esquerda. */
export function NotificacaoBellAluno({ diagonal = false }: { diagonal?: boolean }) {
  const [items, setItems] = useState<NotifItem[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [montado, setMontado] = useState(false) // presente no DOM (durante a animação)
  const [visivel, setVisivel] = useState(false)  // classe que dispara enter/exit
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)
  const [balaoPos, setBalaoPos] = useState<{ left: number; bottom: number } | null>(null) // balão de aviso acima do sino
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
    // Poll a cada 5 min e SÓ com a aba visível (economia de egress). Ao voltar à aba, recarrega na hora.
    const t = setInterval(() => { if (!document.hidden) carregar() }, 300000)
    const onVis = () => { if (!document.hidden) carregar() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
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

  // Balão de aviso acima do sino: recalcula a posição quando há não-lidas.
  // Portal → não é cortado pela sidebar. Some sozinho quando `naoLidas` zera (marcar lidas).
  // ResizeObserver no botão: ao recolher/expandir a sidebar (o sino é display-togglado entre duas
  // instâncias) o tamanho muda de 0↔36 → recalcula/limpa sem depender de um resize da janela.
  useEffect(() => {
    if (naoLidas <= 0) { setBalaoPos(null); return }
    const calc = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r || !r.width) { setBalaoPos(null); return } // instância oculta (sidebar no outro estado)
      if (diagonal) {
        // Ancora no canto superior-direito do sino; o balão cresce p/ a direita e p/ cima.
        const left = Math.min(r.right - 2, window.innerWidth - 210)
        setBalaoPos({ left, bottom: window.innerHeight - r.top + 4 })
      } else {
        const centro = r.left + r.width / 2
        const left = Math.min(Math.max(centro, 96), window.innerWidth - 96) // clamp p/ não sair da tela
        setBalaoPos({ left, bottom: window.innerHeight - r.top + 10 })
      }
    }
    calc()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calc) : null
    if (ro && btnRef.current) ro.observe(btnRef.current)
    window.addEventListener('resize', calc)
    return () => { ro?.disconnect(); window.removeEventListener('resize', calc) }
  }, [naoLidas, diagonal])

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

  const temNaoLidas = naoLidas > 0
  return (
    <>
      <style>{`@keyframes sinoToca{0%{transform:rotate(0)}8%{transform:rotate(14deg)}16%{transform:rotate(-12deg)}24%{transform:rotate(9deg)}32%{transform:rotate(-6deg)}40%{transform:rotate(3deg)}48%,100%{transform:rotate(0)}}.sino-toca{animation:sinoToca 2.4s ease-in-out infinite;transform-origin:50% 2px}@keyframes balaoPop{0%{transform:translateY(8px) scale(.8);opacity:0}60%{transform:translateY(-2px) scale(1.05)}100%{transform:translateY(0) scale(1);opacity:1}}@keyframes balaoFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}.balao-pill{animation:balaoPop .38s ease-out,balaoFloat 2.2s ease-in-out .38s infinite}@media (prefers-reduced-motion:reduce){.sino-toca,.balao-pill{animation:none}}`}</style>
      <button ref={btnRef} onClick={toggle} aria-label="Notificações" className="relative flex h-9 w-9 items-center justify-center rounded-lg outline-none hover:bg-[color:var(--sidebar-accent)] focus-visible:ring-2 focus-visible:ring-ring">
        <Bell className={cn('h-[1.15rem] w-[1.15rem]', temNaoLidas && 'sino-toca')} fill={temNaoLidas ? 'currentColor' : 'none'} />
        {naoLidas > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] animate-in zoom-in items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-[color:var(--sidebar)]">{naoLidas > 9 ? '9+' : naoLidas}</span>
        )}
      </button>

      {/* Balão de aviso — só quando há não-lidas e o painel está fechado. Some ao marcar lidas.
          Normal: acima do sino, cresce p/ a ESQUERDA, ponta pra baixo.
          Diagonal (sidebar recolhida): na diagonal superior-DIREITA do sino, ponta diagonal p/ o ícone. */}
      {naoLidas > 0 && !montado && balaoPos && typeof document !== 'undefined' && createPortal(
        diagonal ? (
          <div className="pointer-events-none fixed z-[115]" style={{ left: balaoPos.left, bottom: balaoPos.bottom }} aria-hidden>
            <div className="balao-pill absolute bottom-0 left-1 flex items-center whitespace-nowrap rounded-full rounded-bl-md px-3 py-1.5 text-xs font-bold text-white shadow-lg" style={{ background: 'var(--brand-accent, var(--primary))' }}>
              {naoLidas} {naoLidas === 1 ? 'nova notificação' : 'novas notificações'}
              {/* ponta DIAGONAL no canto inferior-esquerdo, apontando p/ o sino (baixo-esquerda) */}
              <span className="absolute -bottom-1 -left-1 h-3 w-3 rotate-45 rounded-[3px]" style={{ background: 'var(--brand-accent, var(--primary))' }} />
            </div>
          </div>
        ) : (
          <div className="pointer-events-none fixed z-[115] translate-x-1.5" style={{ left: balaoPos.left, bottom: balaoPos.bottom }} aria-hidden>
            <div className="balao-pill absolute -right-3 bottom-0 flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-lg" style={{ background: 'var(--brand-accent, var(--primary))' }}>
              {naoLidas} {naoLidas === 1 ? 'nova notificação' : 'novas notificações'}
              {/* ponta apontando pra baixo, alinhada ao sino */}
              <span className="absolute -bottom-1 right-3 h-2.5 w-2.5 rotate-45" style={{ background: 'var(--brand-accent, var(--primary))' }} />
            </div>
          </div>
        ),
        document.body,
      )}

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
