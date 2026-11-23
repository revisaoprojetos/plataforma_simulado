'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { MAX_FAIXAS, MODOS_QUESTOES, MODOS_REVISAO, ROTULO_MODO_QUESTOES, ROTULO_MODO_REVISAO, classeDaFaixa, textoHoras, textoIntervalo, validarFaixas, type FaixaCarga, type ModoQuestoes, type ModoRevisao } from '@/lib/cronograma/adaptativo/faixas-carga'
import { resolverFaixaCarga, resolverIndiceFaixa, resolverTetoPdf, type RegrasMotor } from '@/lib/cronograma/adaptativo/regras'
import { adicionarFaixa, ajustarMaximo, contarOverrides, dividirMinutos, juntarMinutos, removerFaixa, segmentosLinha, escalaLinha } from '@/lib/cronograma/adaptativo/faixas-editor'

const CORES = ['bg-primary/15', 'bg-primary/25', 'bg-primary/35', 'bg-primary/45', 'bg-primary/20', 'bg-primary/30', 'bg-primary/40', 'bg-primary/50']
const inputCls = 'h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'

function Linha({ faixas }: { faixas: FaixaCarga[] }) {
  const seg = useMemo(() => segmentosLinha(faixas), [faixas])
  const esc = escalaLinha(faixas)
  const marcas = useMemo(() => { const o: number[] = []; for (let h = 0; h * 60 <= esc; h += 10) o.push(h); return o }, [esc])
  return (
    <div className="space-y-1">
      <div className="flex w-full gap-0.5">
        {seg.map(({ k, pct, aberta }) => {
          const f = faixas[k]
          return (
            <div key={f.id} style={{ width: `${pct}%`, minWidth: '5.5rem' }} className={cn('min-w-0 flex-1 rounded-lg border border-primary/30 p-2 text-xs', CORES[k % CORES.length], aberta && 'border-dashed')} title={`${f.nome} · ${textoIntervalo(f, k, faixas)}`}>
              <p className="truncate font-semibold">{f.nome || `Faixa ${k + 1}`}</p>
              <p className="truncate text-muted-foreground">{textoIntervalo(f, k, faixas)}</p>
              <p className="truncate">PDFull: <b>{f.tetoPdf}</b>/sem</p>
              <p className="truncate text-muted-foreground" title={ROTULO_MODO_REVISAO[f.revisaoModo]}>{f.revisaoModo === 'ciclo' ? 'Revisão em ciclo' : 'Revisão por desempenho'}</p>
              <p className="truncate text-muted-foreground" title={ROTULO_MODO_QUESTOES[f.modoQuestoes]}>Questões: {ROTULO_MODO_QUESTOES[f.modoQuestoes].toLowerCase()}</p>
            </div>
          )
        })}
      </div>
      <div className="relative h-4 text-[10px] text-muted-foreground" aria-hidden>
        {marcas.map((h) => <span key={h} className="absolute -translate-x-1/2" style={{ left: `${(h * 60 / esc) * 100}%` }}>{h}h{h * 60 >= esc ? '+' : ''}</span>)}
      </div>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs text-muted-foreground"><span>{rotulo}</span>{children}</label>
}

/** Campo numérico/lista que pode herdar o global (valor null). */
function Herdavel({ rotulo, globalTxt, valor, lista, podeEditar, onChange }: { rotulo: string; globalTxt: string; valor: number | number[] | null; lista?: boolean; podeEditar: boolean; onChange: (v: number | number[] | null) => void }) {
  const herda = valor == null
  const [txt, setTxt] = useState<string | null>(null)
  const atual = txt ?? (Array.isArray(valor) ? valor.join(', ') : valor == null ? '' : String(valor))
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span className="flex items-center justify-between gap-2">{rotulo}
        <label className="flex items-center gap-1"><input type="checkbox" disabled={!podeEditar} checked={herda} onChange={(e) => { setTxt(null); onChange(e.target.checked ? null : (lista ? globalTxt.split(/[,;\s]+/).filter(Boolean).map(Number) : Number(globalTxt))) }} /> herdar ({globalTxt})</label>
      </span>
      <input disabled={!podeEditar || herda} value={herda ? '' : atual} placeholder={herda ? `global: ${globalTxt}` : ''} inputMode={lista ? 'text' : 'numeric'} className={cn(inputCls, 'text-sm text-foreground')}
        onChange={(e) => { setTxt(e.target.value); onChange(lista ? e.target.value.split(/[,;\s]+/).filter(Boolean).map(Number) : (e.target.value.trim() === '' ? Number.NaN : Number(e.target.value))) }} />
    </div>
  )
}

function Cartao({ k, faixas, regras, podeEditar, onChange }: { k: number; faixas: FaixaCarga[]; regras: RegrasMotor; podeEditar: boolean; onChange: (f: FaixaCarga[]) => void }) {
  const f = faixas[k], ultima = k === faixas.length - 1
  const set = (patch: Partial<FaixaCarga>) => onChange(faixas.map((x, i) => (i === k ? { ...x, ...patch } : x)))
  const mx = f.maxMin == null ? null : dividirMinutos(f.maxMin)
  const nOv = contarOverrides(f)
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><span className={cn('inline-block h-3 w-3 rounded-full border border-primary/40', CORES[k % CORES.length])} />Faixa {k + 1} · {textoIntervalo(f, k, faixas)}</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{nOv} {nOv === 1 ? 'override' : 'overrides'}</span>
          {podeEditar && faixas.length > 1 && (
            <button type="button" aria-label={`Remover faixa ${k + 1}`} onClick={async () => { if (await confirmar({ titulo: 'Remover faixa', mensagem: `Remover "${f.nome}"? A faixa vizinha passa a cobrir o intervalo e os overrides desta faixa são perdidos.`, confirmar: 'Remover', destrutivo: true })) onChange(removerFaixa(faixas, k)) }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-destructive transition hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
          )}
        </div>
      </div>
      <fieldset disabled={!podeEditar} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => set({ nome: e.target.value })} maxLength={60} className={cn(inputCls, 'text-foreground')} /></Campo>
        <Campo rotulo="Carga mínima (automática)"><input readOnly value={`${textoHoras(f.minMin)} (${f.minMin} min)`} className={cn(inputCls, 'bg-muted/40 text-foreground')} /></Campo>
        <Campo rotulo="Carga máxima (inclusive)">
          {mx ? (
            <span className="flex items-center gap-1">
              <input type="number" min={0} max={168} value={mx.h} onChange={(e) => onChange(ajustarMaximo(faixas, k, juntarMinutos(Number(e.target.value) || 0, mx.m)))} className={cn(inputCls, 'w-16 text-foreground')} aria-label="horas" /><span>h</span>
              <select value={mx.m} onChange={(e) => onChange(ajustarMaximo(faixas, k, juntarMinutos(mx.h, Number(e.target.value))))} className={cn(inputCls, 'w-20 text-foreground')} aria-label="minutos">
                {[0, 30, ...(mx.m !== 0 && mx.m !== 30 ? [mx.m] : [])].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </span>
          ) : <input readOnly value="sem limite" className={cn(inputCls, 'bg-muted/40 text-foreground')} />}
        </Campo>
        <Campo rotulo="Teto de PDFull novo/semana (1–12)"><input type="number" min={1} max={12} value={Number.isFinite(f.tetoPdf) ? f.tetoPdf : ''} onChange={(e) => set({ tetoPdf: e.target.value === '' ? Number.NaN : Number(e.target.value) })} className={cn(inputCls, 'text-foreground')} /></Campo>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.soRegra23} onChange={(e) => set({ soRegra23: e.target.checked })} /> Teto só na regra 23</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.equilibra} onChange={(e) => set({ equilibra: e.target.checked })} /> Faixa equilibrada</label>
        <Campo rotulo="Modo de revisão">
          <select value={f.revisaoModo} onChange={(e) => set({ revisaoModo: e.target.value as ModoRevisao })} className={cn(inputCls, 'text-foreground')}>{MODOS_REVISAO.map((m) => <option key={m} value={m}>{ROTULO_MODO_REVISAO[m]}</option>)}</select>
        </Campo>
        <Campo rotulo="Modo de questões">
          <select value={f.modoQuestoes} onChange={(e) => set({ modoQuestoes: e.target.value as ModoQuestoes })} className={cn(inputCls, 'text-foreground')}>{MODOS_QUESTOES.map((m) => <option key={m} value={m}>{ROTULO_MODO_QUESTOES[m]}</option>)}</select>
        </Campo>
        {f.revisaoModo === 'ciclo'
          ? <Herdavel rotulo="Periodicidade do ciclo (sem)" globalTxt={String(regras.revisao.cicloSemanas)} valor={f.cicloSemanas} podeEditar={podeEditar} onChange={(v) => set({ cicloSemanas: v as number | null })} />
          : (<>
            <Herdavel rotulo="Opções da semana especial" lista globalTxt={regras.revisao.opcoesNovas.join(', ')} valor={f.opcoesNovas} podeEditar={podeEditar} onChange={(v) => set({ opcoesNovas: v as number[] | null })} />
            <Herdavel rotulo="Periodicidade padrão (sem)" globalTxt={String(regras.revisao.padrao)} valor={f.padrao} podeEditar={podeEditar} onChange={(v) => set({ padrao: v as number | null })} />
          </>)}
      </fieldset>
      {ultima && <p className="text-xs text-muted-foreground">Última faixa: sem limite superior.</p>}
    </section>
  )
}

function TesteCarga({ regras }: { regras: RegrasMotor }) {
  const [h, setH] = useState('28')
  const horas = Number(h.replace(',', '.'))
  const ok = h.trim() !== '' && Number.isFinite(horas) && horas >= 0 && regras.faixas.length > 0
  const min = ok ? Math.round(horas * 60) : 0
  const r = useMemo(() => {
    if (!ok) return null
    try { const f = resolverFaixaCarga(min, regras), idx = resolverIndiceFaixa(min, regras), t = resolverTetoPdf(min, true, regras); return { f, idx, t, classe: classeDaFaixa(f) } } catch { return null }
  }, [ok, min, regras])
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/20 p-3 text-sm">
      <label className="flex items-center gap-2 font-medium">Teste de carga: <input value={h} onChange={(e) => setH(e.target.value)} inputMode="decimal" className={cn(inputCls, 'w-20 text-right')} aria-label="Horas semanais" /> h/semana</label>
      {r ? (
        <p className="text-muted-foreground">
          Cai na <b className="text-foreground">faixa {r.idx + 1} ({r.f.nome})</b> · teto <b className="text-foreground">{r.t.teto} PDFull</b>/sem{r.t.equilibra ? ' (equilibrada)' : ''} · revisão <b className="text-foreground">{ROTULO_MODO_REVISAO[r.f.revisaoModo]}</b> · questões classe <b className="text-foreground">{r.classe}</b> ({ROTULO_MODO_QUESTOES[r.f.modoQuestoes].toLowerCase()})
        </p>
      ) : <p className="text-muted-foreground">Informe as horas semanais (e corrija as faixas, se houver erro).</p>}
    </div>
  )
}

export function FaixasEditorVisual({ regras, podeEditar, onChange }: { regras: RegrasMotor; podeEditar: boolean; onChange: (f: FaixaCarga[]) => void }) {
  const faixas = regras.faixas
  const erros = useMemo(() => validarFaixas(faixas), [faixas])
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Faixas de carga semanal</h2>
          <p className="text-xs text-muted-foreground">A carga semanal da rotina do aluno cai em UMA faixa. Cada faixa define teto de PDFull, revisão e modo de questões. Sem lacuna nem sobreposição: o mínimo da faixa seguinte acompanha o limite.</p>
        </div>
        {podeEditar && (
          <button type="button" disabled={faixas.length >= MAX_FAIXAS} onClick={() => onChange(adicionarFaixa(faixas))} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50">
            <Plus className="h-4 w-4" /> Adicionar faixa ({faixas.length}/{MAX_FAIXAS})
          </button>
        )}
      </div>
      <Linha faixas={faixas} />
      {erros.length > 0 && (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="font-semibold">Faixas inválidas:</p>
          <ul className="list-disc pl-5">{erros.map((e, k) => <li key={k}>{e}</li>)}</ul>
        </div>
      )}
      <TesteCarga regras={regras} />
      <div className="grid gap-3 xl:grid-cols-2">
        {faixas.map((_, k) => <Cartao key={faixas[k].id + k} k={k} faixas={faixas} regras={regras} podeEditar={podeEditar} onChange={onChange} />)}
      </div>
    </section>
  )
}
