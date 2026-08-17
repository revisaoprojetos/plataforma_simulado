'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Star, CheckCircle2, XCircle, RotateCcw, Scissors, FileText, ChevronUp, ChevronDown } from 'lucide-react'
import { ComentariosFeedbackTabs } from '@/components/aluno/comentarios-feedback-tabs'
import { MarkdownContent } from '@/components/markdown-content'

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
  imagem_url?: string | null
  codigo?: string | null
  disciplina?: string | null
  assunto?: string | null
  banca?: string | null
  ano?: number | null
  comentario_professor?: string | null
  favorito: boolean
  etiquetas?: { nome: string; cor: string | null }[]
  /** Simulados em que a questão já foi usada + a posição dela em cada prova (tag abaixo do número). */
  provas?: { id: string; titulo: string; numero: number | null }[]
  alternativas: AltAluno[]
}

export function QuestaoResolvivel({ questao, numero }: { questao: QuestaoAluno; numero?: number }) {
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [revelado, setRevelado] = useState(false)
  const [comentAberto, setComentAberto] = useState(true)
  const [favorito, setFavorito] = useState(questao.favorito)
  const [favPending, setFavPending] = useState(false)
  const [eliminadas, setEliminadas] = useState<Set<string>>(new Set())
  const eliminar = (id: string) => setEliminadas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

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

  function resolver() {
    setRevelado(true)
    // Registra a tentativa (histórico de prática) — fire-and-forget, não bloqueia a UI.
    if (escolhida) {
      fetch('/api/aluno/questao-resposta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questao_id: questao.id, alternativa_id: escolhida }),
      }).catch(() => {})
    }
  }

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {questao.codigo
                ? <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono font-semibold text-primary">{questao.codigo}</span>
                : numero != null && <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono font-semibold text-primary">#{numero}</span>}
              {questao.disciplina && <span className="rounded-full border bg-muted/40 px-2 py-0.5 font-medium">{questao.disciplina}</span>}
              {questao.assunto && <span className="rounded-full border bg-muted/40 px-2 py-0.5">{questao.assunto}</span>}
              {questao.banca && <span className="rounded-full border bg-muted/40 px-2 py-0.5">{questao.banca}</span>}
              {questao.ano && <span className="rounded-full border bg-muted/40 px-2 py-0.5">{questao.ano}</span>}
              {questao.etiquetas?.map((e) => (
                <span key={e.nome} className="rounded-full px-2 py-0.5 font-medium" style={{ background: `${e.cor ?? '#64748b'}22`, color: e.cor ?? '#64748b' }}>{e.nome}</span>
              ))}
            </div>
            {questao.provas && questao.provas.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                {questao.provas.slice(0, 3).map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-muted-foreground" title={p.titulo}>
                    <FileText className="h-3 w-3 shrink-0" />
                    {p.numero != null && <span className="font-medium text-foreground">Q{p.numero}</span>}
                    {p.numero != null && <span>-</span>}
                    <span>{p.titulo}</span>
                  </span>
                ))}
                {questao.provas.length > 3 && <span className="text-muted-foreground">+{questao.provas.length - 3} outro(s)</span>}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={toggleFavorito}
              disabled={favPending}
              aria-label="Favoritar"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-amber-500"
            >
              <Star className={cn('h-5 w-5', favorito && 'fill-amber-400 text-amber-400')} />
            </button>
          </div>
        </div>

        <MarkdownContent className="text-sm leading-relaxed">{questao.enunciado}</MarkdownContent>

        {questao.imagem_url && (
          <div className="overflow-hidden rounded-lg border bg-muted/30 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={questao.imagem_url} alt="Imagem da questão" className="mx-auto max-h-[60vh] w-auto object-contain" />
          </div>
        )}

        <div className="space-y-2">
          {alts.map((alt, i) => {
            const escolha = escolhida === alt.id
            const mostrarCerta = revelado && alt.correta
            const mostrarErrada = revelado && escolha && !alt.correta
            const cortada = eliminadas.has(alt.id) && !revelado
            return (
              <div key={alt.id} className="flex items-stretch gap-2">
                {/* Tesoura — coluna à ESQUERDA (só antes de resolver). */}
                {!revelado && (
                  <button type="button" onClick={() => eliminar(alt.id)} aria-label={cortada ? 'Restaurar alternativa' : 'Eliminar alternativa'} title="Eliminar (tesoura)"
                    className={cn('flex w-9 shrink-0 items-center justify-center rounded-xl border transition-colors sm:w-10', cortada ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground')}>
                    <Scissors className={cn('h-4 w-4 transition-transform', cortada && '-rotate-12')} />
                  </button>
                )}
                <button
                  disabled={revelado || cortada}
                  onClick={() => setEscolhida(alt.id)}
                  className={cn(
                    'group/alt flex flex-1 items-start gap-3 rounded-xl border p-3.5 text-left text-sm transition-all',
                    !revelado && escolha && 'border-primary bg-primary/[0.06] ring-1 ring-primary/30',
                    !revelado && !escolha && !cortada && 'hover:border-primary/40 hover:bg-muted/60',
                    cortada && 'opacity-45',
                    mostrarCerta && 'border-emerald-500 bg-emerald-50 dark:border-emerald-500/60 dark:bg-emerald-950/30',
                    mostrarErrada && 'border-rose-500 bg-rose-50 dark:border-rose-500/60 dark:bg-rose-950/30',
                  )}
                >
                  <span className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors',
                    mostrarCerta && 'border-emerald-500 bg-emerald-500 text-white',
                    mostrarErrada && 'border-rose-500 bg-rose-500 text-white',
                    !mostrarCerta && !mostrarErrada && escolha && 'border-primary bg-primary text-primary-foreground',
                    !mostrarCerta && !mostrarErrada && !escolha && 'border-muted-foreground/30 text-muted-foreground group-hover/alt:border-primary/50 group-hover/alt:text-foreground',
                  )}>
                    {LETRA[i] ?? i + 1}
                  </span>
                  <MarkdownContent inline className={cn('flex-1 pt-0.5', cortada && 'line-through')}>{alt.texto}</MarkdownContent>
                  {mostrarCerta && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                  {mostrarErrada && <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />}
                </button>
              </div>
            )
          })}
        </div>

        {!revelado ? (
          <button
            onClick={resolver}
            disabled={!escolhida}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <CheckCircle2 className="h-4 w-4" /> Resolver
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
              <div className="overflow-hidden rounded-md border bg-muted/40">
                <button type="button" onClick={() => setComentAberto((v) => !v)} aria-expanded={comentAberto}
                  className="flex w-full items-center justify-between gap-2 p-3 text-left transition-colors hover:bg-muted/60">
                  <span className="text-xs font-semibold text-muted-foreground">Comentário do professor</span>
                  {comentAberto ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
                <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', comentAberto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                  <div className="overflow-hidden">
                    <div className="border-t px-3 py-3 text-sm"><MarkdownContent>{questao.comentario_professor}</MarkdownContent></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <ComentariosFeedbackTabs questaoId={questao.id} />
      </CardContent>
    </Card>
  )
}
