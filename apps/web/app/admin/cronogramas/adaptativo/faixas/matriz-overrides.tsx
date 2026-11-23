'use client'

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROTULO_SECAO, type FaixaCarga, type SecaoOverride } from '@/lib/cronograma/adaptativo/faixas-carga'
import { GRUPOS_CAMPOS, formatarValor, lerCaminho, textoParaValor, valorParaTexto, type CampoRegra } from '@/lib/cronograma/adaptativo/regras-campos'
import { contarOverrides, definirOverride, lerOverride, separarCaminhoOverride, temOverride } from '@/lib/cronograma/adaptativo/faixas-editor'
import type { RegrasMotor } from '@/lib/cronograma/adaptativo/regras'

const LINHAS: Array<{ secao: SecaoOverride; campo: CampoRegra }> = GRUPOS_CAMPOS.flatMap((g) => g.campos).flatMap((c) => { const p = separarCaminhoOverride(c.path); return p ? [{ secao: p.secao, campo: c }] : [] })
const inputCls = 'h-8 rounded-lg border border-input bg-background px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'

export function MatrizOverrides({ regras, podeEditar, onChange }: { regras: RegrasMotor; podeEditar: boolean; onChange: (f: FaixaCarga[]) => void }) {
  const faixas = regras.faixas
  const [busca, setBusca] = useState('')
  const [secao, setSecao] = useState<string>('')
  const [soSobrescritos, setSoSobrescritos] = useState(false)
  const [txt, setTxt] = useState<Record<string, string>>({})
  const b = busca.trim().toLowerCase()

  const linhas = useMemo(() => LINHAS.filter(({ secao: s, campo }) =>
    (!secao || s === secao) && (!b || campo.rotulo.toLowerCase().includes(b) || campo.path.toLowerCase().includes(b)) && (!soSobrescritos || faixas.some((f) => temOverride(f, campo.path)))), [b, secao, soSobrescritos, faixas])
  const porSecao = useMemo(() => {
    const m = new Map<SecaoOverride, typeof linhas>()
    for (const l of linhas) { const a = m.get(l.secao) ?? []; a.push(l); m.set(l.secao, a) }
    return [...m.entries()]
  }, [linhas])

  const gravar = (k: number, c: CampoRegra, valor: unknown) => onChange(definirOverride(faixas, k, c.path, valor))
  const limpar = (k: number, c: CampoRegra) => { setTxt((o) => { const n = { ...o }; delete n[`${k}:${c.path}`]; return n }); gravar(k, c, undefined) }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Parâmetros por faixa</h2>
        <p className="text-xs text-muted-foreground">Cada faixa herda o valor global; clique numa célula esmaecida para sobrescrever só naquela faixa.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar parâmetro" className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={secao} onChange={(e) => setSecao(e.target.value)} aria-label="Filtrar por seção" className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
          <option value="">Todas as seções</option>
          {(Object.keys(ROTULO_SECAO) as SecaoOverride[]).map((s) => <option key={s} value={s}>{ROTULO_SECAO[s]}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soSobrescritos} onChange={(e) => setSoSobrescritos(e.target.checked)} /> Só sobrescritos</label>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Parâmetro</th>
              <th className="px-3 py-2 text-left font-medium">Global</th>
              {faixas.map((f, k) => (
                <th key={f.id + k} className="px-3 py-2 text-left font-medium">
                  <span className="block truncate text-foreground" title={f.nome}>{f.nome || `Faixa ${k + 1}`}</span>
                  <span className="font-normal">{contarOverrides(f)} {contarOverrides(f) === 1 ? 'override' : 'overrides'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {porSecao.length === 0 && <tr><td colSpan={faixas.length + 2} className="p-6 text-center text-muted-foreground">Nenhum parâmetro encontrado com esses filtros.</td></tr>}
            {porSecao.map(([s, ls]) => (
              <SecaoLinhas key={s} titulo={ROTULO_SECAO[s]} colSpan={faixas.length + 2}>
                {ls.map(({ campo: c }) => {
                  const g = lerCaminho(regras, c.path)
                  return (
                    <tr key={c.path} className="border-t border-border">
                      <td className="px-3 py-2"><span className="block">{c.rotulo}</span><span className="text-[11px] text-muted-foreground">{c.path}</span></td>
                      <td className="px-3 py-2 tabular-nums">{formatarValor(g)}{c.sufixo ? ` ${c.sufixo}` : ''}</td>
                      {faixas.map((f, k) => {
                        const tem = temOverride(f, c.path), v = lerOverride(f, c.path), tk = `${k}:${c.path}`
                        if (!tem) return (
                          <td key={f.id + k} className="px-3 py-2">
                            <button type="button" disabled={!podeEditar} onClick={() => gravar(k, c, g)} title="Clique para sobrescrever nesta faixa" className="w-full rounded-lg border border-dashed border-transparent px-2 py-1 text-left text-muted-foreground transition enabled:hover:border-border enabled:hover:bg-muted/40">
                              <span className="tabular-nums">{formatarValor(g)}</span> <span className="text-[11px]">herdado</span>
                            </button>
                          </td>
                        )
                        return (
                          <td key={f.id + k} className="bg-primary/5 px-3 py-2">
                            <div className="flex items-center gap-1">
                              {c.tipo === 'bool'
                                ? <input type="checkbox" disabled={!podeEditar} checked={v === true} onChange={(e) => gravar(k, c, e.target.checked)} aria-label={`${c.rotulo} na faixa ${k + 1}`} className="h-4 w-4" />
                                : <input disabled={!podeEditar} value={txt[tk] ?? valorParaTexto(v)} inputMode={c.tipo === 'lista' ? 'text' : 'decimal'} aria-label={`${c.rotulo} na faixa ${k + 1}`}
                                    onChange={(e) => { setTxt((o) => ({ ...o, [tk]: e.target.value })); gravar(k, c, textoParaValor(c, e.target.value)) }} className={cn(inputCls, c.tipo === 'lista' ? 'w-24' : 'w-16')} />}
                              {c.sufixo && <span className="text-xs text-muted-foreground">{c.sufixo}</span>}
                              {podeEditar && <button type="button" onClick={() => limpar(k, c)} aria-label="Voltar a herdar" title="Voltar a herdar o global" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>}
                            </div>
                            <span className="mt-0.5 inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">sobrescrito</span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </SecaoLinhas>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SecaoLinhas({ titulo, colSpan, children }: { titulo: string; colSpan: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="border-t border-border bg-muted/30"><th colSpan={colSpan} className="px-3 py-1.5 text-left text-xs font-semibold">{titulo}</th></tr>
      {children}
    </>
  )
}
