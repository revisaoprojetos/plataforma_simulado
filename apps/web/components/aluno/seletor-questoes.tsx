'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { questoesAcessiveis, type QuestaoDisponivel } from '@/app/aluno/(portal)/simulados/builder-actions'

const MAX_MOSTRAR = 100 // teto renderizado — refine a busca p/ ver as demais

/**
 * Seletor de questões (das que o aluno tem acesso): clicar num item MARCA/desmarca um check
 * (só estado local, sem tocar o servidor). "Concluir" chama onConcluir com as escolhidas — o pai
 * faz o import em lote e mostra o estado "Importando…". Reusado no wizard e no editor.
 */
export function SeletorQuestoes({ jaEscolhidas, onConcluir, onCancelar, textoConcluir = 'Concluir' }: {
  jaEscolhidas?: Set<string>
  onConcluir: (questoes: QuestaoDisponivel[]) => void | Promise<void>
  onCancelar?: () => void
  textoConcluir?: string
}) {
  const ja = jaEscolhidas ?? new Set<string>()
  const [dados, setDados] = useState<{ questoes: QuestaoDisponivel[]; disciplinas: { id: string; nome: string }[]; truncado: boolean } | null>(null)
  const [termo, setTermo] = useState('')
  const [disc, setDisc] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [importando, setImportando] = useState(false)

  useEffect(() => { questoesAcessiveis().then(setDados).catch(() => setDados({ questoes: [], disciplinas: [], truncado: false })) }, [])

  const filtradas = useMemo(() => {
    if (!dados) return []
    const t = termo.trim().toLowerCase()
    return dados.questoes.filter((q) => (!disc || q.disciplinaId === disc) && (!t || q.enunciado.toLowerCase().includes(t)))
  }, [dados, termo, disc])
  const mostradas = filtradas.slice(0, MAX_MOSTRAR)
  const porId = useMemo(() => new Map((dados?.questoes ?? []).map((q) => [q.id, q])), [dados])

  const toggle = (id: string) => {
    if (ja.has(id)) return
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  const concluir = async () => {
    setImportando(true)
    const escolhidas = [...sel].map((id) => porId.get(id)).filter(Boolean) as QuestaoDisponivel[]
    try { await onConcluir(escolhidas) } finally { setImportando(false) }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b p-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar no enunciado…" className="w-full rounded-lg border bg-transparent py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        <select value={disc} onChange={(e) => setDisc(e.target.value)} className="h-9 rounded-lg border bg-transparent px-2 text-sm">
          <option value="">Todas as disciplinas</option>
          {dados?.disciplinas.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {dados == null ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando questões…</div>
        ) : !filtradas.length ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {dados.questoes.length === 0 ? 'Você ainda não tem acesso a questões de nenhum simulado.' : 'Nenhuma questão para esta busca/filtro.'}
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {mostradas.map((q) => {
                const marcada = sel.has(q.id)
                const jaTem = ja.has(q.id)
                return (
                  <li key={q.id}>
                    <button type="button" onClick={() => toggle(q.id)} disabled={jaTem}
                      className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition',
                        jaTem ? 'cursor-default border-emerald-500/30 bg-emerald-500/5' : marcada ? 'border-primary bg-primary/5' : 'hover:border-foreground/20 hover:bg-muted/40')}>
                      <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                        jaTem ? 'border-emerald-500 bg-emerald-500 text-white' : marcada ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                        {(jaTem || marcada) && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block text-foreground">{q.enunciado || '(sem enunciado)'}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {q.disciplina && <span className="rounded-full bg-muted px-2 py-0.5">{q.disciplina}</span>}
                          {q.ano && <span>{q.ano}</span>}
                          {jaTem && <span className="text-emerald-600 dark:text-emerald-400">já no simulado</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {filtradas.length > MAX_MOSTRAR && (
              <p className="mt-3 text-center text-xs text-muted-foreground">Mostrando {MAX_MOSTRAR} de {filtradas.length}. Refine a busca para ver as demais.</p>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t p-3">
        <span className="text-sm text-muted-foreground">{sel.size} selecionada{sel.size === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-2">
          {onCancelar && <button type="button" onClick={onCancelar} disabled={importando} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">Cancelar</button>}
          <button type="button" onClick={concluir} disabled={importando || sel.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
            {importando ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando questões…</> : <>{textoConcluir} {sel.size > 0 && `(${sel.size})`}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
