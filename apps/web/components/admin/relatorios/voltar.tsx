import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

/** Link de retorno padrão das telas de relatório (volta para a listagem). */
export function Voltar({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-1 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  )
}
