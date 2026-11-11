'use client'

/**
 * Analytics de um vídeo. O SERVIDOR entrega tudo calculado (GET /api/admin/video/[id]/analytics);
 * aqui só se desenha: KPIs + curva de retenção + visualizações por dia (SVG simples, cores por token).
 * Formato esperado (campos opcionais; o que faltar não é exibido):
 *   { views, uniqueViewers, watchTimeS, avgPercent, completionRate,
 *     retention: [{ p: 0..100, v: 0..100 }], daily: [{ date: 'YYYY-MM-DD', views }] }
 */

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { formatTime } from '@/lib/video/player-protocolo'

type Analytics = {
  views?: number; uniqueViewers?: number; watchTimeS?: number; avgPercent?: number; completionRate?: number
  retention?: { p: number; v: number }[]
  daily?: { date: string; views: number }[]
}

const nf = new Intl.NumberFormat('pt-BR')
const pct = (n?: number) => (n == null ? '—' : `${Math.round(n)}%`)

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3.5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">{value}</div>
    </div>
  )
}

const W = 600, H = 180, PAD = { l: 34, r: 8, t: 8, b: 22 }

/** Curva de retenção: eixo X = % do vídeo; Y = % de espectadores. */
function RetentionChart({ data }: { data: { p: number; v: number }[] }) {
  const pts = [...data].sort((a, b) => a.p - b.p)
  const x = (p: number) => PAD.l + (p / 100) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b)
  const line = pts.map((d, i) => `${i ? 'L' : 'M'}${x(d.p).toFixed(1)},${y(d.v).toFixed(1)}`).join(' ')
  const area = pts.length ? `${line} L${x(pts[pts.length - 1].p)},${y(0)} L${x(pts[0].p)},${y(0)} Z` : ''
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Curva de retenção" className="h-auto w-full text-primary">
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g} className="text-muted-foreground">
          <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={0.2} />
          <text x={PAD.l - 6} y={y(g) + 3} textAnchor="end" fontSize={10} fill="currentColor">{g}%</text>
          <text x={x(g)} y={H - 6} textAnchor="middle" fontSize={10} fill="currentColor">{g}%</text>
        </g>
      ))}
      {area && <path d={area} fill="currentColor" fillOpacity={0.12} />}
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  )
}

function DailyChart({ data }: { data: { date: string; views: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.views))
  const bw = (W - PAD.l - PAD.r) / Math.max(1, data.length)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Visualizações por dia" className="h-auto w-full text-primary">
      <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="currentColor" className="text-muted-foreground" strokeOpacity={0.3} />
      <text x={PAD.l - 6} y={PAD.t + 8} textAnchor="end" fontSize={10} fill="currentColor" className="text-muted-foreground">{nf.format(max)}</text>
      {data.map((d, i) => {
        const h = (d.views / max) * (H - PAD.t - PAD.b)
        return (
          <g key={d.date}>
            <rect x={PAD.l + i * bw + bw * 0.15} y={H - PAD.b - h} width={bw * 0.7} height={h} rx={2} fill="currentColor" fillOpacity={0.85}>
              <title>{`${d.date}: ${nf.format(d.views)}`}</title>
            </rect>
            {(data.length <= 10 || i % Math.ceil(data.length / 8) === 0) && (
              <text x={PAD.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="currentColor" className="text-muted-foreground">{d.date.slice(5)}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function VideoAnalytics({ id }: { id: string }) {
  const [d, setD] = React.useState<Analytics | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  React.useEffect(() => {
    const ac = new AbortController()
    setD(null); setErr(null)
    fetch(`/api/admin/video/${id}/analytics`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { analytics?: Analytics } & Analytics) => setD(j.analytics ?? j))
      .catch((e) => { if (!ac.signal.aborted) setErr(e instanceof Error ? 'Não foi possível carregar as métricas.' : 'Erro.') })
    return () => ac.abort()
  }, [id])

  if (err) return <p role="alert" className="text-sm text-destructive">{err}</p>
  if (!d) return <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando métricas…</p>
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi label="Visualizações" value={d.views == null ? '—' : nf.format(d.views)} />
        <Kpi label="Alunos únicos" value={d.uniqueViewers == null ? '—' : nf.format(d.uniqueViewers)} />
        <Kpi label="Tempo assistido" value={d.watchTimeS == null ? '—' : formatTime(d.watchTimeS)} />
        <Kpi label="Conclusão" value={pct(d.completionRate)} />
      </div>
      {d.retention && d.retention.length > 1 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-foreground">Retenção{d.avgPercent != null && <span className="font-normal text-muted-foreground"> · média {pct(d.avgPercent)} assistido</span>}</h3>
          <RetentionChart data={d.retention} />
        </section>
      )}
      {d.daily && d.daily.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-foreground">Visualizações por dia</h3>
          <DailyChart data={d.daily} />
        </section>
      )}
      {!d.retention?.length && !d.daily?.length && d.views == null && <p className="text-sm text-muted-foreground">Ainda não há dados para este vídeo.</p>}
    </div>
  )
}
