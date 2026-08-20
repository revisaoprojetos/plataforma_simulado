import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { SemPermissao } from '@/components/ui/alert-box'
import { carregarDetalhe } from './metas-actions'
import { MetasClient } from './metas-client'

export const dynamic = 'force-dynamic'

export default async function CronogramaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await carregarDetalhe(id)

  if (!r.ok || !r.cronograma) {
    return (
      <div className="animate-page space-y-6">
        <Link href="/admin/cronogramas" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar ao catálogo
        </Link>
        <SemPermissao>{r.error ?? 'Cronograma não encontrado.'}</SemPermissao>
      </div>
    )
  }

  return (
    <div className="animate-page space-y-6">
      <div>
        <Link href="/admin/cronogramas" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar ao catálogo
        </Link>
      </div>
      <MetasClient cronograma={r.cronograma} metasIniciais={r.metas ?? []} diagnostico={r.diagnostico!} />
    </div>
  )
}
