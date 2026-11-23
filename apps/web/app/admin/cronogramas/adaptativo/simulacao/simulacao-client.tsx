'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FlaskConical, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHAVE_RASCUNHO, diffRegras } from '@/lib/cronograma/adaptativo/regras-campos'
import type { RegrasMotor } from '@/lib/cronograma/adaptativo/regras'
import { simularRegras } from '../regras-actions'
import type { DiffSimulacao, ResumoPlano } from '../regras-actions-tipos'

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const dataBr = (s: string | null) => (s ? s.split('-').reverse().join('/') : '—')
const sinal = (n: number) => (n > 0 ? `+${n}` : String(n))

export function SimulacaoClient({ podeSimular, disciplinas, vigente, inicioPadrao, rotulos }: { podeSimular: boolean; disciplinas: string[]; vigente: RegrasMotor; inicioPadrao: string; rotulos: Record<string, string> }) {
  const [inicio, setInicio] = useState(inicioPadrao)
  const [horas, setHoras] = useState<string[]>(['3', '3', '3', '3', '3', '4', '2'])
  const [sel, setSel] = useState<Set<string>>(new Set(disciplinas))
  const [busca, setBusca] = useState('')
  const [rascunho, setRascunho] = useState<RegrasMotor | null>(null)
  const [diff, setDiff] = useState<DiffSimulacao | null>(null)
  const [pend, start] = useTransition()

  useEffect(() => {
    try { const s = sessionStorage.getItem(CHAVE_RASCUNHO); if (s) setRascunho(JSON.parse(s) as RegrasMotor) } catch { /* sem rascunho */ }
  }, [])
  const camposAlterados = useMemo(() => (rascunho ? diffRegras(vigente, rascunho) : []), [rascunho, vigente])
  const horasNum = horas.map((h) => Number(h.replace(',', '.')))
  const horasOk = horasNum.every((h) => Number.isFinite(h) && h >= 0 && h <= 24) && horasNum.some((h) => h > 0)
  const lista = disciplinas.filter((d) => !busca.trim() || d.toLowerCase().includes(busca.trim().toLowerCase()))

  const simular = () => start(async () => {
    const r = await simularRegras(rascunho ?? vigente, { start: inicio, horas: horasNum, discs: disciplinas.filter((d) => sel.has(d)), metas: { pf: true, fl: true, qu: true, lp: true } } as never)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao simular.'); return }
    setDiff(r.dados!)
  })

  if (!podeSimular) return <p className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">Simular exige permissão de edição (cronogramas:update).</p>
  return (
    <div className="space-y-4">
      <div className={cn('rounded-2xl border p-3 text-sm', camposAlterados.length ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30 text-muted-foreground')}>
        {camposAlterados.length
          ? <><b>Rascunho não salvo</b> com {camposAlterados.length} campo(s) diferente(s) das vigentes: {camposAlterados.slice(0, 6).map((d) => `${d.rotulo} (${d.de} → ${d.para})`).join('; ')}{camposAlterados.length > 6 ? '…' : ''}.</>
          : 'Sem rascunho em edição: a simulação compara as regras vigentes com elas mesmas. Altere valores na aba “Faixas e limites” (sem salvar) e volte aqui.'}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Aluno de exemplo</h2>
          <label className="flex items-center gap-2 text-sm">Início <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-8 rounded-lg border border-input bg-background px-2" /></label>
          <div>
            <p className="mb-1 text-sm">Horas de estudo por dia da semana</p>
            <div className="grid grid-cols-7 gap-2">
              {DIAS.map((d, k) => (
                <label key={d} className="text-center text-xs text-muted-foreground">{d}
                  <input value={horas[k]} inputMode="decimal" onChange={(e) => setHoras((h) => h.map((x, j) => (j === k ? e.target.value : x)))} className="mt-1 h-8 w-full rounded-lg border border-input bg-background px-1 text-center text-sm tabular-nums text-foreground" />
                </label>
              ))}
            </div>
            {!horasOk && <p className="mt-1 text-xs text-destructive">Informe horas entre 0 e 24, com ao menos um dia estudado.</p>}
          </div>
        </section>

        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Disciplinas <span className="text-xs font-normal text-muted-foreground">({sel.size}/{disciplinas.length})</span></h2>
            <span className="flex gap-2 text-xs"><button type="button" className="text-primary hover:underline" onClick={() => setSel(new Set(disciplinas))}>Todas</button><button type="button" className="text-primary hover:underline" onClick={() => setSel(new Set())}>Nenhuma</button></span>
          </div>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar disciplina" className="h-8 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" /></div>
          <div className="max-h-52 space-y-1 overflow-y-auto">
            {disciplinas.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma disciplina no catálogo.</p>}
            {lista.map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.has(d)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(d); else n.delete(d); return n })} /> {d}</label>
            ))}
          </div>
        </section>
      </div>

      <button type="button" disabled={pend || !horasOk || sel.size === 0 || !inicio} onClick={simular} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
        {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Simular no servidor
      </button>

      {diff && <Resultado d={diff} rotulos={rotulos} />}
    </div>
  )
}

function Resultado({ d, rotulos }: { d: DiffSimulacao; rotulos: Record<string, string> }) {
  const erro = d.vigente.erro || d.proposto.erro
  const tipos = [...new Set([...Object.keys(d.vigente.metasPorTipo), ...Object.keys(d.proposto.metasPorTipo)])].sort()
  const linha = (rotulo: string, f: (r: ResumoPlano) => string, delta?: string) => (
    <tr className="border-t border-border"><td className="px-3 py-2">{rotulo}</td><td className="px-3 py-2 tabular-nums">{f(d.vigente)}</td><td className="px-3 py-2 tabular-nums">{f(d.proposto)}</td><td className={cn('px-3 py-2 tabular-nums', delta && delta !== '0' && 'font-semibold text-primary')}>{delta ?? ''}</td></tr>
  )
  return (
    <div className="space-y-3">
      {erro && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Falha ao gerar o plano: {erro}</div>}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">Indicador</th><th className="px-3 py-2 text-left font-medium">Vigentes</th><th className="px-3 py-2 text-left font-medium">Propostas</th><th className="px-3 py-2 text-left font-medium">Diferença</th></tr></thead>
          <tbody>
            {linha('Fim do plano (semanas)', (r) => String(r.fim), sinal(d.deltaFimSemanas))}
            {linha('Total de metas', (r) => String(r.totalMetas), sinal(d.deltaMetas))}
            {tipos.map((t) => linha(`Metas · ${rotulos[t] ?? t}`, (r) => String(r.metasPorTipo[t] ?? 0), sinal(d.deltaPorTipo[t] ?? 0)))}
            {linha('1ª data', (r) => dataBr(r.primeiraData))}
            {linha('Última data', (r) => dataBr(r.ultimaData))}
            {linha('Horas totais', (r) => String(r.horasTotais))}
          </tbody>
        </table>
      </div>
      <Violacoes titulo="Plano com as regras propostas" r={d.proposto} />
      <PorSemana r={d.proposto} />
      <Rastro r={d.proposto} />
      {d.vigente.totalViolacoes ? <Violacoes titulo="Plano com as regras vigentes" r={d.vigente} /> : null}
      <p className="text-sm text-muted-foreground">Metas só nas propostas: <b>{d.idsApenasProposto}</b> · só nas vigentes: <b>{d.idsApenasVigente}</b> · com data diferente: <b>{d.idsComDataDiferente}</b>.</p>
    </div>
  )
}

function Violacoes({ titulo, r }: { titulo: string; r: ResumoPlano }) {
  const total = r.totalViolacoes ?? 0
  if (r.erro) return null
  if (!total) return <p className="rounded-2xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground"><b>{titulo}:</b> nenhuma violação das invariantes (capacidade, PDFull na semana, limites por dia, ordem do catálogo, leitura → revisão → questões) nem das restrições ativas. As invariantes 6–9 (fluxo de questões, prioridade do LegProc, evidência de desempenho, preservação ao recalcular) dependem do contexto do aluno e não são conferidas aqui.</p>
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <p className="font-semibold text-destructive">{titulo}: {total} violação(ões){total > (r.violacoes?.length ?? 0) ? ` (mostrando ${r.violacoes?.length})` : ''}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">{(r.violacoes ?? []).map((v, k) => <li key={k}><span className="text-xs text-muted-foreground">{v.invariante ? `Invariante ${v.invariante}` : 'Restrição'}</span> · {v.mensagem}{v.data && !v.mensagem.includes('/') ? ` (${dataBr(v.data)})` : ''}</li>)}</ul>
    </div>
  )
}

const ROTULO_COD: Record<string, string> = { restricao: 'Restrição', limite_dia: 'Limite por dia', teto_semana: 'Teto semanal', limite_novos_dia: 'Novos por dia', revisao_obrigatoria: 'Revisão obrigatória', adaptacao_off: 'Adaptação desligada', adiada_sem_domino: 'Adiada sem dominó' }

/** D3 — faixa efetiva, teto, metas por tipo, ocupação e violações por semana (calculado no servidor; aqui só leitura). */
function PorSemana({ r }: { r: ResumoPlano }) {
  const l = r.porSemana
  if (!l?.length) return null
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold">Faixa por semana (regras propostas)</h3>
      <div className="max-h-96 overflow-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">Semana</th><th className="px-3 py-2 text-left font-medium">Faixa</th><th className="px-3 py-2 text-left font-medium">PDFull novos / teto</th><th className="px-3 py-2 text-left font-medium">Metas</th><th className="px-3 py-2 text-left font-medium">Ocupação</th><th className="px-3 py-2 text-right font-medium">Violações</th></tr></thead>
          <tbody>
            {l.map((s) => (
              <tr key={s.sem} className="border-t border-border">
                <td className="px-3 py-1.5 tabular-nums">{s.sem} <span className="text-xs text-muted-foreground">{dataBr(s.inicio)}</span></td>
                <td className="px-3 py-1.5">{s.faixa}{s.revisao ? ' · revisão' : ''}</td>
                <td className="px-3 py-1.5 tabular-nums">{s.pdfNovos}/{s.tetoPdf}</td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">{Object.entries(s.metasPorTipo).map(([t, n]) => `${t} ${n}`).join(' · ')}</td>
                <td className={cn('px-3 py-1.5 tabular-nums', s.ocupacaoPct > 100 && 'font-semibold text-destructive')}>{Math.round(s.minUsados / 6) / 10}h / {Math.round(s.minDisponiveis / 6) / 10}h ({s.ocupacaoPct}%)</td>
                <td className={cn('px-3 py-1.5 text-right tabular-nums', s.violacoes > 0 && 'font-semibold text-destructive')}>{s.violacoes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** D2 — decisões do motor (quem adiou/barrou o quê e por quê), do plano de exemplo gerado com as regras propostas. */
function Rastro({ r }: { r: ResumoPlano }) {
  const e = r.rastro
  if (!e) return null
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold">Decisões do motor (regras propostas) <span className="text-xs font-normal text-muted-foreground">· {e.eventos.length}{e.descartados ? ` (+${e.descartados} não registradas pelo limite)` : ''}</span></h3>
      {e.eventos.length === 0 ? <p className="rounded-2xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">Nenhuma meta foi adiada ou barrada por restrição, teto ou limite neste plano.</p> : (
        <div className="max-h-96 overflow-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">Motivo</th><th className="px-3 py-2 text-left font-medium">Decisão</th><th className="px-3 py-2 text-left font-medium">Quando</th><th className="px-3 py-2 text-right font-medium">Vezes</th></tr></thead>
            <tbody>
              {e.eventos.map((x, k) => (
                <tr key={k} className="border-t border-border"><td className="px-3 py-1.5 text-xs">{ROTULO_COD[x.cod] ?? x.cod}</td><td className="px-3 py-1.5">{x.texto}</td><td className="px-3 py-1.5 tabular-nums text-muted-foreground">{x.de === x.ate ? dataBr(x.de) : `${dataBr(x.de)} → ${dataBr(x.ate)}`}</td><td className="px-3 py-1.5 text-right tabular-nums">{x.n}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
