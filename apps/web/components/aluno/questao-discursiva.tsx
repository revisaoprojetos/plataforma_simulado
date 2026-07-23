'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Star, Send, Loader2, Clock, CheckCircle2 } from 'lucide-react'
import { ComentariosQuestao } from '@/components/aluno/comentarios-questao'

interface CompCorrecao { nome: string; pontos: number; nota: number; comentario?: string }
interface Resposta { id: string; texto: string; status: string; nota: number | null; feedback: string | null }

export interface QuestaoDiscursivaData {
  id: string
  enunciado: string
  disciplina?: string | null
  comentario_professor?: string | null
  favorito: boolean
}

export function QuestaoDiscursiva({ questao, numero }: { questao: QuestaoDiscursivaData; numero?: number }) {
  const [texto, setTexto] = useState('')
  const [resposta, setResposta] = useState<Resposta | null>(null)
  const [comps, setComps] = useState<CompCorrecao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [favorito, setFavorito] = useState(questao.favorito)

  async function carregar() {
    const res = await fetch(`/api/aluno/discursiva?questao_id=${questao.id}`)
    if (res.ok) {
      const j = await res.json()
      setResposta(j.resposta)
      setComps(j.competencias ?? [])
      if (j.resposta?.texto) setTexto(j.resposta.texto)
    }
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  async function enviar() {
    if (!texto.trim()) return
    setEnviando(true)
    try {
      const res = await fetch('/api/aluno/discursiva', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questao_id: questao.id, texto }),
      })
      if (res.ok) await carregar()
    } finally { setEnviando(false) }
  }

  async function toggleFav() {
    setFavorito((v) => !v)
    await fetch('/api/aluno/favoritos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questao_id: questao.id }) }).catch(() => {})
  }

  const corrigida = resposta?.status === 'corrigida'
  const pendente = resposta?.status === 'pendente' || resposta?.status === 'em_correcao'

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {numero != null && <span className="font-mono">#{numero}</span>}
            <span className="rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">Discursiva</span>
            {questao.disciplina && <span className="rounded bg-muted px-2 py-0.5">{questao.disciplina}</span>}
          </div>
          <button onClick={toggleFav} aria-label="Favoritar" className="shrink-0 text-muted-foreground hover:text-amber-500">
            <Star className={cn('h-5 w-5', favorito && 'fill-amber-400 text-amber-400')} />
          </button>
        </div>

        <p className="text-sm leading-relaxed">{questao.enunciado}</p>

        {carregando ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : corrigida ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">Corrigida — nota {Number(resposta!.nota ?? 0).toFixed(1)}</span>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{resposta!.texto}</div>
            {comps.length > 0 && (
              <div className="space-y-1.5">
                {comps.map((c, i) => (
                  <div key={i} className="rounded-md border p-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{c.nome}</span>
                      <span className="text-muted-foreground">{Number(c.nota).toFixed(1)} / {Number(c.pontos).toFixed(1)}</span>
                    </div>
                    {c.comentario && <p className="mt-0.5 text-xs text-muted-foreground">{c.comentario}</p>}
                  </div>
                ))}
              </div>
            )}
            {resposta!.feedback && (
              <div className="rounded-md border bg-primary/5 p-3 text-sm">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Feedback do corretor</p>
                {resposta!.feedback}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {pendente && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <Clock className="h-3.5 w-3.5" /> Enviada — aguardando correção. Você pode editar até ser corrigida.
              </div>
            )}
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escreva sua resposta…"
              rows={8}
              maxLength={20000}
              className="w-full resize-y rounded-md border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <button onClick={enviar} disabled={enviando || !texto.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {pendente ? 'Reenviar' : 'Enviar para correção'}
            </button>
          </div>
        )}

        {questao.comentario_professor && corrigida && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Comentário do professor</p>
            {questao.comentario_professor}
          </div>
        )}

        <ComentariosQuestao questaoId={questao.id} />
      </CardContent>
    </Card>
  )
}
