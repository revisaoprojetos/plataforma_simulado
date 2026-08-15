'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, X, Eye, Loader2, Flag, GraduationCap, Timer, Trophy, RotateCcw, Pencil, Lightbulb, Bookmark, ChevronDown, StickyNote, PanelRightClose, PanelRightOpen, ClipboardList, Bold, Italic, Underline, List, Baseline, Highlighter } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { MarkdownContent } from '@/components/markdown-content'
import type { SessaoPessoal, ModoPessoal, QuestaoRunner } from '@/app/aluno/(portal)/simulados/runner-actions'

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']
const MODO_INFO: Record<ModoPessoal, { nome: string; Icon: typeof GraduationCap }> = {
  estudo: { nome: 'Estudo', Icon: GraduationCap },
  prova: { nome: 'Prova', Icon: Timer },
  revisao: { nome: 'Revisão', Icon: Eye },
}

type Resultado = { nota: number; acertos: number; total: number }

/** Runner de um simulado personalizado, nos 3 modos: Estudo (feedback na hora), Prova
 *  (cronometrada, resultado no fim) e Revisão (ver gabarito sob demanda). */
export function PersonalizadoRunner({ sessao }: { sessao: SessaoPessoal }) {
  const router = useRouter()
  const { modo } = sessao
  const total = sessao.questoes.length

  const [idx, setIdx] = useState(0)
  const [respostas, setRespostas] = useState<Record<string, string>>(sessao.respostas)
  // Estudo: questões respondidas já nascem reveladas (retomada). Revisão: revela sob demanda.
  const [revelados, setRevelados] = useState<Set<string>>(
    () => new Set(modo === 'estudo' ? Object.keys(sessao.respostas) : []),
  )
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  // Questões marcadas "para revisar" (só client-side, ajudam a navegar; ficam âmbar no navegador).
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const toggleMarcar = (id: string) => setMarcadas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  // Barra lateral de ferramentas (desktop, docada à direita) + seções internas (anotações e comentário,
  // independentes, ambos podem ficar abertos). No mobile vira um card colapsável (ferrAberta).
  const [sidebarAberta, setSidebarAberta] = useState(false)
  const [ferrAberta, setFerrAberta] = useState(true)
  const [anotAberta, setAnotAberta] = useState(false)
  const [comentAberto, setComentAberto] = useState(false)
  const [anotacoes, setAnotacoes] = useState<Record<string, string>>({})

  const q = sessao.questoes[idx]
  const respondidas = useMemo(() => Object.keys(respostas).length, [respostas])
  const secaoPorQ = useMemo(() => secaoMap(sessao.secoes), [sessao.secoes])

  // ── Auto-save (reusa /api/sessoes/resposta, idempotente) ──────────────────
  const salvar = useCallback(async (questaoId: string, alternativaId: string) => {
    const post = () => fetch('/api/sessoes/resposta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessao_id: sessao.sessaoId, questao_id: questaoId, alternativa_id: alternativaId }),
    }).then((r) => r.ok).catch(() => false)
    let ok = await post()
    if (!ok) { await new Promise((r) => setTimeout(r, 600)); ok = await post() }
    if (!ok) toast.error('Não foi possível salvar a resposta. Verifique a conexão.')
  }, [sessao.sessaoId])

  const marcar = (questaoId: string, alternativaId: string) => {
    if (modo === 'estudo' && revelados.has(questaoId)) return // travado após revelar
    setRespostas((r) => ({ ...r, [questaoId]: alternativaId }))
    if (modo === 'estudo') setRevelados((s) => new Set(s).add(questaoId))
    void salvar(questaoId, alternativaId)
  }

  // ── Finalização (reusa /api/sessoes/finalizar — pula efeitos p/ simulado pessoal) ──
  const finalizarRef = useRef(false)
  const finalizar = useCallback(async () => {
    if (finalizarRef.current) return
    finalizarRef.current = true
    setEnviando(true)
    try {
      const res = await fetch('/api/sessoes/finalizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessao_id: sessao.sessaoId, respostas }),
      })
      const j = await res.json()
      if (!res.ok) { toast.error(j?.message ?? 'Não foi possível finalizar.'); finalizarRef.current = false; return }
      setResultado({ nota: Number(j.nota) || 0, acertos: Number(j.acertos) || 0, total: Number(j.total) || total })
    } catch {
      toast.error('Falha ao finalizar. Tente novamente.'); finalizarRef.current = false
    } finally { setEnviando(false) }
  }, [respostas, sessao.sessaoId, total])

  // ── Timer (modo Prova) ────────────────────────────────────────────────────
  const [restante, setRestante] = useState<number | null>(null)
  useEffect(() => {
    if (modo !== 'prova' || !sessao.tempoLimiteMin) return
    const fim = new Date(sessao.iniciadoEm).getTime() + sessao.tempoLimiteMin * 60_000
    const tick = () => {
      const s = Math.round((fim - Date.now()) / 1000)
      setRestante(s)
      if (s <= 0 && !finalizarRef.current) { toast.info('Tempo esgotado — finalizando.'); void finalizar() }
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [modo, sessao.tempoLimiteMin, sessao.iniciadoEm, finalizar])

  if (resultado) return <TelaResultado sessao={sessao} respostas={respostas} resultado={resultado} onRefazer={() => router.refresh()} />
  if (!q) return null

  const { Icon } = MODO_INFO[modo]
  const revelado = modo === 'estudo' ? revelados.has(q.id) : modo === 'revisao' ? revelados.has(q.id) : false
  const escolhida = respostas[q.id] ?? null
  const acertou = revelado && q.alternativas.find((a) => a.id === escolhida)?.correta === true

  // Navegador de questões (reusado no topo em mobile e na coluna à direita no desktop).
  const navBtns = sessao.questoes.map((qq, i) => {
    const feito = respostas[qq.id] != null
    const marcada = marcadas.has(qq.id)
    return (
      <button key={qq.id} type="button" onClick={() => setIdx(i)}
        className={cn('relative h-8 w-8 rounded-md border text-xs font-semibold tabular-nums transition-colors',
          i === idx ? 'border-primary bg-primary text-primary-foreground'
            : marcada ? 'border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400'
              : feito ? 'border-primary/30 bg-primary/15 text-primary'
                : 'text-muted-foreground hover:border-foreground/30')}>
        {i + 1}
        {marcada && i === idx && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-card" />}
      </button>
    )
  })

  // Seções de ferramentas: Anotações (editor rico) + Comentário (SEM revelar o gabarito).
  // preencher=true (barra do desktop): a área de Anotações cresce até o fim.
  // Abrir/fechar desliza via grid-template-rows 0fr↔1fr (anima nos dois sentidos, mantém o preenchimento).
  const renderFerramentas = (preencher: boolean) => (
    <div className={cn('flex flex-col gap-2', preencher && 'min-h-0 flex-1')}>
      {/* Anotações */}
      <div className={cn('flex flex-col overflow-hidden rounded-xl border', preencher && anotAberta && 'min-h-0 flex-1')}>
        <button type="button" onClick={() => setAnotAberta((v) => !v)} className="flex w-full shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/40">
          <StickyNote className="h-4 w-4 text-primary" /> Anotações
          <ChevronDown className={cn('ml-auto h-4 w-4 text-muted-foreground transition-transform', !anotAberta && '-rotate-90')} />
        </button>
        <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', anotAberta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]', preencher && anotAberta && 'min-h-0 flex-1')}>
          <div className={cn('overflow-hidden', preencher && anotAberta && 'flex min-h-0 flex-1 flex-col')}>
            <EditorAnotacao key={q.id} valor={anotacoes[q.id] ?? ''} fill={preencher}
              onChange={(html) => setAnotacoes((a) => ({ ...a, [q.id]: html }))} />
          </div>
        </div>
      </div>
      {/* Comentário do professor */}
      <div className="shrink-0 overflow-hidden rounded-xl border">
        <button type="button" onClick={() => setComentAberto((v) => !v)} className="flex w-full shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/40">
          <Lightbulb className="h-4 w-4 text-primary" /> Comentário do professor
          <ChevronDown className={cn('ml-auto h-4 w-4 text-muted-foreground transition-transform', !comentAberto && '-rotate-90')} />
        </button>
        <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', comentAberto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <div className="overflow-hidden">
            <div className="max-h-64 overflow-y-auto border-t p-3 text-sm">
              {q.comentario ? <MarkdownContent className="leading-relaxed text-foreground">{q.comentario}</MarkdownContent> : <span className="text-muted-foreground">Sem comentário para esta questão.</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // Card do navegador de questões (fita + grid + legenda) — usado na barra lateral.
  const navegadorCard = (
    <div className="overflow-hidden rounded-xl border">
      <div className="h-1.5 bg-gradient-to-r from-primary via-primary to-primary/30" />
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-foreground">Navegador de questões</p>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">{respondidas}/{total}</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">{navBtns}</div>
        <div className="border-t" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary" /> atual</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary/20 ring-1 ring-primary/40" /> respondida</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-500/15 ring-1 ring-amber-500/50" /> para revisar</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border" /> em branco</span>
        </div>
      </div>
    </div>
  )

  // BARRA LATERAL (desktop): trilho fixo (w-14) docado à direita; ao expandir, o painel abre como
  // OVERLAY POR CIMA do conteúdo (não empurra o simulado).
  const sidebar = (
    <aside className="relative hidden h-full w-14 shrink-0 border-l bg-card lg:block">
      {/* Trilho de ícones (sempre no fluxo) */}
      <div className="flex flex-col items-center gap-1 py-3">
        <button type="button" onClick={() => setSidebarAberta((v) => !v)} title={sidebarAberta ? 'Recolher barra' : 'Expandir barra'} className={cn('rounded-md p-2 transition-colors hover:bg-muted', sidebarAberta ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {sidebarAberta ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
        </button>
        <div className="my-1 h-px w-6 bg-border" />
        <button type="button" onClick={() => { setSidebarAberta(true); setAnotAberta(true) }} title="Anotações" className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><StickyNote className="h-5 w-5" /></button>
        <button type="button" onClick={() => { setSidebarAberta(true); setComentAberto(true) }} title="Comentário do professor" className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Lightbulb className="h-5 w-5" /></button>
      </div>
      {/* Painel expandido — OVERLAY por cima do conteúdo E do próprio trilho (a "fita" some) */}
      {sidebarAberta && (
        <div className="absolute right-0 top-0 z-30 flex h-full w-80 flex-col overflow-hidden border-l bg-card shadow-2xl duration-200 animate-in slide-in-from-right-4">
          <div className="flex shrink-0 items-center justify-between border-b p-3">
            <span className="text-xs font-semibold text-muted-foreground">Ferramentas</span>
            <button type="button" onClick={() => setSidebarAberta(false)} title="Recolher barra" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><PanelRightClose className="h-4 w-4" /></button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-3">{renderFerramentas(true)}</div>
        </div>
      )}
    </aside>
  )

  // Ferramentas (mobile) — card colapsável abaixo da questão (a barra lateral é só desktop).
  const ferramentasMobile = (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm lg:hidden">
      <button type="button" onClick={() => setFerrAberta((v) => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-muted/40">
        <span className="text-xs font-semibold text-foreground">Ferramentas</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', !ferrAberta && '-rotate-90')} />
      </button>
      {ferrAberta && <div className="border-t p-3">{renderFerramentas(false)}</div>}
    </div>
  )

  return (
    // Tela cheia imersiva (como o simulado real): cobre o portal, sem barra lateral nem gutters brancos.
    // --primary := --brand-primary (roxo NOVO/mais forte do sistema, vinculado à personalização):
    // assim todos os bg-primary/text-primary do simulado usam a cor da marca atualizada.
    <div className="fixed inset-0 z-50 flex flex-col bg-muted dark:bg-background" style={{ ['--primary' as any]: 'var(--brand-primary)' }}>
      {/* Header: [esquerda: sair/modo] · [centro: título + criado] · [direita: timer + finalizar] */}
      <header className="flex items-center gap-2 border-b bg-card px-3 py-2.5 sm:px-5">
        <div className="flex flex-1 items-center gap-2">
          <button type="button" onClick={() => router.push(`/aluno/simulados/personalizados/${sessao.simuladoId}`)}
            className="shrink-0 rounded-lg border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Sair"><ArrowLeft className="h-4 w-4" /></button>
          <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex"><Icon className="h-5 w-5" /></span>
        </div>
        <div className="flex min-w-0 flex-col items-center px-1 text-center">
          <span className="max-w-[42vw] truncate text-sm font-semibold leading-tight sm:max-w-[26rem]">{sessao.titulo}</span>
          <span className="max-w-[42vw] truncate text-xs text-muted-foreground">Criado: {sessao.estudanteNome}</span>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2">
          {restante != null && (
            <span className={cn('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums',
              restante <= 60 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground')}>
              <Timer className={cn('h-4 w-4', restante <= 60 && 'animate-pulse')} /> {formatarSeg(Math.max(0, restante))}
            </span>
          )}
          {/* Finalizar sempre visível, à direita do timer */}
          <button type="button" onClick={finalizar} disabled={enviando}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 hover:shadow-md disabled:opacity-60">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />} <span className="hidden sm:inline">Finalizar</span>
          </button>
        </div>
      </header>
      {/* Progresso — barra fina full-width sob o header */}
      <div className="h-1 w-full bg-muted">
        <div className="h-full bg-primary transition-all duration-300 ease-out" style={{ width: `${Math.round(((idx + 1) / total) * 100)}%` }} />
      </div>

      {/* Conteúdo (rolagem própria) + BARRA LATERAL de ferramentas docada à direita no desktop */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto grid w-full max-w-5xl gap-4 px-3 py-4 sm:px-4 sm:py-5 lg:grid-cols-[1fr_13rem] lg:gap-8">
            <div className="flex min-w-0 flex-col gap-4">
            {/* Navegador (mobile/tablet) */}
            <div className="lg:hidden">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Navegador de questões</p>
              <div className="flex flex-wrap gap-1.5">{navBtns}</div>
            </div>

      {/* Questão — card com fita colorida, badge do número e pills */}
      <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-primary to-primary/30" />
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 pb-2.5 pt-4 sm:px-5">
          <span className="flex h-6 items-center rounded-lg bg-primary px-2 text-xs font-bold tabular-nums text-primary-foreground">{idx + 1} / {total}</span>
          {secaoPorQ.get(q.id) && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{secaoPorQ.get(q.id)}</span>}
          {q.disciplina && <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary/90">{q.disciplina}</span>}
          {q.origemSimulado && (
            <span className="inline-flex max-w-[15rem] items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground" title={q.origemSimulado}>
              <ClipboardList className="h-3 w-3 shrink-0" />
              <span className="truncate">{q.origemSimulado}</span>
              {q.origemNumero != null && <span className="shrink-0">· Q{q.origemNumero}</span>}
            </span>
          )}
        </div>
        <div className="p-4 sm:p-6">
          {q.imagemUrl && <img src={q.imagemUrl} alt="" className="mb-4 max-h-72 w-auto rounded-lg border" />}
          <MarkdownContent className="text-[15px] leading-relaxed text-foreground sm:text-base">{q.enunciado || '(sem enunciado)'}</MarkdownContent>
        </div>
      </div>

      {/* Alternativas — cards individuais com bolinha da letra */}
      <div className="space-y-2.5">
        {q.alternativas.map((alt, i) => {
          const sel = escolhida === alt.id
          const mostrarCerta = revelado && alt.correta
          const mostrarErrada = revelado && sel && !alt.correta
          const travado = revelado && modo === 'estudo'
          return (
            <button key={alt.id} type="button" onClick={() => marcar(q.id, alt.id)} disabled={travado}
              className={cn('group flex w-full items-center gap-3 rounded-xl border bg-card p-3.5 text-left text-sm shadow-sm transition-all sm:p-4',
                mostrarCerta ? 'border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/40'
                  : mostrarErrada ? 'border-destructive bg-destructive/5 ring-1 ring-destructive/40'
                    : sel ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                      : 'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
                travado && 'cursor-default hover:translate-y-0 hover:shadow-sm')}>
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors',
                mostrarCerta ? 'border-emerald-500 bg-emerald-500 text-white'
                  : mostrarErrada ? 'border-destructive bg-destructive text-white'
                    : sel ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/30 text-muted-foreground group-hover:border-primary/50 group-hover:text-primary')}>
                {mostrarCerta ? <Check className="h-4 w-4" /> : mostrarErrada ? <X className="h-4 w-4" /> : LETRA[i]}
              </span>
              <MarkdownContent inline className="min-w-0 flex-1 leading-relaxed">{alt.texto}</MarkdownContent>
            </button>
          )
        })}
      </div>

      {/* Feedback (Estudo/Revisão revelados) */}
      {revelado && escolhida && (
        <div className={cn('flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold',
          acertou ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-destructive/30 bg-destructive/10 text-destructive')}>
          {acertou ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />} {acertou ? 'Você acertou!' : 'Resposta incorreta.'}
        </div>
      )}
      {revelado && q.comentario && (
        <div className="rounded-xl border bg-card p-4 text-sm shadow-sm">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary"><Lightbulb className="h-3.5 w-3.5" /> Comentário do professor</p>
          <MarkdownContent className="leading-relaxed text-foreground">{q.comentario}</MarkdownContent>
        </div>
      )}

      {/* Ferramentas (mobile) — no desktop viram a barra lateral */}
      {ferramentasMobile}

      {/* Navegação / ações */}
      <div className="flex items-center justify-between gap-2 pb-2">
        <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}
          className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted disabled:opacity-40">
          <ArrowLeft className="h-4 w-4" /> Anterior
        </button>

        <div className="flex items-center gap-2">
          {modo === 'revisao' && !revelados.has(q.id) && (
            <button type="button" onClick={() => setRevelados((s) => new Set(s).add(q.id))}
              className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted">
              <Eye className="h-4 w-4" /> Ver gabarito
            </button>
          )}
          {/* Revisar — à esquerda do Próxima/Finalizar */}
          <button type="button" onClick={() => toggleMarcar(q.id)} title={marcadas.has(q.id) ? 'Desmarcar revisão' : 'Marcar para revisar'}
            className={cn('inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors',
              marcadas.has(q.id) ? 'border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-card hover:bg-muted')}>
            <Bookmark className={cn('h-4 w-4', marcadas.has(q.id) && 'fill-current')} /> Revisar
          </button>
          {idx < total - 1 ? (
            <button type="button" onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 hover:shadow-md">
              Próxima <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={finalizar} disabled={enviando}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 hover:shadow-md disabled:opacity-60">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />} Finalizar
            </button>
          )}
        </div>
      </div>

      {/* Atalho para finalizar antes do fim (respondeu tudo) */}
      {idx < total - 1 && respondidas === total && (
        <button type="button" onClick={finalizar} disabled={enviando}
          className="mx-auto -mt-1 inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary shadow-sm hover:bg-primary/10 disabled:opacity-60">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />} Finalizar agora ({respondidas}/{total})
        </button>
      )}
          </div>

          {/* Navegador de questões — coluna direita do conteúdo (no lugar original) */}
          <aside className="hidden lg:block">
            <div className="sticky top-4">{navegadorCard}</div>
          </aside>
        </div>
        </div>
        {/* Barra lateral de ferramentas docada (desktop) */}
        {sidebar}
      </div>
    </div>
  )
}

const CORES_TEXTO = ['#111827', '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280']
const CORES_MARCA = ['#fef08a', '#fde68a', '#fed7aa', '#fecaca', '#bbf7d0', '#a7f3d0', '#99f6e4', '#a5f3fc', '#bfdbfe', '#c7d2fe', '#ddd6fe', '#f5d0fe', '#fbcfe8', '#e5e7eb']

/** Editor de anotações "estilo Word" (contenteditable + execCommand): negrito, itálico, sublinhado,
 *  marcadores, cor do texto e marca-texto. Remonta por questão (key) e salva o HTML em onChange. */
function EditorAnotacao({ valor, onChange, fill }: { valor: string; onChange: (html: string) => void; fill?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [paleta, setPaleta] = useState<'texto' | 'marca' | null>(null)
  useEffect(() => { if (ref.current) ref.current.innerHTML = valor || '' }, []) // conteúdo inicial (remonta por questão via key) // eslint-disable-line react-hooks/exhaustive-deps
  const exec = (c: string, v?: string) => {
    ref.current?.focus()
    try { document.execCommand('styleWithCSS', false, 'true') } catch { /* ok */ }
    document.execCommand(c, false, v)
    onChange(ref.current?.innerHTML ?? '')
    setPaleta(null)
  }
  return (
    <div className={cn('flex flex-col overflow-hidden border-t', fill && 'min-h-0 flex-1')}>
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-1 py-1">
        <BtnFmt title="Negrito" onClick={() => exec('bold')}><Bold className="h-3.5 w-3.5" /></BtnFmt>
        <BtnFmt title="Itálico" onClick={() => exec('italic')}><Italic className="h-3.5 w-3.5" /></BtnFmt>
        <BtnFmt title="Sublinhado" onClick={() => exec('underline')}><Underline className="h-3.5 w-3.5" /></BtnFmt>
        <BtnFmt title="Marcadores" onClick={() => exec('insertUnorderedList')}><List className="h-3.5 w-3.5" /></BtnFmt>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <div className="relative">
          <BtnFmt title="Cor do texto" ativo={paleta === 'texto'} onClick={() => setPaleta((p) => (p === 'texto' ? null : 'texto'))}><Baseline className="h-3.5 w-3.5" /></BtnFmt>
          {paleta === 'texto' && <Paleta cores={CORES_TEXTO} onPick={(c) => exec('foreColor', c)} />}
        </div>
        <div className="relative">
          <BtnFmt title="Marca-texto" ativo={paleta === 'marca'} onClick={() => setPaleta((p) => (p === 'marca' ? null : 'marca'))}><Highlighter className="h-3.5 w-3.5" /></BtnFmt>
          {paleta === 'marca' && <Paleta cores={CORES_MARCA} onLimpar={() => exec('hiliteColor', 'transparent')} onPick={(c) => exec('hiliteColor', c)} />}
        </div>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true"
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        data-placeholder="Escreva suas anotações sobre esta questão…"
        className={cn('w-full overflow-y-auto p-3 text-sm leading-relaxed outline-none [&_ul]:list-disc [&_ul]:pl-5', fill ? 'min-h-0 flex-1' : 'min-h-[7rem] max-h-72')} />
    </div>
  )
}

function BtnFmt({ children, onClick, title, ativo }: { children: ReactNode; onClick: () => void; title: string; ativo?: boolean }) {
  return <button type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
    className={cn('rounded p-1.5 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
      ativo ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>{children}</button>
}

/** Paleta de cores em grade, ancorada à DIREITA (cresce para a esquerda, sem vazar o painel). */
function Paleta({ cores, onPick, onLimpar }: { cores: string[]; onPick: (c: string) => void; onLimpar?: () => void }) {
  return (
    <div className="absolute right-0 top-full z-20 mt-1 grid w-max grid-cols-7 gap-1 rounded-lg border bg-card p-1.5 shadow-lg">
      {cores.map((c) => <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(c)} title={c} className="h-5 w-5 rounded ring-1 ring-black/10 transition-transform hover:scale-110" style={{ background: c }} />)}
      {onLimpar && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onLimpar} title="Sem marcação" className="flex h-5 w-5 items-center justify-center rounded border text-muted-foreground hover:bg-muted"><X className="h-3 w-3" /></button>}
    </div>
  )
}

/** Mapa questão→nome da seção (para chips/divisórias). */
function secaoMap(secoes: SessaoPessoal['secoes']): Map<string, string> {
  const m = new Map<string, string>()
  for (const s of secoes ?? []) for (const id of s.questaoIds) m.set(id, s.nome)
  return m
}

function formatarSeg(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  const mm = String(m).padStart(2, '0'), sss = String(ss).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${sss}` : `${mm}:${sss}`
}

/** Tela de resultado + revisão do gabarito questão a questão. */
function TelaResultado({ sessao, respostas, resultado, onRefazer }: {
  sessao: SessaoPessoal; respostas: Record<string, string>; resultado: Resultado; onRefazer: () => void
}) {
  const router = useRouter()
  const pct = resultado.total > 0 ? Math.round((resultado.acertos / resultado.total) * 100) : 0
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-muted dark:bg-background" style={{ ['--primary' as any]: 'var(--brand-primary)' }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-3 py-5 sm:px-4">
      <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"><Trophy className="h-7 w-7" /></div>
        <h1 className="text-lg font-bold tracking-tight">Simulado concluído</h1>
        <p className="mt-1 text-sm text-muted-foreground">{sessao.titulo}</p>
        <div className="mt-4 flex items-center justify-center gap-6">
          <div><div className="text-3xl font-bold text-foreground">{resultado.acertos}<span className="text-lg text-muted-foreground">/{resultado.total}</span></div><div className="text-xs text-muted-foreground">acertos</div></div>
          <div className="h-10 w-px bg-border" />
          <div><div className="text-3xl font-bold text-primary">{pct}%</div><div className="text-xs text-muted-foreground">aproveitamento</div></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={onRefazer} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"><RotateCcw className="h-4 w-4" /> Refazer</button>
          <button type="button" onClick={() => router.push(`/aluno/simulados/personalizados/${sessao.simuladoId}`)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"><Pencil className="h-4 w-4" /> Editar</button>
          <button type="button" onClick={() => router.push('/aluno/simulados')} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Voltar aos simulados</button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Gabarito</h2>
        {(() => {
          const sec = secaoMap(sessao.secoes); let anterior = ''
          return sessao.questoes.map((q, i) => {
            const nome = sec.get(q.id) ?? ''
            const divisor = nome && nome !== anterior
            anterior = nome
            return (
              <Fragment key={q.id}>
                {divisor && <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{nome}</p>}
                <RevisaoItem q={q} numero={i + 1} escolhida={respostas[q.id] ?? null} />
              </Fragment>
            )
          })
        })()}
      </div>
      </div>
    </div>
  )
}

function RevisaoItem({ q, numero, escolhida }: { q: QuestaoRunner; numero: number; escolhida: string | null }) {
  const [aberto, setAberto] = useState(false)
  const idxCerta = q.alternativas.findIndex((a) => a.correta)
  const idxSua = q.alternativas.findIndex((a) => a.id === escolhida)
  const acertou = idxSua >= 0 && idxSua === idxCerta
  const emBranco = idxSua < 0
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-3 p-3 text-left">
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white',
          emBranco ? 'bg-muted-foreground/60' : acertou ? 'bg-emerald-500' : 'bg-destructive')}>{numero}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{limparTexto(q.enunciado)}</span>
        <span className="shrink-0 text-xs font-medium">
          {emBranco ? <span className="text-muted-foreground">em branco</span>
            : <>Sua: <b className={acertou ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>{LETRA[idxSua]}</b> · Certa: <b className="text-emerald-600 dark:text-emerald-400">{LETRA[idxCerta]}</b></>}
        </span>
      </button>
      {aberto && (
        <div className="border-t p-3 text-sm">
          <MarkdownContent className="leading-relaxed">{q.enunciado}</MarkdownContent>
          <div className="mt-3 space-y-1.5">
            {q.alternativas.map((alt, i) => (
              <div key={alt.id} className={cn('flex items-start gap-2 rounded-lg border p-2',
                alt.correta ? 'border-emerald-500 bg-emerald-500/10' : alt.id === escolhida ? 'border-destructive bg-destructive/10' : 'border-transparent')}>
                <span className="text-xs font-bold text-muted-foreground">{LETRA[i]}</span>
                <MarkdownContent inline className="min-w-0 flex-1">{alt.texto}</MarkdownContent>
              </div>
            ))}
          </div>
          {q.comentario && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comentário</p>
              <MarkdownContent className="leading-relaxed">{q.comentario}</MarkdownContent>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function limparTexto(s: string): string {
  return (s ?? '').replace(/<[^>]+>/g, ' ').replace(/[*_`#>[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
}
