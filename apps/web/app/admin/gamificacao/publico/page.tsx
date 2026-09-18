import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { PublicoGamificacaoForm } from '../forms/publico-gamificacao-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Gerenciador de gamificação' }

export default async function PublicoGamificacaoPage() {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('gamificacao:view'))) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Público da gamificação</h1>
        <SemPermissao>Sem permissão para acessar a gamificação.</SemPermissao>
      </div>
    )
  }
  const podeGerenciar = access.isAdmin || access.permissions.includes('gamificacao:manage')

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/gamificacao?tab=regras" className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar à gamificação
        </Link>
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-5 w-5" /></span>
          <h1 className="text-2xl font-bold tracking-tight">Gerenciador de gamificação</h1>
        </div>
        <p className="text-sm text-muted-foreground">Libere para todos os alunos ou selecione grupos e alunos específicos.</p>
      </div>

      <PublicoGamificacaoForm podeGerenciar={podeGerenciar} />
    </div>
  )
}
