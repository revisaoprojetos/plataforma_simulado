import Link from 'next/link'
import { ArrowLeft, Link2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { SemPermissao } from '@/components/ui/alert-box'
import { listarLinks } from './actions'
import { LinksClient } from './links-client'

export const dynamic = 'force-dynamic'

export default async function LinksAulaPage() {
  const r = await listarLinks()

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
          <Link2 className="h-6 w-6 text-primary" />
          Links de aula
        </h1>
        <p className="text-muted-foreground">
          Cada aula pode ter um link por plataforma de curso cadastrada. Valem para todos os cronogramas que
          citarem aquela aula — não são por cronograma.
        </p>
      </div>

      {!r.ok ? (
        <SemPermissao>{r.error ?? 'Não foi possível carregar os links.'}</SemPermissao>
      ) : (
        <LinksClient inicial={r.itens ?? []} plataformasIniciais={r.plataformas ?? []} faltandoInicial={r.faltando ?? []} />
      )}
    </div>
  )
}
