import Link from 'next/link'
import { Eye, X } from 'lucide-react'

/** Faixa fixa da pré-visualização do rascunho no portal do aluno (só quem tem produtos:manage). Server component. */
export function FaixaPrevia({ sairHref }: { sairHref: string }) {
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-3 border-t bg-foreground px-4 py-2.5 text-sm text-background shadow-lg">
      <Eye className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate"><strong>Pré-visualização do rascunho</strong> — só você vê isto</span>
      <Link href={sairHref} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-background/30 px-3 py-1 text-xs font-medium transition-colors hover:bg-background/15">
        <X className="h-3.5 w-3.5" />Sair da prévia
      </Link>
    </div>
  )
}
