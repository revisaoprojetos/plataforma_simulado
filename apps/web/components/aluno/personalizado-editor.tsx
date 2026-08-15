'use client'

import { useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Loader2, Play, X, GripVertical, ChevronUp, ChevronDown, FolderPlus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { SeletorQuestoes } from '@/components/aluno/seletor-questoes'
import { adicionarQuestoes, removerQuestao, renomearMeuSimulado, salvarLayout, type QuestaoEscolhida, type Secao } from '@/app/aluno/(portal)/simulados/builder-actions'

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `s_${Math.random().toString(36).slice(2)}_${Date.now()}`)
const ORFA = '__sem_secao__' // chave do grupo "Sem seção"

/** Editor de um simulado personalizado: nome + seções (fileiras) + questões (reordenar/mover/remover). */
export function PersonalizadoEditor({ simuladoId, titulo: tituloIni, itensIniciais, secoesIniciais }: {
  simuladoId: string; titulo: string; itensIniciais: QuestaoEscolhida[]; secoesIniciais: Secao[]
}) {
  const router = useRouter()
  const [titulo, setTitulo] = useState(tituloIni)
  const [modal, setModal] = useState(false)
  const [salvandoNome, startSalvar] = useTransition()
  const [salvando, startLayout] = useTransition()
  const [drag, setDrag] = useState<{ grupo: string; idx: number } | null>(null)
  const [over, setOver] = useState<{ grupo: string; idx: number } | null>(null)

  // Enunciados (id → texto) e o layout (seções + soltas).
  const [enun, setEnun] = useState<Map<string, string>>(() => new Map(itensIniciais.map((i) => [i.questaoId, i.enunciado])))
  const [secoes, setSecoes] = useState<Secao[]>(secoesIniciais)
  const [orfas, setOrfas] = useState<string[]>(() => {
    const refs = new Set(secoesIniciais.flatMap((s) => s.questaoIds))
    return itensIniciais.map((i) => i.questaoId).filter((id) => !refs.has(id))
  })

  const totalQ = useMemo(() => secoes.reduce((n, s) => n + s.questaoIds.length, 0) + orfas.length, [secoes, orfas])
  const escolhidas = useMemo(() => new Set([...secoes.flatMap((s) => s.questaoIds), ...orfas]), [secoes, orfas])

  const salvarNome = () => {
    if (titulo.trim() === tituloIni.trim()) return
    startSalvar(async () => { const r = await renomearMeuSimulado(simuladoId, titulo); if (r.error) toast.error(r.error) })
  }

  // Persiste o layout inteiro (ordem achatada + seções). Fonte única no cliente.
  const persistir = (novasSecoes: Secao[], novasOrfas: string[]) => {
    setSecoes(novasSecoes); setOrfas(novasOrfas)
    const ordem = [...novasSecoes.flatMap((s) => s.questaoIds), ...novasOrfas]
    startLayout(async () => { const r = await salvarLayout(simuladoId, ordem, novasSecoes); if (r.error) toast.error(r.error) })
  }

  // ── Operações de seção ──────────────────────────────────────────────────────
  const addSecao = () => persistir([...secoes, { id: uid(), nome: `Seção ${secoes.length + 1}`, questaoIds: [] }], orfas)
  const renomear = (id: string, nome: string) => persistir(secoes.map((s) => (s.id === id ? { ...s, nome } : s)), orfas)
  const excluirSecao = (id: string) => {
    const sec = secoes.find((s) => s.id === id)
    if (!sec) return
    persistir(secoes.filter((s) => s.id !== id), [...orfas, ...sec.questaoIds]) // questões viram "sem seção"
  }

  // ── Operações de questão ────────────────────────────────────────────────────
  const listaDo = (grupo: string) => (grupo === ORFA ? orfas : secoes.find((s) => s.id === grupo)?.questaoIds ?? [])
  const setListaDo = (grupo: string, lista: string[], base?: { secoes: Secao[]; orfas: string[] }) => {
    const S = base?.secoes ?? secoes, O = base?.orfas ?? orfas
    if (grupo === ORFA) return { secoes: S, orfas: lista }
    return { secoes: S.map((s) => (s.id === grupo ? { ...s, questaoIds: lista } : s)), orfas: O }
  }

  const mover = (grupo: string, from: number, to: number) => {
    const lista = [...listaDo(grupo)]
    if (from === to || to < 0 || to >= lista.length) return
    const [it] = lista.splice(from, 1); lista.splice(to, 0, it)
    const r = setListaDo(grupo, lista); persistir(r.secoes, r.orfas)
  }

  const moverParaSecao = (qid: string, destino: string) => {
    // remove de onde está
    let S = secoes.map((s) => ({ ...s, questaoIds: s.questaoIds.filter((x) => x !== qid) }))
    let O = orfas.filter((x) => x !== qid)
    // adiciona ao fim do destino
    if (destino === ORFA) O = [...O, qid]
    else S = S.map((s) => (s.id === destino ? { ...s, questaoIds: [...s.questaoIds, qid] } : s))
    persistir(S, O)
  }

  const remover = async (qid: string) => {
    const S = secoes.map((s) => ({ ...s, questaoIds: s.questaoIds.filter((x) => x !== qid) }))
    const O = orfas.filter((x) => x !== qid)
    persistir(S, O)
    const r = await removerQuestao(simuladoId, qid)
    if (r.error) toast.error(r.error)
  }

  const grupoDe = (qid: string) => secoes.find((s) => s.questaoIds.includes(qid))?.id ?? ORFA

  // Numeração global (bate com o runner, que ordena pela lista achatada).
  const numeroGlobal = useMemo(() => {
    const m = new Map<string, number>(); let n = 0
    for (const s of secoes) for (const id of s.questaoIds) m.set(id, ++n)
    for (const id of orfas) m.set(id, ++n)
    return m
  }, [secoes, orfas])

  const temSecoes = secoes.length > 0

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 sm:gap-3">
        <Link href="/aluno/simulados" className="shrink-0 rounded-lg border p-2 text-muted-foreground transition-colors hover:text-foreground" aria-label="Voltar para Meus simulados"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="relative min-w-0 flex-1">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} onBlur={salvarNome} maxLength={120}
            className="w-full rounded-lg border bg-transparent px-3 py-2 text-lg font-bold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Nome do simulado" />
          {salvandoNome && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <button type="button" onClick={() => router.push(`/aluno/simulados/personalizados/${simuladoId}/fazer`)}
          disabled={totalQ === 0} title={totalQ === 0 ? 'Adicione questões para fazer' : 'Fazer o simulado'}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
          <Play className="h-4 w-4" /> <span className="hidden sm:inline">Fazer</span>
        </button>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            Questões ({totalQ})
            {salvando && <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> salvando</span>}
          </h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={addSecao}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted">
              <FolderPlus className="h-4 w-4" /> Nova seção
            </button>
            <button type="button" onClick={() => setModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
              <Plus className="h-4 w-4" /> Adicionar questões
            </button>
          </div>
        </div>

        {totalQ === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma questão ainda. Clique em <span className="font-medium text-foreground">Adicionar questões</span> para montar seu simulado.
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">Arraste pela alça ou use as setas para reordenar{temSecoes ? ' dentro da seção; use o seletor para mover entre seções.' : '.'}</p>

            {/* Seções */}
            {secoes.map((s) => (
              <div key={s.id} className="space-y-2 rounded-2xl border bg-muted/20 p-3">
                <div className="flex items-center gap-2">
                  <input value={s.nome} onChange={(e) => setSecoes((prev) => prev.map((x) => (x.id === s.id ? { ...x, nome: e.target.value } : x)))} onBlur={(e) => renomear(s.id, e.target.value.trim() || 'Seção')} maxLength={80}
                    className="min-w-0 flex-1 rounded-lg border bg-card px-2.5 py-1.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Nome da seção" />
                  <span className="shrink-0 text-xs text-muted-foreground">{s.questaoIds.length}</span>
                  <button type="button" onClick={() => excluirSecao(s.id)} title="Excluir seção (as questões vão para 'Sem seção')"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
                {s.questaoIds.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">Seção vazia — mova questões para cá pelo seletor “Seção”.</p>
                ) : (
                  <ol className="space-y-2">{s.questaoIds.map((qid, i) => renderItem(s.id, qid, i, s.questaoIds.length))}</ol>
                )}
              </div>
            ))}

            {/* Sem seção (soltas) — com título só quando existem seções */}
            {orfas.length > 0 && (
              <div className={cn(temSecoes && 'space-y-2 rounded-2xl border border-dashed p-3')}>
                {temSecoes && <p className="text-xs font-medium text-muted-foreground">Sem seção</p>}
                <ol className="space-y-2">{orfas.map((qid, i) => renderItem(ORFA, qid, i, orfas.length))}</ol>
              </div>
            )}
          </>
        )}
      </section>

      {modal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setModal(false)}>
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border bg-card shadow-xl sm:max-h-[85vh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <h3 className="text-sm font-semibold">Adicionar questões</h3>
              <button type="button" onClick={() => setModal(false)} className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            <SeletorQuestoes jaEscolhidas={escolhidas} onCancelar={() => setModal(false)} onConcluir={async (qs) => {
              const r = await adicionarQuestoes(simuladoId, qs.map((q) => q.id))
              if (r.error) { toast.error(r.error); return }
              // novas questões entram como "sem seção" e são persistidas no layout
              const novos = qs.filter((q) => !escolhidas.has(q.id))
              setEnun((prev) => { const m = new Map(prev); for (const q of novos) m.set(q.id, q.enunciado); return m })
              persistir(secoes, [...orfas, ...novos.map((q) => q.id)])
              toast.success(`${r.adicionadas ?? 0} ${(r.adicionadas ?? 0) === 1 ? 'questão adicionada' : 'questões adicionadas'}.`)
              setModal(false)
            }} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  )

  // Renderiza um item de questão dentro de um grupo (seção ou soltas).
  function renderItem(grupo: string, qid: string, i: number, tam: number) {
    const arrastando = drag?.grupo === grupo && drag.idx === i
    const alvo = over?.grupo === grupo && over.idx === i && !arrastando
    return (
      <li key={qid}
        draggable
        onDragStart={() => setDrag({ grupo, idx: i })}
        onDragOver={(e) => { if (drag?.grupo === grupo) { e.preventDefault(); setOver({ grupo, idx: i }) } }}
        onDrop={(e) => { if (drag?.grupo === grupo) { e.preventDefault(); mover(grupo, drag.idx, i); setDrag(null); setOver(null) } }}
        onDragEnd={() => { setDrag(null); setOver(null) }}
        className={cn('flex items-start gap-2 rounded-xl border bg-card p-3 text-sm shadow-sm transition-colors sm:gap-3',
          arrastando && 'opacity-50', alvo && 'border-primary ring-1 ring-primary')}>
        <span className="mt-0.5 flex shrink-0 items-center gap-0.5">
          <span className="hidden cursor-grab text-muted-foreground/50 active:cursor-grabbing sm:inline" title="Arraste para reordenar"><GripVertical className="h-4 w-4" /></span>
          <span className="flex flex-col">
            <button type="button" onClick={() => mover(grupo, i, i - 1)} disabled={i === 0} title="Subir" className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
            <button type="button" onClick={() => mover(grupo, i, i + 1)} disabled={i === tam - 1} title="Descer" className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
          </span>
        </span>
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">{numeroGlobal.get(qid) ?? i + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-foreground">{enun.get(qid) || '(sem enunciado)'}</p>
          {temSecoes && (
            <label className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              Seção:
              <select value={grupoDe(qid)} onChange={(e) => moverParaSecao(qid, e.target.value)}
                className="max-w-[10rem] truncate rounded-md border bg-card px-1.5 py-0.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {secoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                <option value={ORFA}>Sem seção</option>
              </select>
            </label>
          )}
        </div>
        <button type="button" onClick={() => remover(qid)} title="Remover" className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
      </li>
    )
  }
}
