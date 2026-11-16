import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** A aba de acessos agora vive DENTRO do perfil (mantém cabeçalho e abas). Rota antiga só redireciona. */
export default async function AcessosAlunoRedirect({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  const sp = await searchParams
  const q = new URLSearchParams({ tab: 'acessos' })
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') q.set(k, v)
  redirect(`/admin/estudantes/${id}?${q.toString()}`)
}
