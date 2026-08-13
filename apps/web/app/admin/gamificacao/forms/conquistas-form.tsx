'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Search, Sparkles } from 'lucide-react'
import type { GamConfig, ConquistaDef, ConquistaRegraTipo } from '@/lib/gamificacao/config'
import { DEFAULT_CONQUISTAS } from '@/lib/gamificacao/config'
import { iconeConquista, ICONE_OPCOES } from '@/lib/gamificacao/icones'
import { salvarConquistas } from '../actions'
import { SaveBar, SectionCard } from './_campos'
import { useUnsavedGuard } from '@/components/admin/use-unsaved-guard'

let seq = 0
const novoId = () => `c_${Date.now()}_${seq++}`
const REGRAS: { v: ConquistaRegraTipo; label: string }[] = [
  { v: 'simulados_concluidos', label: 'Simulados concluídos' },
  { v: 'xp_total', label: 'XP total acumulado' },
  { v: 'streak', label: 'Dias de sequência' },
  { v: 'nota_max', label: 'Nota máxima atingida' },
]
const regraLabel = (t: string) => REGRAS.find((r) => r.v === t)?.label ?? t
const selectCls = 'h-9 w-full rounded-lg border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60'

export function ConquistasForm({ config, podeGerenciar }: { config: GamConfig; podeGerenciar: boolean }) {
  const [lista, setLista] = useState<ConquistaDef[]>(config.conquistas_def)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'todas' | ConquistaRegraTipo>('todas')
  const [salvando, start] = useTransition()
  const { dirty, markSaved } = useUnsavedGuard({ lista })

  const setById = (id: string, patch: Partial<ConquistaDef>) => setLista((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const setRegra = (id: string, patch: Partial<ConquistaDef['regra']>) => setLista((l) => l.map((x) => (x.id === id ? { ...x, regra: { ...x.regra, ...patch } } : x)))
  const remById = (id: string) => setLista((l) => l.filter((x) => x.id !== id))
  const add = () => setLista((l) => [{ id: novoId(), titulo: 'Nova conquista', descricao: '', icone: 'trophy', regra: { tipo: 'simulados_concluidos', meta: 1 }, xp: 20 }, ...l])
  const addSugeridas = () => {
    const ids = new Set(lista.map((c) => c.id))
    const faltando = DEFAULT_CONQUISTAS.filter((c) => !ids.has(c.id))
    if (!faltando.length) { toast.info('Todas as conquistas sugeridas já estão na lista.'); return }
    setLista((l) => [...l, ...faltando.map((c) => ({ ...c }))])
    toast.success(`${faltando.length} conquista(s) sugerida(s) adicionada(s).`)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const r = await salvarConquistas(lista)
      if (r?.error) toast.error(r.error); else { toast.success('Conquistas salvas.'); markSaved() }
    })
  }

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return lista.filter((c) => {
      if (filtro !== 'todas' && c.regra?.tipo !== filtro) return false
      if (!q) return true
      return c.titulo.toLowerCase().includes(q) || c.descricao.toLowerCase().includes(q)
    })
  }, [lista, busca, filtro])

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {podeGerenciar && <SaveBar salvando={salvando} dirty={dirty} hint="Conquistas do aluno." />}

      <SectionCard titulo="Conquistas" descricao="Desbloqueadas uma única vez ao cumprir a regra. Podem conceder XP extra ao desbloquear.">
        {/* Barra de busca + filtro + ações */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título ou descrição…" className="pl-8" />
          </div>
          <select className={`${selectCls} w-52`} value={filtro} onChange={(e) => setFiltro(e.target.value as any)} aria-label="Filtrar por regra">
            <option value="todas">Todas as regras</option>
            {REGRAS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
          {podeGerenciar && (
            <>
              <Button type="button" variant="secondary" onClick={addSugeridas}><Sparkles className="h-4 w-4" /> Sugeridas</Button>
              <Button type="button" variant="outline" onClick={add}><Plus className="h-4 w-4" /> Nova</Button>
            </>
          )}
        </div>
        <div className="mb-3 text-xs text-muted-foreground">{visiveis.length} de {lista.length} conquista(s)</div>

        <div className="grid gap-3 lg:grid-cols-2">
          {visiveis.map((c) => {
            const Icon = iconeConquista(c.icone)
            return (
              <div key={c.id} className="space-y-3 rounded-xl border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><Icon className="h-5 w-5" /></span>
                  <label className="min-w-0 flex-1 space-y-1">
                    <span className="block text-[11px] font-medium text-muted-foreground">Título</span>
                    <Input value={c.titulo} onChange={(e) => setById(c.id, { titulo: e.target.value })} disabled={!podeGerenciar} />
                  </label>
                  <span className="hidden shrink-0 self-start rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">{regraLabel(c.regra?.tipo)}</span>
                  {podeGerenciar && <Button type="button" variant="ghost" size="icon" onClick={() => remById(c.id)} aria-label={`Remover ${c.titulo}`} className="shrink-0 self-start text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>}
                </div>
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Descrição</span>
                  <Input value={c.descricao} onChange={(e) => setById(c.id, { descricao: e.target.value })} disabled={!podeGerenciar} placeholder="Ex.: Conclua seu primeiro simulado" />
                </label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="space-y-1">
                    <span className="block text-[11px] font-medium text-muted-foreground">Ícone</span>
                    <select className={selectCls} value={c.icone} onChange={(e) => setById(c.id, { icone: e.target.value })} disabled={!podeGerenciar}>
                      {ICONE_OPCOES.map((ic) => <option key={ic.v} value={ic.v}>{ic.label}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] font-medium text-muted-foreground">Regra</span>
                    <select className={selectCls} value={c.regra.tipo} onChange={(e) => setRegra(c.id, { tipo: e.target.value as ConquistaRegraTipo })} disabled={!podeGerenciar}>
                      {REGRAS.map((rg) => <option key={rg.v} value={rg.v}>{rg.label}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] font-medium text-muted-foreground">Meta (≥)</span>
                    <Input type="number" min={0} value={c.regra.meta} onChange={(e) => setRegra(c.id, { meta: Number(e.target.value || 0) })} disabled={!podeGerenciar} className="text-right tabular-nums" />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] font-medium text-muted-foreground">XP</span>
                    <Input type="number" min={0} value={c.xp} onChange={(e) => setById(c.id, { xp: Number(e.target.value || 0) })} disabled={!podeGerenciar} className="text-right tabular-nums" />
                  </label>
                </div>
              </div>
            )
          })}
          {visiveis.length === 0 && (
            <p className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground lg:col-span-2">
              {lista.length === 0 ? 'Nenhuma conquista. Use “Sugeridas” ou “Nova”.' : 'Nenhuma conquista corresponde à busca/filtro.'}
            </p>
          )}
        </div>
      </SectionCard>
    </form>
  )
}
