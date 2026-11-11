import Link from 'next/link'
import { Users, BarChart3, ExternalLink } from 'lucide-react'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao, AlertBox } from '@/components/ui/alert-box'
import { RevisaoHead, RevisaoAbas } from '@/components/admin/revisao/ui'
import {
  ABAS_REL, PERIODOS, carregarRelatorioRevisao, listarGruposFiltro, normalizarAba, normalizarPeriodo,
  type BarrasRel, type RelatorioRevisao,
} from '@/lib/admin/revisao/relatorios'
import { RR } from '@/lib/admin/revisao/rotas'
import { cn } from '@/lib/utils'
import { FiltrosRel } from './filtros-rel'

export const dynamic = 'force-dynamic'

const fmtValor = (v: number, f: BarrasRel['fmt']) => (f === 'pct' ? `${v}%` : f === 'estrela' ? `${String(v).replace('.', ',')} ★` : v.toLocaleString('pt-BR'))
const corBarra = (v: number, cor: BarrasRel['cor']) =>
  cor === 'gold' ? 'bg-amber-500' : cor === 'primary' ? 'bg-primary' : v >= 60 ? 'bg-emerald-600' : v >= 30 ? 'bg-amber-600' : 'bg-red-600'

function Barras({ b, Icon, extra }: { b: BarrasRel; Icon: React.ComponentType<{ className?: string }>; extra?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
          <div className="min-w-0"><h3 className="truncate text-sm font-semibold">{b.titulo}</h3>{b.sub && <p className="truncate text-[11px] text-muted-foreground">{b.sub}</p>}</div>
        </div>
        {extra}
      </div>
      <div className="space-y-2.5 p-4">
        {b.linhas.length === 0 && <p className="text-sm text-muted-foreground">Sem dados neste filtro.</p>}
        {b.linhas.map((l) => (
          <div key={l.nome} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,13rem)_1fr_3.5rem]">
            <span className="truncate" title={l.nome}>{l.nome}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted"><i className={cn('block h-full rounded-full', corBarra(l.valor, b.cor))} style={{ width: `${Math.min(100, (l.valor / b.max) * 100)}%` }} /></span>
            <b className="text-right tabular-nums">{fmtValor(l.valor, b.fmt)}</b>
          </div>
        ))}
      </div>
    </section>
  )
}

function Serie({ dados }: { dados: NonNullable<RelatorioRevisao['serie']> }) {
  const W = 640, H = 160, mn = 60, mx = 100
  const X = (i: number) => 40 + (i * (W - 60)) / (dados.length - 1)
  const Y = (v: number) => H - 26 - ((Math.min(mx, Math.max(mn, v)) - mn) / (mx - mn)) * (H - 46)
  const pts = dados.map((d, i) => `${X(i)},${Y(d.pct)}`).join(' ')
  const ult = dados[dados.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Metas cumpridas por semana" className="h-auto w-full max-w-4xl">
      {[60, 80, 100].map((t) => (
        <g key={t}>
          <line x1={34} x2={W - 10} y1={Y(t)} y2={Y(t)} className="stroke-border" />
          <text x={28} y={Y(t) + 4} textAnchor="end" fontSize={11} className="fill-muted-foreground">{t}%</text>
        </g>
      ))}
      <polygon points={`${X(0)},${Y(mn)} ${pts} ${X(dados.length - 1)},${Y(mn)}`} className="fill-primary/10" />
      <polyline points={pts} fill="none" strokeWidth={2.5} className="stroke-primary" />
      {dados.map((d, i) => <text key={d.rotulo} x={X(i)} y={H - 6} textAnchor="middle" fontSize={11} className="fill-muted-foreground">{d.rotulo}</text>)}
      <circle cx={X(dados.length - 1)} cy={Y(ult.pct)} r={5} className="fill-amber-500" />
      <text x={X(dados.length - 1) - 8} y={Y(ult.pct) - 10} textAnchor="end" fontSize={12} fontWeight={700} className="fill-foreground">{ult.pct}%</text>
    </svg>
  )
}

export default async function RelatoriosRevisaoPage({ searchParams }: { searchParams: Promise<{ aba?: string; periodo?: string; grupo?: string }> }) {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || accessCan(access, 'relatorios:view'))) return <SemPermissao>Você não tem permissão para ver os relatórios.</SemPermissao>

  const sp = await searchParams
  const aba = normalizarAba(sp.aba)
  const periodo = normalizarPeriodo(sp.periodo)
  const tenantId = access.tenantId ?? '00000000-0000-0000-0000-000000000000'
  const [grupos, r] = await Promise.all([listarGruposFiltro(tenantId), carregarRelatorioRevisao(tenantId, aba, periodo, sp.grupo ?? null)])

  const tabela = r.barras.map((b) => ({ titulo: b.titulo, linhas: b.linhas.map((l) => ({ nome: l.nome, valor: fmtValor(l.valor, b.fmt) })) }))
  const base = RR.relatorios

  return (
    <div>
      <RevisaoHead secao="Análise" titulo="Relatórios" subtitulo="Leitura, desempenho, cronograma e feedbacks por grupo de alunos." />
      <FiltrosRel base={base} aba={aba} grupoId={r.grupoId ?? ''} periodo={periodo} grupos={grupos} periodos={PERIODOS} tabela={tabela} />
      <RevisaoAbas abas={ABAS_REL} atual={aba} base={base} extra={{ periodo, grupo: r.grupoId ?? undefined }} />

      {r.indisponivel ? (
        <AlertBox variante="aviso">Os números deste relatório são calculados direto no banco e estão indisponíveis agora (conexão SQL ausente ou erro). Nada foi estimado. Tente novamente em instantes.</AlertBox>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {r.kpis.map((k) => (
              <div key={k.rotulo} className={cn('rounded-2xl border bg-gradient-to-br from-primary/[0.06] via-card to-card p-5 shadow-sm', k.alerta && 'border-red-600/40')}>
                <b className={cn('block text-[2.1rem] font-bold leading-none tracking-tight tabular-nums', k.alerta && 'text-red-600 dark:text-red-400')}>{k.valor}</b>
                <span className="mt-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.rotulo}</span>
              </div>
            ))}
          </div>

          {r.barras.length > 0 && (
            <div className={cn('grid gap-4', r.barras.length > 1 && 'lg:grid-cols-2')}>
              {r.barras.map((b, i) => (
                <Barras key={b.titulo} b={b} Icon={aba === 'leitura' && i === 0 ? Users : BarChart3} extra={
                  aba === 'desemp' && r.linkCompleto ? <Link href={r.linkCompleto.href} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border bg-background px-3 text-[13px] font-medium transition hover:bg-muted"><ExternalLink className="h-3.5 w-3.5" />{r.linkCompleto.rotulo}</Link>
                    : aba === 'feed' && i === 0 ? <Link href={RR.avaliacoes} className="inline-flex h-8 shrink-0 items-center rounded-[10px] border bg-background px-3 text-[13px] font-medium transition hover:bg-muted">Ver comentários</Link> : undefined
                } />
              ))}
            </div>
          )}

          {r.serie && (
            <section className="overflow-hidden rounded-2xl border bg-card">
              <div className="border-b px-4 py-3"><h3 className="text-sm font-semibold">Metas cumpridas por semana</h3><p className="text-[11px] text-muted-foreground">{r.grupoId ? 'Grupo selecionado' : 'Todos os grupos'} · últimas 8 semanas</p></div>
              <div className="p-4"><Serie dados={r.serie} /></div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
