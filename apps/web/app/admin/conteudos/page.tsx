import { redirect } from 'next/navigation'

// A área abre na primeira aba (Produtos).
export default function ConteudosPage() {
  redirect('/admin/conteudos/produtos')
}
