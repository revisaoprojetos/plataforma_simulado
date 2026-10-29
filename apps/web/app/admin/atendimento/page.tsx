import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { listarDuvidasAdmin } from '@/lib/duvidas/duvidas'
import type { Duvida, StatusDuvida } from '@/lib/duvidas/tipos'
import { listarRequerimentosAdmin } from '@/lib/requerimentos/requerimentos'
import type { Requerimento, StatusRequerimento } from '@/lib/requerimentos/tipos'
import { listarReportesAdmin, listarAvaliacoesBaixas, resumoAvaliacoesPorMaterial } from '@/lib/demandas/demandas'
import type { Reporte, Avaliacao, StatusReporte } from '@/lib/demandas/tipos'
import { AtendimentoClient, type DuvidaRow, type RequerimentoRow, type ReporteRow, type AvaliacaoRow } from './atendimento-client'

// Fila de ATENDIMENTO (Dúvidas + Requerimentos + Demandas). Consome as libs prontas (filtro de status NO
// BANCO), enriquece com o nome do aluno (como /admin/feedbacks faz) e, nas Demandas, o título do material;
// entrega ao client. Tolerante às migrações 20261027010000 (dúvidas/requerimentos) e 20261027020000
// (demandas) ainda não aplicadas: lista vazia + aviso discreto, sem quebrar.

export const dynamic = 'force-dynamic'

type Tab = 'duvidas' | 'requerimentos' | 'demandas'

/** Resolve nome/e-mail dos alunos de um conjunto de ids (1 consulta). */
async function mapaEstudantes(svc: ReturnType<typeof createAdminClient>, tenantId: string, ids: string[]) {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (!unicos.length) return new Map<string, { nome: string; email: string | null }>()
  const { data } = await svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', tenantId).in('id', unicos)
  return new Map((data ?? []).map((e: any) => [e.id, { nome: e.nome ?? 'Aluno', email: e.email ?? null }]))
}

/** Resolve o título dos materiais (documentos de conteúdo) de um conjunto de ids (1 consulta). */
async function mapaMateriais(svc: ReturnType<typeof createAdminClient>, tenantId: string, ids: string[]) {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (!unicos.length) return new Map<string, string>()
  const { data } = await svc.from('simulado_conteudo_documentos').select('id, titulo').eq('tenant_id', tenantId).in('id', unicos)
  return new Map((data ?? []).map((d: any) => [d.id, (d.titulo as string) ?? 'Material']))
}

export default async function AtendimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string }>
}) {
  const sp = await searchParams
  const tab: Tab = sp.tab === 'requerimentos' ? 'requerimentos' : sp.tab === 'demandas' ? 'demandas' : 'duvidas'
  const statusFiltro = sp.status || ''

  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('estudantes:view')
  if (!pode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Atendimento</h1>
        <SemPermissao>Você não tem permissão para acessar o atendimento.</SemPermissao>
      </div>
    )
  }

  const tenantId = access.tenantId ?? ''
  const svc = createAdminClient()
  const podeResponder = access.isAdmin || access.permissions.includes('estudantes:update')

  let duvidas: DuvidaRow[] = []
  let requerimentos: RequerimentoRow[] = []
  let reportes: ReporteRow[] = []
  let avaliacoesBaixas: AvaliacaoRow[] = []
  let aviso: string | undefined

  try {
    if (tab === 'duvidas') {
      const st = (['aberta', 'respondida', 'resolvida'] as StatusDuvida[]).includes(statusFiltro as StatusDuvida)
        ? (statusFiltro as StatusDuvida) : undefined
      const rows: Duvida[] = await listarDuvidasAdmin(svc, tenantId, { status: st })
      const nomes = await mapaEstudantes(svc, tenantId, rows.map((d) => d.estudante_id))
      duvidas = rows.map((d) => ({
        ...d,
        estudante_nome: nomes.get(d.estudante_id)?.nome ?? 'Aluno',
        estudante_email: nomes.get(d.estudante_id)?.email ?? null,
      }))
    } else if (tab === 'requerimentos') {
      const st = (['em_analise', 'concluido', 'indeferido'] as StatusRequerimento[]).includes(statusFiltro as StatusRequerimento)
        ? (statusFiltro as StatusRequerimento) : undefined
      const rows: Requerimento[] = await listarRequerimentosAdmin(svc, tenantId, { status: st })
      const nomes = await mapaEstudantes(svc, tenantId, rows.map((r) => r.estudante_id))
      requerimentos = rows.map((r) => ({
        ...r,
        estudante_nome: nomes.get(r.estudante_id)?.nome ?? 'Aluno',
        estudante_email: nomes.get(r.estudante_id)?.email ?? null,
      }))
    } else {
      const st = (['aberto', 'em_analise', 'resolvido'] as StatusReporte[]).includes(statusFiltro as StatusReporte)
        ? (statusFiltro as StatusReporte) : undefined
      const [reps, avas] = await Promise.all([
        listarReportesAdmin(svc, tenantId, { status: st }),
        listarAvaliacoesBaixas(svc, tenantId),
      ])
      const resumo = await resumoAvaliacoesPorMaterial(svc, tenantId)
      const estIds = [...reps.map((r) => r.estudante_id), ...avas.map((a) => a.estudante_id)]
      const docIds = [...reps.map((r) => r.documento_id), ...avas.map((a) => a.documento_id)]
      const nomes = await mapaEstudantes(svc, tenantId, estIds)
      const materiais = await mapaMateriais(svc, tenantId, docIds)
      const enriquecer = (estudante_id: string, documento_id: string) => ({
        estudante_nome: nomes.get(estudante_id)?.nome ?? 'Aluno',
        estudante_email: nomes.get(estudante_id)?.email ?? null,
        material_titulo: materiais.get(documento_id) ?? 'Material',
      })
      reportes = reps.map((r: Reporte) => ({ ...r, ...enriquecer(r.estudante_id, r.documento_id) }))
      avaliacoesBaixas = avas.map((a: Avaliacao) => ({
        ...a,
        ...enriquecer(a.estudante_id, a.documento_id),
        material_media: resumo.get(a.documento_id)?.media ?? null,
        material_total: resumo.get(a.documento_id)?.total ?? null,
      }))
    }
  } catch (e: any) {
    const msg: string = e?.message || ''
    if (/relation .* does not exist|could not find the table|schema cache|does not exist/i.test(msg)) {
      aviso = tab === 'demandas'
        ? 'Demandas (reportes e avaliações) ficam disponíveis após a migração 20261027020000 ser aplicada.'
        : 'Dúvidas e requerimentos ficam disponíveis após a migração 20261027010000 ser aplicada.'
    } else {
      aviso = 'Não foi possível carregar a fila agora. Tente novamente em instantes.'
    }
  }

  return (
    <AtendimentoClient
      tab={tab}
      statusFiltro={statusFiltro}
      duvidas={duvidas}
      requerimentos={requerimentos}
      reportes={reportes}
      avaliacoesBaixas={avaliacoesBaixas}
      podeResponder={podeResponder}
      aviso={aviso}
    />
  )
}
