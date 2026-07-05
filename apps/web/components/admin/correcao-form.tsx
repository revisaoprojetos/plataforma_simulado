'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, Save, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { assumirCorrecao, salvarCorrecao } from '@/app/admin/correcao/actions'

interface Comp { id: string; nome: string; pontos: number; nota: number | null; comentario: string }

export function CorrecaoForm({
  respostaId, jaCorrigida, competencias, feedbackInicial,
}: {
  respostaId: string
  jaCorrigida: boolean
  competencias: Comp[]
  feedbackInicial: string
}) {
  const router = useRouter()
  const [comps, setComps] = useState<Comp[]>(competencias)
  const [feedback, setFeedback] = useState(feedbackInicial)
  const [bloqueado, setBloqueado] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Assume o lock ao abrir (se ainda não corrigida).
  useEffect(() => {
    if (jaCorrigida) return
    assumirCorrecao(respostaId).then((r) => { if (!r.ok) setBloqueado(r.error ?? 'Indisponível') })
  }, [respostaId, jaCorrigida])

  function setNota(id: string, nota: number) {
    setComps((cs) => cs.map((c) => (c.id === id ? { ...c, nota } : c)))
  }
  function setComentario(id: string, comentario: string) {
    setComps((cs) => cs.map((c) => (c.id === id ? { ...c, comentario } : c)))
  }

  const total = comps.reduce((acc, c) => acc + (Number(c.nota) || 0), 0)
  const maxTotal = comps.reduce((acc, c) => acc + c.pontos, 0)

  function salvar() {
    start(async () => {
      const r = await salvarCorrecao(
        respostaId,
        comps.map((c) => ({ competencia_id: c.id, nota: Number(c.nota) || 0, comentario: c.comentario })),
        feedback,
      )
      if (r.ok) {
        toast.success('Correção salva')
        router.push('/admin/correcao')
        router.refresh()
      } else {
        toast.error(r.error ?? 'Erro ao salvar')
      }
    })
  }

  if (bloqueado) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
        <Lock className="h-4 w-4" /> {bloqueado}
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Avaliação por competência</h2>
        <span className="text-sm text-muted-foreground">Total: <strong className="text-foreground">{total.toFixed(1)}</strong> / {maxTotal.toFixed(1)}</span>
      </div>

      {comps.length === 0 && <p className="text-sm text-muted-foreground">Esta questão não tem competências cadastradas — use o feedback abaixo e a nota será 0.</p>}

      {comps.map((c) => (
        <div key={c.id} className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{c.nome}</span>
            <div className="flex items-center gap-1.5 text-sm">
              <input
                type="number" step="0.5" min="0" max={c.pontos}
                value={c.nota ?? ''}
                onChange={(e) => setNota(c.id, Math.min(c.pontos, Math.max(0, Number(e.target.value))))}
                className="w-20 rounded-md border bg-[var(--input-bg,transparent)] px-2 py-1 text-right outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-muted-foreground">/ {c.pontos}</span>
            </div>
          </div>
          <input
            value={c.comentario}
            onChange={(e) => setComentario(c.id, e.target.value)}
            placeholder="Comentário do critério (opcional)"
            className="w-full rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      ))}

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Feedback geral</label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
          placeholder="Observações gerais para o aluno…"
          className="w-full resize-y rounded-md border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <Button onClick={salvar} disabled={pending}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        {jaCorrigida ? 'Atualizar correção' : 'Finalizar correção'}
      </Button>
    </div>
  )
}
