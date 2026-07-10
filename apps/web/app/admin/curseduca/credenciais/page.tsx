import Link from 'next/link'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { CurseducaConfig } from '@/components/admin/curseduca-config'

export const dynamic = 'force-dynamic'

export default function CurseducaCredenciaisPage() {
  return (
    <div className="animate-page mx-auto w-full max-w-3xl space-y-6">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5">
          <Link href="/admin/curseduca" className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'shrink-0')}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"><KeyRound className="h-7 w-7" /></span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Credenciais da Curseduca</h1>
            <p className="text-muted-foreground">As credenciais desta empresa ficam salvas no banco, criptografadas. Cada plataforma tem a sua.</p>
          </div>
        </div>
      </div>

      <CurseducaConfig inicialAberto semColapso />
    </div>
  )
}
