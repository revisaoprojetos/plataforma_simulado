import { redirect } from 'next/navigation'

// Compat: "Simulados realizados" mora em /aluno/simulados. Links/URLs antigos para /aluno/realizados
// (ex.: down bar mobile) caíam em 404 — redireciona para a rota real.
export default function RealizadosRedirect() {
  redirect('/aluno/simulados')
}
