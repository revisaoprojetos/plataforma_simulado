import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, type Access } from '@/lib/auth/permissions'
import { verificarRenderToken } from '@/lib/pdf/render-token'
import { RelatorioPrint } from '@/components/admin/relatorios/relatorio-print'
import { montarRelatorioSimulado } from '@/app/admin/relatorios/simulados/_dados'
import { RelatorioSimuladoView } from '@/app/admin/relatorios/simulados/relatorio-simulado-view'
import { montarRelatorioDisciplina } from '@/app/admin/relatorios/disciplinas/_dados'
import { RelatorioDisciplinaView } from '@/app/admin/relatorios/disciplinas/relatorio-disciplina-view'
import { montarRelatorioEstudante } from '@/app/admin/relatorios/estudantes/_dados'
import { RelatorioEstudanteView } from '@/app/admin/relatorios/estudantes/relatorio-estudante-view'
import { montarRelatorioGrafico } from '@/app/admin/relatorios/graficos/_dados'
import { RelatorioGraficoView } from '@/app/admin/relatorios/graficos/relatorio-grafico-view'

const TIPOS = ['simulado', 'disciplina', 'estudante', 'grafico'] as const
type Tipo = (typeof TIPOS)[number]

export default async function ImprimirRelatorioPage({
  params, searchParams,
}: {
  params: Promise<{ tipo: string; ref: string }>
  searchParams: Promise<{ pdftoken?: string }>
}) {
  const { tipo, ref } = await params
  const { pdftoken } = await searchParams
  if (!TIPOS.includes(tipo as Tipo)) notFound()

  // Acesso: cookie do admin OU token de render assinado (Gotenberg), escopado a este relatório.
  let access: Access
  const payload = verificarRenderToken(pdftoken)
  if (payload && payload.r === `rel-${tipo}` && payload.id === ref) {
    access = { userId: null, tenantId: payload.t, role: 'render', isAdmin: true, permissions: ['*'] }
  } else {
    access = await getCurrentAccess()
    if (!access.isAdmin && !access.permissions.includes('questoes:view')) notFound()
  }
  const tenantId = access.tenantId ?? '00000000-0000-0000-0000-000000000000'
  const svc = createAdminClient()

  // Marca do tenant (logo + cor primária).
  const { data: tenant } = await svc.from('simulado_tenants').select('nome, tema').eq('id', tenantId).maybeSingle()
  const tema = ((tenant as any)?.tema ?? {}) as { logo_url?: string; cor_primaria?: string; cores?: { primaria?: string } }
  const cor = tema.cores?.primaria || tema.cor_primaria || '#6d28d9'
  const logo = tema.logo_url || null
  const tenantNome = (tenant as any)?.nome ?? ''

  let content: React.ReactNode
  let titulo: string
  let subtitulo: string

  if (tipo === 'simulado') {
    const d = await montarRelatorioSimulado(svc, ref, tenantId)
    if (!d) notFound()
    titulo = d.titulo; subtitulo = 'Relatório por Simulado'
    content = <RelatorioSimuladoView d={d} print />
  } else if (tipo === 'disciplina') {
    const d = await montarRelatorioDisciplina(svc, ref, tenantId)
    if (!d) notFound()
    titulo = d.nome; subtitulo = 'Relatório por Disciplina'
    content = <RelatorioDisciplinaView d={d} print />
  } else if (tipo === 'estudante') {
    const d = await montarRelatorioEstudante(svc, ref, tenantId)
    if (!d) notFound()
    titulo = d.nome; subtitulo = 'Relatório por Estudante'
    content = <RelatorioEstudanteView d={d} print />
  } else {
    const d = await montarRelatorioGrafico(svc, tenantId)
    titulo = 'Visão geral da plataforma'; subtitulo = 'Relatório Gráfico'
    content = <RelatorioGraficoView d={d} print />
  }

  return (
    <RelatorioPrint cor={cor} logo={logo} tenantNome={tenantNome} titulo={titulo} subtitulo={subtitulo}>
      {content}
    </RelatorioPrint>
  )
}
