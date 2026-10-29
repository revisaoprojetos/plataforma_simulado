import { redirect } from 'next/navigation'
import { R } from '@/lib/nova/rotas'

// /aluno/nova (raiz) não tem tela própria — a nova área começa em /aluno/nova/inicio.
export default function NovaRaizPage() {
  redirect(R.inicio)
}
