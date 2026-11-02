import { redirect } from 'next/navigation'

// Materiais abre na primeira sub-aba (Aulas).
export default function MateriaisPage() {
  redirect('/admin/conteudos/materiais/aulas')
}
