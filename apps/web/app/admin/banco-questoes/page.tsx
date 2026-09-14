import { redirect } from 'next/navigation'

// A área "Banco de Simulado" foi CONSOLIDADA dentro da "Aplicação de Simulado": todo o conteúdo
// (questões, personalização, caderno, HUD, grupos, estudantes) é editado nas abas do detalhe do
// simulado. A listagem de bancos deixou de existir como área — redireciona para a Aplicação.
// (As rotas de detalhe /admin/banco-questoes/[id]/* seguem vivas como editores internos, acessados
//  a partir das abas do simulado.)
export default function BancoQuestoesRedirect() {
  redirect('/admin/simulados')
}
