import { getCurrentTenant } from '@/lib/tenant'
import { lerAjudaFaq } from '@/lib/ajuda/faq'
import { AjudaFaqForm } from '@/components/admin/ajuda-faq-form'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'

// AJUDA / FAQ — gestão do FAQ exibido na Ajuda do aluno, por tenant. Guardado em
// simulado_tenants.tema.ajuda_faq (sem migração). Gate por `configuracoes:manage` na action.

export const dynamic = 'force-dynamic'

export default async function AjudaFaqPage() {
  const tenant = await getCurrentTenant()
  const faq = lerAjudaFaq(tenant?.tema)

  return (
    <div className="w-full space-y-6">
      <CabecalhoArea
        titulo="Ajuda / FAQ"
        descricao="Perguntas e respostas exibidas na Ajuda do aluno. Organize por temas; em branco, usa o conteúdo padrão."
      />
      <AjudaFaqForm faqInicial={faq} />
    </div>
  )
}
