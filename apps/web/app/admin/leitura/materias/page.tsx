import Link from 'next/link'
import { ArrowLeft, Layers } from 'lucide-react'
import { listarMaterias } from '../actions'
import { MateriasClient } from '@/components/admin/materias-client'

export const dynamic = 'force-dynamic'

export default async function MateriasPage() {
  const r = await listarMaterias()
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/leitura" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Área de Leitura</Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight"><Layers className="h-6 w-6 text-primary" /> Matérias</h1>
        <p className="text-muted-foreground">Áreas do direito para organizar o catálogo de leis (ex.: Constitucional, Administrativo, Civil).</p>
      </div>
      {r.ok ? <MateriasClient inicial={r.itens ?? []} /> : <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{r.error}</p>}
    </div>
  )
}
