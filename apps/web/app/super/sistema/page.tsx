import { ChecklistSistema } from '@/components/admin/checklist-sistema'
import { ServerCog } from 'lucide-react'

export const dynamic = 'force-dynamic'

// No console isolado, "Sistema" mostra a prontidão GLOBAL (checklist, sem tenant).
// A manutenção (modo bloqueio) é POR-PLATAFORMA e fica dentro do admin de cada plataforma.
export default function SuperSistemaPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ServerCog className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sistema</h1>
          <p className="text-muted-foreground">Prontidão e verificações gerais. A manutenção (bloqueio) é configurada dentro de cada plataforma.</p>
        </div>
      </div>

      <ChecklistSistema />
    </div>
  )
}
