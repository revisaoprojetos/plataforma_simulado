import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ConcederAcessoForm } from '@/components/admin/conceder-acesso-form'
import { RevogarAcessoButton } from '@/components/admin/revogar-acesso-button'
import { Info } from 'lucide-react'

export async function SimuladoAcessos({ simuladoId, modoAplicacao }: { simuladoId: string; modoAplicacao?: string }) {
  const access = await getCurrentAccess()
  const svc = createAdminClient()

  const [{ data: estudantes }, { data: acessos }] = await Promise.all([
    svc.from('simulado_estudantes').select('id, nome').eq('tenant_id', access.tenantId ?? '').order('nome').limit(500),
    svc.from('simulado_acessos').select('id, estudante_id, expira_em, tentativas_permitidas, tentativas_usadas, liberado_em').eq('simulado_id', simuladoId).order('criado_em', { ascending: false }),
  ])

  const estMap = new Map((estudantes ?? []).map((e: any) => [e.id, e.nome]))
  const agora = Date.now()

  return (
    <div className="space-y-4">
      {modoAplicacao !== 'prazo_relativo' && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Este simulado não está no modo <strong>prazo relativo</strong>. Os acessos avulsos abaixo só são exigidos nesse modo — em outros modos servem como liberação extra opcional.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conceder acesso avulso (sob medida)</CardTitle>
        </CardHeader>
        <CardContent>
          <ConcederAcessoForm simuladoId={simuladoId} estudantes={(estudantes ?? []) as any} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acessos concedidos ({acessos?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!acessos || acessos.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum acesso avulso concedido.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Aluno</th>
                  <th className="px-4 py-2 text-left font-medium">Expira em</th>
                  <th className="px-4 py-2 text-center font-medium">Tentativas</th>
                  <th className="px-4 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {acessos.map((a: any) => {
                  const expirado = a.expira_em && new Date(a.expira_em).getTime() < agora
                  const esgotado = a.tentativas_usadas >= a.tentativas_permitidas
                  return (
                    <tr key={a.id} className="border-t">
                      <td className="px-4 py-2 font-medium">{estMap.get(a.estudante_id) ?? 'Aluno'}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {a.expira_em ? new Date(a.expira_em).toLocaleString('pt-BR') : '—'}
                        {expirado && <Badge variant="destructive" className="ml-2">expirado</Badge>}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {a.tentativas_usadas}/{a.tentativas_permitidas}
                        {esgotado && <Badge variant="secondary" className="ml-2">esgotado</Badge>}
                      </td>
                      <td className="px-4 py-2 text-right"><RevogarAcessoButton acessoId={a.id} simuladoId={simuladoId} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
