import { LifeBuoy } from 'lucide-react'
import { AjudaAluno } from '@/components/aluno/ajuda-aluno'

export const metadata = { title: 'Ajuda' }

export default function AjudaAlunoPage() {
  return (
    <div className="flex flex-col gap-5 lg:h-full lg:min-h-0">
      <div className="flex shrink-0 items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><LifeBuoy className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ajuda</h1>
          <p className="text-muted-foreground">Passo a passo de como usar a plataforma — escolha um guia ao lado.</p>
        </div>
      </div>

      <div className="min-h-0 lg:flex-1">
        <AjudaAluno />
      </div>
    </div>
  )
}
