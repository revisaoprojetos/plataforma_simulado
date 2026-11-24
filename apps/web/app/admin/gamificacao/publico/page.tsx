import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { PublicoGamificacaoForm } from '../forms/publico-gamificacao-form'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Gerenciador de gamificação' }

export default async function PublicoGamificacaoPage() {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('gamificacao:view'))) {
    return (
      <div className="space-y-4">
        <CabecalhoArea titulo="Público da gamificação" />
        <SemPermissao>Sem permissão para acessar a gamificação.</SemPermissao>
      </div>
    )
  }
  const podeGerenciar = access.isAdmin || access.permissions.includes('gamificacao:manage')

  return (
    <div className="space-y-6">
      <CabecalhoArea
        titulo="Gerenciador de gamificação"
        descricao="Libere para todos os alunos ou selecione grupos e alunos específicos."
        acoes={
          <Link href="/admin/gamificacao?tab=regras" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar à gamificação
          </Link>
        }
      />

      <PublicoGamificacaoForm podeGerenciar={podeGerenciar} />
    </div>
  )
}
