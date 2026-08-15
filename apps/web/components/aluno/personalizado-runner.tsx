'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, X, Eye, Loader2, Flag, GraduationCap, Timer, Trophy, RotateCcw, Pencil } from 'lucide-react'
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

  const q = sessao.questoes[idx]
  const respondidas = useMemo(() => Object.keys(respostas).length, [respostas])

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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {/* Barra fixa: sair, progresso, timer */}
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6">
        <button type="button" onClick={() => router.push(`/aluno/simulados/personalizados/${sessao.simuladoId}`)}
          className="shrink-0 rounded-lg border p-1.5 text-muted-foreground transition-colors hover:text-foreground" aria-label="Sair"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="h-3.5 w-3.5" /> <span className="truncate font-medium text-foreground">{sessao.titulo}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(((idx + 1) / total) * 100)}%` }} />
          </div>
        </div>
        {restante != null && (
          <span className={cn('shrink-0 rounded-lg border px-2 py-1 text-sm font-semibold tabular-nums',
            restante <= 60 ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'text-foreground')}>
            {formatarSeg(Math.max(0, restante))}
          </span>
        )}
      </div>

      {/* Navegador de questões */}
      <div className="flex flex-wrap gap-1.5">
        {sessao.questoes.map((qq, i) => {
          const feito = respostas[qq.id] != null
          return (
            <button key={qq.id} type="button" onClick={() => setIdx(i)}
              className={cn('h-7 w-7 rounded-md border text-xs font-semibold tabular-nums transition-colors',
                i === idx ? 'border-primary bg-primary text-primary-foreground'
                  : feito ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground hover:border-foreground/30')}>{i + 1}</button>
          )
        })}
      </div>

      {/* Questão */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted font-semibold text-foreground">{idx + 1}</span>
          <span>de {total}</span>
          {q.disciplina && <span className="rounded-full bg-muted px-2 py-0.5">{q.disciplina}</span>}
        </div>

        {q.imagemUrl && <img src={q.imagemUrl} alt="" className="mb-3 max-h-64 w-auto rounded-lg border" />}
        <MarkdownContent className="leading-relaxed">{q.enunciado || '(sem enunciado)'}</MarkdownContent>

        <div className="mt-4 space-y-2">
          {q.alternativas.map((alt, i) => {
            const sel = escolhida === alt.id
            const mostrarCerta = revelado && alt.correta
            const mostrarErrada = revelado && sel && !alt.correta
            return (
              <button key={alt.id} type="button" onClick={() => marcar(q.id, alt.id)}
                disabled={revelado && modo === 'estudo'}
                className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition',
                  mostrarCerta ? 'border-emerald-500 bg-emerald-500/10'
                    : mostrarErrada ? 'border-destructive bg-destructive/10'
                      : sel ? 'border-primary bg-primary/5'
                        : 'hover:border-foreground/20 hover:bg-muted/40',
                  revelado && modo === 'estudo' && 'cursor-default')}>
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-bold',
                  mostrarCerta ? 'border-emerald-500 bg-emerald-500 text-white'
                    : mostrarErrada ? 'border-destructive bg-destructive text-white'
                      : sel ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 text-muted-foreground')}>
                  {mostrarCerta ? <Check className="h-3.5 w-3.5" /> : mostrarErrada ? <X className="h-3.5 w-3.5" /> : LETRA[i]}
                </span>
                <MarkdownContent inline className="min-w-0 flex-1 leading-relaxed">{alt.texto}</MarkdownContent>
              </button>
            )
          })}
        </div>

        {/* Feedback (Estudo/Revisão revelados) */}
        {revelado && escolhida && (
          <div className={cn('mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
            acertou ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-destructive/10 text-destructive')}>
            {acertou ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />} {acertou ? 'Você acertou!' : 'Resposta incorreta.'}
          </div>
        )}
        {revelado && q.comentario && (
          <div className="mt-3 rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comentário do professor</p>
            <MarkdownContent className="leading-relaxed text-foreground">{q.comentario}</MarkdownContent>
          </div>
        )}
      </div>

      {/* Navegação / ações */}
      <div className="flex items-center justify-between gap-2 pb-2">
        <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-40">
          <ArrowLeft className="h-4 w-4" /> Anterior
        </button>

        <div className="flex items-center gap-2">
          {modo === 'revisao' && !revelados.has(q.id) && (
            <button type="button" onClick={() => setRevelados((s) => new Set(s).add(q.id))}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">
              <Eye className="h-4 w-4" /> Ver gabarito
            </button>
          )}
          {idx < total - 1 ? (
            <button type="button" onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              Próxima <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={finalizar} disabled={enviando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />} Finalizar
            </button>
          )}
        </div>
      </div>

      {/* Atalho para finalizar antes do fim (respondeu tudo) */}
      {idx < total - 1 && respondidas === total && (
        <button type="button" onClick={finalizar} disabled={enviando}
          className="mx-auto -mt-1 inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-60">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />} Finalizar agora ({respondidas}/{total})
        </button>
      )}
    </div>
  )
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
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
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
        {sessao.questoes.map((q, i) => <RevisaoItem key={q.id} q={q} numero={i + 1} escolhida={respostas[q.id] ?? null} />)}
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
