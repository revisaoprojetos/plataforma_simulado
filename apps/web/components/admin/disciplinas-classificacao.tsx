'use client'

// Editor de CLASSIFICAÇÃO de disciplinas (essencial/complementar/específica) + cor + ordem.
// Alimenta os grupos do Cronograma Adaptativo. Padrão de tabela do admin (busca + ordenação),
// cores via tokens, salvamento por linha com toast.

import { useMemo, useState } from 'react'
import { Loader2, Search, Save, ArrowUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { atualizarDisciplinaClassificacao, vincularPastaDisciplina, type DisciplinaClass, type PastaConteudo } from '@/app/admin/questoes/disciplinas-actions'

const CLASSES: { v: string; rot: string }[] = [
  { v: '', rot: '—' },
  { v: 'essencial', rot: 'Essencial' },
  { v: 'complementar', rot: 'Complementar' },
  { v: 'especifica', rot: 'Específica' },
]
type Linha = DisciplinaClass & { _dirty?: boolean; _saving?: boolean }

export function DisciplinasClassificacao({ itens, pastas = [] }: { itens: DisciplinaClass[]; pastas?: PastaConteudo[] }) {
  const [linhas, setLinhas] = useState<Linha[]>(itens)
  const [busca, setBusca] = useState('')
  const [ordCol, setOrdCol] = useState<'nome' | 'classificacao' | 'ordem' | 'questoes'>('ordem')
  const [ordDir, setOrdDir] = useState<1 | -1>(1)

  const vis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const arr = linhas.filter((l) => !q || l.nome.toLowerCase().includes(q))
    arr.sort((a, b) => {
      let r = 0
      if (ordCol === 'nome' || ordCol === 'classificacao') r = String(a[ordCol] ?? '').localeCompare(String(b[ordCol] ?? ''), 'pt-BR')
      else r = (Number(a[ordCol]) || 0) - (Number(b[ordCol]) || 0)
      return r * ordDir
    })
    return arr
  }, [linhas, busca, ordCol, ordDir])

  function set(id: string, patch: Partial<Linha>) {
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch, _dirty: true } : l)))
  }
  function sort(col: typeof ordCol) {
    if (ordCol === col) setOrdDir((d) => (d === 1 ? -1 : 1))
    else { setOrdCol(col); setOrdDir(1) }
  }
  async function salvar(l: Linha) {
    setLinhas((ls) => ls.map((x) => (x.id === l.id ? { ...x, _saving: true } : x)))
    const r = await atualizarDisciplinaClassificacao(l.id, { classificacao: l.classificacao || null, cor: l.cor || null, ordem: l.ordem })
    setLinhas((ls) => ls.map((x) => (x.id === l.id ? { ...x, _saving: false, _dirty: !r.ok ? x._dirty : false } : x)))
    if (r.ok) toast.success(`${l.nome} atualizada.`)
    else toast.error(r.error ?? 'Falha ao salvar.')
  }

  const Th = ({ col, children }: { col: typeof ordCol; children: React.ReactNode }) => (
    <th className="px-3 py-2 text-left">
      <button onClick={() => sort(col)} className="inline-flex items-center gap-1 font-medium hover:text-foreground">
        {children} <ArrowUpDown className={`h-3 w-3 ${ordCol === col ? 'text-primary' : 'text-muted-foreground/50'}`} />
      </button>
    </th>
  )

  const porClasse = useMemo(() => {
    const m: Record<string, number> = { essencial: 0, complementar: 0, especifica: 0, '': 0 }
    linhas.forEach((l) => { m[l.classificacao || ''] = (m[l.classificacao || ''] || 0) + 1 })
    return m
  }, [linhas])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar disciplina…" className="h-9 w-64 rounded-lg border bg-card pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5">Essenciais: <b className="text-foreground">{porClasse.essencial}</b></span>
          <span className="rounded-full bg-muted px-2 py-0.5">Complementares: <b className="text-foreground">{porClasse.complementar}</b></span>
          <span className="rounded-full bg-muted px-2 py-0.5">Específicas: <b className="text-foreground">{porClasse.especifica}</b></span>
          {porClasse[''] > 0 && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">Sem classificação: <b>{porClasse['']}</b></span>}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <Th col="nome">Disciplina</Th>
              <Th col="classificacao">Classificação</Th>
              <th className="px-3 py-2 text-left font-medium">Cor</th>
              <Th col="ordem">Ordem</Th>
              <Th col="questoes">Questões</Th>
              <th className="px-3 py-2 text-right font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {vis.map((l) => (
              <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: l.cor || 'var(--muted-foreground)' }} />
                    <span className="font-medium">{l.nome}</span>
                  </span>
                </td>
                <td className="px-3 py-2">
                  <select value={l.classificacao ?? ''} onChange={(e) => set(l.id, { classificacao: e.target.value || null })} className="h-8 rounded-lg border bg-card px-2 text-sm">
                    {CLASSES.map((c) => <option key={c.v} value={c.v}>{c.rot}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input type="color" value={l.cor || '#6b6b6b'} onChange={(e) => set(l.id, { cor: e.target.value })} className="h-8 w-12 cursor-pointer rounded border bg-card p-0.5" aria-label={`Cor de ${l.nome}`} />
                </td>
                <td className="px-3 py-2">
                  <input type="number" value={l.ordem} onChange={(e) => set(l.id, { ordem: Number(e.target.value) || 0 })} className="h-8 w-16 rounded-lg border bg-card px-2 text-sm" />
                </td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{l.questoes.toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => salvar(l)} disabled={!l._dirty || l._saving} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-40 enabled:hover:border-primary">
                    {l._saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
                  </button>
                </td>
              </tr>
            ))}
            {!vis.length && <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">Nenhuma disciplina.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">A classificação monta os grupos do Cronograma Adaptativo (essenciais/complementares/específicas) e a cor identifica a disciplina na grade.</p>

      <PastasVinculo pastas={pastas} disciplinas={linhas.map((l) => ({ id: l.id, nome: l.nome }))} />
    </div>
  )
}

function PastasVinculo({ pastas, disciplinas }: { pastas: PastaConteudo[]; disciplinas: { id: string; nome: string }[] }) {
  const [rows, setRows] = useState(pastas)
  const [saving, setSaving] = useState<string | null>(null)
  if (!pastas.length) return null
  async function set(pastaId: string, disciplinaId: string | null) {
    setRows((rs) => rs.map((r) => (r.id === pastaId ? { ...r, disciplina_id: disciplinaId } : r)))
    setSaving(pastaId)
    const r = await vincularPastaDisciplina(pastaId, disciplinaId)
    setSaving(null)
    if (r.ok) toast.success('Vínculo atualizado.')
    else toast.error(r.error ?? 'Falha ao vincular.')
  }
  return (
    <div className="space-y-3 pt-2">
      <div>
        <h3 className="text-sm font-semibold">Pastas da Biblioteca por disciplina</h3>
        <p className="text-xs text-muted-foreground">Marque qual pasta de conteúdo pertence a cada disciplina. Os documentos (PDFs) publicados dela viram as aulas do Cronograma Adaptativo. Subpastas herdam o vínculo.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr><th className="px-3 py-2 text-left font-medium">Pasta</th><th className="px-3 py-2 text-left font-medium">Documentos</th><th className="px-3 py-2 text-left font-medium">Disciplina</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{p.nome}{p.pai_id ? <span className="ml-1 text-xs text-muted-foreground">(subpasta)</span> : null}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{p.docs.toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <select value={p.disciplina_id ?? ''} onChange={(e) => set(p.id, e.target.value || null)} className="h-8 rounded-lg border bg-card px-2 text-sm">
                      <option value="">— não vinculada —</option>
                      {disciplinas.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                    </select>
                    {saving === p.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
