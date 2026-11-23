// Aba "Visão geral" (server component): KPIs e distribuições já agregados no banco (auditoria_problemas_resumo).
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  AREAS, STATUS, ROTULO_AREA, ROTULO_STATUS, ROTULO_PRIORIDADE,
  type Resumo, type StatusProblema,
} from '@/lib/auditoria-problemas/tipos'
import { PrioridadeChip, StatusChip, dataBr } from './comuns'

const BARRA: Record<StatusProblema, string> = { aberto: 'bg-rose-500', em_andamento: 'bg-amber-500', resolvido: 'bg-emerald-500' }
const CARTAO = 'rounded-2xl border bg-card p-4 shadow-sm'
const TIT = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'

export function VisaoGeral({ r }: { r: Resumo }) {
  const kpis: { label: string; valor: number; dica: string; href: string; alerta?: boolean }[] = [
    { label: 'Abertos', valor: r.abertos, dica: 'Ainda sem ninguém atuando', href: '?aba=lista&status=aberto' },
    { label: 'Em andamento', valor: r.em_andamento, dica: 'Alguém já está resolvendo', href: '?aba=lista&status=em_andamento' },
    { label: 'Atrasados', valor: r.atrasados, dica: 'Prazo vencido e não resolvidos', href: '?aba=lista&prazo=atrasado', alerta: r.atrasados > 0 },
    { label: 'Resolvidos (30 dias)', valor: r.resolvidos_30d, dica: 'Concluídos no último mês', href: '?aba=lista&status=resolvido' },
  ]

  // Matriz área × status (já vem agregada do banco; aqui só distribui nas barras).
  const porArea = AREAS.map((area) => {
    const linha = Object.fromEntries(STATUS.map((s) => [s, r.por_area.find((x) => x.area === area && x.status === s)?.total ?? 0])) as Record<StatusProblema, number>
    return { area, linha, total: STATUS.reduce((n, s) => n + linha[s], 0) }
  })
  const maxArea = Math.max(1, ...porArea.map((a) => a.total))
  const statusTotais = STATUS.map((s) => ({ s, n: s === 'aberto' ? r.abertos : s === 'em_andamento' ? r.em_andamento : r.resolvidos }))
  const maxStatus = Math.max(1, ...statusTotais.map((x) => x.n))

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className={cn(CARTAO, 'transition-colors hover:bg-muted/40')}>
            <div className={TIT}>{k.label}</div>
            <div className={cn('mt-1 text-3xl font-extrabold tabular-nums', k.alerta && 'text-rose-600 dark:text-rose-400')}>{k.valor.toLocaleString('pt-BR')}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{k.dica}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className={CARTAO}>
          <h3 className={TIT}>Por área</h3>
          <ul className="mt-3 space-y-2.5">
            {porArea.map((a) => (
              <li key={a.area}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <Link href={`?aba=lista&area=${a.area}`} className="min-w-0 truncate font-medium hover:underline">{ROTULO_AREA[a.area]}</Link>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{a.total}</span>
                </div>
                <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-muted" style={{ width: '100%' }} role="img" aria-label={`${ROTULO_AREA[a.area]}: ${a.total} problemas`}>
                  <div className="flex h-full" style={{ width: `${(a.total / maxArea) * 100}%` }}>
                    {STATUS.map((s) => a.linha[s] > 0 && <div key={s} className={BARRA[s]} style={{ width: `${(a.linha[s] / a.total) * 100}%` }} title={`${ROTULO_STATUS[s]}: ${a.linha[s]}`} />)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-3">
          <section className={CARTAO}>
            <h3 className={TIT}>Por status</h3>
            <ul className="mt-3 space-y-2.5">
              {statusTotais.map(({ s, n }) => (
                <li key={s} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0"><StatusChip status={s} /></span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', BARRA[s])} style={{ width: `${(n / maxStatus) * 100}%` }} /></div>
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{n}</span>
                </li>
              ))}
            </ul>
            {r.por_prioridade.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <h3 className={TIT}>Pendentes por prioridade</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.por_prioridade.map((p) => <span key={p.prioridade} className="inline-flex items-center gap-1.5 text-sm"><PrioridadeChip prioridade={p.prioridade} /><span className="tabular-nums text-muted-foreground">{p.total}</span></span>)}
                </div>
              </div>
            )}
          </section>

          <section className={CARTAO}>
            <h3 className={TIT}>Próximos prazos</h3>
            {r.proximos.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nenhum prazo pendente.</p> : (
              <ul className="mt-2 divide-y text-sm">
                {r.proximos.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate font-medium" title={p.assunto}>{p.assunto}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="hidden sm:inline">{ROTULO_PRIORIDADE[p.prioridade]}</span>
                      <span className="tabular-nums">{dataBr(p.prazo)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
