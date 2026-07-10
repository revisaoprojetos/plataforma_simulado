import { HelpCircle } from 'lucide-react'
import { AjudaTutoriais } from '@/components/admin/ajuda-tutoriais'

export const metadata = { title: 'Ajuda' }

export default function AjudaPage() {
  return (
    <div className="flex flex-col gap-5 lg:h-full lg:min-h-0">
      <div className="flex shrink-0 items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><HelpCircle className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ajuda &amp; Tutoriais</h1>
          <p className="text-muted-foreground">Passo a passo, com imagens do sistema, de como fazer cada coisa na plataforma.</p>
        </div>
      </div>

      <div className="min-h-0 lg:flex-1">
        <AjudaTutoriais />
      </div>
    </div>
  )
}
