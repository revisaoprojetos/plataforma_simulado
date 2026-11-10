import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { VideosClient } from './videos-client'

export const dynamic = 'force-dynamic'

// ESTÚDIO · VÍDEOS (gerenciador de vídeo próprio). A página só valida o acesso; a listagem é
// server-driven pela rota GET /api/admin/video (busca/filtro/ordenação/paginação no servidor)
// e o <DataTable> muda os searchParams. Nenhum cálculo no front.
export default async function VideosPage() {
  const access = await getCurrentAccess()
  const podeVer = access.isAdmin || access.permissions.includes('video:view') || access.permissions.includes('video:manage')
  if (!podeVer) return <SemAcessoArea />
  const podeGerir = access.isAdmin || access.permissions.includes('video:manage')
  return <VideosClient podeGerir={podeGerir} />
}
