import { CalendarDays } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { cronogramasDoAluno } from '@/lib/cronograma/acesso'
import { Card } from '@/components/ui/card'
import { CronogramaClient } from './cronograma-client'

export const dynamic = 'force-dynamic'

export default async function CronogramaAlunoPage() {
  // O layout do portal já barra quem não tem sessão; repetimos porque a página lê
  // estudanteId e tenantId dela — e o tenant vem da SESSÃO, não do host (que falha
  // dentro de iframe).
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const svc = createAdminClient()

  // O módulo é ligado por tenant; enquanto estiver desligado, nem a tela aparece.
  const { data: cfg } = await svc
    .from('simulado_cronograma_config')
    .select('ativo')
    .eq('tenant_id', sessao.tenantId)
    .maybeSingle()

  const catalogo = (cfg as any)?.ativo ? await cronogramasDoAluno(svc, sessao.tenantId, sessao.estudanteId) : []

  return (
    <div className="animate-page space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CalendarDays className="h-6 w-6 text-primary" />
          Cronograma de estudos
        </h1>
        <p className="text-muted-foreground">
          Escolha um cronograma pronto, informe quando você começa, e nós montamos o calendário com as
          semanas de revisão e recesso que você quiser.
        </p>
      </div>

      {!catalogo.length ? (
        <Card className="px-4 py-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">Nenhum cronograma disponível para você</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {(cfg as any)?.ativo
              ? 'Os cronogramas são liberados pela equipe. Fale com o suporte para saber como ter acesso.'
              : 'Esta área ainda está sendo preparada. Volte em breve.'}
          </p>
        </Card>
      ) : (
        <CronogramaClient catalogo={catalogo} nomeAluno={sessao.nome ?? ''} />
      )}
    </div>
  )
}
