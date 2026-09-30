import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ConcederAcessoForm } from '@/components/admin/conceder-acesso-form'
import { RevogarAcessoButton } from '@/components/admin/revogar-acesso-button'
import { SimuladoTestadores } from '@/components/admin/simulado-testadores'
import { listarTestadores } from '@/app/admin/simulados/actions'
import { Info, FlaskConical, Users } from 'lucide-react'

export async function SimuladoAcessos({ simuladoId, modoAplicacao }: { simuladoId: string; modoAplicacao?: string }) {
  const access = await getCurrentAccess()
  const svc = createAdminClient()
  const tid = access.tenantId ?? '00000000-0000-0000-0000-000000000000'

  const MAX_MAT = 5000 // teto de segurança da listagem (simulados com dezenas de milhares só mostram o topo + contagem)
  const [{ data: estudantes }, { data: acessos }, { data: mats, count: matCount }, { data: sim }] = await Promise.all([
    svc.from('simulado_estudantes').select('id, nome').eq('tenant_id', tid).order('nome').limit(500),
    svc.from('simulado_acessos').select('id, estudante_id, expira_em, tentativas_permitidas, tentativas_usadas, liberado_em').eq('simulado_id', simuladoId).order('criado_em', { ascending: false }),
    svc.from('simulado_matriculas').select('estudante_id, liberado', { count: 'exact' }).eq('simulado_id', simuladoId).eq('tenant_id', tid).order('estudante_id').limit(MAX_MAT),
    svc.from('simulado_simulados').select('regras').eq('id', simuladoId).maybeSingle(),
  ])
  const acessoGratuito = !!((sim as any)?.regras?.acesso_gratuito)
  const agora = Date.now()
  const testadores = (await listarTestadores(simuladoId)).testadores ?? []

  // Unifica TODAS as vias de acesso do simulado (matrícula + avulso) por aluno, com badges de via.
  type LinhaAcesso = { estudanteId: string; vias: string[]; avulso?: any }
  const porAluno = new Map<string, LinhaAcesso>()
  for (const m of (mats ?? []) as any[]) {
    if (m.liberado === false) continue
    const l: LinhaAcesso = porAluno.get(m.estudante_id) ?? { estudanteId: m.estudante_id, vias: [] }
    if (!l.vias.includes('matrícula')) l.vias.push('matrícula')
    porAluno.set(m.estudante_id, l)
  }
  for (const a of (acessos ?? []) as any[]) {
    const l: LinhaAcesso = porAluno.get(a.estudante_id) ?? { estudanteId: a.estudante_id, vias: [] }
    if (!l.vias.includes('avulso')) l.vias.push('avulso')
    l.avulso = a
    porAluno.set(a.estudante_id, l)
  }
  const idsAcesso = [...porAluno.keys()]
  // Nomes dos que têm acesso (podem passar dos 500 do fetch p/ os formulários) — busca focada por id.
  const nomesExtra = idsAcesso.length ? await fetchAllByIn<{ id: string; nome: string }>(idsAcesso, (chunk) => svc.from('simulado_estudantes').select('id, nome').in('id', chunk)) : []
  const estMap = new Map([...((estudantes ?? []) as any[]), ...nomesExtra].map((e: any) => [e.id, e.nome]))
  const linhasAcesso = [...porAluno.values()].sort((a, b) => (estMap.get(a.estudanteId) ?? '').localeCompare(estMap.get(b.estudanteId) ?? '', 'pt-BR'))

  return (
    <div className="space-y-4">
      {/* Acesso de teste (admin/testador): fazer o simulado mesmo fora da janela, sem contar em stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><FlaskConical className="h-4 w-4 text-amber-500" /> Acesso de teste (admin/testador)</CardTitle>
        </CardHeader>
        <CardContent>
          <SimuladoTestadores simuladoId={simuladoId} estudantes={(estudantes ?? []) as any} testadores={testadores} />
        </CardContent>
      </Card>

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

      {acessoGratuito && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
          <Users className="mt-0.5 h-4 w-4 shrink-0" />
          <span><strong>Acesso gratuito ligado</strong> — todos os alunos da plataforma podem fazer este simulado, além dos listados abaixo.</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alunos com acesso ({(matCount ?? linhasAcesso.length).toLocaleString('pt-BR')}{(matCount ?? 0) > MAX_MAT ? ` · mostrando ${linhasAcesso.length}` : ''})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {linhasAcesso.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{acessoGratuito ? 'Ninguém com acesso específico — todos entram pelo acesso gratuito.' : 'Nenhum aluno com acesso ainda (matrícula ou avulso).'}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Aluno</th>
                  <th className="px-4 py-2 text-left font-medium">Via</th>
                  <th className="px-4 py-2 text-left font-medium">Expira em</th>
                  <th className="px-4 py-2 text-center font-medium">Tentativas</th>
                  <th className="px-4 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {linhasAcesso.map((l) => {
                  const a = l.avulso
                  const expirado = a?.expira_em && new Date(a.expira_em).getTime() < agora
                  const esgotado = a && a.tentativas_usadas >= a.tentativas_permitidas
                  return (
                    <tr key={l.estudanteId} className="border-t">
                      <td className="px-4 py-2 font-medium">{estMap.get(l.estudanteId) ?? 'Aluno'}</td>
                      <td className="px-4 py-2">
                        <span className="flex flex-wrap gap-1">
                          {l.vias.map((v) => <Badge key={v} variant={v === 'matrícula' ? 'secondary' : 'default'} className="capitalize">{v}</Badge>)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {a?.expira_em ? new Date(a.expira_em).toLocaleString('pt-BR') : '—'}
                        {expirado && <Badge variant="destructive" className="ml-2">expirado</Badge>}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {a ? <>{a.tentativas_usadas}/{a.tentativas_permitidas}{esgotado && <Badge variant="secondary" className="ml-2">esgotado</Badge>}</> : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">{a && <RevogarAcessoButton acessoId={a.id} simuladoId={simuladoId} />}</td>
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
