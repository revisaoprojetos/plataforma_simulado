import { AjudaTutoriais } from '@/components/admin/ajuda-tutoriais'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'

export const metadata = { title: 'Ajuda' }

export default function AjudaPage() {
  return (
    <div className="flex flex-col gap-5 lg:h-full lg:min-h-0">
      <CabecalhoArea
        className="shrink-0"
        titulo="Ajuda & Tutoriais"
        descricao="Passo a passo, com imagens do sistema, de como fazer cada coisa na plataforma."
      />
      <div className="min-h-0 lg:flex-1">
        <AjudaTutoriais />
      </div>
    </div>
  )
}
