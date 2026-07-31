import { redirect } from 'next/navigation'

/**
 * A área "Simulados" foi absorvida pela Início (pastas + recentes). Esta rota agora
 * só redireciona para a home, preservando ?pasta=id (link de pasta antigo continua válido).
 */
export default async function SimuladoRedirect({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta } = await searchParams
  redirect(pasta ? `/aluno?pasta=${pasta}` : '/aluno')
}
