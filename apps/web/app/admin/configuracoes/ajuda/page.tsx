import { HelpCircle } from 'lucide-react'
import { getCurrentTenant } from '@/lib/tenant'
import { lerAjudaFaq } from '@/lib/ajuda/faq'
import { AjudaFaqForm } from '@/components/admin/ajuda-faq-form'

// AJUDA / FAQ — gestão do FAQ exibido na Ajuda do aluno, por tenant. Guardado em
// simulado_tenants.tema.ajuda_faq (sem migração). Gate por `configuracoes:manage` na action.

export const dynamic = 'force-dynamic'

export default async function AjudaFaqPage() {
  const tenant = await getCurrentTenant()
  const faq = lerAjudaFaq(tenant?.tema)

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><HelpCircle className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ajuda / FAQ</h1>
          <p className="text-muted-foreground">
            Perguntas e respostas exibidas na Ajuda do aluno. Organize por temas; em branco, usa o conteúdo padrão.
          </p>
        </div>
      </div>

      <AjudaFaqForm faqInicial={faq} />
    </div>
  )
}
