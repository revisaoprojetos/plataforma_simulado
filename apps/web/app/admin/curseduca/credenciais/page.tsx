import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { CurseducaConfig } from '@/components/admin/curseduca-config'

export const dynamic = 'force-dynamic'

export default function CurseducaCredenciaisPage() {
  return (
    <div className="animate-page mx-auto w-full max-w-3xl space-y-6">
      <CabecalhoArea
        eyebrow="Integrações"
        titulo="Credenciais da Curseduca"
        descricao="As credenciais desta empresa ficam salvas no banco, criptografadas. Cada plataforma tem a sua."
        semBarraSetor
        acoes={
          <Link href="/admin/curseduca" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        }
      />

      <CurseducaConfig inicialAberto semColapso />
    </div>
  )
}
