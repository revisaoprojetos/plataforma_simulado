'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ReportarErroButton } from '@/components/aluno/reportar-erro-button'
import {
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  Home,
  Trophy,
  Lock,
} from 'lucide-react'

interface AltRev {
  id: string
  texto: string
  correta?: boolean
}
interface QuestaoRev {
  numero: number
  id: string
  enunciado: string
  resposta_aluno: string | null
  acertou: boolean | null
  alternativas: AltRev[]
}
interface StatDisciplina {
  disciplina: string
  acertos: number
  total: number
  percentual: number
}
interface Resultado {
  titulo: string
  nota: number | null
  acertos: number
  total: number
  posicao: number | null
  total_participantes: number
  stats_por_disciplina: StatDisciplina[]
  gabarito_liberado: boolean
  questoes: QuestaoRev[]
}

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']

export function RevisaoFinal({
  sessionToken,
  voltarUrl,
}: {
  sessionToken: string
  voltarUrl: string
}) {
  const [data, setData] = useState<Resultado | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (!sessionToken) {
      setErro(true)
      setCarregando(false)
      return
    }
    fetch(`/api/sessoes/resultado?st=${sessionToken}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.questoes)) setData(d)
        else setErro(true)
      })
      .catch(() => setErro(true))
      .finally(() => setCarregando(false))
  }, [sessionToken])

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (erro || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Sessão não encontrada</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Esta sessão de prova não existe mais ou o link expirou. Acesse o simulado novamente para realizá-lo.
              </p>
            </div>
            <a href={voltarUrl} className={buttonVariants()}>
              <Home className="mr-2 h-4 w-4" />
              Voltar ao menu
            </a>
          </CardContent>
        </Card>
      </div>
    )
  }

  const nota = data?.nota ?? 0
  const acertos = data?.acertos ?? 0
  const total = data?.total ?? 0
  const pct = total > 0 ? Math.round((acertos / total) * 100) : 0
  const liberado = data?.gabarito_liberado ?? false

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      {/* Cabeçalho fixo */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-sm font-semibold">Prova finalizada</span>
          </div>
          <a href={voltarUrl} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Home className="mr-1.5 h-4 w-4" />
            Voltar ao menu
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {/* Resumo */}
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="flex items-center gap-4">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <svg className="absolute inset-0 h-20 w-20 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="16" fill="none" className="stroke-muted" strokeWidth="3" />
                  <circle
                    cx="18"
                    cy="18"
                    r="16"
                    fill="none"
                    className={cn(
                      'transition-all',
                      pct >= 70 ? 'stroke-green-500' : pct >= 50 ? 'stroke-amber-500' : 'stroke-red-500',
                    )}
                    strokeWidth="3"
                    strokeDasharray={`${pct} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="text-lg font-bold">{pct}%</span>
              </div>
              <div>
                <h1 className="text-xl font-bold">{data?.titulo ?? 'Resultado'}</h1>
                <p className="text-sm text-muted-foreground">
                  Você acertou <strong className="text-foreground">{acertos}</strong> de{' '}
                  <strong className="text-foreground">{total}</strong> questões.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {data?.posicao != null && (
                <div className="flex items-center gap-2 rounded-xl bg-muted px-5 py-3">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  <div className="text-left">
                    <div className="text-2xl font-bold leading-none">{data.posicao}º</div>
                    <div className="text-xs text-muted-foreground">de {data.total_participantes}</div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-5 py-3">
                <div className="text-left">
                  <div className="text-2xl font-bold leading-none text-primary">{nota.toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground">Nota final</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Desempenho por matéria */}
        {liberado && (data?.stats_por_disciplina?.length ?? 0) > 0 && (
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="text-sm font-semibold">Desempenho por matéria</h2>
              {data!.stats_por_disciplina.map((s) => (
                <div key={s.disciplina} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{s.disciplina}</span>
                    <span className="text-muted-foreground">{s.acertos}/{s.total} · {s.percentual}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full', s.percentual >= 70 ? 'bg-green-500' : s.percentual >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                      style={{ width: `${s.percentual}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Aviso de gabarito */}
        {!liberado && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
            <Lock className="h-4 w-4 shrink-0" />
            O gabarito será liberado conforme a configuração do simulado. Abaixo estão suas respostas marcadas.
          </div>
        )}

        {/* Navegador de questões — clicar vai direto para a questão */}
        <div className="rounded-xl border bg-card p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Ir para questão</p>
          <div className="flex flex-wrap gap-1.5">
            {(data?.questoes ?? []).map((q) => {
              const status = q.acertou === null ? 'pendente' : q.acertou ? 'acertou' : 'errou'
              return (
                <button
                  key={q.id}
                  onClick={() =>
                    document.getElementById(`q-${q.numero}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                  title={`Questão ${q.numero}`}
                  className={cn(
                    'h-8 w-8 rounded-md text-xs font-semibold transition-colors',
                    status === 'acertou' &&
                      'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400',
                    status === 'errou' &&
                      'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400',
                    status === 'pendente' && 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  {q.numero}
                </button>
              )
            })}
          </div>
        </div>

        {/* Revisão das questões */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Revisão das questões ({total})
          </h2>

          {(data?.questoes ?? []).map((q) => {
            const status = q.acertou === null ? 'pendente' : q.acertou ? 'acertou' : 'errou'
            return (
              <Card key={q.id} id={`q-${q.numero}`} className="overflow-hidden scroll-mt-20">
                <CardContent className="space-y-3 p-4">
                  {/* cabeçalho da questão */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-muted px-2 text-sm font-semibold">
                      {q.numero}
                    </span>
                    {status === 'acertou' && (
                      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Acertou
                      </span>
                    )}
                    {status === 'errou' && (
                      <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        <XCircle className="h-3.5 w-3.5" /> Errou
                      </span>
                    )}
                    {status === 'pendente' && (
                      <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        <Circle className="h-3.5 w-3.5" /> Respondida
                      </span>
                    )}
                  </div>

                  <p className="text-sm leading-relaxed">{q.enunciado}</p>

                  {/* alternativas */}
                  <div className="space-y-2">
                    {q.alternativas.map((alt, i) => {
                      const marcada = q.resposta_aluno === alt.id
                      const correta = alt.correta === true
                      const erradaMarcada = marcada && alt.correta === false
                      return (
                        <div
                          key={alt.id}
                          className={cn(
                            'flex items-start gap-3 rounded-lg border p-3 text-sm',
                            correta && 'border-green-500 bg-green-50 dark:bg-green-900/20',
                            erradaMarcada && 'border-red-500 bg-red-50 dark:bg-red-900/20',
                            !correta && !erradaMarcada && marcada && 'border-primary bg-primary/5',
                          )}
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                              correta && 'border-green-500 bg-green-500 text-white',
                              erradaMarcada && 'border-red-500 bg-red-500 text-white',
                              !correta && !erradaMarcada && 'border-muted-foreground/30 text-muted-foreground',
                            )}
                          >
                            {LETRA[i] ?? i + 1}
                          </span>
                          <span className="flex-1">{alt.texto}</span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {marcada && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                Sua resposta
                              </span>
                            )}
                            {correta && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                            {erradaMarcada && <XCircle className="h-4 w-4 text-red-600" />}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex justify-end pt-1">
                    <ReportarErroButton sessaoId={sessionToken} questaoId={q.id} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="flex justify-center pt-2">
          <a href={voltarUrl} className={buttonVariants({ size: 'lg' })}>
            <Home className="mr-2 h-4 w-4" />
            Voltar ao menu
          </a>
        </div>
      </main>
    </div>
  )
}
