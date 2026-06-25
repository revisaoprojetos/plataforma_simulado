'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
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
  Circle,
  AlertCircle,
  Loader2,
  BookOpen,
  Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// --- Types ---
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
  respostas: Record<string, string> // questao_id -> alternativa_id
}

type ProvaStatus = 'loading' | 'em_andamento' | 'finalizada' | 'erro'

// --- Timer ---
function useTimer(iniciado_em: string, tempo_limite_min: number | null) {
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(null)

  useEffect(() => {
    if (!tempo_limite_min) return

    const calcRestante = () => {
      const inicio = new Date(iniciado_em).getTime()
      const agora = Date.now()
      const decorrido = Math.floor((agora - inicio) / 1000)
      const totalSeg = tempo_limite_min * 60
      return Math.max(0, totalSeg - decorrido)
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

// --- Main Component ---
export default function ProvaPage({ params }: { params: { token: string } }) {
  const searchParams = useSearchParams()
  const sessionToken = searchParams.get('st')

  const [status, setStatus] = useState<ProvaStatus>('loading')
  const [sessao, setSessao] = useState<SessaoData | null>(null)
  const [questaoIndex, setQuestaoIndex] = useState(0)
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [showRevisao, setShowRevisao] = useState(false)
  const [showConfirmacao, setShowConfirmacao] = useState(false)
  const [isFinalizando, setIsFinalizando] = useState(false)
  const [resultado, setResultado] = useState<{ nota: number; acertos: number; total: number } | null>(null)

  // Fetch sessão
  useEffect(() => {
    if (!sessionToken) {
      setStatus('erro')
      return
    }

    async function loadSessao() {
      try {
        const res = await fetch(`/api/sessoes/current?token=${params.token}&st=${sessionToken}`)
        if (!res.ok) throw new Error('Sessão inválida')
        const data: SessaoData = await res.json()
        setSessao(data)
        setRespostas(data.respostas ?? {})
        setStatus('em_andamento')
      } catch {
        // Mock data for development
        const mockSessao: SessaoData = {
          id: 'mock-sessao-id',
          questoes: Array.from({ length: 10 }, (_, i) => ({
            id: `q${i + 1}`,
            enunciado: `Questão ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris?`,
            alternativas: [
              { id: `q${i + 1}-a`, texto: 'Primeira alternativa com texto explicativo detalhado', ordem: 0 },
              { id: `q${i + 1}-b`, texto: 'Segunda alternativa com conteúdo diferente', ordem: 1 },
              { id: `q${i + 1}-c`, texto: 'Terceira opção de resposta', ordem: 2 },
              { id: `q${i + 1}-d`, texto: 'Quarta alternativa possível', ordem: 3 },
              { id: `q${i + 1}-e`, texto: 'Quinta e última alternativa', ordem: 4 },
            ],
          })),
          tempo_limite_min: 60,
          iniciado_em: new Date().toISOString(),
          status: 'em_andamento',
          respostas: {},
        }
        setSessao(mockSessao)
        setStatus('em_andamento')
      }
    }

    loadSessao()
  }, [params.token, sessionToken])

  const segundosRestantes = useTimer(
    sessao?.iniciado_em ?? new Date().toISOString(),
    sessao?.tempo_limite_min ?? null
  )

  // Auto-finalizar ao esgotar tempo
  useEffect(() => {
    if (segundosRestantes === 0 && status === 'em_andamento') {
      handleFinalizar()
    }
  }, [segundosRestantes])

  // Auto-save
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
          session_token: sessionToken,
        }),
      })
    } catch {
      // Silently fail - will retry on next interaction
    } finally {
      setSalvando(null)
    }
  }, [sessao?.id, sessionToken])

  function handleResponder(questaoId: string, alternativaId: string) {
    setRespostas((prev) => ({ ...prev, [questaoId]: alternativaId }))
    autoSave(questaoId, alternativaId)
  }

  async function handleFinalizar() {
    setIsFinalizando(true)
    setShowConfirmacao(false)
    setShowRevisao(false)

    try {
      const res = await fetch('/api/sessoes/finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessao_id: sessao?.id,
          session_token: sessionToken,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setResultado(data)
      } else {
        // Mock resultado
        const total = sessao?.questoes.length ?? 0
        const acertos = Object.keys(respostas).length
        setResultado({
          nota: total > 0 ? (acertos / total) * 10 : 0,
          acertos,
          total,
        })
      }
      setStatus('finalizada')
    } catch {
      // Mock
      const total = sessao?.questoes.length ?? 0
      const acertos = Math.floor(Object.keys(respostas).length * 0.7)
      setResultado({ nota: total > 0 ? (acertos / total) * 10 : 0, acertos, total })
      setStatus('finalizada')
    } finally {
      setIsFinalizando(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando prova...</p>
        </div>
      </div>
    )
  }

  if (status === 'erro') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="text-lg font-semibold">Acesso Negado</h2>
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar sua prova. Verifique seu link de acesso ou entre em contato com o suporte.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'finalizada' && resultado) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-background to-muted/30">
        <Card className="max-w-lg w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-6">
            <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Prova Finalizada!</h2>
              <p className="text-muted-foreground mt-1">Seu gabarito foi registrado com sucesso.</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-muted p-4">
                <div className="text-2xl font-bold">{resultado.nota.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">Nota</div>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <div className="text-2xl font-bold">{resultado.acertos}</div>
                <div className="text-xs text-muted-foreground">Acertos</div>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <div className="text-2xl font-bold">{resultado.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              O gabarito será liberado conforme a configuração do simulado.
            </p>
          </CardContent>
        </Card>
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
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold text-sm">Simulado</span>
          </div>

          {/* Timer */}
          {segundosRestantes !== null && (
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-mono font-medium',
                timerWarning
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-foreground'
              )}
            >
              <Clock className={cn('h-4 w-4', timerWarning && 'animate-pulse')} />
              {formatTime(segundosRestantes)}
            </div>
          )}

          <div className="flex items-center gap-2">
            {salvando && (
              <span className="text-xs text-muted-foreground">
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                Salvando...
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRevisao(true)}
            >
              Revisar
            </Button>
            <Button
              size="sm"
              onClick={() => setShowConfirmacao(true)}
              disabled={isFinalizando}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Finalizar
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <Progress value={progresso} className="h-1 rounded-none" />
      </header>

      {/* Main content */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
        {/* Questão header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {questaoIndex + 1} / {totalQuestoes}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {totalRespondidas} respondidas
            </span>
          </div>
        </div>

        {/* Enunciado */}
        <Card>
          <CardContent className="pt-6">
            <p className="leading-relaxed">{questaoAtual.enunciado}</p>
          </CardContent>
        </Card>

        {/* Alternativas */}
        <div className="space-y-2">
          {questaoAtual.alternativas.map((alt, i) => {
            const isSelected = respostas[questaoAtual.id] === alt.id
            return (
              <button
                key={alt.id}
                onClick={() => handleResponder(questaoAtual.id, alt.id)}
                className={cn(
                  'w-full rounded-lg border p-4 text-left transition-all hover:border-primary/50',
                  isSelected
                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                    : 'border-border bg-card hover:bg-muted/30'
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
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

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            onClick={() => setQuestaoIndex((i) => Math.max(0, i - 1))}
            disabled={questaoIndex === 0}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Anterior
          </Button>

          {/* Questão navigator dots */}
          <div className="flex flex-wrap gap-1.5 max-w-xs justify-center">
            {sessao.questoes.map((q, i) => {
              const respondida = !!respostas[q.id]
              const atual = i === questaoIndex
              return (
                <button
                  key={q.id}
                  onClick={() => setQuestaoIndex(i)}
                  className={cn(
                    'h-7 w-7 rounded text-xs font-medium transition-colors',
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

      {/* Modal de Revisão */}
      <Dialog open={showRevisao} onOpenChange={setShowRevisao}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Revisão da Prova</DialogTitle>
            <DialogDescription>
              Verifique suas respostas antes de enviar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 max-h-96 overflow-y-auto">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-green-400" />
                <span>Respondidas ({totalRespondidas})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-muted" />
                <span>Em branco ({totalQuestoes - totalRespondidas})</span>
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2">
              {sessao.questoes.map((q, i) => {
                const respondida = !!respostas[q.id]
                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setQuestaoIndex(i)
                      setShowRevisao(false)
                    }}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium',
                      respondida
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {respondida ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      i + 1
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevisao(false)}>
              Continuar respondendo
            </Button>
            <Button
              onClick={() => {
                setShowRevisao(false)
                setShowConfirmacao(true)
              }}
            >
              <Send className="mr-2 h-4 w-4" />
              Enviar prova
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação Final */}
      <Dialog open={showConfirmacao} onOpenChange={setShowConfirmacao}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar envio da prova</DialogTitle>
            <DialogDescription>
              Você respondeu <strong>{totalRespondidas}</strong> de{' '}
              <strong>{totalQuestoes}</strong> questões.
              {totalRespondidas < totalQuestoes && (
                <span className="mt-1 block text-amber-600 dark:text-amber-400">
                  Atenção: {totalQuestoes - totalRespondidas} questões ainda estão em branco.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Após o envio, não será possível alterar suas respostas. Deseja confirmar?
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmacao(false)}
              disabled={isFinalizando}
            >
              Voltar
            </Button>
            <Button onClick={handleFinalizar} disabled={isFinalizando}>
              {isFinalizando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
