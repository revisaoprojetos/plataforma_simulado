'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { QuizConteudoAdmin } from '@/components/admin/quiz-conteudo-admin'
import { obterQuizDaMetaAction } from './questoes-meta-actions'

/** "Questões da meta" (JurisClub): abre o MESMO editor de questões do conteúdo (banco, importar, plataformas, ordem). */
export function QuestoesMetaDialog({ produtoId, itemId, titulo, onClose }: { produtoId: string; itemId: string; titulo: string; onClose: () => void }) {
  const [docId, setDocId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    obterQuizDaMetaAction(produtoId, itemId)
      .then((r) => { if (!vivo) return; if (r.ok) setDocId(r.documentoId); else setErro(r.error) })
      .catch(() => { if (vivo) setErro('Falha ao abrir as questões da meta.') })
    return () => { vivo = false }
  }, [produtoId, itemId])

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="max-h-[90vh] w-[min(1100px,calc(100vw-2rem))] max-w-[min(1100px,calc(100vw-2rem))] overflow-y-auto sm:max-w-[min(1100px,calc(100vw-2rem))]">
        <DialogTitle>Questões da meta · {titulo}</DialogTitle>
        {erro ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{erro}</div>
        ) : !docId ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Preparando as questões…</div>
        ) : (
          <QuizConteudoAdmin documentoId={docId} />
        )}
      </DialogContent>
    </Dialog>
  )
}
