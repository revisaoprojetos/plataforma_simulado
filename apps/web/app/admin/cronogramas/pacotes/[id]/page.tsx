import Link from 'next/link'
import { ArrowLeft, Package } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { SemPermissao } from '@/components/ui/alert-box'
import { carregarPacote } from '../actions'
import { PacoteClient } from './pacote-client'

export const dynamic = 'force-dynamic'

export default async function PacoteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await carregarPacote(id)

  return (
    <div className="animate-page space-y-6">
      <div>
        <Link href="/admin/cronogramas/pacotes" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar aos pacotes
        </Link>
      </div>

      {!r.ok || !r.dados ? (
        <SemPermissao>{r.error ?? 'Pacote não encontrado.'}</SemPermissao>
      ) : (
        <>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Package className="h-6 w-6 text-primary" />
              {r.dados.pacote.nome}
            </h1>
            {r.dados.pacote.descricao && <p className="text-muted-foreground">{r.dados.pacote.descricao}</p>}
          </div>
          <PacoteClient dados={r.dados} />
        </>
      )}
    </div>
  )
}
