import { LifeBuoy } from 'lucide-react'
import { AjudaAluno } from '@/components/aluno/ajuda-aluno'

export const metadata = { title: 'Ajuda' }

export default function AjudaAlunoPage() {
  return (
    <div className="animate-page space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><LifeBuoy className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ajuda</h1>
          <p className="text-muted-foreground">Passo a passo de como usar a plataforma — do início do simulado ao seu desempenho.</p>
        </div>
      </div>

      <AjudaAluno />
    </div>
  )
}
