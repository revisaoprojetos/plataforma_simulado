'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Star, CheckCircle2, XCircle, RotateCcw } from 'lucide-react'
import { ComentariosQuestao } from '@/components/aluno/comentarios-questao'
import { AddToCaderno } from '@/components/aluno/add-to-caderno'

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']

export interface AltAluno {
  id: string
  texto: string
  ordem: number
  correta: boolean
}
export interface QuestaoAluno {
  id: string
  tipo?: string
  enunciado: string
  disciplina?: string | null
  banca?: string | null
  ano?: number | null
  comentario_professor?: string | null
  favorito: boolean
  alternativas: AltAluno[]
}

export function QuestaoResolvivel({ questao, numero }: { questao: QuestaoAluno; numero?: number }) {
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [revelado, setRevelado] = useState(false)
  const [favorito, setFavorito] = useState(questao.favorito)
  const [favPending, setFavPending] = useState(false)

  const alts = [...questao.alternativas].sort((a, b) => a.ordem - b.ordem)
  const acertou = revelado && alts.find((a) => a.id === escolhida)?.correta

  async function toggleFavorito() {
    setFavPending(true)
    setFavorito((v) => !v) // otimista
    try {
      const res = await fetch('/api/aluno/favoritos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questao_id: questao.id }),
      })
      if (res.ok) {
        const j = await res.json()
        setFavorito(!!j.favorito)
      }
    } finally {
      setFavPending(false)
    }
  }

  function resetar() {
    setEscolhida(null)
    setRevelado(false)
  }

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {numero != null && <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono font-semibold text-primary">#{numero}</span>}
            {questao.disciplina && <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{questao.disciplina}</span>}
            {questao.banca && <span className="rounded-full bg-muted px-2 py-0.5">{questao.banca}</span>}
            {questao.ano && <span className="rounded-full bg-muted px-2 py-0.5">{questao.ano}</span>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AddToCaderno questaoId={questao.id} />
            <button
              onClick={toggleFavorito}
              disabled={favPending}
              aria-label="Favoritar"
              className="text-muted-foreground hover:text-amber-500"
            >
              <Star className={cn('h-5 w-5', favorito && 'fill-amber-400 text-amber-400')} />
            </button>
          </div>
        </div>

        <p className="text-sm leading-relaxed">{questao.enunciado}</p>

        <div className="space-y-2">
          {alts.map((alt, i) => {
            const escolha = escolhida === alt.id
            const mostrarCerta = revelado && alt.correta
            const mostrarErrada = revelado && escolha && !alt.correta
            return (
              <button
                key={alt.id}
                disabled={revelado}
                onClick={() => setEscolhida(alt.id)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors',
                  !revelado && escolha && 'border-primary bg-primary/5',
                  !revelado && !escolha && 'hover:bg-muted',
                  mostrarCerta && 'border-emerald-500 bg-emerald-50 dark:border-emerald-500/60 dark:bg-emerald-950/30',
                  mostrarErrada && 'border-rose-500 bg-rose-50 dark:border-rose-500/60 dark:bg-rose-950/30',
                )}
              >
                <span className={cn(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                  mostrarCerta && 'border-emerald-500 bg-emerald-500 text-white',
                  mostrarErrada && 'border-rose-500 bg-rose-500 text-white',
                  !mostrarCerta && !mostrarErrada && escolha && 'border-primary bg-primary text-primary-foreground',
                  !mostrarCerta && !mostrarErrada && !escolha && 'border-muted-foreground/30 text-muted-foreground',
                )}>
                  {LETRA[i] ?? i + 1}
                </span>
                <span className="flex-1">{alt.texto}</span>
                {mostrarCerta && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                {mostrarErrada && <XCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />}
              </button>
            )
          })}
        </div>

        {!revelado ? (
          <button
            onClick={() => setRevelado(true)}
            disabled={!escolhida}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Resolver
          </button>
        ) : (
          <div className="space-y-3">
            <div className={cn(
              'flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold',
              acertou
                ? 'border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                : 'border-rose-500/40 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400',
            )}>
              {acertou ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {acertou ? 'Você acertou!' : 'Resposta incorreta.'}
              <button onClick={resetar} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-background/60 hover:text-foreground">
                <RotateCcw className="h-3.5 w-3.5" /> Refazer
              </button>
            </div>
            {questao.comentario_professor && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Comentário do professor</p>
                {questao.comentario_professor}
              </div>
            )}
          </div>
        )}

        <ComentariosQuestao questaoId={questao.id} />
      </CardContent>
    </Card>
  )
}
