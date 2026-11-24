import { Suspense } from 'react'
import { AppLoading } from '@/components/admin/app-loading'
import { ShellCronogramas } from '@/components/admin/cronograma/shell-cronogramas'

// MESMA casca de /admin/cronogramas/** (eyebrow + BarraSetor + grupos + sub-abas persistentes entre navegações).
export default function CronogramaShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShellCronogramas>
      <Suspense fallback={<AppLoading />}>{children}</Suspense>
    </ShellCronogramas>
  )
}
