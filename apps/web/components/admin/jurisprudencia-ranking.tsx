'use client'

import { useEffect, useState } from 'react'
import { Loader2, Trophy, Crown, Medal, Award, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

type Materia = { id: string; nome: string; curto: string; icon?: string; dias: number[] }
type Row = { nome: string; ini?: string; pts: number; selos?: number; you?: boolean }
type Tab = 'geral' | 'dia' | 'materia'

const iniciais = (n: string) => (n || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

// Ranking do desafio no estilo arcade/pixel (tokens white-label). Abas Geral/Dia/Matéria.
export function JurisRanking({ desafioId, materias }: { desafioId: string; materias: Materia[] }) {
  const [tab, setTab] = useState<Tab>('geral')
  const [ref, setRef] = useState<string>('1') // dia (número) ou materiaId
  const [rows, setRows] = useState<Row[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    setCarregando(true); setErro(null)
    try {
      const qs = new URLSearchParams({ desafio: desafioId, tab })
      if (tab !== 'geral') qs.set('ref', ref)
      const r = await fetch(`/api/jurisprudencia/ranking?${qs.toString()}`, { cache: 'no-store' })
      if (!r.ok) throw new Error('Falha ao carregar o ranking.')
      const data = await r.json()
      setRows(Array.isArray(data?.rows) ? data.rows : [])
    } catch (e: any) {
      setErro(e?.message ?? 'Erro ao carregar.')
      setRows([])
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab, ref, desafioId])

  // Primeiro valor válido de ref ao trocar de aba.
  useEffect(() => {
    if (tab === 'materia') setRef((r) => (materias.some((m) => m.id === r) ? r : (materias[0]?.id ?? '')))
    if (tab === 'dia') setRef((r) => (/^\d+$/.test(r) ? r : '1'))
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [tab])

  const topo = rows.slice(0, 3)
  const resto = rows.slice(3)

  return (
    <div className="space-y-4">
      {/* Abas + seletor de referência */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border bg-muted/40 p-1">
          {(['geral', 'dia', 'materia'] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn('rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors', tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {t === 'geral' ? 'Geral' : t === 'dia' ? 'Por dia' : 'Por matéria'}
            </button>
          ))}
        </div>

        {tab === 'dia' && (
          <select value={ref} onChange={(e) => setRef(e.target.value)} className="rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => <option key={n} value={String(n)}>Dia {n}</option>)}
          </select>
        )}
        {tab === 'materia' && (
          <select value={ref} onChange={(e) => setRef(e.target.value)} className="rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            {materias.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        )}

        <button type="button" onClick={carregar} title="Atualizar" className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <RefreshCw className={cn('h-4 w-4', carregando && 'animate-spin')} /> Atualizar
        </button>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando ranking…</div>
      ) : erro ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{erro}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center shadow-sm">
          <Trophy className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Ninguém pontuou aqui ainda.</p>
        </div>
      ) : (
        <>
          {/* Pódio arcade */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[1, 0, 2].map((pos) => {
              const r = topo[pos]
              if (!r) return <div key={pos} />
              const medalha = pos === 0 ? 'text-amber-400' : pos === 1 ? 'text-slate-300' : 'text-amber-700'
              const alturas = pos === 0 ? 'sm:mt-0' : 'sm:mt-6'
              const Ico = pos === 0 ? Crown : pos === 1 ? Medal : Award
              return (
                <div key={pos} className={cn('flex flex-col items-center rounded-2xl border bg-gradient-to-b from-primary/10 to-transparent p-3 text-center shadow-sm', alturas, r.you && 'ring-2 ring-primary')}>
                  <Ico className={cn('mb-1 h-6 w-6', medalha)} />
                  <div className={cn('flex h-12 w-12 items-center justify-center rounded-full border-2 bg-card text-sm font-bold', pos === 0 ? 'border-amber-400' : 'border-primary/30')}>
                    {r.ini || iniciais(r.nome)}
                  </div>
                  <span className="mt-1.5 line-clamp-1 text-xs font-semibold">{r.nome}{r.you && ' (você)'}</span>
                  <span className="font-mono text-base font-bold tabular-nums text-primary">{r.pts.toLocaleString('pt-BR')}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">pontos</span>
                </div>
              )
            })}
          </div>

          {/* Demais colocados */}
          {resto.length > 0 && (
            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              {resto.map((r, i) => (
                <div key={i} className={cn('flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0', r.you && 'bg-primary/5')}>
                  <span className="w-6 shrink-0 text-center font-mono text-sm font-bold tabular-nums text-muted-foreground">{i + 4}</span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-bold">{r.ini || iniciais(r.nome)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.nome}{r.you && <span className="ml-1 text-xs text-primary">(você)</span>}</span>
                  {typeof r.selos === 'number' && r.selos > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400"><Medal className="h-3 w-3" /> {r.selos}</span>
                  )}
                  <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-primary">{r.pts.toLocaleString('pt-BR')}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
