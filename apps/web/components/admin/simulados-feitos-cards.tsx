'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
import { SessaoAcoesMenu } from './sessao-acoes-menu'
import { iconeBanco } from '@/lib/banco-visual'
import type { SessaoRow } from './historico-estudante'
import { ClipboardList, Search, Trophy, Repeat, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type Visual = { cor: string | null; icone: string | null; capa: string | null; bancoId: string | null }
const notaTom = (n: number | null) =>
  n == null ? 'text-white/70' : n >= 7 ? 'text-emerald-300' : n >= 5 ? 'text-amber-300' : 'text-rose-300'

type Grupo = { simuladoId: string; titulo: string; tipo: SessaoRow['tipo']; nTent: number; melhor: number | null; media: number | null; ultima: SessaoRow }

export function SimuladosFeitosCards({ rows, estudanteId, estudanteNome, visuais, sempreAberto = false }: { rows: SessaoRow[]; estudanteId: string; estudanteNome?: string; visuais: Record<string, Visual>; sempreAberto?: boolean }) {
  const [aberto, setAberto] = useState(sempreAberto)
  const [busca, setBusca] = useState('')

  const grupos = useMemo<Grupo[]>(() => {
    const m = new Map<string, SessaoRow[]>()
    for (const r of rows) { const arr = m.get(r.simuladoId) ?? []; arr.push(r); m.set(r.simuladoId, arr) }
    return [...m.values()].map((sess) => {
      const comNota = sess.filter((s) => s.nota != null).map((s) => s.nota as number)
      return {
        simuladoId: sess[0].simuladoId, titulo: sess[0].titulo, tipo: sess[0].tipo, nTent: sess.length,
        melhor: comNota.length ? Math.max(...comNota) : null,
        media: comNota.length ? Math.round((comNota.reduce((a, b) => a + b, 0) / comNota.length) * 10) / 10 : null,
        ultima: sess[0], // rows já vêm ordenados por início desc → a mais recente
      }
    })
  }, [rows])

  const q = busca.trim().toLowerCase()
  const filtrados = q ? grupos.filter((g) => g.titulo.toLowerCase().includes(q)) : grupos

  return (
    <Card className="overflow-hidden">
      {/* Cabeçalho compacto: título à esquerda, busca à direita */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <button type="button" onClick={() => !sempreAberto && setAberto((v) => !v)} className={cn('flex items-center gap-2.5 text-left', sempreAberto && 'cursor-default')}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="h-4 w-4" /></span>
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold">Simulados feitos</p>
            <p className="text-[11px] text-muted-foreground">{grupos.length} simulado(s)</p>
          </div>
          {!sempreAberto && <ChevronDown className={cn('ml-1 h-4 w-4 shrink-0 transition-transform', aberto && 'rotate-180')} />}
        </button>
        {aberto && (
          <div className="relative ml-auto min-w-[170px] flex-1 sm:max-w-[280px] sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar simulado…"
              className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-1.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
        )}
      </div>

      {aberto && (
        <div className="border-t p-4">
          {filtrados.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum simulado feito.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtrados.map((g) => {
                const v = visuais[g.simuladoId] ?? { cor: null, icone: null, capa: null, bancoId: null }
                const Icon = iconeBanco(v.icone)
                const c = v.cor ?? '#6d28d9'
                const u = g.ultima
                return (
                  <div key={g.simuladoId} className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
                    {v.capa
                      ? <img src={v.capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />}
                    {!v.capa && <Icon className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

                    {/* link cobre o card (abaixo do kebab) */}
                    <Link href={`/admin/estudantes/${estudanteId}/simulado/${g.simuladoId}`} className="absolute inset-0 z-10" aria-label={g.titulo} />

                    {/* chip do ícone */}
                    <span className="pointer-events-none absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ring-1 ring-white/20" style={{ background: c }}>
                      <Icon className="h-4 w-4" />
                    </span>

                    {/* AÇÕES (última tentativa) — acima do link */}
                    <div className="absolute right-2 top-2 z-30 rounded-lg bg-black/40 backdrop-blur [&_button:hover]:!bg-white/20 [&_button]:!text-white/90">
                      <SessaoAcoesMenu cadId={u.cadId} mods={u.mods} estudanteId={estudanteId} sessaoId={u.id} simuladoId={u.simuladoId} temResultado={u.temResultado} estudanteNome={estudanteNome} simuladoTitulo={u.titulo} />
                    </div>

                    {/* rodapé */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/80 backdrop-blur">Simulado feito</span>
                        <span className={cn('inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-xs font-bold tabular-nums backdrop-blur', notaTom(g.melhor))}><Trophy className="h-3 w-3" /> {g.melhor != null ? g.melhor.toFixed(1) : '—'}</span>
                      </div>
                      <h3 className="line-clamp-2 text-base font-bold leading-tight text-white drop-shadow-sm">{g.titulo}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <TipoSimuladoBadge tipo={g.tipo} />
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur"><Repeat className="h-3 w-3" /> {g.nTent}x</span>
                        {g.media != null && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">média {g.media.toFixed(1)}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
