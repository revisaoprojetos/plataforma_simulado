'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Play } from 'lucide-react'
import type { CaminhoRotina } from '@/lib/cronograma/adaptativo/fluxo-regras'
import { simularFaixa } from '@/app/admin/cronogramas/adaptativo/fluxo/fluxo-actions'
import type { PropsExtra } from './index'

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function Card({ t, v, s }: { t: string; v: string; s?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{t}</div>
      <div className="text-sm font-semibold">{v}</div>
      {s && <div className="text-xs text-muted-foreground">{s}</div>}
    </div>
  )
}

/** Extra do adaptador 'cronograma-adaptativo': resolve uma rotina nas regras vigentes (no servidor) e destaca o caminho no canvas. */
export function SimuladorFaixa({ onCaminho, irPara }: PropsExtra) {
  const [horas, setHoras] = useState<string[]>(['4', '4', '4', '4', '4', '2', '2'])
  const [res, setRes] = useState<CaminhoRotina | null>(null)
  const [pend, start] = useTransition()
  const total = horas.reduce((t, x) => t + (Number(x.replace(',', '.')) || 0), 0)
  const simular = () => start(async () => {
    const r = await simularFaixa(horas.map((x) => Number(x.replace(',', '.')) || 0))
    if (!r.ok) { toast.error(r.error); return }
    setRes(r.dados); onCaminho(r.dados.caminho); irPara('faixa')
  })
  const limpar = () => { setRes(null); onCaminho(null) }
  return (
    <section className="space-y-3 p-1">
      <div>
        <h2 className="font-semibold">Simulador de faixa</h2>
        <p className="text-sm text-muted-foreground">Informe as horas de cada dia (blocos de 30 min). O servidor resolve a rotina nas regras vigentes e o caminho é destacado no canvas.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {DIAS.map((dn, k) => (
          <label key={dn} className="flex flex-col gap-1 text-xs text-muted-foreground">{dn}
            <input value={horas[k]} inputMode="decimal" onChange={(e) => setHoras((h) => h.map((v, i) => (i === k ? e.target.value : v)))} className="h-9 w-16 rounded-md border bg-background px-2 text-sm text-foreground" aria-label={`Horas de ${dn}`} />
          </label>
        ))}
        <span className="pb-2 text-sm text-muted-foreground">Total: <b className="text-foreground">{total.toLocaleString('pt-BR')}h</b></span>
        <button type="button" onClick={simular} disabled={pend} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Simular
        </button>
        {res && <button type="button" onClick={limpar} className="h-9 rounded-md border px-3 text-sm">Limpar destaque</button>}
      </div>
      {res && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Card t="Carga semanal" v={`${res.minutosSemana} min`} s={`${(res.minutosSemana / 60).toLocaleString('pt-BR')}h`} />
            <Card t="Faixa" v={`Faixa ${res.faixa}`} s={res.equilibra ? 'Equilibrada (retornos limitados por dia)' : undefined} />
            <Card t="Teto de PDFulls novos" v={`${res.teto} por semana`} s={res.tetoAteMin == null ? 'Sem limite superior' : `Linha até ${res.tetoAteMin} min`} />
            <Card t="Revisão" v={res.revisao.modo === 'ciclo' ? `Ciclo a cada ${res.revisao.periodicidade} sem.` : res.revisao.modo === 'desempenho' ? `Desempenho a cada ${res.revisao.periodicidade} sem.` : 'Sem revisão por desempenho'}
              s={res.revisao.modo === 'desempenho' ? `Opções: ${res.revisao.opcoes.join(', ')}` : res.revisao.modo === 'ciclo' ? 'PDFlash/questões pendentes' : 'Adaptação desligada'} />
            <Card t="Limites por dia" v={`${res.limites.pdfDistintos} PDFull · ${res.limites.revisoes} PDFlash · ${res.limites.questoes} questões`} s={`PDFulls novos: ${res.limites.pdfNovosBase}/dia`} />
            <Card t="Diagnóstico histórico" v={`${res.historicoMetaSemanal} metas por semana`} />
            <Card t="Jurisprudência" v={res.jurisReserva ? 'Reserva a meta' : 'Carga insuficiente'} s="Se o aluno marcou o opt-in" />
            <Card t="Nós percorridos" v={String(res.caminho.length)} s="destacados no canvas" />
          </div>
          {res.avisos.length > 0 && <ul className="list-disc pl-5 text-xs text-muted-foreground">{res.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
        </div>
      )}
    </section>
  )
}
