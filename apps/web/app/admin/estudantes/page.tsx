import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Plus, Upload } from 'lucide-react'
import { EstudantesLista } from '@/components/admin/estudantes-lista'
import { carregarLoteEstudantes, kpisEstudantes } from './actions'

export const dynamic = 'force-dynamic'

const POR_PAGINA = 10

export default async function EstudantesPage() {
  // 1ª página (10) + KPIs cacheados (5 min) — server-side, leve. O resto pagina sob demanda.
  const [{ rows: inicial, total }, kpis] = await Promise.all([
    carregarLoteEstudantes(0, POR_PAGINA),
    kpisEstudantes(),
  ])

  return (
    <div className="animate-page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estudantes</h1>
          <p className="text-muted-foreground">Gerencie os alunos e acesse o dashboard pessoal de cada um.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/estudantes/novo?tab=csv" className={buttonVariants({ variant: 'outline' })}>
            <Upload className="mr-2 h-4 w-4" /> Importar
          </Link>
          <Link href="/admin/estudantes/novo" className={buttonVariants()}>
            <Plus className="mr-2 h-4 w-4" /> Novo Estudante
          </Link>
        </div>
      </div>

      <EstudantesLista
        inicial={inicial}
        total={total}
        adminEmails={kpis.adminEmails}
        kpis={{ total: kpis.total, passaporte: kpis.passaporte, feitos: kpis.feitos, ativos: kpis.ativos }}
      />
    </div>
  )
}
