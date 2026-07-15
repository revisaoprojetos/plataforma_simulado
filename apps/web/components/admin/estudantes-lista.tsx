'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Users, Crown, ClipboardCheck, X, ArrowUpRight, GraduationCap, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'
import { ExcluirEstudanteButton } from '@/components/admin/excluir-estudante-button'

export type EstudanteRow = {
  id: string; nome: string; email: string | null; cpf: string | null; telefone: string | null
  classificacao: string | null; created_at: string | null; feitos: number; media: number | null
}

type Filtro = 'todos' | 'passaporte' | 'estudante'
type SortKey = 'nome' | 'classificacao' | 'feitos' | 'media' | 'created_at'
type Sort = { key: SortKey; dir: 'asc' | 'desc' } | null

function iniciais(nome: string) {
  return (nome || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('')
}
function fmtData(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function notaTom(n: number | null) {
  if (n == null) return 'text-muted-foreground'
  return n >= 7 ? 'text-emerald-600 dark:text-emerald-400' : n >= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
}

export function EstudantesLista({ estudantes }: { estudantes: EstudanteRow[] }) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [sort, setSort] = useState<Sort>(null)

  function ordenarPor(key: SortKey) {
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    return estudantes.filter((e) => {
      const okFiltro = filtro === 'todos' || (filtro === 'passaporte' ? e.classificacao === 'passaporte' : e.classificacao !== 'passaporte')
      const okBusca = !t || [e.nome, e.email, e.cpf, e.telefone].some((v) => (v ?? '').toLowerCase().includes(t))
      return okFiltro && okBusca
    })
  }, [estudantes, q, filtro])

  const ordenados = useMemo(() => {
    if (!sort) return filtrados
    const dir = sort.dir === 'asc' ? 1 : -1
    const arr = [...filtrados]
    arr.sort((a, b) => {
      switch (sort.key) {
        case 'nome': return (a.nome || '').localeCompare(b.nome || '', 'pt-BR') * dir
        case 'classificacao': return (a.classificacao || '').localeCompare(b.classificacao || '', 'pt-BR') * dir
        case 'feitos': return (a.feitos - b.feitos) * dir
        case 'media': {
          // Sem média vai sempre para o fim, independente da direção.
          if (a.media == null && b.media == null) return 0
          if (a.media == null) return 1
          if (b.media == null) return -1
          return (a.media - b.media) * dir
        }
        case 'created_at': {
          const av = a.created_at ? Date.parse(a.created_at) : 0
          const bv = b.created_at ? Date.parse(b.created_at) : 0
          return (av - bv) * dir
        }
      }
    })
    return arr
  }, [filtrados, sort])

  const totalPass = estudantes.filter((e) => e.classificacao === 'passaporte').length
  const totalFeitos = estudantes.reduce((a, e) => a + e.feitos, 0)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Users className="h-5 w-5" />} tom="primary" rotulo="Estudantes" valor={estudantes.length} />
        <Kpi icon={<Crown className="h-5 w-5" />} tom="violet" rotulo="Passaporte" valor={totalPass} />
        <Kpi icon={<GraduationCap className="h-5 w-5" />} tom="slate" rotulo="Padrão" valor={estudantes.length - totalPass} />
        <Kpi icon={<ClipboardCheck className="h-5 w-5" />} tom="emerald" rotulo="Simulados feitos" valor={totalFeitos} />
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
              <button key={v} type="button" onClick={() => setFiltro(v)}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition', filtro === v ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-3 py-2 text-xs text-muted-foreground">Exibindo <b className="tabular-nums text-foreground">{filtrados.length}</b> de {estudantes.length}</div>

        {/* tabela */}
        <div className="scroll-claro max-h-[62vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
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
              {ordenados.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Nenhum estudante encontrado.</td></tr>
              ) : ordenados.map((e) => (
                <tr key={e.id} className="group border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/estudantes/${e.id}`} className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{iniciais(e.nome)}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-foreground group-hover:text-primary">{e.nome || '—'}</span>
                        <span className="block truncate text-xs text-muted-foreground">{e.email ?? 'sem e-mail'}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs tabular-nums text-muted-foreground lg:table-cell">{[e.cpf, e.telefone].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-4 py-2.5"><ClassificacaoBadge classificacao={e.classificacao} /></td>
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
      </div>
    </div>
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

function Kpi({ icon, tom, rotulo, valor }: { icon: React.ReactNode; tom: 'primary' | 'violet' | 'slate' | 'emerald'; rotulo: string; valor: number }) {
  const cores: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    slate: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
    emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cores[tom])}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
        <p className="text-xl font-bold leading-tight tabular-nums">{valor}</p>
      </div>
    </div>
  )
}
