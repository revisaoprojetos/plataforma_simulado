'use client'

import { useMemo, useState } from 'react'
import { Repeat, CircleSlash, Search, CreditCard, TrendingUp, Receipt, CheckCircle2, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'

export interface AssinaturaItem {
  produtoNome: string | null
  produtoRef: string | null
  status: string | null
  provider: string | null
  inicioEm: string | null
  expiraEm: string | null
}
export interface PagamentoItem {
  id: string
  pagoEm: string | null
  status: string | null
  produto: string | null
  produtoRef: string | null
  valor: number | null
  metodo: string | null
  recorrente: boolean
  parcelas: number | null
  ciclo: number | null
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDataHora = (d: string | null) => (d ? formatBrt(d) : '—')

const ASS_STATUS: Record<string, { label: string; cls: string }> = {
  ativo: { label: 'Ativa', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  expirado: { label: 'Expirada', cls: 'bg-muted text-muted-foreground' },
  cancelado: { label: 'Cancelada', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  reembolsado: { label: 'Reembolsada', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
}
const assCfg = (s: string | null) => ASS_STATUS[(s ?? '').toLowerCase()] ?? { label: s ?? '—', cls: 'bg-muted text-muted-foreground' }

const PAG_STATUS: Record<string, { label: string; cls: string; pago: boolean }> = {
  approved: { label: 'Aprovado', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', pago: true },
  paid: { label: 'Pago', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', pago: true },
  completed: { label: 'Concluído', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', pago: true },
  refunded: { label: 'Reembolsado', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', pago: false },
  chargeback: { label: 'Chargeback', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', pago: false },
  canceled: { label: 'Cancelado', cls: 'bg-muted text-muted-foreground', pago: false },
  cancelled: { label: 'Cancelado', cls: 'bg-muted text-muted-foreground', pago: false },
  waiting_payment: { label: 'Aguardando', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', pago: false },
  pending: { label: 'Pendente', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', pago: false },
  billet_printed: { label: 'Boleto gerado', cls: 'bg-muted text-muted-foreground', pago: false },
  abandoned: { label: 'Abandonado', cls: 'bg-muted text-muted-foreground', pago: false },
}
const pagCfg = (s: string | null) => PAG_STATUS[(s ?? '').toLowerCase()] ?? { label: s ?? '—', cls: 'bg-muted text-muted-foreground', pago: false }

const METODO: Record<string, string> = { credit_card: 'Cartão', pix: 'Pix', billet: 'Boleto', free: 'Grátis' }
const metodoLabel = (m: string | null) => METODO[(m ?? '').toLowerCase()] ?? (m || '—')

function tipoPagamento(p: PagamentoItem): { label: string; cls: string; detalhe: string | null; rank: number } {
  if (p.recorrente) return { label: 'Recorrente', cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', detalhe: p.ciclo ? `cobrança nº ${p.ciclo}` : null, rank: 2 }
  if ((p.parcelas ?? 1) > 1) return { label: `Parcelado ${p.parcelas}×`, cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', detalhe: null, rank: 1 }
  return { label: 'À vista', cls: 'bg-muted text-muted-foreground', detalhe: null, rank: 0 }
}

type SortState = { col: string; dir: 'asc' | 'desc' }
function toggle(prev: SortState, col: string, padrao: 'asc' | 'desc' = 'asc'): SortState {
  return prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: padrao }
}
type Align = 'left' | 'center' | 'right'
const thAlignCls = (a: Align) => (a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left')
function SortTh({ label, col, sort, onSort, align = 'left' }: { label: string; col: string; sort: SortState; onSort: (c: string) => void; align?: Align }) {
  const active = sort.col === col
  const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th className={cn('px-4 py-2.5', thAlignCls(align))}>
      <button type="button" onClick={() => onSort(col)}
        className={cn('flex w-fit items-center gap-1 hover:text-foreground', align === 'center' && 'mx-auto', align === 'right' && 'ml-auto', active && 'text-foreground')}>
        {label} <Icon className={cn('h-3 w-3', !active && 'opacity-40')} />
      </button>
    </th>
  )
}
function ordenar<T>(itens: T[], val: (x: T) => string | number, dir: 'asc' | 'desc'): T[] {
  return [...itens].sort((a, b) => { const va = val(a), vb = val(b); const r = va < vb ? -1 : va > vb ? 1 : 0; return dir === 'asc' ? r : -r })
}

function Kpi({ icon: I, label, value, tone, chip }: { icon: any; label: string; value: React.ReactNode; tone?: string; chip: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', chip)}><I className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className={cn('text-xl font-extrabold leading-none tracking-tight tabular-nums', tone)}>{value}</p>
          <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  )
}

export function EstudanteAssinaturas({ assinaturas, pagamentos, sqlOff }: { assinaturas: AssinaturaItem[]; pagamentos: PagamentoItem[]; sqlOff: boolean }) {
  const [sub, setSub] = useState<'historico' | 'assinaturas'>('historico')

  if (sqlOff) {
    return <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-700 dark:text-amber-300">As assinaturas e pagamentos dependem do <b>SQL agregado</b> (DATABASE_URL), indisponível no momento.</div>
  }

  const SubBtn = ({ k, icon: I, label, count }: { k: 'historico' | 'assinaturas'; icon: any; label: string; count: number }) => {
    const on = sub === k
    return (
      <button type="button" onClick={() => setSub(k)}
        className={cn('inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', on ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
        <I className="h-4 w-4" /> {label}
        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', on ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground')}>{count}</span>
      </button>
    )
  }

  return (
    // `rounded-xl` (invisível, sem fundo/borda) faz o CascataEntrada tratar este bloco como UM card
    // único — então toda a aba (sub-abas + KPIs + tabela) entra JUNTA, sem escalonar por card.
    <div className="space-y-4 rounded-xl">
      <div className="flex w-fit flex-wrap gap-1 rounded-xl border bg-card p-1 shadow-sm">
        <SubBtn k="historico" icon={Receipt} label="Histórico de pagamentos" count={pagamentos.length} />
        <SubBtn k="assinaturas" icon={Repeat} label="Assinaturas recorrentes" count={assinaturas.length} />
      </div>
      {sub === 'historico' ? <Historico pagamentos={pagamentos} /> : <Assinaturas assinaturas={assinaturas} />}
    </div>
  )
}

function Historico({ pagamentos }: { pagamentos: PagamentoItem[] }) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [sort, setSort] = useState<SortState>({ col: 'data', dir: 'desc' })

  const totalPago = useMemo(() => pagamentos.filter((p) => pagCfg(p.status).pago).reduce((s, p) => s + (p.valor ?? 0), 0), [pagamentos])
  const nAprovados = useMemo(() => pagamentos.filter((p) => pagCfg(p.status).pago).length, [pagamentos])
  const statusPresentes = useMemo(() => [...new Set(pagamentos.map((p) => (p.status ?? '').toLowerCase()).filter(Boolean))], [pagamentos])

  const busca = q.trim().toLowerCase()
  const filtrados = pagamentos.filter((p) => {
    if (filtro !== 'todos' && (p.status ?? '').toLowerCase() !== filtro) return false
    if (busca && !((p.produto ?? '').toLowerCase().includes(busca) || (p.produtoRef ?? '').includes(busca))) return false
    return true
  })
  const val = (p: PagamentoItem): string | number => {
    switch (sort.col) {
      case 'produto': return (p.produto ?? '').toLowerCase()
      case 'valor': return p.valor ?? -1
      case 'tipo': return tipoPagamento(p).rank
      case 'metodo': return metodoLabel(p.metodo).toLowerCase()
      case 'status': return pagCfg(p.status).label.toLowerCase()
      default: return p.pagoEm ?? ''
    }
  }
  const lista = ordenar(filtrados, val, sort.dir)
  const onSort = (c: string) => setSort((s) => toggle(s, c, c === 'produto' ? 'asc' : 'desc'))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi icon={TrendingUp} label="Total pago" value={brl(totalPago)} chip="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" tone="text-emerald-600 dark:text-emerald-400" />
        <Kpi icon={CheckCircle2} label="Pagamentos aprovados" value={nAprovados} chip="bg-sky-500/15 text-sky-600 dark:text-sky-400" tone="text-sky-600 dark:text-sky-400" />
        <Kpi icon={CreditCard} label="Transações (total)" value={pagamentos.length} chip="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" tone="text-indigo-600 dark:text-indigo-400" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip label="Todos" on={filtro === 'todos'} onClick={() => setFiltro('todos')} />
          {statusPresentes.map((s) => <Chip key={s} label={pagCfg(s).label} on={filtro === s} onClick={() => setFiltro(s)} />)}
        </div>
        <BuscaInput value={q} onChange={setQ} placeholder="Buscar produto…" />
      </div>

      <div className="text-xs text-muted-foreground">{lista.length} pagamento(s) no filtro</div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <SortTh label="Data do pagamento" col="data" sort={sort} onSort={onSort} />
              <SortTh label="Produto" col="produto" sort={sort} onSort={onSort} />
              <SortTh label="Valor" col="valor" sort={sort} onSort={onSort} align="center" />
              <SortTh label="Tipo" col="tipo" sort={sort} onSort={onSort} align="center" />
              <SortTh label="Método" col="metodo" sort={sort} onSort={onSort} align="center" />
              <SortTh label="Status" col="status" sort={sort} onSort={onSort} align="center" />
            </tr>
          </thead>
          <tbody>
            {pagamentos.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum pagamento encontrado (casado por e-mail/CPF nos webhooks da Guru).</td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum pagamento no filtro.</td></tr>
            ) : lista.map((p) => {
              const st = pagCfg(p.status); const tp = tipoPagamento(p)
              return (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDataHora(p.pagoEm)}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.produto || 'Produto'}</div>
                    {p.produtoRef && <div className="text-[11px] text-muted-foreground">#{p.produtoRef}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums font-medium">{p.valor != null ? brl(p.valor) : '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tp.cls)}>{tp.label}</span>
                    {tp.detalhe && <div className="mt-0.5 text-[11px] text-muted-foreground">{tp.detalhe}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">{metodoLabel(p.metodo)}</td>
                  <td className="px-4 py-2.5 text-center"><span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', st.cls)}>{st.label}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Assinaturas({ assinaturas }: { assinaturas: AssinaturaItem[] }) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [sort, setSort] = useState<SortState>({ col: 'status', dir: 'asc' })

  const statusPresentes = useMemo(() => [...new Set(assinaturas.map((a) => (a.status ?? '').toLowerCase()).filter(Boolean))], [assinaturas])
  const ativas = assinaturas.filter((a) => a.status === 'ativo').length

  const busca = q.trim().toLowerCase()
  const filtrados = assinaturas.filter((a) => {
    if (filtro !== 'todos' && (a.status ?? '').toLowerCase() !== filtro) return false
    if (busca && !((a.produtoNome ?? '').toLowerCase().includes(busca) || (a.produtoRef ?? '').includes(busca))) return false
    return true
  })
  const val = (a: AssinaturaItem): string | number => {
    switch (sort.col) {
      case 'produto': return (a.produtoNome ?? '').toLowerCase()
      case 'inicio': return a.inicioEm ?? ''
      case 'expira': return a.expiraEm ?? ''
      default: return assCfg(a.status).label.toLowerCase()
    }
  }
  const lista = ordenar(filtrados, val, sort.dir)
  const onSort = (c: string) => setSort((s) => toggle(s, c, c === 'produto' || c === 'status' ? 'asc' : 'desc'))

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground"><b className="text-foreground">{ativas}</b> ativa(s) de {assinaturas.length} registro(s).</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip label="Todos" on={filtro === 'todos'} onClick={() => setFiltro('todos')} />
          {statusPresentes.map((s) => <Chip key={s} label={assCfg(s).label} on={filtro === s} onClick={() => setFiltro(s)} />)}
        </div>
        <BuscaInput value={q} onChange={setQ} placeholder="Buscar assinatura…" />
      </div>

      <div className="text-xs text-muted-foreground">{lista.length} assinatura(s) no filtro</div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <SortTh label="Produto" col="produto" sort={sort} onSort={onSort} />
              <SortTh label="Status" col="status" sort={sort} onSort={onSort} align="center" />
              <th className="px-4 py-2.5 text-center">Origem</th>
              <SortTh label="Pagamento (início)" col="inicio" sort={sort} onSort={onSort} align="center" />
              <SortTh label="Próxima renovação" col="expira" sort={sort} onSort={onSort} align="center" />
            </tr>
          </thead>
          <tbody>
            {assinaturas.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhuma assinatura registrada para este aluno.</td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhuma assinatura no filtro.</td></tr>
            ) : lista.map((a, i) => {
              const st = assCfg(a.status)
              return (
                <tr key={a.produtoRef ? `${a.produtoRef}:${i}` : i} className="border-t">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{a.produtoNome || 'Produto'}</div>
                    {a.produtoRef && <div className="text-[11px] text-muted-foreground">#{a.produtoRef}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-center"><span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', st.cls)}>{a.status === 'ativo' ? <Repeat className="h-3 w-3" /> : <CircleSlash className="h-3 w-3" />} {st.label}</span></td>
                  <td className="px-4 py-2.5 text-center text-xs capitalize text-muted-foreground">{a.provider ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">{fmtDataHora(a.inicioEm)}</td>
                  <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">{fmtDataHora(a.expiraEm)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
      {label}
    </button>
  )
}
function BuscaInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-[280px] sm:flex-none">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-1.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
    </div>
  )
}
