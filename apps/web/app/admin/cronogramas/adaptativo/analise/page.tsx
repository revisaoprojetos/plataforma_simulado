import Link from 'next/link'
import { Download } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { AdaptativoTabs } from '@/components/admin/adaptativo-tabs'
import { BarraBusca, KpiCard, KpiGrid, Nota, ParamsInt, ThFixo, ThOrd, hrefCom, type QS } from '@/app/admin/revisao/_comp/lista'
import { TabelaCron, type LinhaCron } from '@/app/admin/revisao/cronograma/tabela-cron'
import { listarGruposFiltro } from '@/lib/admin/revisao/relatorios'
import { dataBr } from '@/lib/admin/revisao/datas'
import {
  PERIODOS_AN, SECOES, carregarOpcoes, carregarResumo, consultarVisao, formatarValor, normalizarFiltro, periodoParaDatas, secaoDe, visaoDe, type ColAn,
} from '@/lib/cronograma/adaptativo/analise'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — ANÁLISE DE USO (geração, configuração dos alunos, progresso, atraso real, desempenho, tempo e material).
// Backend-first: a página só LÊ o que as RPCs devolvem (migração 20261119030000), com cache curto; nada é calculado aqui.
const BASE = '/admin/cronogramas/adaptativo/analise'
const TIPOS = [{ v: 'pf', l: 'PDFull' }, { v: 'pp', l: 'PDFull (parte)' }, { v: 'fl', l: 'PDFlash' }, { v: 'qu', l: 'Questões' }, { v: 'lp', l: 'LegProc' }, { v: 'rf', l: 'Revisão PDFlash' }, { v: 'rq', l: 'Revisão Questões' }, { v: 'jp', l: 'Jurisprudência' }]
const DIAS_PARADO = [15, 30, 60, 90]
const nf = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('pt-BR')
const dia = (iso: string | null) => (iso ? dataBr(new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10)) : null)

function Abas({ itens, atual, nivel }: { itens: Array<{ id: string; rotulo: string; href: string }>; atual: string; nivel: 1 | 2 }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1 overflow-x-auto', nivel === 1 ? 'border-b' : 'mb-3 border-b')}>
      {itens.map((t) => (
        <Link key={t.id} href={t.href}
          className={cn('relative flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 font-medium transition', nivel === 1 ? 'text-sm' : 'text-[13px]',
            t.id === atual ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {t.rotulo}
        </Link>
      ))}
    </div>
  )
}

export default async function AnaliseUsoAdaptativoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acesso = await getCurrentAccess()
  const permitido = acesso.isAdmin || acesso.permissions.includes('*') || acesso.permissions.includes('cronogramas:view')
  if (!acesso.tenantId || !permitido) return <SemPermissao>Você não tem permissão para ver a análise do cronograma adaptativo.</SemPermissao>
  const tenantId = acesso.tenantId

  const raw = await searchParams
  const qs: QS = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))
  const sec = secaoDe(qs.sec)
  const vis = visaoDe(sec, qs.vis)
  const per = periodoParaDatas(qs.periodo)
  const filtro = normalizarFiltro({ de: per.de ?? undefined, ate: per.ate, grupo: qs.grupo, disc: qs.disc, tipo: qs.tipo, motor: qs.motor, dias: qs.dias })
  const pagina = ParamsInt(qs.pag, 1, 1, 100000)
  const porPagina = ParamsInt(qs.pps, 14, 5, 100)

  const svc = createAdminClient()
  const [resumo, opcoes, grupos, lista] = await Promise.all([
    carregarResumo(svc, tenantId, filtro),
    carregarOpcoes(svc, tenantId),
    listarGruposFiltro(tenantId),
    consultarVisao(svc, tenantId, vis, filtro, { q: qs.q, ord: qs.ord, dir: qs.dir, pag: pagina, pp: porPagina }),
  ])

  // links: troca de seção/visão preserva só os filtros globais
  const globais: QS = { periodo: qs.periodo, grupo: qs.grupo, disc: qs.disc, tipo: qs.tipo, motor: qs.motor, dias: qs.dias }
  const hrefSec = (id: string) => hrefCom(BASE, globais, { sec: id })
  const hrefVis = (id: string) => hrefCom(BASE, globais, { sec: sec.id, vis: id })
  const csvHref = hrefCom('/api/admin/cronograma-adaptativo/analise/csv', { ...globais, sec: sec.id, vis: vis.id, q: qs.q, ord: qs.ord, dir: qs.dir })

  const filtros = [
    { nome: 'periodo', rotulo: 'Últimos 30 dias', opcoes: PERIODOS_AN.filter((p) => p.v !== '30').map((p) => ({ v: p.v, l: p.l })) },
    { nome: 'grupo', rotulo: 'Todas as turmas', opcoes: grupos.map((g) => ({ v: g.id, l: g.nome })) },
    { nome: 'disc', rotulo: 'Todas as matérias', opcoes: opcoes.disciplinas.map((d) => ({ v: d, l: d })) },
    { nome: 'tipo', rotulo: 'Todos os tipos de meta', opcoes: TIPOS },
    { nome: 'motor', rotulo: 'Todas as versões do motor', opcoes: opcoes.motores.map((m) => ({ v: m, l: `Motor ${m}` })) },
    ...(vis.param === 'dias' ? [{ nome: 'dias', rotulo: 'Parado há 7+ dias', opcoes: DIAS_PARADO.map((d) => ({ v: String(d), l: `Parado há ${d}+ dias` })) }] : []),
  ]

  const celula = (c: ColAn, r: Record<string, unknown>): React.ReactNode => {
    const txt = formatarValor(c.f, r[c.k])
    if (c.aluno && r.estudante_id) return <Link href={`/admin/estudantes/${String(r.estudante_id)}`} className="font-medium text-primary underline-offset-2 hover:underline">{txt}</Link>
    const num = c.f === 'int' || c.f === 'pct' || c.f === 'dec' || c.f === 'seg'
    return <span className={cn(num && 'tabular-nums', c.k === 'rotulo' || c.k === 'nome' ? 'font-medium' : '')}>{txt}</span>
  }
  const rows: LinhaCron[] = lista.rows.map((r, i) => ({ id: `${pagina}-${i}`, cells: vis.cols.map((c) => <span key={c.k}>{celula(c, r)}</span>) }))
  const head = (
    <>{vis.cols.map((c) => {
      const num = c.f === 'int' || c.f === 'pct' || c.f === 'dec' || c.f === 'seg'
      return c.ord ? <ThOrd key={c.k} rotulo={c.l} col={c.k} base={BASE} qs={{ ...qs, sec: sec.id, vis: vis.id }} align={num ? 'right' : undefined} /> : <ThFixo key={c.k} align={num ? 'right' : undefined}>{c.l}</ThFixo>
    })}</>
  )

  const logDesde = dia(resumo.log_desde), evDesde = dia(resumo.eventos_desde)
  const vazio = !lista.migrado ? 'A migração ainda não foi aplicada — veja o aviso acima.'
    : vis.fonte === 'log' ? `Nenhuma geração registrada neste filtro${logDesde ? ` — o histórico começa em ${logDesde}` : ' — o histórico começa quando o registro novo entrar em produção'}.`
    : vis.fonte === 'evento' ? `Nenhuma marcação registrada neste filtro${evDesde ? ` — o histórico começa em ${evDesde}` : ' — o histórico começa quando o registro novo entrar em produção'}.`
    : vis.fonte === 'agg' ? 'Sem dados no agregado diário para este filtro (o cálculo roda de hora em hora).'
    : 'Nada encontrado com esses filtros.'

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cronograma adaptativo · Análise de uso</h1>
        <p className="text-muted-foreground">Como os alunos geram, configuram e cumprem o cronograma: gerações e falhas, ritmo, atrasos, desempenho e tempo — por turma, matéria e versão do motor.</p>
      </div>
      <AdaptativoTabs />

      {!resumo.migrado && <Nota tipo="aviso">Aplique a migração <b>20261119030000_adaptativo_log_analise.sql</b> no Supabase para ativar esta análise. Enquanto isso o cronograma dos alunos segue funcionando normalmente; só o registro e os números desta aba ficam indisponíveis.</Nota>}
      {resumo.erro && <Nota tipo="aviso">Não foi possível calcular os indicadores agora ({resumo.erro}). Nada foi estimado.</Nota>}
      {resumo.migrado && !resumo.erro && (
        <>
          <Nota tipo="info">
            {logDesde ? <>O registro de gerações começa em <b>{logDesde}</b>{evDesde && evDesde !== logDesde ? <> e o de marcações em <b>{evDesde}</b></> : null}; antes disso existem apenas os dados atuais dos cronogramas (progresso, configuração, desempenho e atraso são lidos direto deles e cobrem todo o período).</>
              : <>Ainda não há gerações registradas — o histórico começa quando o código novo entrar em produção. Progresso, configuração, desempenho e atraso já aparecem porque são lidos dos cronogramas existentes.</>}
          </Nota>
          {resumo.agg_linhas === 0 && <Nota tipo="aviso">O agregado diário ainda não foi calculado. O cron <b>adaptativo-agg</b> roda de hora em hora; para preencher o passado, chame <b>POST /api/cron/adaptativo-agg?dias=120</b> (com o CRON_SECRET). Até lá, as tabelas de Progresso por turma/matéria/tipo/semana e Tempo ficam vazias.</Nota>}
        </>
      )}

      <div>
        <KpiGrid>
          <KpiCard rotulo="Alunos com cronograma" valor={nf(resumo.alunos_com_plano)} />
          <KpiCard rotulo={`Cronogramas ativos · ${nf(resumo.planos_fixados)} fixados · ${nf(resumo.alunos_multiplano)} alunos c/ mais de um`} valor={nf(resumo.planos_ativos)} />
          <KpiCard rotulo={`Gerações no período · ${nf(resumo.recalculos)} recálculos`} valor={nf(resumo.geracoes)} />
          <KpiCard rotulo="Falhas de geração no período" valor={nf(resumo.falhas)} alerta={resumo.falhas > 0} />
        </KpiGrid>
        <KpiGrid>
          <KpiCard rotulo={`Metas cumpridas (${nf(resumo.feitas)} de ${nf(resumo.planejadas)})`} valor={resumo.pct_feitas != null ? `${formatarValor('dec', resumo.pct_feitas)}%` : '—'} />
          <KpiCard rotulo="Metas atrasadas (sem marcação)" valor={nf(resumo.atrasadas)} alerta={resumo.atrasadas > 0} />
          <KpiCard rotulo={`Alunos parados há ${filtro.dias}+ dias`} valor={nf(resumo.parados)} alerta={resumo.parados > 0} />
          <KpiCard rotulo={`Acerto nas questões · ${formatarValor('seg', resumo.tempo_real_seg)} estudados em foco`} valor={resumo.acerto_pct != null ? `${formatarValor('dec', resumo.acerto_pct)}%` : '—'} />
        </KpiGrid>
      </div>

      <Abas nivel={1} atual={sec.id} itens={SECOES.map((s) => ({ id: s.id, rotulo: s.rotulo, href: hrefSec(s.id) }))} />
      <div>
        <Abas nivel={2} atual={vis.id} itens={sec.visoes.map((v) => ({ id: v.id, rotulo: v.rotulo, href: hrefVis(v.id) }))} />
        {vis.dica && <p className="mb-3 text-xs text-muted-foreground">{vis.dica}</p>}
        <BarraBusca base={BASE} qs={qs} preservar={['sec', 'vis']} placeholder={vis.busca ? 'Buscar nesta tabela' : 'Filtros desta análise'} filtros={filtros} />
        {lista.erro && <Nota tipo="aviso">Não foi possível carregar esta tabela agora ({lista.erro}).</Nota>}
        <div className="mb-2 flex justify-end">
          <a href={csvHref} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border bg-background px-3 text-[13px] font-medium transition hover:bg-muted"><Download className="h-3.5 w-3.5" />Exportar CSV</a>
        </div>
        <TabelaCron tipo="leitura" podeEditar={false} colunas={vis.cols.length} total={lista.total} page={pagina} pp={porPagina} vazio={vazio} head={head} rows={rows} />
      </div>
    </div>
  )
}
