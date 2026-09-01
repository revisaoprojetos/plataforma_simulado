import Link from 'next/link'
import { Library, Layers } from 'lucide-react'
import { listarDocumentosAdmin } from './actions'
import { LeituraCard } from '@/components/admin/leitura-card'
import { NovoDocumentoButton } from '@/components/admin/leitura-novo'

export const dynamic = 'force-dynamic'

export default async function LeituraAdminPage() {
  const r = await listarDocumentosAdmin()
  const itens = r.itens ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Library className="h-6 w-6 text-primary" /> LegProc Digital</h1>
          <p className="text-muted-foreground">Documentos (leis/materiais) que o aluno lê num leitor dinâmico, com progresso e anotações.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/leitura/materias" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><Layers className="h-4 w-4" /> Matérias</Link>
          <NovoDocumentoButton />
        </div>
      </div>

      {!r.ok ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{r.error}</p>
      ) : itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
          Nenhum documento ainda. Clique em <span className="font-medium text-foreground">“Novo documento”</span> para criar o primeiro.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {itens.map((doc) => <LeituraCard key={doc.id} doc={doc} />)}
        </div>
      )}
    </div>
  )
}
