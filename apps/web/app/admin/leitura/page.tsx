import Link from 'next/link'
import { Library, Layers } from 'lucide-react'
import { listarBancoAulas } from './actions'
import { BancoAulasGrid } from '@/components/admin/banco-aulas-grid'

export const dynamic = 'force-dynamic'

export default async function LeituraAdminPage({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta } = await searchParams
  const data = await listarBancoAulas(pasta ?? null)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Library className="h-6 w-6 text-primary" /> LegProc Digital</h1>
          <p className="text-muted-foreground">Banco de aulas: módulos ordenáveis → aulas (documento + questões) que formam a trilha do aluno.</p>
        </div>
        <Link href="/admin/leitura/materias" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><Layers className="h-4 w-4" /> Matérias</Link>
      </div>

      {!data.ok ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{data.error}</p>
      ) : (
        <BancoAulasGrid data={data} pastaAtual={pasta ?? null} />
      )}
    </div>
  )
}
