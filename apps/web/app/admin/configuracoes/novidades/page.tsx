import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { listarNovidadesAdmin } from '@/lib/novidades/novidades'
import { Newspaper } from 'lucide-react'
import { NovidadesClient, type NovidadeAdmin } from './novidades-client'

// NOVIDADES ("O que mudou") — gestão do changelog/anúncios por tenant (admin). Consome a lib pronta
// (listarNovidadesAdmin). Tolerante à migração 20261028000000 ainda não aplicada: lista vazia + aviso
// discreto, sem quebrar a tela. Mutações no client via server actions (actions.ts) com guard + audit.

export const dynamic = 'force-dynamic'

export default async function NovidadesPage() {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('configuracoes:view')
  if (!pode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Novidades</h1>
        <SemPermissao>Você não tem permissão para gerenciar as novidades.</SemPermissao>
      </div>
    )
  }

  const podeEditar = access.isAdmin || access.permissions.includes('configuracoes:manage')

  const svc = createAdminClient()
  const tid = access.tenantId ?? ''
  let itens: NovidadeAdmin[] = []
  let aviso: string | undefined
  try {
    itens = tid ? await listarNovidadesAdmin(svc, tid) : []
  } catch (e: any) {
    if (/relation .* does not exist|could not find the table|schema cache|does not exist/i.test(e?.message || '')) {
      aviso = 'As novidades ficam disponíveis após a migração 20261028000000 ser aplicada.'
    } else {
      aviso = 'Não foi possível carregar as novidades agora. Tente novamente em instantes.'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Newspaper className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Novidades</h1>
          <p className="text-muted-foreground">Changelog &quot;O que mudou&quot; exibido no início do aluno. Categoria, destaque com capa e até 2 botões (CTAs).</p>
        </div>
      </div>
      <NovidadesClient itens={itens} aviso={aviso} podeEditar={podeEditar} />
    </div>
  )
}
