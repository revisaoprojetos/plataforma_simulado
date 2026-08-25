'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Merge, Search, Check, Loader2, Info, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { unificarDisciplinas, type DisciplinaContagem } from '@/app/admin/questoes/disciplinas-actions'

// Normaliza p/ detectar duplicatas: sem acento, minúsculo, sem pontuação, espaços colapsados.
const norm = (s: string) => (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
// Escolhe a "melhor" p/ manter: mais questões, depois mais assuntos, depois nome mais curto.
const melhor = (g: DisciplinaContagem[]) => [...g].sort((a, b) => b.questoes - a.questoes || b.assuntos - a.assuntos || a.nome.length - b.nome.length)[0]

export function DisciplinasUnificacao({ disciplinas }: { disciplinas: DisciplinaContagem[] }) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [manter, setManter] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Clusters de possíveis duplicatas (mesmo nome normalizado, 2+ variações).
  const clusters = useMemo(() => {
    const m = new Map<string, DisciplinaContagem[]>()
    for (const d of disciplinas) { const k = norm(d.nome); const g = m.get(k) ?? []; g.push(d); m.set(k, g) }
    return [...m.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length)
  }, [disciplinas])

  const filtradas = useMemo(() => {
    const q = norm(busca)
    return q ? disciplinas.filter((d) => norm(d.nome).includes(q)) : disciplinas
  }, [disciplinas, busca])

  async function unificar(canonicaId: string, dups: string[]) {
    const alvo = disciplinas.find((d) => d.id === canonicaId)
    if (!alvo || !dups.length) return
    const totalQ = disciplinas.filter((d) => dups.includes(d.id)).reduce((s, d) => s + d.questoes, 0)
    const ok = await confirmar({
      titulo: 'Unificar disciplinas?',
      mensagem: `${dups.length} disciplina(s) serão mescladas em «${alvo.nome}»: ~${totalQ} questão(ões) e os assuntos passam para ela, e as ${dups.length} duplicadas são removidas do filtro. As questões não são apagadas.`,
      confirmar: 'Unificar',
    })
    if (!ok) return
    setSalvando(true)
    const r = await unificarDisciplinas(canonicaId, dups)
    setSalvando(false)
    if (r.ok) { toast.success(`Unificado em «${r.mantida}» — ${r.questoes} questão(ões) movidas, ${r.removidas} removida(s)`); setSel(new Set()); setManter(''); router.refresh() }
    else toast.error(r.error ?? 'Erro ao unificar.')
  }

  function toggle(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  // Canônica do merge manual: a escolhida (se ainda selecionada) OU a "melhor" das marcadas.
  const selArr = [...sel]
  const canonManual = (manter && sel.has(manter)) ? manter : melhor(selArr.map((id) => disciplinas.find((d) => d.id === id)!).filter(Boolean))?.id ?? ''

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-sky-700 dark:text-sky-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Disciplinas com nomes diferentes mas que são a mesma coisa (ex.: da criação/import CSV) poluem o filtro. Marque as duplicadas, escolha qual <strong>manter</strong> e unifique — as questões e assuntos passam para a mantida e as demais somem do filtro.</span>
      </div>

      {/* Sugestões automáticas */}
      {clusters.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Sugestões automáticas <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{clusters.length}</span></p>
          <p className="text-xs text-muted-foreground">Grupos com o mesmo nome escrito de formas diferentes. Confira a que vai ser mantida e unifique num clique.</p>
          <div className="grid gap-2 lg:grid-cols-2">
            {clusters.map((g, i) => <ClusterCard key={i} grupo={g} salvando={salvando} onUnificar={unificar} />)}
          </div>
        </div>
      )}

      {/* Todas as disciplinas — seleção manual */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <p className="text-sm font-semibold">Todas as disciplinas <span className="text-xs font-normal text-muted-foreground">({disciplinas.length})</span></p>
          <div className="relative ml-auto min-w-48 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar disciplina…" className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>

        <div className="max-h-[46vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2 font-medium">Disciplina</th>
                <th className="px-3 py-2 text-right font-medium">Questões</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Assuntos</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">Nenhuma disciplina.</td></tr>
              ) : filtradas.map((d) => {
                const on = sel.has(d.id)
                return (
                  <tr key={d.id} onClick={() => toggle(d.id)} className={cn('cursor-pointer border-b transition-colors hover:bg-muted/40', on && 'bg-primary/5')}>
                    <td className="px-3 py-2"><span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span></td>
                    <td className="px-3 py-2"><span className="block truncate font-medium">{d.nome}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{d.questoes.toLocaleString('pt-BR')}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell">{d.assuntos.toLocaleString('pt-BR')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Barra de merge manual */}
        {sel.size >= 2 && (
          <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-2.5">
            <span className="text-sm font-medium">{sel.size} selecionadas · manter:</span>
            <select value={canonManual} onChange={(e) => setManter(e.target.value)} className="rounded-lg border bg-card px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring">
              {selArr.map((id) => { const d = disciplinas.find((x) => x.id === id); return d ? <option key={id} value={id}>{d.nome} ({d.questoes})</option> : null })}
            </select>
            <button onClick={() => setSel(new Set())} className="rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
            <button onClick={() => unificar(canonManual, selArr.filter((id) => id !== canonManual))} disabled={salvando || !canonManual}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />} Unificar {sel.size}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ClusterCard({ grupo, salvando, onUnificar }: { grupo: DisciplinaContagem[]; salvando: boolean; onUnificar: (canonicaId: string, dups: string[]) => void }) {
  const [canonica, setCanonica] = useState(() => melhor(grupo).id)
  const dups = grupo.filter((d) => d.id !== canonica).map((d) => d.id)
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-3 shadow-sm">
      <div className="space-y-1">
        {grupo.map((d) => (
          <label key={d.id} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors', d.id === canonica ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/40')}>
            <input type="radio" name={`canon-${grupo[0].id}`} checked={d.id === canonica} onChange={() => setCanonica(d.id)} className="h-3.5 w-3.5" />
            <span className="min-w-0 flex-1 truncate">{d.nome}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{d.questoes} q · {d.assuntos} as.</span>
            {d.id === canonica && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">manter</span>}
          </label>
        ))}
      </div>
      <button onClick={() => onUnificar(canonica, dups)} disabled={salvando}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-muted disabled:opacity-50">
        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />} Unificar {grupo.length} em «{grupo.find((d) => d.id === canonica)?.nome}»
      </button>
    </div>
  )
}
