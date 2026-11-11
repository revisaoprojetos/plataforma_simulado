import { redirect } from 'next/navigation'

// O Cronograma Adaptativo é renderizado em /aluno/cronograma (shell interno, com título/marca
// como as demais páginas). Esta rota legada só redireciona para lá, mapeando ?novo para ?criar.
export default async function PainelCronogramaRedirect({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const sp = await searchParams
  redirect(sp?.novo === '1' ? '/aluno/cronograma?criar' : '/aluno/cronograma')
}
