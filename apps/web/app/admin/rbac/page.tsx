import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// A área de Permissões virou uma aba dentro de Administradores.
export default async function RbacRedirect({ searchParams }: { searchParams: Promise<{ perfil?: string }> }) {
  const { perfil } = await searchParams
  redirect(perfil ? `/admin/administradores/permissoes?perfil=${perfil}` : '/admin/administradores/permissoes')
}
