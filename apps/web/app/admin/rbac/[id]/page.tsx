import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// A área de Permissões virou uma aba dentro de Administradores.
export default async function RbacIdRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/admin/administradores/permissoes/${id}`)
}
