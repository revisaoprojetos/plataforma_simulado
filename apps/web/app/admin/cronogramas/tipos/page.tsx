import { Tag } from 'lucide-react'
import { SemPermissao } from '@/components/ui/alert-box'
import { listarTipos } from '../tipos-actions'
import { TiposClient } from './tipos-client'

export const dynamic = 'force-dynamic'

export default async function TiposMetaPage() {
  const r = await listarTipos()

  return (
    <div className="animate-page space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Tag className="h-6 w-6 text-primary" />
          Tipos de meta
        </h1>
        <p className="text-muted-foreground">
          As linhas que aparecem em cada dia do cronograma. Cada tipo define como o conteúdo é escrito, se os
          links de questões aparecem e se ele conta como atividade.
        </p>
      </div>

      {!r.ok ? <SemPermissao>{r.error ?? 'Não foi possível carregar os tipos.'}</SemPermissao> : <TiposClient inicial={r.itens ?? []} />}
    </div>
  )
}
