import { redirect } from 'next/navigation'

// Rota ÓRFÃ (singular): nenhuma aba/link a referencia; a tela vigente de conteúdos é /admin/cronogramas/conteudos
// (Banco de Conteúdos), também alcançável por ?aba=gerador&sub=conteudos em /admin/revisao/cronograma.
// O editor antigo (conteudo-client.tsx) ficou sem uso; mantido no repositório só como referência.
export default function ConteudoSingularPage() {
  redirect('/admin/cronogramas/conteudos')
}
