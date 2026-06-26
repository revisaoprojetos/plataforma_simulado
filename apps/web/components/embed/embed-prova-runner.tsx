'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BookOpen,
  Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Alternativa {
  id: string
  texto: string
  ordem: number
}

interface Questao {
  id: string
  enunciado: string
  alternativas: Alternativa[]
}

interface SessaoData {
  id: string
  questoes: Questao[]
  tempo_limite_min: number | null
  iniciado_em: string
  status: string
  respostas: Record<string, string>
}

type ProvaStatus = 'loading' | 'em_andamento' | 'finalizada' | 'erro'

function useTimer(iniciado_em: string, tempo_limite_min: number | null) {
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(null)

  useEffect(() => {
    if (!tempo_limite_min) return

    const calcRestante = () => {
      const inicio = new Date(iniciado_em).getTime()
      const decorrido = Math.floor((Date.now() - inicio) / 1000)
      return Math.max(0, tempo_limite_min * 60 - decorrido)
    }

    setSegundosRestantes(calcRestante())
    const interval = setInterval(() => {
      const restante = calcRestante()
      setSegundosRestantes(restante)
      if (restante === 0) clearInterval(interval)
    }, 1000)

    return () => clearInterval(interval)
  }, [iniciado_em, tempo_limite_min])

  return segundosRestantes
}

function formatTime(segundos: number) {
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  const s = segundos % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const LETRA = ['A', 'B', 'C', 'D', 'E']

interface EmbedProvaRunnerProps {
  embedToken: string
  sessaoId: string
  simuladoTitulo: string
}

export function EmbedProvaRunner({ embedToken, sessaoId, simuladoTitulo }: EmbedProvaRunnerProps) {
  const [status, setStatus] = useState<ProvaStatus>('loading')
  const [sessao, setSessao] = useState<SessaoData | null>(null)
  const [questaoIndex, setQuestaoIndex] = useState(0)
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [showRevisao, setShowRevisao] = useState(false)
  const [showConfirmacao, setShowConfirmacao] = useState(false)
  const [isFinalizando, setIsFinalizando] = useState(false)
  const [resultado, setResultado] = useState<{ nota: number; acertos: number; total: number; posicao?: number | null } | null>(null)

  useEffect(() => {
    async function loadSessao() {
      try {
        const res = await fetch(`/api/sessoes/current?st=${sessaoId}&token=${embedToken}`)
        if (!res.ok) throw new Error('Sessão inválida')
        const data: SessaoData = await res.json()
        setSessao(data)
        setRespostas(data.respostas ?? {})
        setStatus('em_andamento')
      } catch {
        setStatus('erro')
      }
    }
    loadSessao()
  }, [sessaoId, embedToken])

  const segundosRestantes = useTimer(
    sessao?.iniciado_em ?? new Date().toISOString(),
    sessao?.tempo_limite_min ?? null
  )

  const handleFinalizar = useCallback(async () => {
    if (isFinalizando) return
    setIsFinalizando(true)
    setShowConfirmacao(false)
    setShowRevisao(false)

    try {
      const res = await fetch('/api/sessoes/finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessao_id: sessao?.id }),
      })

      if (res.ok) {
        const data = await res.json()
        setResultado(data)
      } else {
        const total = sessao?.questoes.length ?? 0
        const acertos = Object.keys(respostas).length
        setResultado({ nota: total > 0 ? (acertos / total) * 10 : 0, acertos, total })
      }
      setStatus('finalizada')
    } catch {
      const total = sessao?.questoes.length ?? 0
      const acertos = Object.keys(respostas).length
      setResultado({ nota: total > 0 ? (acertos / total) * 10 : 0, acertos, total })
      setStatus('finalizada')
    } finally {
      setIsFinalizando(false)
    }
  }, [sessao, respostas, isFinalizando])

  useEffect(() => {
    if (segundosRestantes === 0 && status === 'em_andamento') {
      handleFinalizar()
    }
  }, [segundosRestantes, status, handleFinalizar])

  useEffect(() => {
    if (status === 'finalizada' && resultado) {
      try {
        parent.postMessage({ type: 'embed-finished', nota: resultado.nota }, '*')
      } catch {}
    }
  }, [status, resultado])

  const autoSave = useCallback(async (questaoId: string, alternativaId: string) => {
    setSalvando(questaoId)
    try {
      await fetch('/api/sessoes/resposta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessao_id: sessao?.id,
          questao_id: questaoId,
          alternativa_id: alternativaId,
        }),
      })
    } catch {
      toast.error('Erro ao salvar resposta. Tente novamente.')
    } finally {
      setSalvando(null)
    }
  }, [sessao?.id])

  function handleResponder(questaoId: string, alternativaId: string) {
    setRespostas((prev) => ({ ...prev, [questaoId]: alternativaId }))
    autoSave(questaoId, alternativaId)
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando prova...</p>
        </div>
      </div>
    )
  }

  if (status === 'erro') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center space-y-3">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="text-base font-semibold">Sessão inválida</h2>
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar sua prova. Tente novamente ou entre em contato com o suporte.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'finalizada' && resultado) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm space-y-5 text-center">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Prova Finalizada!</h2>
            <p className="text-sm text-muted-foreground mt-1">Seu gabarito foi registrado.</p>
          </div>
          <div className={`grid gap-3 ${resultado.posicao != null ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <div className="rounded-lg bg-muted p-3">
              <div className="text-2xl font-bold">{resultado.nota.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">Nota</div>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <div className="text-2xl font-bold">{resultado.acertos}</div>
              <div className="text-xs text-muted-foreground">Acertos</div>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <div className="text-2xl font-bold">{resultado.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            {resultado.posicao != null && (
              <div className="rounded-lg bg-amber-100 p-3 dark:bg-amber-900/30">
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{resultado.posicao}º</div>
                <div className="text-xs text-muted-foreground">Ranking</div>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            O gabarito será liberado conforme a configuração do simulado.
          </p>
        </div>
      </div>
    )
  }

  if (!sessao) return null

  const questaoAtual = sessao.questoes[questaoIndex]
  const totalQuestoes = sessao.questoes.length
  const totalRespondidas = Object.keys(respostas).length
  const progresso = (totalRespondidas / totalQuestoes) * 100
  const timerWarning = segundosRestantes !== null && segundosRestantes < 300

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm truncate max-w-[140px]">{simuladoTitulo}</span>
          </div>

          {segundosRestantes !== null && (
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-mono font-medium',
                timerWarning
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-foreground'
              )}
            >
              <Clock className={cn('h-3.5 w-3.5', timerWarning && 'animate-pulse')} />
              {formatTime(segundosRestantes)}
            </div>
          )}

          <div className="flex items-center gap-2">
            {salvando && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            <Button variant="outline" size="sm" onClick={() => setShowRevisao(true)}>
              Revisar
            </Button>
            <Button size="sm" onClick={() => setShowConfirmacao(true)} disabled={isFinalizando}>
              <Send className="mr-1 h-3 w-3" />
              Enviar
            </Button>
          </div>
        </div>
        <Progress value={progresso} className="h-0.5 rounded-none" />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-5">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {questaoIndex + 1} / {totalQuestoes}
          </Badge>
          <span className="text-xs text-muted-foreground">{totalRespondidas} respondidas</span>
        </div>

        <Card>
          <CardContent className="pt-5">
            <p className="leading-relaxed text-sm">{questaoAtual.enunciado}</p>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {questaoAtual.alternativas.map((alt, i) => {
            const isSelected = respostas[questaoAtual.id] === alt.id
            return (
              <button
                key={alt.id}
                onClick={() => handleResponder(questaoAtual.id, alt.id)}
                className={cn(
                  'w-full rounded-lg border p-3.5 text-left transition-all hover:border-primary/50',
                  isSelected
                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                    : 'border-border bg-card hover:bg-muted/30'
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/30 text-muted-foreground'
                    )}
                  >
                    {LETRA[i] ?? i + 1}
                  </span>
                  <span className={cn('text-sm leading-relaxed', isSelected && 'font-medium')}>
                    {alt.texto}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuestaoIndex((i) => Math.max(0, i - 1))}
            disabled={questaoIndex === 0}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Anterior
          </Button>

          <div className="flex flex-wrap gap-1 max-w-[200px] justify-center">
            {sessao.questoes.map((q, i) => {
              const respondida = !!respostas[q.id]
              const atual = i === questaoIndex
              return (
                <button
                  key={q.id}
                  onClick={() => setQuestaoIndex(i)}
                  className={cn(
                    'h-6 w-6 rounded text-xs font-medium transition-colors',
                    atual
                      ? 'bg-primary text-primary-foreground'
                      : respondida
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                  title={`Questão ${i + 1}`}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>

          <Button
            variant={questaoIndex === totalQuestoes - 1 ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              if (questaoIndex === totalQuestoes - 1) {
                setShowRevisao(true)
              } else {
                setQuestaoIndex((i) => Math.min(totalQuestoes - 1, i + 1))
              }
            }}
          >
            {questaoIndex === totalQuestoes - 1 ? 'Revisar' : 'Próxima'}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </main>

      <Dialog open={showRevisao} onOpenChange={setShowRevisao}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revisão</DialogTitle>
            <DialogDescription>Verifique suas respostas antes de enviar.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1 max-h-64 overflow-y-auto">
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded bg-green-400" />
                <span>Respondidas ({totalRespondidas})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded bg-muted" />
                <span>Em branco ({totalQuestoes - totalRespondidas})</span>
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-1.5">
              {sessao.questoes.map((q, i) => {
                const respondida = !!respostas[q.id]
                return (
                  <button
                    key={q.id}
                    onClick={() => { setQuestaoIndex(i); setShowRevisao(false) }}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-md text-xs font-medium',
                      respondida
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {respondida ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </button>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowRevisao(false)}>
              Continuar
            </Button>
            <Button size="sm" onClick={() => { setShowRevisao(false); setShowConfirmacao(true) }}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Enviar prova
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showConfirmacao} onOpenChange={setShowConfirmacao}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar envio</DialogTitle>
            <DialogDescription>
              Você respondeu <strong>{totalRespondidas}</strong> de <strong>{totalQuestoes}</strong> questões.
              {totalRespondidas < totalQuestoes && (
                <span className="mt-1 block text-amber-600 dark:text-amber-400 text-xs">
                  {totalQuestoes - totalRespondidas} questões ainda estão em branco.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Após o envio não será possível alterar suas respostas.</p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowConfirmacao(false)} disabled={isFinalizando}>
              Voltar
            </Button>
            <Button size="sm" onClick={handleFinalizar} disabled={isFinalizando}>
              {isFinalizando ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Confirmar envio'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
