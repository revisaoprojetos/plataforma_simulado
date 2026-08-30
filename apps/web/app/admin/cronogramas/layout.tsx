import { CronogramaTabs } from '@/components/admin/cronograma-tabs'

/** Layout da área de Cronograma: barra de abas no topo de TODAS as telas (catálogo + subáreas). */
export default function CronogramaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <CronogramaTabs />
      {children}
    </div>
  )
}
