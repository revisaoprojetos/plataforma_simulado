import { redirect } from 'next/navigation'
import { R } from '@/lib/nova/rotas'

// A lista antiga de cadernos foi substituída por "Meus Cadernos" do portal novo (cadernos reais + caderno
// de erros + anotações/grifos/salvos). Links e favoritos antigos caem lá. O detalhe /aluno/cadernos/[id]
// continua sendo a tela de cada caderno.
export default function AlunoCadernosPage() {
  redirect(R.cadernos)
}
