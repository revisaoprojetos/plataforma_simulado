'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, Play, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ArestaFluxo, CaminhoRotina, DiagramaFluxo, NoFluxo, TipoNo } from '@/lib/cronograma/adaptativo/fluxo-regras'
import { simularFaixa } from './fluxo-actions'

const W = 196, H = 84, COLW = 244, ROWH = 112, PAD = 12
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const ROTULO: Record<TipoNo, string> = { inicio: 'Início', etapa: 'Etapa', decisao: 'Decisão', resultado: 'Resultado', rejeicao: 'Rejeição / adia', aberto: 'Em aberto' }
const ESTILO: Record<TipoNo, string> = {
  inicio: 'border-primary bg-primary text-primary-foreground',
  etapa: 'border-border bg-card text-card-foreground',
  decisao: 'border-primary/60 bg-primary/10 text-foreground',
  resultado: 'border-emerald-500/60 bg-emerald-500/10 text-foreground',
  rejeicao: 'border-destructive/60 bg-destructive/10 text-foreground',
  aberto: 'border-dashed border-amber-500 bg-amber-500/10 text-foreground',
}

const pos = (n: NoFluxo) => ({ x: PAD + n.col * COLW, y: PAD + n.row * ROWH })

function caminhoAresta(a: NoFluxo, b: NoFluxo): { d: string; lx: number; ly: number } {
  const pa = pos(a), pb = pos(b)
  if (b.col > a.col) {
    const x1 = pa.x + W, y1 = pa.y + H / 2, x2 = pb.x, y2 = pb.y + H / 2, m = (x1 + x2) / 2
    return { d: `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`, lx: m, ly: (y1 + y2) / 2 }
  }
  const baixo = b.row >= a.row
  const x1 = pa.x + W / 2, y1 = baixo ? pa.y + H : pa.y, x2 = pb.x + W / 2, y2 = baixo ? pb.y : pb.y + H, m = (y1 + y2) / 2
  return { d: `M${x1},${y1} C${x1},${m} ${x2},${m} ${x2},${y2}`, lx: (x1 + x2) / 2, ly: m }
}

function Quadro({ d, sel, onSel, marcados }: { d: DiagramaFluxo; sel: string | null; onSel: (id: string) => void; marcados: Set<string> }) {
  const porId = useMemo(() => new Map(d.nos.map((n) => [n.id, n])), [d])
  const largura = PAD * 2 + (Math.max(...d.nos.map((n) => n.col)) + 1) * COLW - (COLW - W)
  const altura = PAD * 2 + (Math.max(...d.nos.map((n) => n.row)) + 1) * ROWH - (ROWH - H)
  const temCaminho = marcados.size > 0
  return (
    <div className="overflow-x-auto rounded-xl border bg-muted/20 p-2">
      <div className="relative" style={{ width: largura, height: altura }}>
        <svg className="absolute inset-0" width={largura} height={altura} aria-hidden>
          <defs>
            <marker id={`seta-${d.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" /></marker>
          </defs>
          {d.arestas.map((e: ArestaFluxo, k) => {
            const a = porId.get(e.de), b = porId.get(e.para)
            if (!a || !b) return null
            const c = caminhoAresta(a, b), forte = marcados.has(e.de) && marcados.has(e.para)
            return (
              <g key={k} className={cn(forte ? 'text-primary' : 'text-muted-foreground/60', temCaminho && !forte && 'opacity-40')}>
                <path d={c.d} fill="none" stroke="currentColor" strokeWidth={forte ? 2.5 : 1.5} markerEnd={`url(#seta-${d.id})`} />
                {e.rotulo && <text x={c.lx} y={c.ly - 4} textAnchor="middle" className="fill-current text-[10px] font-medium">{e.rotulo}</text>}
              </g>
            )
          })}
        </svg>
        {d.nos.map((n) => {
          const p = pos(n), ativo = sel === n.id, forte = marcados.has(n.id)
          return (
            <button key={n.id} type="button" onClick={() => onSel(n.id)} aria-pressed={ativo} title={n.titulo}
              className={cn('absolute flex flex-col justify-center gap-0.5 border-2 px-2.5 py-1.5 text-left text-xs shadow-sm transition hover:shadow-md',
                n.tipo === 'decisao' ? 'rounded-3xl' : 'rounded-lg', ESTILO[n.tipo],
                forte && 'ring-2 ring-primary ring-offset-2 ring-offset-background', temCaminho && !forte && 'opacity-60', ativo && 'outline outline-2 outline-offset-2 outline-foreground')}
              style={{ left: p.x, top: p.y, width: W, height: H }}>
              <span className="line-clamp-2 font-semibold leading-tight">{n.titulo}</span>
              {n.valor && <span className="line-clamp-2 text-[10px] leading-tight opacity-80">{n.valor}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Detalhe({ no }: { no: NoFluxo | null }) {
  if (!no) return <div className="rounded-xl border p-4 text-sm text-muted-foreground">Clique em uma etapa do fluxograma.</div>
  return (
    <div className="space-y-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-md border-2 px-2 py-0.5 text-[11px] font-semibold', ESTILO[no.tipo])}>{ROTULO[no.tipo]}</span>
        <h3 className="font-semibold">{no.titulo}</h3>
        {no.inferido && <span className="rounded-md border border-dashed border-amber-500 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400" title="Não consta no motor nem no mapa: inferido das regras vigentes e do .md">inferido</span>}
      </div>
      <p className="whitespace-pre-line text-sm text-muted-foreground">{no.descricao}</p>
      {no.valor && <p className="text-sm"><span className="text-muted-foreground">Valor vigente: </span><b>{no.valor}</b></p>}
      {no.link && <Link href={no.link.href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{no.link.rotulo}<ExternalLink className="h-3.5 w-3.5" /></Link>}
    </div>
  )
}

function Card({ t, v, s }: { t: string; v: string; s?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{t}</div>
      <div className="text-sm font-semibold">{v}</div>
      {s && <div className="text-xs text-muted-foreground">{s}</div>}
    </div>
  )
}

export function FluxoClient({ diagramas }: { diagramas: DiagramaFluxo[] }) {
  const [aba, setAba] = useState(diagramas[0].id)
  const [sel, setSel] = useState<string | null>(null)
  const [horas, setHoras] = useState<string[]>(['4', '4', '4', '4', '4', '2', '2'])
  const [res, setRes] = useState<CaminhoRotina | null>(null)
  const [pend, start] = useTransition()
  const marcados = useMemo(() => new Set(res?.caminho ?? []), [res])
  const atual = diagramas.find((d) => d.id === aba) ?? diagramas[0]
  const no = useMemo(() => diagramas.flatMap((d) => d.nos).find((n) => n.id === sel) ?? null, [diagramas, sel])
  const total = horas.reduce((t, x) => t + (Number(x.replace(',', '.')) || 0), 0)

  function simular() {
    start(async () => {
      const r = await simularFaixa(horas.map((x) => Number(x.replace(',', '.')) || 0))
      if (!r.ok) { toast.error(r.error); return }
      setRes(r.dados)
      const alvo = diagramas.find((d) => d.id === 'faixa'); if (alvo) setAba(alvo.id)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {(Object.keys(ROTULO) as TipoNo[]).map((t) => <span key={t} className={cn('rounded-md border-2 px-2 py-0.5 font-medium', ESTILO[t])}>{ROTULO[t]}</span>)}
        <span className="text-muted-foreground">Contorno forte = caminho do simulador. “inferido” = deduzido das regras vigentes e do mapa (o HTML original não estava disponível).</span>
      </div>

      <section className="space-y-3 rounded-xl border p-4">
        <div>
          <h2 className="font-semibold">Simulador de faixa</h2>
          <p className="text-sm text-muted-foreground">Informe as horas de cada dia (blocos de 30 min). O servidor resolve a rotina nas regras vigentes e o caminho é destacado nas árvores.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {DIAS.map((dn, k) => (
            <label key={dn} className="flex flex-col gap-1 text-xs text-muted-foreground">{dn}
              <input value={horas[k]} inputMode="decimal" onChange={(e) => setHoras((h) => h.map((v, i) => (i === k ? e.target.value : v)))}
                className="h-9 w-16 rounded-md border bg-background px-2 text-sm text-foreground" aria-label={`Horas de ${dn}`} />
            </label>
          ))}
          <span className="pb-2 text-sm text-muted-foreground">Total: <b className="text-foreground">{total.toLocaleString('pt-BR')}h</b></span>
          <button type="button" onClick={simular} disabled={pend} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Simular
          </button>
          {res && <button type="button" onClick={() => setRes(null)} className="h-9 rounded-md border px-3 text-sm">Limpar destaque</button>}
        </div>
        {res && (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Card t="Carga semanal" v={`${res.minutosSemana} min`} s={`${(res.minutosSemana / 60).toLocaleString('pt-BR')}h`} />
              <Card t="Faixa" v={`Faixa ${res.faixa}`} s={res.equilibra ? 'Equilibrada (retornos limitados por dia)' : undefined} />
              <Card t="Teto de PDFulls novos" v={`${res.teto} por semana`} s={res.tetoAteMin == null ? 'Sem limite superior' : `Linha até ${res.tetoAteMin} min`} />
              <Card t="Revisão" v={res.revisao.modo === 'ciclo' ? `Ciclo a cada ${res.revisao.periodicidade} sem.` : res.revisao.modo === 'desempenho' ? `Desempenho a cada ${res.revisao.periodicidade} sem.` : 'Sem revisão por desempenho'}
                s={res.revisao.modo === 'desempenho' ? `Opções: ${res.revisao.opcoes.join(', ')}` : res.revisao.modo === 'ciclo' ? 'PDFlash/questões pendentes' : 'Adaptação desligada'} />
              <Card t="Limites por dia" v={`${res.limites.pdfDistintos} PDFull · ${res.limites.revisoes} PDFlash · ${res.limites.questoes} questões`} s={`PDFulls novos: ${res.limites.pdfNovosBase}/dia`} />
              <Card t="Diagnóstico histórico" v={`${res.historicoMetaSemanal} metas por semana`} />
              <Card t="Jurisprudência" v={res.jurisReserva ? 'Reserva a meta' : 'Carga insuficiente'} s="Se o aluno marcou o opt-in" />
              <Card t="Nós percorridos" v={String(res.caminho.length)} s="destacados nas árvores" />
            </div>
            {res.avisos.length > 0 && <ul className="list-disc pl-5 text-xs text-muted-foreground">{res.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-1 overflow-x-auto border-b" role="tablist">
        {diagramas.map((d) => {
          const n = d.nos.filter((x) => marcados.has(x.id)).length
          return (
            <button key={d.id} role="tab" aria-selected={aba === d.id} type="button" onClick={() => setAba(d.id)}
              className={cn('flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition', aba === d.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {d.titulo}{n > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{n}</span>}
            </button>
          )
        })}
      </div>
      <p className="text-sm text-muted-foreground">{atual.resumo}</p>
      <Quadro key={atual.id} d={atual} sel={sel} onSel={setSel} marcados={marcados} />
      <Detalhe no={no} />
    </div>
  )
}
