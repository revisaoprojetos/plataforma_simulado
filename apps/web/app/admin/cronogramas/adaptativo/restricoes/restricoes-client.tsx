'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Plus, Save, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FAMILIAS_RESTRICAO, TIPOS_RESTRICAO, normalizarRestricoes, type FamiliaRestricao, type RestricaoRegra, type TipoRestricao } from '@/lib/cronograma/adaptativo/regras'
import { validarRegras } from '@/lib/cronograma/adaptativo/regras-validacao'
import { EXEMPLOS_RESTRICOES, ROTULO_FAMILIA, ROTULO_TIPO_RESTRICAO, descreverRestricao } from '@/lib/cronograma/adaptativo/restricoes'
import { CHAVE_RASCUNHO } from '@/lib/cronograma/adaptativo/regras-campos'
import { salvarRegras } from '../regras-actions'
import type { RegistroRegras } from '../regras-actions-tipos'

type Col = 'rotulo' | 'tipo' | 'personagem' | 'ativa'
const FAIXAS = [{ n: 1, rotulo: 'Faixa 1 (< 15h)' }, { n: 2, rotulo: 'Faixa 2 (15h–24h30)' }, { n: 3, rotulo: 'Faixa 3 (> 24h30)' }]
const AJUDA: Record<TipoRestricao, string> = {
  max_por_dia: 'Quantas metas deste personagem cabem no mesmo dia (PDFull conta leituras distintas).',
  nao_mesmo_dia: 'Os dois personagens nunca dividem o mesmo dia.',
  nao_dias_seguidos: 'O personagem não aparece em dois dias consecutivos.',
  so_na_sobra: 'Só entra num dia que já tenha meta de outro tipo (se ainda houver outras metas a planejar). Não vale para PDFull.',
  depois_de: 'Cada meta do conteúdo só entra ao menos N dias depois da meta do outro personagem (mesmo conteúdo). 0 = no mesmo dia ou depois.',
}
const sel = 'h-9 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'

const vazia = (): RestricaoRegra => ({ id: '', tipo: 'nao_mesmo_dia', ativa: true, rotulo: '', tipoA: 'pf', tipoB: 'qu', valor: 1, faixas: [] })
const novoId = () => `r-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const relacional = (t: TipoRestricao) => t === 'nao_mesmo_dia' || t === 'depois_de'
const personagem = (r: RestricaoRegra) => (r.tipoB ? `${ROTULO_FAMILIA[r.tipoA]} × ${ROTULO_FAMILIA[r.tipoB]}` : ROTULO_FAMILIA[r.tipoA])

export function RestricoesClient({ registro, podeEditar }: { registro: RegistroRegras; podeEditar: boolean }) {
  const [vigente, setVigente] = useState<RestricaoRegra[]>(registro.regras.restricoes)
  const [lista, setLista] = useState<RestricaoRegra[]>(registro.regras.restricoes)
  const [versao, setVersao] = useState(registro.versao)
  const [motivo, setMotivo] = useState('')
  const [busca, setBusca] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fPers, setFPers] = useState('')
  const [ord, setOrd] = useState<Col>('rotulo')
  const [asc, setAsc] = useState(true)
  const [form, setForm] = useState<RestricaoRegra | null>(null)
  const [conflito, setConflito] = useState(false)
  const [pend, start] = useTransition()

  const draft = useMemo(() => ({ ...registro.regras, restricoes: lista }), [registro.regras, lista])
  const validacao = useMemo(() => validarRegras(draft), [draft])
  const erros = validacao.ok ? [] : validacao.erros
  const avisos = validacao.avisos ?? []
  const sujo = useMemo(() => JSON.stringify(vigente) !== JSON.stringify(lista), [vigente, lista])

  // rascunho compartilhado com a aba Simulação (a simulação mostra as violações das restrições do rascunho)
  useEffect(() => {
    try {
      if (!sujo) return
      const atual = sessionStorage.getItem(CHAVE_RASCUNHO)
      const base = atual ? (JSON.parse(atual) as Record<string, unknown>) : (registro.regras as unknown as Record<string, unknown>)
      sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ ...base, restricoes: lista }))
    } catch { /* sem storage */ }
  }, [lista, sujo, registro.regras])
  useEffect(() => {
    if (!sujo) return
    const f = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [sujo])

  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase()
    const f = lista.filter((r) => (!fTipo || r.tipo === fTipo) && (!fPers || r.tipoA === fPers || r.tipoB === fPers) && (!b || `${r.rotulo} ${descreverRestricao(r)}`.toLowerCase().includes(b)))
    const chave = (r: RestricaoRegra) => (ord === 'rotulo' ? (r.rotulo || descreverRestricao(r)) : ord === 'tipo' ? ROTULO_TIPO_RESTRICAO[r.tipo] : ord === 'personagem' ? personagem(r) : r.ativa ? 0 : 1)
    return [...f].sort((a, c) => {
      const x = chave(a), y = chave(c)
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')) * (asc ? 1 : -1)
    })
  }, [lista, busca, fTipo, fPers, ord, asc])

  const Th = ({ c, children }: { c: Col; children: string }) => (
    <th className="px-3 py-2 text-left font-medium">
      <button type="button" onClick={() => { if (ord === c) setAsc(!asc); else { setOrd(c); setAsc(true) } }} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}{ord === c ? (asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  )

  const aplicar = (r: RestricaoRegra) => {
    const [n] = normalizarRestricoes([r])
    if (!n) { toast.error('Preencha o tipo e os personagens da restrição.'); return }
    setLista((l) => (l.some((x) => x.id === n.id) ? l.map((x) => (x.id === n.id ? n : x)) : [...l, n]))
    setForm(null)
  }
  const alternar = (id: string) => setLista((l) => l.map((x) => (x.id === id ? { ...x, ativa: !x.ativa } : x)))
  const remover = (id: string) => setLista((l) => l.filter((x) => x.id !== id))

  const salvar = () => start(async () => {
    if (!validacao.ok) { toast.error(erros[0] ?? 'Há restrições inválidas.'); return }
    const r = await salvarRegras(draft, versao, motivo)
    if (!r.ok) { setConflito(!!r.conflito); toast.error(r.error ?? 'Falha ao salvar.'); return }
    setConflito(false); setVersao(r.dados!.versao); setVigente(lista); setMotivo('')
    toast.success(`Restrições salvas (versão ${r.dados!.versao}). Valem para planos gerados a partir de agora.`)
    if (r.avisos?.length) toast.warning(r.avisos[0])
  })

  return (
    <div className="space-y-4">
      {conflito && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Outra pessoa salvou regras depois que você abriu esta tela. Recarregue a página para ver a versão atual (suas alterações locais serão perdidas).</div>}
      {erros.length > 0 && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="font-semibold">Corrija antes de salvar:</p>
          <ul className="list-disc pl-5">{erros.slice(0, 6).map((e, k) => <li key={k}>{e}</li>)}</ul>
        </div>
      )}
      {avisos.length > 0 && (
        <div className="rounded-2xl border border-border bg-muted/40 p-3 text-sm">
          <p className="font-semibold">Atenção (não impede salvar):</p>
          <ul className="list-disc pl-5 text-muted-foreground">{avisos.slice(0, 6).map((e, k) => <li key={k}>{e}</li>)}</ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar restrição" className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className={sel}>
          <option value="">Todos os tipos</option>
          {TIPOS_RESTRICAO.map((t) => <option key={t} value={t}>{ROTULO_TIPO_RESTRICAO[t]}</option>)}
        </select>
        <select value={fPers} onChange={(e) => setFPers(e.target.value)} className={sel}>
          <option value="">Todos os personagens</option>
          {FAMILIAS_RESTRICAO.map((f) => <option key={f} value={f}>{ROTULO_FAMILIA[f]}</option>)}
        </select>
        {podeEditar && <button type="button" onClick={() => setForm({ ...vazia(), id: novoId() })} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"><Plus className="h-4 w-4" /> Nova restrição</button>}
        <span className="text-xs text-muted-foreground">Versão {versao || 'padrão'} · {lista.filter((r) => r.ativa).length} ativa(s) de {lista.length}</span>
      </div>

      {form && podeEditar && <Formulario r={form} existe={lista.some((x) => x.id === form.id)} onChange={setForm} onSalvar={() => aplicar(form)} onCancelar={() => setForm(null)} />}

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
            <Th c="ativa">Ativa</Th><Th c="rotulo">Restrição</Th><Th c="tipo">Tipo</Th><Th c="personagem">Personagem</Th><th className="px-3 py-2 text-left font-medium">Escopo</th><th className="w-24 px-3 py-2" />
          </tr></thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">{lista.length ? 'Nenhuma restrição com esses filtros.' : 'Nenhuma restrição cadastrada: o motor segue o padrão. Adicione uma nova ou um exemplo abaixo.'}</td></tr>}
            {visiveis.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2"><input type="checkbox" aria-label="Ativar restrição" disabled={!podeEditar} checked={r.ativa} onChange={() => alternar(r.id)} className="h-4 w-4" /></td>
                <td className={cn('px-3 py-2', !r.ativa && 'text-muted-foreground')}><p className="font-medium">{r.rotulo || descreverRestricao(r)}</p>{r.rotulo && <p className="text-xs text-muted-foreground">{descreverRestricao(r)}</p>}</td>
                <td className="px-3 py-2">{ROTULO_TIPO_RESTRICAO[r.tipo]}{r.tipo === 'max_por_dia' ? ` (${r.valor})` : r.tipo === 'depois_de' ? ` (${r.valor} dia${r.valor === 1 ? '' : 's'})` : ''}</td>
                <td className="px-3 py-2">{personagem(r)}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.faixas.length ? `Faixa ${r.faixas.join(', ')}` : 'Todas as faixas'}</td>
                <td className="px-3 py-2 text-right">
                  {podeEditar && <span className="inline-flex gap-1">
                    <button type="button" onClick={() => setForm({ ...r })} className="rounded-lg border border-border px-2 py-1 text-xs font-medium transition hover:bg-muted">Editar</button>
                    <button type="button" aria-label="Remover restrição" onClick={() => remover(r.id)} className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:bg-muted hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <h2 className="font-semibold">Exemplos prontos</h2>
          <p className="text-xs text-muted-foreground">Entram <b>desligados</b>; ative na lista e simule na aba <Link href="/admin/cronogramas/adaptativo/simulacao" className="font-medium text-primary underline-offset-2 hover:underline">Simulação</Link> antes de salvar.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {EXEMPLOS_RESTRICOES.map((e) => {
            const ja = lista.some((x) => x.id === e.id)
            return (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
                <div className="min-w-0"><p className="text-sm font-medium">{e.rotulo}</p><p className="text-xs text-muted-foreground">{ROTULO_TIPO_RESTRICAO[e.tipo]} · {personagem(e)}</p></div>
                <button type="button" disabled={!podeEditar || ja} onClick={() => setLista((l) => [...l, { ...e }])} className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition hover:bg-muted disabled:opacity-50">{ja ? 'Adicionado' : 'Adicionar'}</button>
              </div>
            )
          })}
        </div>
      </section>

      {podeEditar ? (
        <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Motivo da alteração (opcional, vai para o histórico)" className="h-9 min-w-56 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <button type="button" disabled={!sujo || pend} onClick={() => { setLista(vigente); setForm(null) }} className="h-9 rounded-xl border border-border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50">Descartar alterações</button>
          <button type="button" disabled={!sujo || pend || erros.length > 0} onClick={salvar} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
            {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar restrições
          </button>
        </div>
      ) : <p className="text-xs text-muted-foreground">Somente leitura: você não tem permissão para editar (cronogramas:update).</p>}
    </div>
  )
}

function Formulario({ r, existe, onChange, onSalvar, onCancelar }: { r: RestricaoRegra; existe: boolean; onChange: (r: RestricaoRegra) => void; onSalvar: () => void; onCancelar: () => void }) {
  const set = (p: Partial<RestricaoRegra>) => onChange({ ...r, ...p })
  const rel = relacional(r.tipo)
  return (
    <section className="space-y-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
      <h2 className="font-semibold">{existe ? 'Editar restrição' : 'Nova restrição'}</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-sm">Tipo
          <select value={r.tipo} onChange={(e) => { const t = e.target.value as TipoRestricao; set({ tipo: t, tipoB: relacional(t) ? (r.tipoB ?? 'qu') : null, valor: t === 'max_por_dia' ? Math.max(1, r.valor) : t === 'depois_de' ? Math.max(0, r.valor) : 0 }) }} className={cn(sel, 'w-full')}>
            {TIPOS_RESTRICAO.map((t) => <option key={t} value={t}>{ROTULO_TIPO_RESTRICAO[t]}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">Personagem
          <select value={r.tipoA} onChange={(e) => set({ tipoA: e.target.value as FamiliaRestricao })} className={cn(sel, 'w-full')}>
            {FAMILIAS_RESTRICAO.map((f) => <option key={f} value={f}>{ROTULO_FAMILIA[f]}</option>)}
          </select>
        </label>
        {rel && (
          <label className="space-y-1 text-sm">{r.tipo === 'depois_de' ? 'Depois de' : 'Não no mesmo dia que'}
            <select value={r.tipoB ?? ''} onChange={(e) => set({ tipoB: e.target.value as FamiliaRestricao })} className={cn(sel, 'w-full')}>
              {FAMILIAS_RESTRICAO.map((f) => <option key={f} value={f}>{ROTULO_FAMILIA[f]}</option>)}
            </select>
          </label>
        )}
        {(r.tipo === 'max_por_dia' || r.tipo === 'depois_de') && (
          <label className="space-y-1 text-sm">{r.tipo === 'max_por_dia' ? 'Máximo por dia' : 'Atraso mínimo (dias)'}
            <input type="number" min={r.tipo === 'max_por_dia' ? 1 : 0} max={r.tipo === 'max_por_dia' ? 6 : 60} value={r.valor} onChange={(e) => set({ valor: Number(e.target.value) })} className={cn(sel, 'w-full tabular-nums')} />
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{AJUDA[r.tipo]}</p>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-muted-foreground">Vale nas faixas (nenhuma marcada = todas):</span>
        {FAIXAS.map((f) => (
          <label key={f.n} className="flex items-center gap-1.5"><input type="checkbox" checked={r.faixas.includes(f.n)} onChange={(e) => set({ faixas: e.target.checked ? [...r.faixas, f.n].sort() : r.faixas.filter((x) => x !== f.n) })} /> {f.rotulo}</label>
        ))}
      </div>
      <label className="block space-y-1 text-sm">Descrição (opcional)
        <input value={r.rotulo} maxLength={80} onChange={(e) => set({ rotulo: e.target.value })} placeholder="Ex.: PDFull não junto com Questões" className={cn(sel, 'w-full')} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onSalvar} className="h-9 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90">{existe ? 'Aplicar' : 'Adicionar'}</button>
        <button type="button" onClick={onCancelar} className="h-9 rounded-xl border border-border px-3 text-sm font-medium transition hover:bg-muted">Cancelar</button>
      </div>
    </section>
  )
}
