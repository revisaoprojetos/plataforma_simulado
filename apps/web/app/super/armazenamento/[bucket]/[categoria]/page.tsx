import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { listarArquivosAction } from '../../actions'
import { BrowserClient } from './browser-client'

export const dynamic = 'force-dynamic'

export default async function CategoriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ bucket: string; categoria: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { bucket, categoria } = await params
  const sp = await searchParams
  const pagina = Number(sp?.p ?? 0) || 0
  const busca = typeof sp?.q === 'string' ? sp.q : ''

  const r = await listarArquivosAction(bucket, categoria, pagina, busca)

  if (!r.ok || !r.dados) {
    return (
      <div className="space-y-4">
        <Link href="/super/armazenamento" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Armazenamento
        </Link>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{r.error ?? 'Não foi possível carregar os arquivos.'}</div>
      </div>
    )
  }

  return <BrowserClient bucket={bucket} categoria={categoria} dadosIniciais={r.dados} buscaInicial={busca} />
}
