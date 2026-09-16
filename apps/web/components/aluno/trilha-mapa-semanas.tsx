'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { Award } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Trilha, TrilhaNode } from '@/components/aluno/trilha-simulados'
import { SimboloNo } from '@/components/gamificacao/simbolo-no'
import { coresNo, DEFAULT_TRILHA_SIMBOLOS, type TrilhaSimbolos, type SimboloEstado } from '@/lib/gamificacao/trilha-simbolos'

const MIN_STEP = 210    // largura mínima de uma "célula" (nó + card) → define quantos cabem por linha
const STEP_Y = 168
const R = 30            // raio do nó
const PAD_TOP = 40

const estadoDe = (n: TrilhaNode): SimboloEstado => n.estado === 'concluido' ? 'concluido' : n.estado === 'atual' ? 'atual' : 'disponivel'

function Secao({ t, simbolos }: { t: Trilha; simbolos: TrilhaSimbolos }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [aberto, setAberto] = useState<string | null>(t.nodes.find((n) => n.estado === 'atual')?.id ?? null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const calc = () => setW(el.clientWidth)
    calc()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calc) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])

  const liberada = t.total > 0 && t.done >= t.total
  const cols = Math.max(2, Math.floor(w / MIN_STEP)) || 2
  const stepX = w > 0 ? w / cols : MIN_STEP
  const cardW = Math.min(190, stepX - 14)
  // "Boustrophedon": linha par esquerda→direita, ímpar direita→esquerda; curva SÓ no fim da linha.
  const cellCol = (i: number) => { const r = Math.floor(i / cols); const inRow = i % cols; return { r, c: r % 2 === 0 ? inRow : cols - 1 - inRow } }
  const cx = (c: number) => c * stepX + stepX / 2
  const cy = (r: number) => PAD_TOP + r * STEP_Y + R

  const pts = t.nodes.map((n, i) => ({ n, ...cellCol(i) }))
  const medalIdx = t.nodes.length
  const medal = cellCol(medalIdx)
  const todos = [...pts.map((p) => ({ r: p.r, c: p.c, feito: p.n.estado === 'concluido' })), { r: medal.r, c: medal.c, feito: false }]
  const rows = Math.floor(medalIdx / cols) + 1
  const height = PAD_TOP + rows * STEP_Y + 20

  return (
    <section className="space-y-3">
      {/* Header enxuto (nome da trilha + progresso) — sem moldura de "semana". */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/30 px-4 py-2.5">
        <span className="truncate text-sm font-semibold">{t.nome}</span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Award className="h-3.5 w-3.5" /> medalha ao concluir · {t.done} de {t.total}
        </span>
      </div>

      <div ref={wrapRef} className="relative w-full">
        {w > 0 && (
          <div className="relative" style={{ height }}>
            {/* Conectores: linhas pontilhadas na horizontal + curva em U só no fim da linha. */}
            <svg className="absolute left-0 top-0" width={w} height={height} aria-hidden>
              {todos.slice(0, -1).map((p, k) => {
                const q = todos[k + 1]
                const cor = p.feito ? 'var(--primary)' : 'var(--border)'
                const x1 = cx(p.c), y1 = cy(p.r), x2 = cx(q.c), y2 = cy(q.r)
                if (p.r === q.r) return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={cor} strokeWidth={4} strokeDasharray="2 9" strokeLinecap="round" />
                const bulge = p.r % 2 === 0 ? stepX * 0.42 : -stepX * 0.42
                return <path key={k} d={`M ${x1} ${y1} C ${x1 + bulge} ${y1}, ${x1 + bulge} ${y2}, ${x2} ${y2}`} fill="none" stroke={cor} strokeWidth={4} strokeDasharray="2 9" strokeLinecap="round" />
              })}
            </svg>

            {/* Nós + cards */}
            {pts.map((p) => {
              const n = p.n
              const est = estadoDe(n)
              const c = coresNo(est, simbolos[est])
              const atual = n.estado === 'atual'
              const href = n.hrefLeitura ?? n.href
              return (
                <div key={n.id} className="absolute -translate-x-1/2" style={{ left: cx(p.c), top: cy(p.r) - R, width: cardW }}>
                  <div className="mx-auto flex flex-col items-center">
                    <div className="relative">
                      {atual && <span className="absolute -top-5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow">você está aqui</span>}
                      {atual && <span className="pointer-events-none absolute inset-[-5px] rounded-full border-2 opacity-60 motion-safe:animate-ping" style={{ borderColor: c.borda }} />}
                      <button type="button" onClick={() => setAberto((v) => v === n.id ? null : n.id)} aria-label={n.titulo}
                        className={cn('flex items-center justify-center rounded-full border-4 shadow-sm transition-transform hover:scale-105', aberto === n.id && 'ring-4 ring-primary/25')}
                        style={{ width: R * 2, height: R * 2, background: c.fundo, borderColor: c.borda }}>
                        <SimboloNo config={simbolos[est]} escala={0.78} cor={c.simbolo} />
                      </button>
                    </div>
                    <div className={cn('mt-2 w-full rounded-xl border px-3 py-2 text-center shadow-sm', atual ? 'border-primary/40 bg-primary/[0.05]' : 'bg-card')}>
                      <p className="line-clamp-2 text-[13px] font-semibold leading-snug">{n.titulo}</p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{n.statusLabel || n.quando || (href ? '' : 'Conclua a aula anterior')}</p>
                      {aberto === n.id && href && (
                        <Link href={href} className={cn('mt-2 inline-flex w-full items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-all active:scale-[0.98]',
                          n.estado === 'concluido' ? 'border bg-card hover:bg-muted' : 'bg-primary text-primary-foreground hover:brightness-110')}>
                          {n.acaoLeitura ?? n.acao}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Medalha — marco no fim da trilha */}
            <div className="absolute -translate-x-1/2" style={{ left: cx(medal.c), top: cy(medal.r) - R, width: cardW }}>
              <div className="mx-auto flex flex-col items-center">
                <span className={cn('flex items-center justify-center rounded-full border-4 border-dashed', liberada ? 'text-amber-500' : 'text-muted-foreground/60')}
                  style={{ width: R * 2, height: R * 2, background: liberada ? 'color-mix(in oklab, #f0b000 18%, var(--card))' : 'var(--muted)', borderColor: liberada ? '#f0b000' : 'var(--border)' }}>
                  <Award className="h-6 w-6" />
                </span>
                <div className="mt-2 w-full rounded-xl border bg-card px-3 py-2 text-center shadow-sm">
                  <p className="text-[13px] font-semibold">Medalha</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">conclua as {t.total} aulas</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/** Formato "Trilha horizontal": segue na horizontal e curva só no fim da linha (largura dinâmica). */
export function TrilhaMapaSemanas({ trilhas, simbolos = DEFAULT_TRILHA_SIMBOLOS }: { trilhas: Trilha[]; simbolos?: TrilhaSimbolos }) {
  return (
    <div className="space-y-8">
      {trilhas.map((t) => <Secao key={t.id} t={t} simbolos={simbolos} />)}
    </div>
  )
}
