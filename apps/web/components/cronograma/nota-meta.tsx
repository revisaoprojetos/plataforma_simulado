'use client'

import { useEffect, useState } from 'react'
import { Loader2, NotebookPen } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { salvarNota } from '@/app/aluno/(portal)/cronograma/notas-actions'
import type { MetaDatada } from '@/lib/cronograma/tipos'

/**
 * A anotação do aluno numa meta.
 *
 * O botão muda de cara conforme exista nota ou não — anotação que não se vê de fora é
 * anotação que se esquece, e o aluno precisa saber onde já escreveu antes de abrir.
 *
 * Salva ao fechar, e não a cada tecla: escrever é pensar, e um "salvo" piscando a cada
 * palavra atrapalha. O texto vazio apaga a nota, porque "sem anotação" e "anotação em branco"
 * são a mesma coisa para quem lê.
 */
export function NotaMeta({
  meta,
  emissaoId,
  nota,
  aoSalvar,
  compacto,
}: {
  meta: MetaDatada
  emissaoId: string
  nota: string | undefined
  aoSalvar: (metaId: string, texto: string) => void
  /** Na grade a linha é apertada: só o ícone. No diálogo do dia cabe o rótulo. */
  compacto?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState(nota ?? '')
  const [salvando, setSalvando] = useState(false)

  // O texto do diálogo acompanha o que veio de fora enquanto ele está fechado.
  useEffect(() => {
    if (!aberto) setTexto(nota ?? '')
  }, [nota, aberto])

  const tem = !!(nota ?? '').trim()

  async function gravar() {
    const limpo = texto.trim()
    if (limpo === (nota ?? '').trim()) {
      setAberto(false)
      return
    }
    setSalvando(true)
    const r = await salvarNota(emissaoId, meta.id, limpo, { data: meta.data, titulo: meta.titulo })
    setSalvando(false)
    if (!r.ok) {
      toast.error(r.error ?? 'Não foi possível salvar a anotação.')
      return
    }
    aoSalvar(meta.id, limpo)
    setAberto(false)
    toast.success(limpo ? 'Anotação salva' : 'Anotação removida', { duration: 1400 })
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setAberto(true)
        }}
        title={tem ? `Sua anotação: ${(nota ?? '').slice(0, 80)}` : 'Escrever uma anotação'}
        aria-label={tem ? 'Ver a anotação desta meta' : 'Anotar nesta meta'}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 text-xs transition ${
          tem
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-transparent text-muted-foreground/50 hover:border-input hover:text-foreground'
        }`}
      >
        <NotebookPen className="h-3.5 w-3.5" />
        {!compacto && (tem ? 'anotação' : 'anotar')}
      </button>

      <Dialog open={aberto} onOpenChange={(v) => (v ? setAberto(true) : gravar())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <NotebookPen className="h-5 w-5 text-primary" />
              Sua anotação
            </DialogTitle>
            <DialogDescription>
              {meta.tipoDef.nome} · {meta.titulo}
              {meta.complemento && <span className="block text-xs">{meta.complemento}</span>}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={7}
            maxLength={4000}
            autoFocus
            placeholder="O que você quer lembrar sobre esta meta — dúvidas, o que revisar, onde parou…"
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter grava sem tirar a mão do teclado.
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                void gravar()
              }
            }}
          />

          <p className="text-xs text-muted-foreground">
            Só você vê. Fica salva neste cronograma e aparece no PDF, se você exportar.{' '}
            <span className="opacity-70">Ctrl+Enter salva · apagar tudo remove a anotação.</span>
          </p>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={salvando}>
              Fechar sem salvar
            </Button>
            <Button onClick={gravar} disabled={salvando}>
              {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
