import { SimuladoForm } from '@/components/admin/simulado-form'
import { createSimuladoAction } from '../actions'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default function NovoSimuladoPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/simulados"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar para Simulados
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Novo Simulado</h1>
      </div>

      <SimuladoForm onSubmit={createSimuladoAction} />
    </div>
  )
}
