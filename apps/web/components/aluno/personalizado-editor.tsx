'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Search, Loader2, Check, Play, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  questoesAcessiveis, adicionarQuestao, removerQuestao, renomearMeuSimulado,
  type QuestaoEscolhida, type QuestaoDisponivel,
} from '@/app/aluno/(portal)/simulados/builder-actions'

/** Editor de um simulado personalizado do aluno: nome + questões escolhidas + seletor de questões. */
export function PersonalizadoEditor({ simuladoId, titulo: tituloIni, itensIniciais }: {
  simuladoId: string; titulo: string; itensIniciais: QuestaoEscolhida[]
}) {
  const [titulo, setTitulo] = useState(tituloIni)
  const [itens, setItens] = useState<QuestaoEscolhida[]>(itensIniciais)
  const [modal, setModal] = useState(false)
  const [salvandoNome, startSalvar] = useTransition()
  const escolhidas = useMemo(() => new Set(itens.map((i) => i.questaoId)), [itens])

  const salvarNome = () => {
    if (titulo.trim() === tituloIni.trim()) return
    startSalvar(async () => { const r = await renomearMeuSimulado(simuladoId, titulo); if (r.error) toast.error(r.error) })
  }
  const remover = async (qid: string) => {
    setItens((prev) => prev.filter((i) => i.questaoId !== qid))
    const r = await removerQuestao(simuladoId, qid)
    if (r.error) toast.error(r.error)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 sm:gap-3">
        <Link href="/aluno/simulados" className="shrink-0 rounded-lg border p-2 text-muted-foreground transition-colors hover:text-foreground" aria-label="Voltar para Meus simulados"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="relative min-w-0 flex-1">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} onBlur={salvarNome} maxLength={120}
            className="w-full rounded-lg border bg-transparent px-3 py-2 text-lg font-bold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Nome do simulado" />
          {salvandoNome && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <button type="button" disabled title="Fazer o simulado — em breve"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground opacity-60">
          <Play className="h-4 w-4" /> <span className="hidden sm:inline">Fazer</span>
        </button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Questões ({itens.length})</h2>
          <button type="button" onClick={() => setModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
            <Plus className="h-4 w-4" /> Adicionar questões
          </button>
        </div>
        {itens.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma questão ainda. Clique em <span className="font-medium text-foreground">Adicionar questões</span> para montar seu simulado.
          </div>
        ) : (
          <ol className="space-y-2">
            {itens.map((q, i) => (
              <li key={q.questaoId} className="flex items-start gap-3 rounded-xl border bg-card p-3 text-sm shadow-sm">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">{i + 1}</span>
                <p className="min-w-0 flex-1 line-clamp-2 text-foreground">{q.enunciado || '(sem enunciado)'}</p>
                <button type="button" onClick={() => remover(q.questaoId)} title="Remover"
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {modal && (
        <ModalQuestoes simuladoId={simuladoId} escolhidas={escolhidas} onFechar={() => setModal(false)}
          onAdicionar={(q) => setItens((prev) => (prev.some((i) => i.questaoId === q.id) ? prev : [...prev, { questaoId: q.id, ordem: prev.length, enunciado: q.enunciado }]))} />
      )}
    </div>
  )
}

const MAX_MOSTRAR = 80 // teto de itens renderizados no modal (refine a busca p/ ver os demais)

function ModalQuestoes({ simuladoId, escolhidas, onFechar, onAdicionar }: {
  simuladoId: string; escolhidas: Set<string>; onFechar: () => void; onAdicionar: (q: QuestaoDisponivel) => void
}) {
  const [termo, setTermo] = useState('')
  const [disc, setDisc] = useState('')
  const [dados, setDados] = useState<{ questoes: QuestaoDisponivel[]; disciplinas: { id: string; nome: string }[]; truncado: boolean } | null>(null)
  const [addId, setAddId] = useState<string | null>(null)
  const [locais, setLocais] = useState<Set<string>>(new Set())

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onFechar])

  // Carrega TODAS as acessíveis uma vez; a busca/filtro é client-side (sem re-buscar o banco).
  useEffect(() => { questoesAcessiveis().then(setDados).catch(() => setDados({ questoes: [], disciplinas: [], truncado: false })) }, [])

  const filtradas = useMemo(() => {
    if (!dados) return []
    const t = termo.trim().toLowerCase()
    return dados.questoes.filter((q) => (!disc || q.disciplinaId === disc) && (!t || q.enunciado.toLowerCase().includes(t)))
  }, [dados, termo, disc])
  const mostradas = filtradas.slice(0, MAX_MOSTRAR)

  const add = async (q: QuestaoDisponivel) => {
    setAddId(q.id)
    const r = await adicionarQuestao(simuladoId, q.id)
    setAddId(null)
    if (r.error) { toast.error(r.error); return }
    setLocais((prev) => new Set(prev).add(q.id))
    onAdicionar(q)
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onFechar}>
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-2xl border bg-card shadow-xl sm:max-h-[85vh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <h3 className="text-sm font-semibold">Adicionar questões {dados && <span className="font-normal text-muted-foreground">({dados.questoes.length} disponíveis)</span>}</h3>
          <button type="button" onClick={onFechar} className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
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
                  const ja = escolhidas.has(q.id) || locais.has(q.id)
                  return (
                    <li key={q.id} className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-foreground">{q.enunciado || '(sem enunciado)'}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {q.disciplina && <span className="rounded-full bg-muted px-2 py-0.5">{q.disciplina}</span>}
                          {q.ano && <span>{q.ano}</span>}
                        </div>
                      </div>
                      <button type="button" disabled={ja || addId === q.id} onClick={() => add(q)}
                        className={cn('inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                          ja ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60')}>
                        {ja ? <><Check className="h-3.5 w-3.5" /> Adicionada</> : addId === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="h-3.5 w-3.5" /> Adicionar</>}
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
        <div className="border-t p-3 text-right">
          <button type="button" onClick={onFechar} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">Concluir</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
