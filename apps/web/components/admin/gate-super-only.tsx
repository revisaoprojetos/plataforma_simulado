import { Lock } from 'lucide-react'
import { isSuperAdmin } from '@/lib/auth/permissions'

/**
 * Camada 2b do SUPER-ONLY: usado nos `layout.tsx` de cada área reservada ao super-admin global. O gate do
 * `app/admin/layout.tsx` só roda na carga completa (layouts persistem na navegação suave); este roda sempre que o
 * SEGMENTO da área é (re)entrado — então o link direto/soft-nav de um não-super nunca executa a página.
 * `access.isAdmin` (acesso total do tenant) NÃO basta.
 */
export async function GateSuperOnly({ children }: { children: React.ReactNode }) {
  if (!(await isSuperAdmin())) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><Lock className="h-7 w-7" /></span>
        <h2 className="text-lg font-semibold">Sem acesso a esta área</h2>
        <p className="max-w-md text-sm text-muted-foreground">Esta área é restrita ao super administrador.</p>
        <a href="/admin" className="mt-1 inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Voltar ao painel</a>
      </div>
    )
  }
  return <>{children}</>
}
