import Link from 'next/link'
import { ArrowLeft, Upload } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { SemPermissao } from '@/components/ui/alert-box'
import { carregarEstadoAtual } from './actions'
import { ImportarClient } from './importar-client'

export const dynamic = 'force-dynamic'

export default async function ImportarPage() {
  const r = await carregarEstadoAtual()

  return (
    <div className="animate-page space-y-6">
      <div>
        <Link href="/admin/cronogramas" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar ao catálogo
        </Link>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Upload className="h-6 w-6 text-primary" />
          Importar cronogramas
        </h1>
        <p className="text-muted-foreground">
          Substitui as metas dos cronogramas mencionados nos arquivos. Cronogramas que não aparecerem ficam
          intocados, e reimportar o mesmo arquivo duas vezes dá o mesmo resultado.
        </p>
      </div>

      {!r.ok || !r.estado ? (
        <SemPermissao>{r.error ?? 'Não foi possível carregar o catálogo atual.'}</SemPermissao>
      ) : (
        <ImportarClient estado={r.estado} />
      )}
    </div>
  )
}
