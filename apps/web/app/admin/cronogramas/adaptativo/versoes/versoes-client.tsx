'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Loader2, RotateCcw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import type { DifCampo } from '@/lib/cronograma/adaptativo/regras-campos'
import { listarVersoes, salvarRegras } from '../regras-actions'

export interface VersaoLinha {
  versao: number; hash: string; motivo: string | null; atual: boolean
  quando: string | null; quandoBrt: string | null; autor: string | null; autorId?: string | null
  vsPadrao: DifCampo[]; vsVigente: DifCampo[]
}
type Col = 'versao' | 'quando' | 'difs'

export function VersoesClient({ linhas, versaoAtual, podeEditar }: { linhas: VersaoLinha[]; versaoAtual: number; podeEditar: boolean }) {
  const router = useRouter()
  const [pend, start] = useTransition()
  const [q, setQ] = useState('')
  const [so, setSo] = useState('')
  const [ord, setOrd] = useState<Col>('versao')
  const [asc, setAsc] = useState(false)
  const [aberta, setAberta] = useState<number | null>(null)
  const [base, setBase] = useState<'padrao' | 'vigente'>('padrao')

  const lista = useMemo(() => {
    const b = q.trim().toLowerCase()
    const f = linhas.filter((l) => (so === '' || (so === 'atual' ? l.atual : !l.atual)) && (!b || `${l.versao} ${l.motivo ?? ''} ${l.autor ?? ''} ${l.vsPadrao.map((d) => d.rotulo).join(' ')}`.toLowerCase().includes(b)))
    return [...f].sort((a, c) => {
      const r = ord === 'versao' ? a.versao - c.versao : ord === 'quando' ? (a.quando ?? '').localeCompare(c.quando ?? '') : a.vsPadrao.length - c.vsPadrao.length
      return (r || a.versao - c.versao) * (asc ? 1 : -1)
    })
  }, [linhas, q, so, ord, asc])

  const restaurar = async (l: VersaoLinha) => {
    if (!(await confirmar({ titulo: `Restaurar a versão ${l.versao}`, mensagem: `As regras da versão ${l.versao} passam a valer como uma NOVA versão (a atual fica no histórico). Planos já gravados não mudam.`, confirmar: 'Restaurar versão' }))) return
    start(async () => {
      // O delta da versão é relido no servidor (fonte da verdade) e regravado como nova versão.
      const r = await listarVersoes()
      const v = r.dados?.find((x) => x.versao === l.versao)
      if (!r.ok || !v) { toast.error(r.error ?? 'Versão não encontrada.'); return }
      const s = await salvarRegras(v.delta, versaoAtual, `Restaurada a versão ${l.versao}`)
      if (!s.ok) { toast.error(s.conflito ? 'Outra pessoa salvou regras nesse meio tempo. Recarregue a página.' : (s.error ?? 'Falha ao restaurar.')); return }
      toast.success(`Versão ${l.versao} restaurada como versão ${s.dados!.versao}.`)
      router.refresh()
    })
  }

  const Th = ({ c, children }: { c: Col; children: string }) => (
    <th className="px-3 py-2 text-left font-medium">
      <button type="button" onClick={() => { if (ord === c) setAsc(!asc); else { setOrd(c); setAsc(false) } }} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}{ord === c ? (asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por versão, motivo, autor ou regra alterada" className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={so} onChange={(e) => setSo(e.target.value)} className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="">Todas as versões</option><option value="atual">Somente a em vigor</option><option value="antigas">Somente anteriores</option>
        </select>
        <select value={base} onChange={(e) => setBase(e.target.value as 'padrao' | 'vigente')} className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="padrao">Comparar com o padrão</option><option value="vigente">Comparar com a versão em vigor</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
            <th className="w-8" /><Th c="versao">Versão</Th><Th c="quando">Quando (Brasília)</Th><th className="px-3 py-2 text-left font-medium">Autor</th><th className="px-3 py-2 text-left font-medium">Motivo</th><Th c="difs">Difere do padrão</Th><th className="px-3 py-2" />
          </tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">{linhas.length === 0 ? 'Nenhuma versão gravada ainda — a plataforma usa o padrão.' : 'Nenhuma versão com esses filtros.'}</td></tr>}
            {lista.map((l) => {
              const difs = base === 'padrao' ? l.vsPadrao : l.vsVigente
              const open = aberta === l.versao
              return (
                <Fragment key={l.versao}>
                  <tr className={cn('border-t border-border', l.atual && 'bg-primary/5')}>
                    <td className="pl-2"><button type="button" aria-label="Ver diferenças" onClick={() => setAberta(open ? null : l.versao)}>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td>
                    <td className="px-3 py-2 font-semibold tabular-nums">v{l.versao}{l.atual && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">em vigor</span>}</td>
                    <td className="px-3 py-2 tabular-nums">{l.quandoBrt ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground" title={l.autorId ?? ''}>{l.autor ?? (l.autorId ? l.autorId.slice(0, 8) : 'sistema')}</td>
                    <td className="px-3 py-2">{l.motivo ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 tabular-nums">{l.vsPadrao.length ? `${l.vsPadrao.length} campo(s)` : 'igual ao padrão'}</td>
                    <td className="px-3 py-2 text-right">
                      {podeEditar && !l.atual && (
                        <button type="button" disabled={pend} onClick={() => restaurar(l)} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition hover:bg-muted disabled:opacity-50">
                          {pend ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restaurar
                        </button>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-t border-border bg-muted/20"><td /><td colSpan={6} className="px-3 py-3">
                      {difs.length === 0 ? <p className="text-sm text-muted-foreground">Sem diferenças {base === 'padrao' ? 'em relação ao padrão' : 'em relação à versão em vigor'}.</p> : (
                        <table className="w-full text-xs">
                          <thead className="text-muted-foreground"><tr><th className="py-1 text-left font-medium">Regra</th><th className="py-1 text-left font-medium">{base === 'padrao' ? 'Padrão' : 'Em vigor'}</th><th className="py-1 text-left font-medium">v{l.versao}</th></tr></thead>
                          <tbody>{difs.map((d) => <tr key={d.path} className="border-t border-border/60"><td className="py-1 pr-3">{d.rotulo}</td><td className="py-1 pr-3 tabular-nums">{d.de}</td><td className="py-1 font-semibold tabular-nums text-primary">{d.para}</td></tr>)}</tbody>
                        </table>
                      )}
                    </td></tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
