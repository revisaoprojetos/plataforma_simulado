'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, X, Eye, EyeOff, Loader2, Flag, GraduationCap, Timer, Lightbulb, Bookmark, ChevronDown, StickyNote, PanelRightClose, PanelRightOpen, FileText, Scissors, Bold, Italic, Underline, List, Baseline, Highlighter, Download, Maximize2, AlertCircle, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { MarkdownContent } from '@/components/markdown-content'
import { PersonalizadoResultado } from '@/components/aluno/personalizado-resultado'
import type { SessaoPessoal, ModoPessoal } from '@/app/aluno/(portal)/simulados/runner-actions'

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']
const MODO_INFO: Record<ModoPessoal, { nome: string; Icon: typeof GraduationCap }> = {
  estudo: { nome: 'Estudo', Icon: GraduationCap },
  prova: { nome: 'Prova', Icon: Timer },
  revisao: { nome: 'Revisão', Icon: Eye },
}

type Resultado = { nota: number; acertos: number; total: number }

/** Runner de um simulado personalizado, nos 3 modos: Estudo (feedback na hora), Prova
 *  (cronometrada, resultado no fim) e Revisão (ver gabarito sob demanda). */
export function PersonalizadoRunner({ sessao, onSair }: { sessao: SessaoPessoal; onSair?: () => void }) {
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
  // Tesoura: alternativas "eliminadas" (riscadas) por questão — só ajuda visual, client-side.
  const [eliminadas, setEliminadas] = useState<Set<string>>(new Set())
  const eliminar = (id: string) => setEliminadas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const [mostrarTempo, setMostrarTempo] = useState(true) // ocultar/mostrar o temporizador

  // Baixar TODAS as anotações feitas (todas as questões) como .txt.
  const baixarAnotacoes = () => {
    const strip = (html: string) => { const d = document.createElement('div'); d.innerHTML = html || ''; return (d.textContent || '').replace(/ /g, ' ').trim() }
    const blocos: string[] = []
    sessao.questoes.forEach((qq, i) => {
      const txt = strip(anotacoes[qq.id] ?? '')
      if (!txt) return
      const orig = qq.origemSimulado ? ` — ${qq.origemNumero ? `Q${qq.origemNumero} ` : ''}${qq.origemSimulado}` : ''
      blocos.push(`Questão ${i + 1}${orig}\n${txt}`)
    })
    if (!blocos.length) { toast.info('Você ainda não fez anotações.'); return }
    const conteudo = `Anotações — ${sessao.titulo}\n${'='.repeat(40)}\n\n` + blocos.join(`\n\n${'─'.repeat(30)}\n\n`) + '\n'
    const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `anotacoes-${(sessao.titulo || 'simulado').replace(/[^\w-]+/g, '_').slice(0, 40)}.txt`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }
  // Barra lateral de ferramentas (desktop, docada à direita) + seções internas (anotações e comentário,
  // independentes, ambos podem ficar abertos). No mobile vira um card colapsável (ferrAberta).
  const [sidebarAberta, setSidebarAberta] = useState(false)
  const [ferrAberta, setFerrAberta] = useState(true)
  const [anotAberta, setAnotAberta] = useState(false)
  const [comentAberto, setComentAberto] = useState(false)
  const [anotacoes, setAnotacoes] = useState<Record<string, string>>({})
  // Expandir um bloco em modal grande. expandKey remonta o editor inline ao fechar (sincroniza o conteúdo).
  const [expandido, setExpandido] = useState<'anot' | 'coment' | null>(null)
  const [expandKey, setExpandKey] = useState(0)
  const fecharExpandido = () => { setExpandido(null); setExpandKey((k) => k + 1) }

  const q = sessao.questoes[idx]
  // Questão anulada (bloqueada) não é respondível → conta como "concluída" p/ o progresso.
  const respondidas = useMemo(() => sessao.questoes.filter((qq) => qq.bloqueada || respostas[qq.id] != null).length, [respostas, sessao.questoes])
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
    if (sessao.questoes.find((x) => x.id === questaoId)?.bloqueada) return // anulada: marcação travada
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

  // Resultado: REUSA a tela oficial (RevisaoFinal) via o overlay compartilhado — o MESMO usado pela
  // rota /personalizados/[id]/resultado (acesso pelo card). Fundo opaco + fita roxa + caminhos do topo.
  if (resultado) return <PersonalizadoResultado sessaoId={sessao.sessaoId} simuladoId={sessao.simuladoId} />
  if (!q) return null

  const { Icon } = MODO_INFO[modo]
  const bloqueada = q.bloqueada === true // questão anulada: marcação travada, ponto garantido a todos
  const revelado = !bloqueada && (modo === 'estudo' ? revelados.has(q.id) : modo === 'revisao' ? revelados.has(q.id) : false)
  const escolhida = respostas[q.id] ?? null
  const acertou = revelado && q.alternativas.find((a) => a.id === escolhida)?.correta === true

  // Navegador de questões (reusado no topo em mobile e na coluna à direita no desktop).
  const navBtns = sessao.questoes.map((qq, i) => {
    const feito = respostas[qq.id] != null
    const marcada = marcadas.has(qq.id)
    return (
      <button key={qq.id} type="button" onClick={() => setIdx(i)} title={qq.bloqueada ? `Questão ${i + 1} — anulada` : `Questão ${i + 1}`}
        className={cn('relative flex h-8 w-8 items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition-colors',
          i === idx ? 'border-primary bg-primary text-primary-foreground'
            : qq.bloqueada ? 'border-border bg-muted text-muted-foreground'
              : marcada ? 'border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400'
                : feito ? 'border-primary/30 bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:border-foreground/30')}>
        {qq.bloqueada ? <Ban className="h-3.5 w-3.5" /> : i + 1}
        {marcada && i === idx && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-card" />}
      </button>
    )
  })

  // Seções de ferramentas: Anotações (editor rico) + Comentário (SEM revelar o gabarito).
  // Abrir/fechar desliza via grid-template-rows 0fr↔1fr + fade (anima nos dois sentidos; sem flex-1,
  // que fazia o bloco abrir de uma vez). No desktop o editor é alto (min-h-[58vh]) para preencher.
  const renderFerramentas = (preencher: boolean) => (
    <div className="flex flex-col gap-2">
      {/* Anotações */}
      <div className="flex flex-col overflow-hidden rounded-xl border">
        <div className="flex shrink-0 items-center pr-1.5">
          <button type="button" onClick={() => setAnotAberta((v) => !v)} className="flex flex-1 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/40">
            <StickyNote className="h-4 w-4 text-primary" /> Anotações
          </button>
          <button type="button" onClick={() => setExpandido('anot')} title="Expandir" aria-label="Expandir anotações" className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Maximize2 className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setAnotAberta((v) => !v)} title={anotAberta ? 'Recolher' : 'Abrir'} className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronDown className={cn('h-4 w-4 transition-transform', !anotAberta && '-rotate-90')} /></button>
        </div>
        <div className={cn('grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]', anotAberta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <div className={cn('overflow-hidden transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]', anotAberta ? 'opacity-100' : 'opacity-0')}>
            <EditorAnotacao key={`${q.id}-${expandKey}`} valor={anotacoes[q.id] ?? ''} fill={preencher} onBaixar={baixarAnotacoes}
              onChange={(html) => setAnotacoes((a) => ({ ...a, [q.id]: html }))} />
          </div>
        </div>
      </div>
      {/* Comentário do professor */}
      <div className="shrink-0 overflow-hidden rounded-xl border">
        <div className="flex shrink-0 items-center pr-1.5">
          <button type="button" onClick={() => setComentAberto((v) => !v)} className="flex flex-1 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/40">
            <Lightbulb className="h-4 w-4 text-primary" /> Comentário do professor
          </button>
          <button type="button" onClick={() => setExpandido('coment')} title="Expandir" aria-label="Expandir comentário" className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Maximize2 className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setComentAberto((v) => !v)} title={comentAberto ? 'Recolher' : 'Abrir'} className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronDown className={cn('h-4 w-4 transition-transform', !comentAberto && '-rotate-90')} /></button>
        </div>
        <div className={cn('grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]', comentAberto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <div className={cn('overflow-hidden transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]', comentAberto ? 'opacity-100' : 'opacity-0')}>
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
    // Trilho SEM borda/fundo próprios (só os ícones flutuam) — assim, ao recolher, não sobra uma
    // "divisória"/faixa atrás do painel. A borda + sombra ficam só no painel deslizante.
    <aside className="relative hidden h-full w-14 shrink-0 lg:block">
      {/* Trilho de ícones = card flutuante compacto no topo (não uma faixa de altura cheia). Some ao
          abrir; ao recolher, só reaparece DEPOIS que o painel termina de deslizar (delay). */}
      <div className={cn('absolute right-2 top-3 z-20 flex flex-col items-center gap-1 rounded-xl border bg-card p-1 shadow-sm transition-opacity duration-200',
        sidebarAberta ? 'pointer-events-none opacity-0' : 'opacity-100 delay-[380ms]')}>
        <button type="button" onClick={() => setSidebarAberta((v) => !v)} title={sidebarAberta ? 'Recolher barra' : 'Expandir barra'} className={cn('rounded-md p-2 transition-colors hover:bg-muted', sidebarAberta ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {sidebarAberta ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
        </button>
        <div className="my-1 h-px w-6 bg-border" />
        <button type="button" onClick={() => { setSidebarAberta(true); setAnotAberta(true) }} title="Anotações" className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><StickyNote className="h-5 w-5" /></button>
        <button type="button" onClick={() => { setSidebarAberta(true); setComentAberto(true) }} title="Comentário do professor" className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Lightbulb className="h-5 w-5" /></button>
      </div>
      {/* Painel — OVERLAY por cima do conteúdo E do trilho; sempre montado, DESLIZA ao expandir/recolher */}
      <div className={cn('absolute right-0 top-0 z-30 flex h-full w-80 flex-col overflow-hidden border-l bg-card shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
        sidebarAberta ? 'translate-x-0' : 'pointer-events-none translate-x-full')}>
        <div className="flex shrink-0 items-center justify-between border-b p-3">
          <span className="text-xs font-semibold text-muted-foreground">Ferramentas</span>
          <button type="button" onClick={() => setSidebarAberta(false)} title="Recolher barra" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><PanelRightClose className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">{renderFerramentas(true)}</div>
      </div>
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
          <button type="button" onClick={() => (onSair ? onSair() : router.push('/aluno/simulados'))}
            className="shrink-0 rounded-lg border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></button>
          <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex"><Icon className="h-5 w-5" /></span>
        </div>
        <div className="flex min-w-0 flex-col items-center px-1 text-center">
          <span className="max-w-[42vw] truncate text-sm font-semibold leading-tight sm:max-w-[26rem]">{sessao.titulo}</span>
          <span className="max-w-[42vw] truncate text-xs text-muted-foreground">Criado: {sessao.estudanteNome}</span>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2">
          {restante != null && (
            <span className={cn('flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pl-3 pr-2 text-sm font-bold tabular-nums',
              restante <= 60 && mostrarTempo ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground')}>
              <Timer className={cn('h-4 w-4', restante <= 60 && mostrarTempo && 'animate-pulse')} />
              {mostrarTempo ? formatarSeg(Math.max(0, restante)) : '--:--'}
              <button type="button" onClick={() => setMostrarTempo((v) => !v)} title={mostrarTempo ? 'Ocultar tempo' : 'Mostrar tempo'} aria-label={mostrarTempo ? 'Ocultar tempo' : 'Mostrar tempo'}
                className="ml-0.5 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground">
                {mostrarTempo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </span>
          )}
          {/* Finalizar sempre visível, à direita do timer */}
          <button type="button" onClick={finalizar} disabled={enviando}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 hover:shadow-md disabled:opacity-60">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />} <span className="hidden sm:inline">Finalizar</span>
          </button>
        </div>
      </header>
      {/* Progresso — avança com as questões RESPONDIDAS (não com o número da questão atual) */}
      <div className="h-1 w-full bg-muted">
        <div className="h-full bg-primary transition-all duration-300 ease-out" style={{ width: `${Math.round((respondidas / Math.max(1, total)) * 100)}%` }} />
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
            <span className="inline-flex max-w-[15rem] items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground" title={q.origemSimulado}>
              <FileText className="h-3 w-3 shrink-0" />
              {q.origemNumero != null && <span className="font-medium text-foreground">Q{q.origemNumero}</span>}
              {q.origemNumero != null && <span>-</span>}
              <span className="truncate">{q.origemSimulado}</span>
            </span>
          )}
        </div>
        <div className="p-4 sm:p-6">
          {q.imagemUrl && <img src={q.imagemUrl} alt="" className="mb-4 max-h-72 w-auto rounded-lg border" />}
          <MarkdownContent className="text-[15px] leading-relaxed text-foreground sm:text-base">{q.enunciado || '(sem enunciado)'}</MarkdownContent>
        </div>
      </div>

      {/* Aviso de questão anulada — ponto garantido a todos, marcação travada */}
      {bloqueada && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm font-semibold text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> Questão anulada
          <span className="font-normal text-destructive/80">· ponto garantido a todos — não precisa responder</span>
        </div>
      )}

      {/* Alternativas — cards com bolinha da letra + tesoura (eliminar) à esquerda */}
      <div className="space-y-2.5">
        {q.alternativas.map((alt, i) => {
          const sel = escolhida === alt.id
          const mostrarCerta = revelado && alt.correta
          const mostrarErrada = revelado && sel && !alt.correta
          const travado = bloqueada || (revelado && modo === 'estudo')
          const cortada = eliminadas.has(alt.id) && !revelado && !bloqueada
          return (
            <div key={alt.id} className="flex items-stretch gap-2">
              {/* Tesoura — elimina/restaura a alternativa (só antes de revelar; anulada não tem) */}
              {!revelado && !bloqueada && (
                <button type="button" onClick={() => eliminar(alt.id)} title={cortada ? 'Restaurar alternativa' : 'Eliminar (tesoura)'} aria-label={cortada ? 'Restaurar alternativa' : 'Eliminar alternativa'}
                  className={cn('flex h-9 w-9 shrink-0 self-center items-center justify-center rounded-full border transition-colors sm:h-10 sm:w-10',
                    cortada ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground')}>
                  <Scissors className={cn('h-4 w-4 transition-transform', cortada && '-rotate-12')} />
                </button>
              )}
              <button type="button" onClick={() => marcar(q.id, alt.id)} disabled={travado || cortada}
                className={cn('group flex flex-1 items-center gap-3 rounded-xl border bg-card p-3.5 text-left text-sm shadow-sm transition-all sm:p-4',
                  bloqueada ? 'cursor-not-allowed border-border bg-muted/30 opacity-60'
                    : mostrarCerta ? 'border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/40'
                      : mostrarErrada ? 'border-destructive bg-destructive/5 ring-1 ring-destructive/40'
                        : sel ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                          : !cortada ? 'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md' : '',
                  cortada && 'opacity-45',
                  travado && !bloqueada && 'cursor-default hover:translate-y-0 hover:shadow-sm')}>
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors',
                  mostrarCerta ? 'border-emerald-500 bg-emerald-500 text-white'
                    : mostrarErrada ? 'border-destructive bg-destructive text-white'
                      : sel && !bloqueada ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/30 text-muted-foreground group-hover:border-primary/50 group-hover:text-primary')}>
                  {mostrarCerta ? <Check className="h-4 w-4" /> : mostrarErrada ? <X className="h-4 w-4" /> : LETRA[i]}
                </span>
                <MarkdownContent inline className={cn('min-w-0 flex-1 leading-relaxed', cortada && 'line-through')}>{alt.texto}</MarkdownContent>
              </button>
            </div>
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

      {/* Navegação / ações — Anterior (esq) · Revisar (centro) · Ver gabarito + Próxima/Finalizar (dir) */}
      <div className="flex items-center gap-2 pb-2">
        <div className="flex flex-1 justify-start">
          <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted disabled:opacity-40">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Anterior</span>
          </button>
        </div>

        {/* Revisar — centralizado entre Anterior e Próxima */}
        <button type="button" onClick={() => toggleMarcar(q.id)} title={marcadas.has(q.id) ? 'Desmarcar revisão' : 'Marcar para revisar'}
          className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors',
            marcadas.has(q.id) ? 'border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-card hover:bg-muted')}>
          <Bookmark className={cn('h-4 w-4', marcadas.has(q.id) && 'fill-current')} /> Revisar
        </button>

        <div className="flex flex-1 items-center justify-end gap-2">
          {modo === 'revisao' && !revelados.has(q.id) && !bloqueada && (
            <button type="button" onClick={() => setRevelados((s) => new Set(s).add(q.id))}
              className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted">
              <Eye className="h-4 w-4" /> <span className="hidden sm:inline">Ver gabarito</span>
            </button>
          )}
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

      {/* Modal — expandir um bloco (Anotações / Comentário) em tela grande */}
      {expandido && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm duration-200 animate-in fade-in" onClick={fecharExpandido}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl duration-200 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()} style={{ ['--primary' as any]: 'var(--brand-primary)' }}>
            <div className="flex shrink-0 items-center justify-between border-b p-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {expandido === 'anot' ? <><StickyNote className="h-4 w-4 text-primary" /> Anotações</> : <><Lightbulb className="h-4 w-4 text-primary" /> Comentário do professor</>}
              </span>
              <button type="button" onClick={fecharExpandido} title="Fechar" aria-label="Fechar" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            {expandido === 'anot' ? (
              <EditorAnotacao key={`exp-${q.id}`} valor={anotacoes[q.id] ?? ''} fill onBaixar={baixarAnotacoes} onChange={(html) => setAnotacoes((a) => ({ ...a, [q.id]: html }))} />
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-5 text-sm">
                {q.comentario ? <MarkdownContent className="leading-relaxed text-foreground">{q.comentario}</MarkdownContent> : <span className="text-muted-foreground">Sem comentário para esta questão.</span>}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

const CORES_TEXTO = ['#111827', '#ffffff', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899']
const CORES_MARCA = ['#fde047', '#facc15', '#fdba74', '#fb923c', '#f87171', '#f472b6', '#e879f9', '#c084fc', '#a78bfa', '#818cf8', '#60a5fa', '#38bdf8', '#22d3ee', '#4ade80', '#a3e635']

/** Editor de anotações "estilo Word" (contenteditable + execCommand): negrito, itálico, sublinhado,
 *  marcadores, cor do texto e marca-texto. Remonta por questão (key) e salva o HTML em onChange. */
function EditorAnotacao({ valor, onChange, fill, onBaixar }: { valor: string; onChange: (html: string) => void; fill?: boolean; onBaixar?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [paleta, setPaleta] = useState<'texto' | 'marca' | null>(null)
  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false, ul: false })
  const sync = () => { try { setFmt({ bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), underline: document.queryCommandState('underline'), ul: document.queryCommandState('insertUnorderedList') }) } catch { /* ok */ } }
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = valor || '' // conteúdo inicial (remonta por questão via key)
    const onSel = () => { if (document.activeElement === ref.current) sync() }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const exec = (c: string, v?: string) => {
    ref.current?.focus()
    try { document.execCommand('styleWithCSS', false, 'true') } catch { /* ok */ }
    document.execCommand(c, false, v)
    onChange(ref.current?.innerHTML ?? '')
    setPaleta(null); sync()
  }
  return (
    <div className="flex flex-col overflow-hidden border-t">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-1 py-1">
        <BtnFmt title="Negrito" ativo={fmt.bold} onClick={() => exec('bold')}><Bold className="h-3.5 w-3.5" /></BtnFmt>
        <BtnFmt title="Itálico" ativo={fmt.italic} onClick={() => exec('italic')}><Italic className="h-3.5 w-3.5" /></BtnFmt>
        <BtnFmt title="Sublinhado" ativo={fmt.underline} onClick={() => exec('underline')}><Underline className="h-3.5 w-3.5" /></BtnFmt>
        <BtnFmt title="Marcadores" ativo={fmt.ul} onClick={() => exec('insertUnorderedList')}><List className="h-3.5 w-3.5" /></BtnFmt>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <div className="relative">
          <BtnFmt title="Cor do texto" ativo={paleta === 'texto'} onClick={() => setPaleta((p) => (p === 'texto' ? null : 'texto'))}><Baseline className="h-3.5 w-3.5" /></BtnFmt>
          {paleta === 'texto' && <Paleta cores={CORES_TEXTO} onPick={(c) => exec('foreColor', c)} />}
        </div>
        <div className="relative">
          <BtnFmt title="Marca-texto" ativo={paleta === 'marca'} onClick={() => setPaleta((p) => (p === 'marca' ? null : 'marca'))}><Highlighter className="h-3.5 w-3.5" /></BtnFmt>
          {paleta === 'marca' && <Paleta cores={CORES_MARCA} onLimpar={() => exec('hiliteColor', 'transparent')} onPick={(c) => exec('hiliteColor', c)} />}
        </div>
        {onBaixar && (
          <>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <BtnFmt title="Salvar anotações em texto (.txt)" onClick={onBaixar}><Download className="h-3.5 w-3.5" /></BtnFmt>
          </>
        )}
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true"
        onInput={() => { onChange(ref.current?.innerHTML ?? ''); sync() }} onKeyUp={sync} onMouseUp={sync}
        data-placeholder="Escreva suas anotações sobre esta questão…"
        className={cn('w-full overflow-y-auto p-3 text-sm leading-relaxed outline-none [&_ul]:list-disc [&_ul]:pl-5', fill ? 'min-h-[58vh]' : 'min-h-[7rem] max-h-72')} />
    </div>
  )
}

function BtnFmt({ children, onClick, title, ativo }: { children: ReactNode; onClick: () => void; title: string; ativo?: boolean }) {
  return <button type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
    className={cn('rounded p-1.5 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
      ativo ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>{children}</button>
}

/** Paleta de cores em grade (2 linhas de 8), CENTRALIZADA na opção. */
function Paleta({ cores, onPick, onLimpar }: { cores: string[]; onPick: (c: string) => void; onLimpar?: () => void }) {
  return (
    <div className="absolute left-1/2 top-full z-20 mt-1 grid w-max -translate-x-1/2 grid-cols-8 gap-1 rounded-lg border bg-card p-1.5 shadow-lg">
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
