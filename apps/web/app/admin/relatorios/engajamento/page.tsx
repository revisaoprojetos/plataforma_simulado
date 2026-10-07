import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ExternalLink, CreditCard, Search, Repeat, CircleSlash, ArrowUp, ArrowDown, ArrowUpDown,
  Users, TrendingUp, AlertTriangle, Target, CheckCircle2, ClipboardList, Library,
} from 'lucide-react'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { KpiCard } from '@/components/admin/relatorios/viz'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'
import {
  engajamentoKpis, engajamentoLista, opcoesEngajamento,
  normArea, normSituacao, type EngajArea, type EngajSituacao, type EngajGeralSortCol,
} from './_dados'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => n.toLocaleString('pt-BR')
const ROTA = '/admin/relatorios/engajamento'

const AREA_LABEL: Record<EngajArea, string> = { todos: 'Todos', simulados: 'Simulados', desafios: 'Desafios' }
const SITUACAO_LABEL: Record<EngajSituacao, string> = {
  todos: 'Todos', churn: 'Risco de cancelamento', conversao: 'Oportunidade', pagantes: 'Recorrentes', ativos: 'Ativos',
}

type SP = {
  area?: string; alvo?: string; situacao?: string; q?: string; sort?: string; dir?: string; pg?: string; aluno?: string
}

export default async function EngajamentoPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await checkPermission('relatorios:view'))) redirect('/admin')
  const access = await getCurrentAccess()
  if (!access.tenantId) redirect('/admin')
  const sp = await searchParams
  const area = normArea(sp.area)
  const alvo = (sp.alvo ?? '').trim() || null

  return (
    <EngajamentoLista
      tenantId={access.tenantId}
      area={area}
      alvo={alvo}
      situacao={normSituacao(sp.situacao)}
      q={sp.q ?? ''}
      pgina={Math.max(1, Number(sp.pg) || 1)}
      sort={sp.sort ?? ''}
      dir={sp.dir ?? ''}
    />
  )
}

async function EngajamentoLista({ tenantId, area, alvo, situacao, q, pgina, sort, dir }: {
  tenantId: string; area: EngajArea; alvo: string | null; situacao: EngajSituacao; q: string; pgina: number; sort: string; dir: string
}) {
  const filtro = { area, alvoId: area === 'todos' ? null : alvo }
  const [k, lista, opcoes] = await Promise.all([
    engajamentoKpis(tenantId, filtro),
    engajamentoLista(tenantId, filtro, { pagina: pgina, q, situacao, sort, dir }),
    opcoesEngajamento(tenantId),
  ])

  const header = (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><CreditCard className="h-6 w-6 text-primary" /> Assinaturas &amp; Engajamento</h1>
      <p className="text-muted-foreground">Quem é <b>recorrente</b> (está numa assinatura ativa) × quem está <b>engajado</b> — por área. Identifica risco de cancelamento e oportunidades de conversão.</p>
    </div>
  )

  if (lista.sqlOff || !k) {
    return (
      <div className="space-y-5">
        {header}
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-700 dark:text-amber-300">
          Esta análise depende do <b>SQL agregado</b> (DATABASE_URL). Ele está indisponível no momento — confira a configuração para liberar o cruzamento de assinaturas × engajamento.
        </div>
      </div>
    )
  }

  const totalPaginas = Math.max(1, Math.ceil(lista.total / lista.porPagina))
  const coberturaPct = k.baseTotal ? Math.round((k.pagantes / k.baseTotal) * 100) : 0

  // Monta URL preservando filtros, com overrides.
  const mkHref = (ov: Partial<{ area: EngajArea; alvo: string | null; situacao: EngajSituacao; q: string; pg: number; sort: EngajGeralSortCol; dir: 'asc' | 'desc' }> = {}) => {
    const s = new URLSearchParams()
    const a = ov.area ?? area
    if (a !== 'todos') s.set('area', a)
    const al = ov.alvo !== undefined ? ov.alvo : alvo
    if (a !== 'todos' && al) s.set('alvo', al)
    const sit = ov.situacao ?? situacao
    if (sit !== 'todos') s.set('situacao', sit)
    const busca = ov.q !== undefined ? ov.q : q
    if (busca) s.set('q', busca)
    s.set('pg', String(ov.pg ?? lista.pagina))
    s.set('sort', ov.sort ?? lista.sort)
    s.set('dir', ov.dir ?? lista.dir)
    const qs = s.toString()
    return qs ? `${ROTA}?${qs}` : ROTA
  }
  const qsPg = (pgNum: number) => mkHref({ pg: pgNum })

  // Cabeçalho ordenável.
  const th = (col: EngajGeralSortCol, label: string, padrao: 'asc' | 'desc', align: 'left' | 'right' = 'left') => {
    const ativa = lista.sort === col
    const prox = ativa ? (lista.dir === 'asc' ? 'desc' : 'asc') : padrao
    const Icon = ativa ? (lista.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
    return (
      <Link href={mkHref({ sort: col, dir: prox, pg: 1 })} className={cn('inline-flex items-center gap-1 hover:text-foreground', align === 'right' && 'flex-row-reverse', ativa && 'text-foreground')}>
        {label} <Icon className={cn('h-3 w-3', !ativa && 'opacity-40')} />
      </Link>
    )
  }

  const subFiltroOpcoes = area === 'simulados' ? opcoes.simulados.map((s) => ({ id: s.id, label: s.titulo }))
    : area === 'desafios' ? opcoes.desafios.map((d) => ({ id: d.id, label: `${d.nome} · ${d.area === 'jurisprudencia' ? 'Jurisprudência' : 'Lei Seca'}` }))
    : []

  return (
    <div className="space-y-5">
      {header}

      {/* Filtro de ÁREA (segmentado) + sub-filtro */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border bg-card p-1 shadow-sm">
          {(['todos', 'simulados', 'desafios'] as EngajArea[]).map((a) => {
            const ativo = area === a
            const Icon = a === 'simulados' ? ClipboardList : a === 'desafios' ? Library : Users
            return (
              <Link key={a} href={mkHref({ area: a, alvo: null, pg: 1 })} aria-current={ativo ? 'page' : undefined}
                className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  ativo ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-4 w-4" /> {AREA_LABEL[a]}
              </Link>
            )
          })}
        </div>

        {area !== 'todos' && subFiltroOpcoes.length > 0 && (
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="area" value={area} />
            {situacao !== 'todos' && <input type="hidden" name="situacao" value={situacao} />}
            {q && <input type="hidden" name="q" value={q} />}
            <input type="hidden" name="sort" value={lista.sort} />
            <input type="hidden" name="dir" value={lista.dir} />
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {area === 'simulados' ? 'Simulado' : 'Módulo'}
              <select name="alvo" defaultValue={alvo ?? ''} className="h-9 min-w-[220px] rounded-lg border bg-background px-2 text-sm text-foreground">
                <option value="">Todos</option>
                {subFiltroOpcoes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <button type="submit" className="h-9 rounded-lg border px-3 text-sm font-medium transition hover:bg-muted">Aplicar</button>
          </form>
        )}
      </div>

      {/* KPIs — foco em churn/conversão/cobertura */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={<Repeat className="h-4 w-4" />} tom="emerald" label="Recorrentes ativos" valor={fmt(k.pagantes)} sub={`de ${fmt(k.baseTotal)} alunos na base`} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} tom="rose" label="Risco de cancelamento" valor={fmt(k.pagantesSemAtividade)} sub="recorrentes, mas não engajam" />
        <KpiCard icon={<Target className="h-4 w-4" />} tom="violet" label="Oportunidade de conversão" valor={fmt(k.engajadosNaoPagantes)} sub="engajam, mas não são recorrentes" />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} tom="sky" label="Cobertura da base" valor={`${coberturaPct}%`} sub={`${fmt(k.engajados)} engajados no escopo`} />
      </div>

      {/* Situação (chips) + busca */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(['todos', 'churn', 'conversao', 'pagantes', 'ativos'] as EngajSituacao[]).map((s) => {
            const ativo = situacao === s
            return (
              <Link key={s} href={mkHref({ situacao: s, pg: 1 })}
                className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  ativo ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                {SITUACAO_LABEL[s]}
              </Link>
            )
          })}
        </div>
        <form method="get" className="ml-auto flex items-center gap-2">
          {area !== 'todos' && <input type="hidden" name="area" value={area} />}
          {area !== 'todos' && alvo && <input type="hidden" name="alvo" value={alvo} />}
          {situacao !== 'todos' && <input type="hidden" name="situacao" value={situacao} />}
          <input type="hidden" name="sort" value={lista.sort} />
          <input type="hidden" name="dir" value={lista.dir} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input name="q" defaultValue={q} placeholder="Nome ou e-mail…" className="h-9 w-56 rounded-lg border bg-background pl-8 pr-3 text-sm text-foreground" />
          </div>
          <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90">Buscar</button>
        </form>
      </div>

      <div className="text-xs text-muted-foreground">{fmt(lista.total)} aluno(s) no filtro</div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">{th('nome', 'Aluno', 'asc')}</th>
              <th className="px-4 py-2.5">{th('situacao', 'Recorrente?', 'desc')}</th>
              <th className="px-4 py-2.5">Engajado?</th>
              <th className="px-4 py-2.5">Áreas ativas</th>
              <th className="px-4 py-2.5">{th('ultima', 'Última atividade', 'desc')}</th>
              <th className="px-4 py-2.5 text-right"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {lista.linhas.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum aluno neste filtro.</td></tr>
            ) : lista.linhas.map((a) => (
              <tr key={a.id} className="border-t transition-colors hover:bg-muted/40">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <AvatarEstudante nome={a.nome} className="h-8 w-8 border bg-muted text-[11px] text-muted-foreground" />
                    <div className="min-w-0">
                      <Link href={`/admin/estudantes/${a.id}`} className="font-medium hover:text-primary hover:underline">{a.nome}</Link>
                      {a.email && <div className="truncate text-xs text-muted-foreground">{a.email}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {a.paga
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Repeat className="h-3 w-3" /> Recorrente</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CircleSlash className="h-3 w-3" /> Não recorrente</span>}
                </td>
                <td className="px-4 py-2.5">
                  {a.engajado
                    ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Engajado</span>
                    : <span className="text-amber-600 dark:text-amber-400">Sem atividade</span>}
                </td>
                <td className="px-4 py-2.5">
                  {a.areasAtivas.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : (
                    <div className="flex flex-wrap gap-1">
                      {a.areasAtivas.map((ar) => (
                        <span key={ar} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {ar === 'Simulados' ? <ClipboardList className="h-3 w-3" /> : <Library className="h-3 w-3" />} {ar}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.ultimaAtividade ? formatBrt(a.ultimaAtividade) : '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={`/admin/estudantes/${a.id}?tab=assinaturas`} title="Abrir perfil do aluno (assinaturas & histórico)" aria-label={`Abrir perfil de ${a.nome}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted hover:text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-xs text-muted-foreground">Página <b className="tabular-nums text-foreground">{lista.pagina}</b> de <b className="tabular-nums text-foreground">{fmt(totalPaginas)}</b></span>
          <div className="flex items-center gap-1">
            <PagLink href={qsPg(1)} disabled={lista.pagina <= 1}>Início</PagLink>
            <PagLink href={qsPg(lista.pagina - 1)} disabled={lista.pagina <= 1}>Anterior</PagLink>
            <PagLink href={qsPg(lista.pagina + 1)} disabled={lista.pagina >= totalPaginas}>Próxima</PagLink>
            <PagLink href={qsPg(totalPaginas)} disabled={lista.pagina >= totalPaginas}>Final</PagLink>
          </div>
        </div>
      )}
    </div>
  )
}

function PagLink({ href, disabled, children }: { href: string; disabled?: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="inline-flex h-8 items-center rounded-lg border px-3 text-muted-foreground opacity-40">{children}</span>
  return <Link href={href} className="inline-flex h-8 items-center rounded-lg border px-3 text-muted-foreground transition hover:bg-muted">{children}</Link>
}
