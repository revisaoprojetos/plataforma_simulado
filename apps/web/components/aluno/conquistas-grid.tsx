'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Award, Lock, X } from 'lucide-react'
import type { ConquistaView } from '@/lib/gamificacao/leitura'
import { iconeConquista, corConquista } from '@/lib/gamificacao/icones'
import { ConquistaIconeFx } from '@/components/gamificacao/conquista-icone'
import { formatBrt } from '@/lib/brt'

function dataCurta(iso: string | null): string | null {
  const f = formatBrt(iso)
  if (!f) return null
  const [d, t] = f.split(' ')
  const [dd, mm, yy] = d.split('/')
  return `${dd}/${mm}/${yy.slice(2)} ${t}`
}

type Hover = { c: ConquistaView; x: number; y: number }

/** Tile de uma conquista: desbloqueada colorida; bloqueada em cinza com cadeado.
 * `mostrarData` (só no "Ver todas") exibe a data/hora conquistada, fixada na base do tile. */
function Tile({ c, fixo, mostrarData, onHover }: { c: ConquistaView; fixo?: boolean; mostrarData?: boolean; onHover: (h: Hover | null) => void }) {
  const Icon = iconeConquista(c.def.icone)
  const cor = c.def.cor || corConquista(c.def.id)
  const data = mostrarData && c.desbloqueada ? dataCurta(c.desbloqueadoEm) : null
  const enter = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    onHover({ c, x: r.left + r.width / 2, y: r.top })
  }
  return (
    <div
      onMouseEnter={enter}
      onMouseLeave={() => onHover(null)}
      className={`group flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${fixo ? 'w-[92px] shrink-0' : ''} ${c.desbloqueada ? '' : 'opacity-55'}`}
      style={c.desbloqueada ? { borderColor: `color-mix(in oklab, ${cor} 35%, transparent)`, background: `color-mix(in oklab, ${cor} 7%, transparent)` } : undefined}
    >
      <span className={`relative flex h-11 w-11 items-center justify-center rounded-full ${c.def.icone === 'rocket' ? 'overflow-hidden' : 'overflow-visible'} ${c.desbloqueada ? '' : 'bg-muted text-muted-foreground'}`}
        style={c.desbloqueada ? { background: `color-mix(in oklab, ${cor} 18%, transparent)`, color: cor } : undefined}>
        {c.desbloqueada ? <ConquistaIconeFx icone={c.def.icone} /> : <Icon className="h-5 w-5" />}
        {!c.desbloqueada && <Lock className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-background p-0.5 text-muted-foreground" />}
      </span>
      <span className="line-clamp-2 text-[11px] font-medium leading-tight">{c.def.titulo}</span>
      {/* Reserva a linha da data em todos os tiles do modal → base alinhada mesmo quando bloqueada/sem data. */}
      {mostrarData && <span className="mt-auto pt-0.5 text-[9px] leading-tight tabular-nums text-muted-foreground">{data ?? ' '}</span>}
    </div>
  )
}

/** Tooltip flutuante (portal) com os requisitos da conquista — evita ser cortado por overflow. */
function TooltipConquista({ h }: { h: Hover }) {
  if (typeof document === 'undefined') return null
  const x = Math.min(Math.max(h.x, 150), window.innerWidth - 150)
  return createPortal(
    <div className="pointer-events-none fixed z-[110] -translate-x-1/2 -translate-y-full" style={{ left: x, top: h.y - 10 }}>
      <div className="max-w-[260px] rounded-lg bg-foreground px-3 py-2 text-left text-xs text-background shadow-xl">
        <div className="font-semibold">{h.c.def.titulo}</div>
        <div className="mt-0.5 text-background/80">{h.c.def.descricao}</div>
        {h.c.desbloqueada && h.c.desbloqueadoEm && <div className="mt-1 text-[10px] text-background/60">Conquistada em {formatBrt(h.c.desbloqueadoEm)}</div>}
      </div>
      <span className="mx-auto block h-2 w-2 -translate-y-1 rotate-45 bg-foreground" />
    </div>,
    document.body,
  )
}

/** Grade de conquistas: prévia em UMA linha + pop-up com todas (desbloqueadas × bloqueadas). */
export function ConquistasGrid({ conquistas }: { conquistas: ConquistaView[] }) {
  const [aberto, setAberto] = useState(false)
  const [hover, setHover] = useState<Hover | null>(null)
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [aberto])

  if (!conquistas.length) return null
  const desbloqueadas = conquistas.filter((c) => c.desbloqueada)
  const bloqueadas = conquistas.filter((c) => !c.desbloqueada)
  const preview = [...desbloqueadas, ...bloqueadas]

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Award className="h-4 w-4 text-primary" /> Conquistas</h3>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">{desbloqueadas.length} de {conquistas.length} desbloqueadas</span>
          <button type="button" onClick={() => setAberto(true)}
            className="rounded-lg border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
            Ver todas
          </button>
        </div>
      </div>

      {/* Uma linha só (o excedente fica escondido; "Ver todas" abre o pop-up). */}
      <div className="relative">
        <div className="flex gap-2 overflow-hidden">
          {preview.map((c) => <Tile key={c.def.id} c={c} fixo onHover={setHover} />)}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent" />
      </div>

      {hover && <TooltipConquista h={hover} />}

      {aberto && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setAberto(false)}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Award className="h-4 w-4 text-primary" /> Conquistas <span className="text-xs font-normal text-muted-foreground">· {desbloqueadas.length} de {conquistas.length}</span></h3>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-5 overflow-y-auto p-5 [scrollbar-width:thin]">
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Desbloqueadas ({desbloqueadas.length})</h4>
                {desbloqueadas.length ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                    {desbloqueadas.map((c) => <Tile key={c.def.id} c={c} mostrarData onHover={setHover} />)}
                  </div>
                ) : <p className="text-sm text-muted-foreground">Nenhuma ainda — faça simulados para desbloquear. 🚀</p>}
              </section>
              {bloqueadas.length > 0 && (
                <section>
                  <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Bloqueadas ({bloqueadas.length})</h4>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                    {bloqueadas.map((c) => <Tile key={c.def.id} c={c} mostrarData onHover={setHover} />)}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
