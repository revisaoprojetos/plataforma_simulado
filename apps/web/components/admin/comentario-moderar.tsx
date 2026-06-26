'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { aprovarComentario, excluirComentario } from '@/app/admin/comentarios/actions'

interface Coment {
  id: string
  texto: string
  autor: string
  enunciado: string
  criado_em: string
  aprovado: boolean
}

export function ComentarioModerar({ c }: { c: Coment }) {
  const [pending, start] = useTransition()

  function aprovar() {
    start(async () => {
      const r = await aprovarComentario(c.id)
      r.ok ? toast.success('Comentário aprovado') : toast.error(r.error ?? 'Erro')
    })
  }
  function excluir() {
    start(async () => {
      const r = await excluirComentario(c.id)
      r.ok ? toast.success('Comentário excluído') : toast.error(r.error ?? 'Erro')
    })
  }

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={c.aprovado ? 'default' : 'secondary'}>{c.aprovado ? 'aprovado' : 'pendente'}</Badge>
        <span className="font-medium">{c.autor}</span>
        <span className="ml-auto text-muted-foreground">{new Date(c.criado_em).toLocaleDateString('pt-BR')}</span>
      </div>
      <p className="line-clamp-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Questão:</span> {c.enunciado}
      </p>
      <p className="rounded-md bg-muted/40 p-2.5 text-sm">{c.texto}</p>
      <div className="flex gap-2">
        {!c.aprovado && (
          <Button size="sm" disabled={pending} onClick={aprovar}>
            {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
            Aprovar
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={pending} onClick={excluir}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
        </Button>
      </div>
    </div>
  )
}
