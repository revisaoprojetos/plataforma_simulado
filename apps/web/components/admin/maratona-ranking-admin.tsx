'use client'

// RANKING ADMIN da maratona (suporte): nomes/e-mails REAIS + detalhe por etapa (check-in, tempo que conta,
// tentativas, flags "refez"/"tentativa < mínimo"). Resolve "não dá pra ver quem são / quem fez <20min / 2x".
import { useEffect, useMemo, useState, useTransition } from 'react'
import { Trophy, Search, Check, AlertTriangle, RotateCcw, Loader2, Hash, Medal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { obterRankingMaratonaAdmin } from '@/app/admin/simulados/desafios-actions'
import type { MaratonaRankingAdminData, MaratonaAdminCelula } from '@/lib/maratona/carregar'

const fmtDur = (seg: number) => { const s = Math.max(0, Math.round(seg || 0)); const m = Math.floor(s / 60), ss = s % 60; return m ? `${m}min${ss ? ' ' + ss + 's' : ''}` : `${ss}s` }
const fmtMin = (seg: number) => `${Math.floor((seg || 0) / 60)}min`

type Filtro = 'todos' | 'com' | 'sem' | 'refez' | 'rapida'
const FILTROS: { v: Filtro; rotulo: string }[] = [
  { v: 'todos', rotulo: 'Todos' },
  { v: 'com', rotulo: 'Com check-in' },
  { v: 'sem', rotulo: 'Sem check-in' },
  { v: 'refez', rotulo: 'Refez (2+ tentativas)' },
  { v: 'rapida', rotulo: 'Fez abaixo do mínimo' },
]

export function MaratonaRankingAdmin({ pastaId }: { pastaId: string }) {
  const [data, setData] = useState<MaratonaRankingAdminData | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pend, start] = useTransition()
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const carregar = () => start(async () => {
    const r = await obterRankingMaratonaAdmin(pastaId)
    if (!r.ok) { setErro(r.error ?? 'Falha ao carregar.'); return }
    setErro(null); setData(r.data ?? { etapas: [], linhas: [] })
  })
  useEffect(() => { carregar() }, [pastaId]) // eslint-disable-line react-hooks/exhaustive-deps

  const linhas = useMemo(() => {
    const todas = data?.linhas ?? []
    const termo = q.trim().toLowerCase()
    return todas.filter((l) => {
      if (termo) {
        const alvo = `${l.nome} ${l.email ?? ''} ${l.numero ?? ''}`.toLowerCase()
        if (!alvo.includes(termo)) return false
      }
      if (filtro === 'com') return l.checkins > 0
      if (filtro === 'sem') return l.checkins === 0
      if (filtro === 'refez') return l.etapas.some((c) => c?.refez)
      if (filtro === 'rapida') return l.etapas.some((c) => c?.teveRapida)
      return true
    })
  }, [data, q, filtro])

  const etapas = data?.etapas ?? []
  const totalCheckEtapa = (i: number) => (data?.linhas ?? []).filter((l) => l.etapas[i]?.checkin).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4 text-primary" /> Ranking da maratona (admin)</h3>
        <span className="text-xs text-muted-foreground">{data ? `${data.linhas.length} aluno(s)` : ''}</span>
        <button type="button" onClick={carregar} disabled={pend} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-60">
          {pend ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Atualizar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, e-mail ou nº…" className="h-9 w-64 pl-8" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button key={f.v} type="button" onClick={() => setFiltro(f.v)}
              className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition', filtro === f.v ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>{f.rotulo}</button>
          ))}
        </div>
      </div>

      {erro && <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{erro}</div>}

      {/* Legenda */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" /> check-in validado (ficou ≥ mínimo)</span>
        <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-600" /> fez, mas abaixo do mínimo</span>
        <span className="inline-flex items-center gap-1"><RotateCcw className="h-3 w-3 text-muted-foreground" /> refez (nº de tentativas)</span>
        <span>· tempo exibido = <b>tentativa válida</b> que conta (não a mais rápida)</span>
      </p>

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5 font-semibold">#</th>
              <th className="px-3 py-2.5 text-center font-semibold"><Hash className="mx-auto h-3.5 w-3.5" /></th>
              <th className="px-3 py-2.5 font-semibold">Aluno</th>
              {etapas.map((e, i) => (
                <th key={e.simuladoId} className="px-3 py-2.5 text-center font-semibold">
                  <div className="truncate" title={e.nome}>{e.nome}</div>
                  <div className="text-[10px] font-normal normal-case text-muted-foreground">mín {fmtMin(e.segMin)} · {totalCheckEtapa(i)} check-in</div>
                </th>
              ))}
              <th className="px-3 py-2.5 text-center font-semibold"><Medal className="mx-auto h-3.5 w-3.5" /></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pend && !data ? (
              <tr><td colSpan={etapas.length + 4} className="px-3 py-10 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Carregando…</td></tr>
            ) : linhas.length === 0 ? (
              <tr><td colSpan={etapas.length + 4} className="px-3 py-10 text-center text-sm text-muted-foreground">Nenhum aluno encontrado.</td></tr>
            ) : linhas.map((l, idx) => (
              <tr key={l.estudanteId} className="hover:bg-muted/30">
                <td className="px-3 py-2.5 text-muted-foreground">{idx + 1}</td>
                <td className="px-3 py-2.5 text-center font-mono text-xs">{l.numero ? String(l.numero).padStart(4, '0') : '—'}</td>
                <td className="px-3 py-2.5">
                  <div className="font-medium leading-tight">{l.nome}</div>
                  {l.email && <div className="text-xs text-muted-foreground">{l.email}</div>}
                </td>
                {etapas.map((e, i) => <CelulaEtapa key={e.simuladoId} c={l.etapas[i]} />)}
                <td className="px-3 py-2.5 text-center font-semibold">{l.checkins}/{etapas.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CelulaEtapa({ c }: { c: MaratonaAdminCelula | null }) {
  if (!c) return <td className="px-3 py-2.5 text-center text-muted-foreground">—</td>
  const cor = c.checkin ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
  return (
    <td className="px-3 py-2.5 text-center align-top">
      <div className={cn('inline-flex items-center gap-1 font-semibold', cor)}>
        {c.checkin ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        {fmtDur(c.tempoConta)}
      </div>
      {(c.refez || c.teveRapida) && (
        <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1 text-[10px] text-muted-foreground">
          {c.refez && <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px" title="Mais de uma tentativa"><RotateCcw className="h-2.5 w-2.5" />{c.tentativas}x</span>}
          {c.teveRapida && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-amber-700 dark:text-amber-400" title={`Teve tentativa abaixo do mínimo (maior permanência: ${fmtDur(c.maxDur)})`}>abaixo do mín</span>}
        </div>
      )}
    </td>
  )
}
