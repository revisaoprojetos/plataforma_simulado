'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, Users, Crown, ClipboardCheck, UserCheck, X, ArrowUpRight, GraduationCap, ArrowUp, ArrowDown, ChevronsUpDown, Loader2, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'
import { ExcluirEstudanteButton } from '@/components/admin/excluir-estudante-button'
import { ExportButton } from '@/components/admin/export-button'
import type { ColunaExport } from '@/lib/exportar'
import { carregarLoteEstudantes, buscarEstudantes, exportarTodosEstudantes, type EstudanteBase, type SortEstudante, type FiltroEstudante } from '@/app/admin/estudantes/actions'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'

export type EstudanteRow = EstudanteBase

type Filtro = FiltroEstudante
type SortKey = 'nome' | 'classificacao' | 'feitos' | 'media' | 'created_at'
type Sort = { key: SortKey; dir: 'asc' | 'desc' } | null

const POR_PAGINA = 10
// Colunas que o BANCO sabe ordenar (o resto — feitos/média, que são agregados — ordena a página atual).
const SORT_SERVIDOR: SortKey[] = ['nome', 'classificacao', 'created_at']

function fmtData(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function notaTom(n: number | null) {
  if (n == null) return 'text-muted-foreground'
  return n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
}
/** Sort do servidor (só para colunas do banco). */
function sortDb(s: Sort): SortEstudante | undefined {
  if (s && SORT_SERVIDOR.includes(s.key)) return { key: s.key as SortEstudante['key'], dir: s.dir }
  return undefined
}
/** Ordena um array no cliente por qualquer coluna (busca + feitos/média). */
function ordenarCliente(arr: EstudanteRow[], s: Sort): EstudanteRow[] {
  if (!s) return arr
  const dir = s.dir === 'asc' ? 1 : -1
  return [...arr].sort((a, b) => {
    switch (s.key) {
      case 'nome': return (a.nome || '').localeCompare(b.nome || '', 'pt-BR') * dir
      case 'classificacao': return (a.classificacao || '').localeCompare(b.classificacao || '', 'pt-BR') * dir
      case 'feitos': return (a.feitos - b.feitos) * dir
      case 'media': {
        if (a.media == null && b.media == null) return 0
        if (a.media == null) return 1
        if (b.media == null) return -1
        return (a.media - b.media) * dir
      }
      case 'created_at': return ((a.created_at ? Date.parse(a.created_at) : 0) - (b.created_at ? Date.parse(b.created_at) : 0)) * dir
    }
  })
}

export function EstudantesLista({ inicial, total, kpis, adminEmails = [] }: {
  inicial: EstudanteBase[]
  total: number
  kpis: { total: number; passaporte: number; feitos: number; ativos: number }
  adminEmails?: string[]
}) {
  const adminSet = useMemo(() => new Set(adminEmails.map((e) => e.toLowerCase())), [adminEmails])
  const ehAdmin = (e: EstudanteRow) => !!e.email && adminSet.has(e.email.toLowerCase())

  // Página SERVIDOR (10 por vez) — não baixa mais os milhares de uma vez.
  const [rows, setRows] = useState<EstudanteRow[]>(inicial)
  const [totalFiltro, setTotalFiltro] = useState(total)
  const [pagina, setPagina] = useState(1)
  const [carregandoPag, setCarregandoPag] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [sort, setSort] = useState<Sort>(null)
  // Busca NO SERVIDOR (nome/e-mail/CPF/telefone) — resultados paginados no cliente (≤200).
  const [q, setQ] = useState('')
  const [busca, setBusca] = useState<EstudanteRow[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const buscandoAtivo = q.trim().length > 0
  const reqId = useRef(0)

  // Busca a página do servidor com filtro/sort atuais.
  async function irPagina(p: number, f: Filtro = filtro, s: Sort = sort) {
    const id = ++reqId.current
    setCarregandoPag(true)
    try {
      const r = await carregarLoteEstudantes((p - 1) * POR_PAGINA, POR_PAGINA, true, { sort: sortDb(s), filtro: f })
      if (id !== reqId.current) return // resposta antiga (o usuário já mudou de página) → descarta
      setRows(r.rows); setTotalFiltro(r.total); setPagina(p)
    } finally {
      if (id === reqId.current) setCarregandoPag(false)
    }
  }

  function mudarFiltro(f: Filtro) { if (f === filtro) return; setFiltro(f); if (!buscandoAtivo) irPagina(1, f, sort); else setPagina(1) }
  function ordenarPor(key: SortKey) {
    const novo: Sort = sort?.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    setSort(novo)
    // Sort de coluna do banco (e sem busca) → refaz a página 1 no servidor; senão ordena no cliente.
    if (!buscandoAtivo && SORT_SERVIDOR.includes(key)) irPagina(1, filtro, novo)
    else setPagina(1)
  }

  // Busca no servidor (debounce). Enquanto há termo, a paginação/ordenação é sobre os resultados.
  useEffect(() => {
    const t = q.trim()
    if (!t) { setBusca(null); setBuscando(false); return }
    setBuscando(true); setPagina(1)
    const id = setTimeout(async () => {
      try { setBusca(await buscarEstudantes(t)) } catch { setBusca([]) } finally { setBuscando(false) }
    }, 300)
    return () => clearTimeout(id)
  }, [q])
  // Ao SAIR da busca, recarrega a página 1 do servidor (com filtro/sort atuais).
  const buscaAntes = useRef(false)
  useEffect(() => {
    if (buscaAntes.current && !buscandoAtivo) irPagina(1, filtro, sort)
    buscaAntes.current = buscandoAtivo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscandoAtivo])

  // ── Fonte exibida ──
  // Buscando: resultados do servidor, filtrados + ordenados + paginados no cliente.
  // Navegando: a página do servidor (10) — só aplica sort de feitos/média no cliente (na página).
  const buscaFiltrada = useMemo(() => {
    if (!buscandoAtivo) return []
    const base = (busca ?? []).filter((e) => filtro === 'todos' || (filtro === 'passaporte' ? e.classificacao === 'passaporte' : e.classificacao !== 'passaporte'))
    return ordenarCliente(base, sort)
  }, [buscandoAtivo, busca, filtro, sort])

  const totalPaginas = buscandoAtivo ? Math.max(1, Math.ceil(buscaFiltrada.length / POR_PAGINA)) : Math.max(1, Math.ceil(totalFiltro / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = buscandoAtivo
    ? buscaFiltrada.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)
    : (sort && !SORT_SERVIDOR.includes(sort.key) ? ordenarCliente(rows, sort) : rows)
  const totalMostrado = buscandoAtivo ? buscaFiltrada.length : totalFiltro
  const primeiroIdx = totalMostrado === 0 ? 0 : (paginaAtual - 1) * POR_PAGINA + 1
  const ultimoIdx = buscandoAtivo ? Math.min(paginaAtual * POR_PAGINA, totalMostrado) : (paginaAtual - 1) * POR_PAGINA + visiveis.length

  const colunasExport: ColunaExport<EstudanteRow>[] = [
    { titulo: 'Nome', valor: (e) => e.nome, largura: 32 },
    { titulo: 'E-mail', valor: (e) => e.email, largura: 30 },
    { titulo: 'CPF', valor: (e) => e.cpf },
    { titulo: 'Telefone', valor: (e) => e.telefone },
    { titulo: 'Plano', valor: (e) => (ehAdmin(e) ? 'Admin' : e.classificacao === 'vitalicio' ? 'Vitalício' : e.classificacao === 'passaporte' ? 'Passaporte' : 'Padrão') },
    { titulo: 'Simulados feitos', valor: (e) => e.feitos },
    { titulo: 'Média', valor: (e) => (e.media != null ? e.media.toFixed(1).replace('.', ',') : '') },
    { titulo: 'Cadastrado em', valor: (e) => fmtData(e.created_at) },
  ]

  function irPaginaSegura(p: number) {
    const alvo = Math.min(Math.max(1, p), totalPaginas)
    if (buscandoAtivo) setPagina(alvo)
    else irPagina(alvo)
  }

  return (
    <div className="space-y-4">
      {/* KPIs (contagens cacheadas do servidor) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={<Users className="h-5 w-5" />} tom="primary" rotulo="Estudantes" valor={kpis.total} />
        <Kpi icon={<Crown className="h-5 w-5" />} tom="violet" rotulo="Passaporte" valor={kpis.passaporte} />
        <Kpi icon={<GraduationCap className="h-5 w-5" />} tom="slate" rotulo="Padrão" valor={Math.max(0, kpis.total - kpis.passaporte)} />
        <Kpi icon={<ClipboardCheck className="h-5 w-5" />} tom="emerald" rotulo="Simulados feitos" valor={kpis.feitos} />
        <Kpi icon={<UserCheck className="h-5 w-5" />} tom="sky" rotulo="Alunos ativos" valor={kpis.ativos} />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        {/* busca + filtros */}
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, e-mail, CPF ou telefone…"
              className="w-full rounded-lg border bg-transparent py-2 pl-9 pr-8 text-sm outline-none transition focus:ring-2 focus:ring-ring" />
            {q && <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
          </div>
          <div className="flex items-center gap-1.5">
            {([['todos', 'Todos'], ['passaporte', 'Passaporte'], ['estudante', 'Padrão']] as [Filtro, string][]).map(([v, label]) => (
              <button key={v} type="button" onClick={() => mudarFiltro(v)}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition', filtro === v ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                {label}
              </button>
            ))}
          </div>
          <ExportButton fetchRows={exportarTodosEstudantes} colunas={colunasExport} nomeBase="estudantes" titulo="Estudantes" subtitulo={`${kpis.total} estudante(s)`} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {buscandoAtivo
              ? (buscando ? 'Buscando…' : <>{totalMostrado} resultado(s) para "<b className="text-foreground">{q.trim()}</b>"</>)
              : totalMostrado > 0 ? <>Exibindo <b className="tabular-nums text-foreground">{primeiroIdx}–{ultimoIdx}</b> de <b className="tabular-nums text-foreground">{totalMostrado}</b></> : 'Nenhum estudante'}
          </span>
          {carregandoPag && <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> carregando…</span>}
        </div>

        {/* tabela (só a página atual — 10 linhas) */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b">
                <Th label="Estudante" k="nome" sort={sort} onSort={ordenarPor} />
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">CPF / Telefone</th>
                <Th label="Plano" k="classificacao" sort={sort} onSort={ordenarPor} />
                <Th label="Simulados" k="feitos" sort={sort} onSort={ordenarPor} align="center" className="whitespace-nowrap" />
                <Th label="Média" k="media" sort={sort} onSort={ordenarPor} align="center" className="whitespace-nowrap" />
                <Th label="Cadastrado" k="created_at" sort={sort} onSort={ordenarPor} className="hidden whitespace-nowrap sm:table-cell" />
                <th className="px-4 py-2.5 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">{(buscando || carregandoPag) ? 'Carregando…' : 'Nenhum estudante encontrado.'}</td></tr>
              ) : visiveis.map((e) => (
                <tr key={e.id} className="group border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/estudantes/${e.id}`} className="flex items-center gap-3">
                      <AvatarEstudante nome={e.nome} avatar={e.avatar} cor={e.avatarCor} className="h-9 w-9 bg-primary/10 text-xs text-primary" />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-foreground group-hover:text-primary">{e.nome || '—'}</span>
                        <span className="block truncate text-xs text-muted-foreground">{e.email ?? 'sem e-mail'}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs tabular-nums text-muted-foreground lg:table-cell">{[e.cpf, e.telefone].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-4 py-2.5">
                    {ehAdmin(e)
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">Admin</span>
                      : <ClassificacaoBadge classificacao={e.classificacao} />}
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums">{e.feitos > 0 ? <span className="font-semibold">{e.feitos}</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className={cn('px-4 py-2.5 text-center font-semibold tabular-nums', notaTom(e.media))}>{e.media != null ? e.media.toFixed(1) : '—'}</td>
                  <td className="hidden whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">{fmtData(e.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/admin/estudantes/${e.id}`} title="Abrir dashboard do estudante"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-primary/10 hover:text-primary">
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                      <ExcluirEstudanteButton id={e.id} nome={e.nome} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* paginação */}
        {totalPaginas > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
            <span className="text-xs text-muted-foreground">Página <b className="tabular-nums text-foreground">{paginaAtual}</b> de <b className="tabular-nums text-foreground">{totalPaginas}</b></span>
            <div className="flex items-center gap-1">
              <PagBtn onClick={() => irPaginaSegura(1)} disabled={paginaAtual === 1 || carregandoPag} title="Início"><ChevronsLeft className="h-4 w-4" /></PagBtn>
              <PagBtn onClick={() => irPaginaSegura(paginaAtual - 1)} disabled={paginaAtual === 1 || carregandoPag} title="Anterior"><ChevronLeft className="h-4 w-4" /></PagBtn>
              <PagBtn onClick={() => irPaginaSegura(paginaAtual + 1)} disabled={paginaAtual === totalPaginas || carregandoPag} title="Próxima"><ChevronRight className="h-4 w-4" /></PagBtn>
              <PagBtn onClick={() => irPaginaSegura(totalPaginas)} disabled={paginaAtual === totalPaginas || carregandoPag} title="Final"><ChevronsRight className="h-4 w-4" /></PagBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PagBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
      {children}
    </button>
  )
}

/** Cabeçalho de coluna ordenável — mostra ↑ (asc), ↓ (desc) ou ⇅ (inativo) ao lado do texto. */
function Th({ label, k, sort, onSort, align = 'left', className }: {
  label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void; align?: 'left' | 'center'; className?: string
}) {
  const ativo = sort?.key === k
  const Icon = ativo ? (sort!.dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown
  return (
    <th className={cn('px-4 py-2.5 font-medium', align === 'center' && 'text-center', className)}>
      <button type="button" onClick={() => onSort(k)}
        className={cn('inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground', align === 'center' && 'mx-auto', ativo && 'text-foreground')}>
        {label}
        <Icon className={cn('h-3.5 w-3.5', ativo ? 'opacity-100' : 'opacity-40')} />
      </button>
    </th>
  )
}

function Kpi({ icon, tom, rotulo, valor }: { icon: React.ReactNode; tom: 'primary' | 'violet' | 'slate' | 'emerald' | 'sky'; rotulo: string; valor: number }) {
  const cores: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    slate: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
    emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    sky: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cores[tom])}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
        <p className="text-xl font-bold leading-tight tabular-nums">{valor.toLocaleString('pt-BR')}</p>
      </div>
    </div>
  )
}
