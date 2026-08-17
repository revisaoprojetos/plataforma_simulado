'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Loader2, Check, ChevronDown, X, ClipboardList, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { questoesAcessiveis, type QuestaoDisponivel, type OpcoesFiltro } from '@/app/aluno/(portal)/simulados/builder-actions'

const MAX_MOSTRAR = 100 // teto renderizado — refine os filtros p/ ver as demais

const tipoLabel = (t: string) => (t === 'objetiva' ? 'Objetiva' : t === 'discursiva' ? 'Discursiva' : t.charAt(0).toUpperCase() + t.slice(1))
const difLabel = (d: string) => ({ facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' } as Record<string, string>)[d] ?? (d.charAt(0).toUpperCase() + d.slice(1))

type Filtros = { disciplina: string; assunto: string; banca: string; simulado: string; ano: string; tipo: string; dificuldade: string }
const F0: Filtros = { disciplina: '', assunto: '', banca: '', simulado: '', ano: '', tipo: '', dificuldade: '' }

/**
 * Seletor de questões (das que o aluno tem acesso): clicar num item MARCA/desmarca um check
 * (estado local, sem tocar o servidor). Filtros em "pills" que quebram em várias linhas.
 * "Concluir" chama onConcluir com as escolhidas — o pai importa em lote ("Importando…").
 */
export function SeletorQuestoes({ jaEscolhidas, onConcluir, onCancelar, textoConcluir = 'Concluir' }: {
  jaEscolhidas?: Set<string>
  onConcluir: (questoes: QuestaoDisponivel[]) => void | Promise<void>
  onCancelar?: () => void
  textoConcluir?: string
}) {
  const ja = jaEscolhidas ?? new Set<string>()
  const [dados, setDados] = useState<{ questoes: QuestaoDisponivel[]; filtros: OpcoesFiltro; truncado: boolean } | null>(null)
  const [termo, setTermo] = useState('')
  const [f, setF] = useState<Filtros>(F0)
  const [soFavoritas, setSoFavoritas] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [importando, setImportando] = useState(false)

  useEffect(() => { questoesAcessiveis().then(setDados).catch(() => setDados({ questoes: [], filtros: { disciplinas: [], assuntos: [], bancas: [], anos: [], tipos: [], dificuldades: [], simulados: [] }, truncado: false })) }, [])

  // Assuntos dependem da disciplina escolhida (mostra só os dela).
  const assuntosOpc = useMemo(() => {
    const all = dados?.filtros.assuntos ?? []
    return f.disciplina ? all.filter((a) => a.disciplinaId === f.disciplina) : all
  }, [dados, f.disciplina])

  const filtradas = useMemo(() => {
    if (!dados) return []
    const t = termo.trim().toLowerCase()
    return dados.questoes.filter((q) =>
      (!soFavoritas || q.favorito) &&
      (!f.disciplina || q.disciplinaId === f.disciplina) &&
      (!f.assunto || q.assuntoId === f.assunto) &&
      (!f.banca || q.bancaId === f.banca) &&
      (!f.simulado || q.simuladoId === f.simulado) &&
      (!f.ano || String(q.ano) === f.ano) &&
      (!f.tipo || q.tipo === f.tipo) &&
      (!f.dificuldade || q.dificuldade === f.dificuldade) &&
      (!t || q.enunciado.toLowerCase().includes(t)))
  }, [dados, termo, f, soFavoritas])
  const mostradas = filtradas.slice(0, MAX_MOSTRAR)
  const porId = useMemo(() => new Map((dados?.questoes ?? []).map((q) => [q.id, q])), [dados])
  const algumFiltro = termo.trim() !== '' || Object.values(f).some(Boolean) || soFavoritas

  const toggle = (id: string) => { if (ja.has(id)) return; setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  const concluir = async () => {
    setImportando(true)
    const escolhidas = [...sel].map((id) => porId.get(id)).filter(Boolean) as QuestaoDisponivel[]
    try { await onConcluir(escolhidas) } finally { setImportando(false) }
  }
  const op = dados?.filtros

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar no enunciado…" className="w-full rounded-lg border bg-transparent py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        {/* Filtros em pills: no mobile ficam numa ÚNICA linha rolável (swipe) p/ não roubar altura
            da lista; em telas maiores quebram em 2+ linhas. */}
        <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          {/* Só favoritas — questões marcadas como favoritas no banco. */}
          <button type="button" onClick={() => setSoFavoritas((v) => !v)} aria-pressed={soFavoritas}
            className={cn('inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
              soFavoritas ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-border bg-card text-muted-foreground hover:bg-muted')}>
            <Star className={cn('h-3.5 w-3.5', soFavoritas && 'fill-amber-400 text-amber-500')} /> Favoritas
          </button>
          {!!op?.disciplinas.length && (
            <Pill valor={f.disciplina} onChange={(v) => setF((s) => ({ ...s, disciplina: v, assunto: '' }))} rotulo="Disciplina">
              {op.disciplinas.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </Pill>
          )}
          {!!assuntosOpc.length && (
            <Pill valor={f.assunto} onChange={(v) => setF((s) => ({ ...s, assunto: v }))} rotulo="Assunto">
              {assuntosOpc.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </Pill>
          )}
          {!!op?.bancas.length && (
            <Pill valor={f.banca} onChange={(v) => setF((s) => ({ ...s, banca: v }))} rotulo="Banca">
              {op.bancas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </Pill>
          )}
          {!!op?.simulados.length && (
            <Pill valor={f.simulado} onChange={(v) => setF((s) => ({ ...s, simulado: v }))} rotulo="Simulado">
              {op.simulados.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </Pill>
          )}
          {!!op?.anos.length && (
            <Pill valor={f.ano} onChange={(v) => setF((s) => ({ ...s, ano: v }))} rotulo="Ano">
              {op.anos.map((a) => <option key={a} value={String(a)}>{a}</option>)}
            </Pill>
          )}
          {!!op?.tipos.length && (
            <Pill valor={f.tipo} onChange={(v) => setF((s) => ({ ...s, tipo: v }))} rotulo="Tipo">
              {op.tipos.map((t) => <option key={t} value={t}>{tipoLabel(t)}</option>)}
            </Pill>
          )}
          {!!op?.dificuldades.length && (
            <Pill valor={f.dificuldade} onChange={(v) => setF((s) => ({ ...s, dificuldade: v }))} rotulo="Dificuldade">
              {op.dificuldades.map((d) => <option key={d} value={d}>{difLabel(d)}</option>)}
            </Pill>
          )}
          {algumFiltro && (
            <button type="button" onClick={() => { setTermo(''); setF(F0); setSoFavoritas(false) }} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-3 w-3" /> Limpar
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {dados == null ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando questões…</div>
        ) : !filtradas.length ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {dados.questoes.length === 0 ? 'Você ainda não tem acesso a questões de nenhum simulado.' : 'Nenhuma questão para esses filtros.'}
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
                        {/* Infos no topo: tag do simulado + disciplina/banca/ano/dificuldade. */}
                        <span className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                          {q.favorito && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />}
                          {q.simulado && <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary"><ClipboardList className="h-3 w-3 shrink-0" /> <span className="truncate">{q.simulado}</span></span>}
                          {q.disciplina && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{q.disciplina}</span>}
                          {q.banca && <span className="text-muted-foreground">{q.banca}</span>}
                          {q.ano && <span className="text-muted-foreground">{q.ano}</span>}
                          {q.dificuldade && <span className="capitalize text-muted-foreground">{difLabel(q.dificuldade)}</span>}
                          {jaTem && <span className="text-emerald-600 dark:text-emerald-400">já no simulado</span>}
                        </span>
                        <span className="line-clamp-2 text-foreground">{q.enunciado || '(sem enunciado)'}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {filtradas.length > MAX_MOSTRAR && (
              <p className="mt-3 text-center text-xs text-muted-foreground">Mostrando {MAX_MOSTRAR} de {filtradas.length}. Refine os filtros para ver as demais.</p>
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

/** Filtro "pill": select nativo estilizado como chip; realça quando ativo. */
function Pill({ valor, onChange, rotulo, children }: { valor: string; onChange: (v: string) => void; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="relative shrink-0">
      <select value={valor} onChange={(e) => onChange(e.target.value)}
        className={cn('h-8 max-w-[9.5rem] cursor-pointer appearance-none truncate rounded-full border py-0 pl-3 pr-7 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary',
          valor ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted')}>
        <option value="">{rotulo}</option>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
