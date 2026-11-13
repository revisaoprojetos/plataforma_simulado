import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { rotuloAparelho } from '@/lib/acessos/user-agent'
import {
  resumoAluno, listarSessoesAluno, listarAtividadesAluno, duracaoMin, fmtDuracao, statusSessao,
  ROTULO_METODO, ROTULO_ORIGEM, ROTULO_ATIVIDADE, METODOS, TIPOS_ATIVIDADE, PERIODOS, MSG_NAO_ATIVADO,
} from '@/lib/acessos/leitura'
import { CartoesResumo, BlocoAlertas, AvisoNaoAtivado, AbasLinks } from '@/components/admin/acessos/blocos'
import { AcessosFiltros } from '@/components/admin/acessos/acessos-filtros'
import { EncerrarSessoesButton } from '@/components/admin/acessos/encerrar-sessoes-button'
import { SessoesAlunoTable, AtividadesAlunoTable, type SessaoLinha, type AtividadeLinha } from '@/components/admin/acessos/tabelas'

export const dynamic = 'force-dynamic'

type SP = { aba?: string; page?: string; pp?: string; sort?: string; dir?: string; q?: string; periodo?: string; metodo?: string; tipo?: string }

export default async function AcessosAlunoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params
  const sp = await searchParams
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId || !accessCan(access, 'acessos:view')) {
    return <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">Sem permissão para ver o registro de acessos de alunos.</div>
  }
  const tenantId = access.tenantId
  const { data: est } = await createAdminClient().from('simulado_estudantes').select('id, nome, email').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!est) notFound()
  const nome = (est.nome as string | null) ?? 'Aluno'

  const aba = sp.aba === 'atividade' ? 'atividade' : 'sessoes'
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const pp = [10, 25, 50].includes(Number(sp.pp)) ? Number(sp.pp) : (aba === 'atividade' ? 25 : 10)
  const dir = sp.dir === 'asc' ? 'asc' : 'desc'
  const q = (sp.q ?? '').trim().slice(0, 80)
  const podeExportar = accessCan(access, 'acessos:export')
  const podeEncerrar = accessCan(access, 'acessos:manage')

  const { indisponivel, resumo } = await resumoAluno(tenantId, id)
  const agora = Date.now()
  const base = `/admin/estudantes/${id}/acessos`

  const acoes = (
    <>
      <Link href={`/admin/estudantes/${id}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}><ArrowLeft className="h-4 w-4" />Voltar ao perfil</Link>
      {podeExportar && !indisponivel && (
        <a href={`/api/admin/acessos/exportar?estudante=${id}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}><Download className="h-4 w-4" />Exportar CSV</a>
      )}
      {podeEncerrar && !indisponivel && <EncerrarSessoesButton estudanteId={id} nome={nome} />}
    </>
  )

  if (indisponivel || !resumo) {
    return (
      <div className="space-y-6">
        <EstudioHeader eyebrow="Segurança" titulo={`Acessos · ${nome}`} acoes={acoes} semAbas />
        <AvisoNaoAtivado msg={MSG_NAO_ATIVADO} />
      </div>
    )
  }

  let tabela: React.ReactNode
  if (aba === 'sessoes') {
    const r = await listarSessoesAluno(tenantId, id, { page, pp, sort: sp.sort ?? 'iniciado_em', dir, q, periodo: sp.periodo, metodo: sp.metodo })
    const rows: SessaoLinha[] = r.rows.map((a) => ({
      id: a.id, estudanteId: a.estudante_id, inicio: formatBrt(a.iniciado_em) ?? '—', visto: formatBrt(a.ultimo_visto_em) ?? '—',
      duracao: fmtDuracao(duracaoMin(a)), ip: a.ip, aparelho: rotuloAparelho(a), metodo: ROTULO_METODO[a.metodo] ?? a.metodo,
      origem: ROTULO_ORIGEM[a.origem] ?? a.origem, status: statusSessao(a, agora), motivo: a.motivo_encerramento, impersonado: !!a.impersonado_por,
    }))
    tabela = (
      <SessoesAlunoTable rows={rows} total={r.total} filtros={
        <AcessosFiltros selects={[
          { param: 'periodo', label: 'Período', padrao: '180d', opcoes: Object.entries(PERIODOS).map(([value, v]) => ({ value, label: v.label })) },
          { param: 'metodo', label: 'Método', opcoes: [{ value: '', label: 'Todos' }, ...METODOS.map((m) => ({ value: m, label: ROTULO_METODO[m] }))] },
        ]} />
      } />
    )
  } else {
    const r = await listarAtividadesAluno(tenantId, id, { page, pp, sort: sp.sort ?? 'criado_em', dir, q, periodo: sp.periodo, tipo: sp.tipo })
    const rows: AtividadeLinha[] = r.rows.map((a) => {
      const m = (a.meta ?? {}) as Record<string, unknown>
      const det: string[] = []
      if (m.qtd && Number(m.qtd) > 1) det.push(`${m.qtd} no lote (${m.janela_seg ?? 0}s)`)
      if (m.origem) det.push(m.origem === 'pdf' ? 'PDF' : 'texto')
      if (m.pct != null) det.push(`${m.pct}%`)
      if (m.acertos != null) det.push(`${m.acertos}/${m.total}`)
      if (m.rajada) det.push(`rajada: ${m.rajada_max_10s} em 10s`)
      if (m.teste) det.push('teste')
      return {
        id: a.id, quando: formatBrt(a.criado_em) ?? '—', tipo: a.tipo, tipoRotulo: ROTULO_ATIVIDADE[a.tipo] ?? a.tipo,
        item: a.itemTitulo ?? a.ref_id ?? '—', detalhe: det.join(' · ') || '—', ip: a.ip, impersonado: !!m.impersonado_por, rajada: m.rajada === true,
      }
    })
    tabela = (
      <AtividadesAlunoTable rows={rows} total={r.total} filtros={
        <AcessosFiltros selects={[
          { param: 'periodo', label: 'Período', padrao: '30d', opcoes: Object.entries(PERIODOS).map(([value, v]) => ({ value, label: v.label })) },
          { param: 'tipo', label: 'Tipo', opcoes: [{ value: '', label: 'Todos' }, ...TIPOS_ATIVIDADE.map((t) => ({ value: t, label: ROTULO_ATIVIDADE[t] }))] },
        ]} />
      } />
    )
  }

  return (
    <div className="space-y-6">
      <EstudioHeader eyebrow="Segurança" titulo={`Acessos · ${nome}`} acoes={acoes} semAbas />
      <CartoesResumo itens={[
        { label: 'Último acesso', valor: <span className="text-base">{formatBrt(resumo.ultimoAcesso) ?? 'sem registro'}</span> },
        { label: 'Sessões (7 dias)', valor: resumo.sessoes7d },
        { label: 'Sessões (30 dias)', valor: resumo.sessoes30d },
        { label: 'IPs distintos (30d)', valor: resumo.ipsDistintos30d },
        { label: 'Aparelhos distintos (30d)', valor: resumo.aparelhosDistintos30d },
        { label: 'Tempo estimado (30d)', valor: <span className="text-xl">{fmtDuracao(resumo.tempoTotalMin30d)}</span>, dica: 'Soma de (último visto − início) por sessão; estimativa.' },
      ]} />
      <BlocoAlertas alertas={resumo.alertas} />
      <AbasLinks itens={[
        { label: 'Sessões', href: base, ativo: aba === 'sessoes' },
        { label: 'Atividade', href: `${base}?aba=atividade`, ativo: aba === 'atividade' },
      ]} />
      {tabela}
    </div>
  )
}
