'use client'

import { useState } from 'react'
import { MessageSquare, Loader2, Send, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Comentario {
  id: string
  tipo: 'professor' | 'aluno'
  texto: string
  aprovado: boolean
  autor: string
  em: string
  meu: boolean
}

export function ComentariosQuestao({ questaoId }: { questaoId: string }) {
  const [aberto, setAberto] = useState(false)
  const [comentarios, setComentarios] = useState<Comentario[] | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function carregar() {
    const res = await fetch(`/api/aluno/comentarios?questao_id=${questaoId}`)
    if (res.ok) setComentarios((await res.json()).comentarios ?? [])
  }

  function abrir() {
    const v = !aberto
    setAberto(v)
    if (v && comentarios === null) carregar()
  }

  async function enviar() {
    if (!texto.trim()) return
    setEnviando(true)
    try {
      const res = await fetch('/api/aluno/comentarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questao_id: questaoId, texto }),
      })
      if (res.ok) {
        setTexto('')
        await carregar()
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="border-t pt-3">
      <button onClick={abrir} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <MessageSquare className="h-4 w-4" />
        Comentários {comentarios ? `(${comentarios.length})` : ''}
      </button>

      {aberto && (
        <div className="mt-3 space-y-3">
          {comentarios === null ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : comentarios.length === 0 ? (
            <p className="text-xs text-muted-foreground">Seja o primeiro a comentar.</p>
          ) : (
            comentarios.map((c) => (
              <div key={c.id} className={cn('rounded-md p-2.5 text-sm', c.tipo === 'professor' ? 'bg-primary/5 border border-primary/20' : 'bg-muted/40')}>
                <div className="mb-0.5 flex items-center gap-1.5 text-xs font-medium">
                  {c.tipo === 'professor' && <GraduationCap className="h-3.5 w-3.5 text-primary" />}
                  <span className={c.tipo === 'professor' ? 'text-primary' : ''}>{c.autor}</span>
                  {!c.aprovado && c.meu && <span className="text-amber-600">(aguardando moderação)</span>}
                </div>
                <p>{c.texto}</p>
              </div>
            ))
          )}

          <div className="flex gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escreva um comentário…"
              rows={2}
              maxLength={2000}
              className="flex-1 resize-none rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={enviar}
              disabled={enviando || !texto.trim()}
              className="flex shrink-0 items-center gap-1 self-end rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
