import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { AlertBox } from '@/components/ui/alert-box'
import { abrirEmissao } from '../emissoes-actions'
import { EmissaoClient } from './emissao-client'

export const dynamic = 'force-dynamic'

export default async function EmissaoPage({ params }: { params: Promise<{ emissaoId: string }> }) {
  const { emissaoId } = await params
  const r = await abrirEmissao(emissaoId)

  return (
    <div className="animate-page space-y-6">
      <div>
        <Link href="/aluno/cronograma" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Meus cronogramas
        </Link>
      </div>

      {!r.ok || !r.dados ? (
        <AlertBox variante="aviso" titulo="Não encontramos este cronograma">
          <p className="text-sm">{r.error ?? 'Ele pode ter sido removido.'}</p>
        </AlertBox>
      ) : (
        <EmissaoClient emissao={r.dados.emissao} grade={r.dados.grade} indisponivel={r.dados.indisponivel} />
      )}
    </div>
  )
}
