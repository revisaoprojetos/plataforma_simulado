import { redirect } from 'next/navigation'

// Trilha DESATIVADA por ora — some do menu e a rota redireciona para a Início.
export default async function TrilhaAlunoPage() {
  redirect('/aluno')
}
