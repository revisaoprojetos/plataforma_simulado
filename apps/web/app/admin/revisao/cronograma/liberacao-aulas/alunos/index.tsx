import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { Nota, type QS } from '../../../_comp/lista'
import { carregarBase } from './dados-alunos'
import { AVISO_MIGRACAO } from './tipos-alunos'
import { VisaoAlunos } from './visao-alunos'
import { VisaoExcecoes } from './visao-excecoes'
import { VisaoLog } from './visao-log'

// Sub-abas "Alunos", "Exceções" e "Log" da Liberação de aulas (o shell ../index.tsx escolhe por ?vis=).
// Server component: só LÊ dados prontos (./dados-alunos + lib/produtos/liberacao-consulta-aluno).

type SP = Record<string, string | string[] | undefined>
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function AlunosExcecoesLog({ produtoId, vis, sp, basePath }: { produtoId: string; vis: 'alunos' | 'excecoes' | 'log'; sp: SP; basePath: string }) {
  const [pathname, queryBase = ''] = basePath.split('?')
  const qs: QS = {}
  for (const [k, v] of new URLSearchParams(queryBase)) qs[k] = v
  for (const [k, v] of Object.entries(sp)) { const s = um(v); if (s) qs[k] = s }
  qs.vis = vis
  if (!qs.produto) qs.produto = produtoId

  const [pode, podeEditar, access] = await Promise.all([checkPermission('cronogramas:view'), checkPermission('cronogramas:update'), getCurrentAccess()])
  if (!pode) return <SemPermissao>Você não tem permissão para ver o controle de liberação por aluno.</SemPermissao>
  if (!access.tenantId) return <Nota tipo="aviso">Tenant não resolvido.</Nota>

  const svc = createAdminClient()
  const base = await carregarBase(svc, access.tenantId, produtoId)
  if (!base.migradoPlanilha) return <Nota tipo="aviso">{AVISO_MIGRACAO} (liberação de aulas: 20261117010000).</Nota>

  const props = { svc, tenantId: access.tenantId, produtoId, base, qs, pathname, podeEditar: podeEditar && base.migradoTrilhas }
  return (
    <div className="w-full">
      {!base.migradoTrilhas && <Nota tipo="aviso">As tabelas de cronogramas de referência e exceções ainda não existem: aplique as migrações 20261117010000 e 20261118020000. Até lá só a data-base da planilha vale.</Nota>}
      {vis === 'alunos' ? <VisaoAlunos {...props} /> : vis === 'excecoes' ? <VisaoExcecoes {...props} /> : <VisaoLog {...props} />}
    </div>
  )
}
