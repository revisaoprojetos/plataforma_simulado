import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { ProblemasAbas, ABAS, type AbaId } from '@/components/admin/problemas/abas'
import { VisaoGeral } from '@/components/admin/problemas/visao-geral'
import { MapaMental } from '@/components/admin/problemas/mapa-mental'
import { ProblemasLista } from '@/components/admin/problemas/lista'
import { HistoricoTabela } from '@/components/admin/problemas/historico-tabela'
import { listarProblemas, listarTodosProblemas, resumoProblemas, listarHistorico, MSG_MIGRACAO } from '@/lib/auditoria-problemas/dados'

export const dynamic = 'force-dynamic'

type SP = { aba?: string; page?: string; pp?: string; sort?: string; dir?: string; q?: string; area?: string; status?: string; prioridade?: string; prazo?: string; responsavel?: string }

/**
 * Auditoria › Problemas: versão interativa de docs/AUDITORIA-PROBLEMAS.md (por plataforma).
 * A página só LÊ dados prontos (KPIs agregados no banco, listas paginadas com .range()+count). Exige `problemas:view`.
 */
export default async function ProblemasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId || !accessCan(access, 'problemas:view')) {
    return <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">Sem permissão para ver a Auditoria de Problemas.</div>
  }
  const tenantId = access.tenantId
  const aba: AbaId = (ABAS.map((a) => a.id) as string[]).includes(sp.aba ?? '') ? (sp.aba as AbaId) : 'visao'
  const perms = { criar: accessCan(access, 'problemas:create'), editar: accessCan(access, 'problemas:update'), excluir: accessCan(access, 'problemas:delete') }
  const podeExportar = accessCan(access, 'problemas:export')

  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const pp = [10, 25, 50].includes(Number(sp.pp)) ? Number(sp.pp) : 25
  const filtros = { q: sp.q, area: sp.area, status: sp.status, prioridade: sp.prioridade, prazo: sp.prazo, responsavel: sp.responsavel }

  let migrado = true
  let corpo: React.ReactNode = null
  if (aba === 'visao') {
    const r = await resumoProblemas(tenantId)
    migrado = r.migrado
    corpo = migrado && <VisaoGeral r={r.resumo} />
  } else if (aba === 'mapa') {
    const r = await listarTodosProblemas(tenantId)
    migrado = r.migrado
    corpo = migrado && <MapaMental problemas={r.linhas} perms={perms} podeExportar={podeExportar} />
  } else if (aba === 'lista') {
    const r = await listarProblemas(tenantId, filtros, { page, pp, sort: sp.sort, dir: sp.dir === 'asc' ? 'asc' : 'desc' })
    migrado = r.migrado
    corpo = migrado && <ProblemasLista rows={r.linhas} total={r.total} perms={perms} podeExportar={podeExportar} />
  } else {
    const r = await listarHistorico(tenantId, { page, pp })
    migrado = r.migrado
    corpo = migrado && <HistoricoTabela rows={r.linhas} total={r.total} />
  }

  return (
    <div className="space-y-5">
      <EstudioHeader eyebrow="Auditoria" titulo="Problemas" semAbas />
      <ProblemasAbas ativa={aba} />
      {!migrado ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">{MSG_MIGRACAO}</div>
      ) : corpo}
    </div>
  )
}
