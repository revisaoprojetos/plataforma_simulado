'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { adicionarQuestoes } from '@/app/admin/banco-questoes/actions'

interface Questao {
  id: string
  enunciado: string
  tipo: string
  nivel_dificuldade?: string | null
  bancas?: { nome: string } | null
  disciplinas?: { nome: string } | null
  assuntos?: { nome: string } | null
  ano?: number | null
}

export function AdicionarQuestoesClient({
  bancoId,
  questoes,
  jaNoBanco,
}: {
  bancoId: string
  questoes: Questao[]
  jaNoBanco: string[]
}) {
  const router = useRouter()
  const noBanco = new Set(jaNoBanco)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()

  function toggle(id: string) {
    if (noBanco.has(id)) return
    setSel((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function adicionar() {
    if (sel.size === 0) return
    start(async () => {
      const r = await adicionarQuestoes(bancoId, [...sel])
      if (r.ok) {
        toast.success(`${r.adicionadas ?? 0} questão(ões) adicionada(s)`)
        router.push(`/admin/banco-questoes/${bancoId}`)
      } else {
        toast.error(r.error ?? 'Erro ao adicionar')
      }
    })
  }

  return (
    <div className="space-y-3">
      {questoes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">Nenhuma questão encontrada com os filtros.</p>
        </div>
      ) : (
        questoes.map((q) => {
          const enunciado = q.enunciado ?? ''
          const preview = enunciado.length > 160 ? enunciado.slice(0, 160) + '…' : enunciado
          const jaTem = noBanco.has(q.id)
          const marcada = sel.has(q.id)
          return (
            <Card
              key={q.id}
              onClick={() => toggle(q.id)}
              className={cn(
                'group transition-colors',
                jaTem ? 'opacity-60' : 'cursor-pointer hover:border-primary/50',
                marcada && 'border-primary ring-1 ring-primary',
              )}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <div
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                    marcada ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                    jaTem && 'border-green-500 bg-green-500 text-white',
                  )}
                >
                  {(marcada || jaTem) && <Check className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline">{q.tipo === 'discursiva' ? 'Discursiva' : 'Objetiva'}</Badge>
                    {q.bancas?.nome && <span className="rounded bg-muted px-1.5 py-0.5">{q.bancas.nome}</span>}
                    {q.ano && <span>{q.ano}</span>}
                    {q.disciplinas?.nome && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{q.disciplinas.nome}</span>}
                    {q.assuntos?.nome && <span>{q.assuntos.nome}</span>}
                    {jaTem && <span className="font-medium text-green-600">já no banco</span>}
                  </div>
                  <p className="text-sm leading-relaxed">{preview}</p>
                </div>
              </CardContent>
            </Card>
          )
        })
      )}

      {sel.size > 0 && (
        <div className="sticky bottom-4 z-10 flex justify-center">
          <Button size="lg" className="shadow-lg" onClick={adicionar} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Adicionar {sel.size} ao banco
          </Button>
        </div>
      )}
    </div>
  )
}
