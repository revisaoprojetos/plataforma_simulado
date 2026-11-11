import Link from 'next/link'
import { History } from 'lucide-react'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao, AlertBox } from '@/components/ui/alert-box'
import { RevisaoHead } from '@/components/admin/revisao/ui'
import { carregarEquipe } from '@/lib/admin/revisao/equipe'
import { RR } from '@/lib/admin/revisao/rotas'
import { EquipeClient } from './equipe-client'

export const dynamic = 'force-dynamic'

export default async function EquipeRevisaoPage() {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || accessCan(access, 'rbac:view'))) return <SemPermissao>Você não tem permissão para ver as permissões da equipe.</SemPermissao>
  const dados = await carregarEquipe(access.tenantId ?? '00000000-0000-0000-0000-000000000000', access.userId)

  return (
    <div>
      <RevisaoHead secao="Configurar" titulo="Permissões da equipe"
        subtitulo="O que cada papel pode ver ou editar no admin, e quem da equipe tem cada papel. Toda alteração fica registrada no histórico." />
      {dados.indisponivel
        ? <AlertBox variante="aviso">Não foi possível carregar os papéis agora (tabelas de RBAC indisponíveis). Tente novamente.</AlertBox>
        : (
          <div className="space-y-4">
            <EquipeClient dados={dados} podeGerenciar={accessCan(access, 'rbac:manage')} />
            <section className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><History className="h-4 w-4" /></span>
                  <div><h2 className="text-sm font-semibold">Histórico de alterações</h2><p className="text-[11px] text-muted-foreground">Últimas ações no admin</p></div>
                </div>
                <Link href={RR.auditoria} className="inline-flex h-8 items-center rounded-[10px] border bg-background px-3 text-[13px] font-medium transition hover:bg-muted">Ver auditoria completa</Link>
              </div>
              <div className="space-y-2 p-4">
                {dados.historico.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>}
                {dados.historico.map((h) => (
                  <div key={h.id} className="flex items-stretch gap-3 rounded-xl border bg-background">
                    <span className="w-1.5 rounded-l-xl bg-primary" />
                    <span className="py-2.5 pr-3"><b className="block text-sm">{h.texto}</b><small className="text-xs text-muted-foreground">{h.quando} · {h.ator}</small></span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
    </div>
  )
}
