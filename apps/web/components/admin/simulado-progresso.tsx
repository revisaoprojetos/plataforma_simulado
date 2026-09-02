'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Search, ArrowUpDown, Users, RefreshCw, Radio, PauseCircle, CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { progressoEstudantesSimulado, type ProgressoEstudante, type SituacaoAoVivo } from '@/app/admin/simulados/actions'

type Campo = 'nome' | 'email' | 'respondidas' | 'acertos' | 'erros' | 'emBranco' | 'media'
type FiltroSit = 'todos' | SituacaoAoVivo
const POR_PAGINA = 11

// Rótulo/estilo de cada situação ao vivo (badge da tabela + chips do filtro).
const SIT_META: Record<SituacaoAoVivo, { label: string; icon: any; badge: string; chip: string; dot: string }> = {
  fazendo:    { label: 'Fazendo agora', icon: Radio,        badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  pausado:    { label: 'Pausado',       icon: PauseCircle,  badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',       chip: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',       dot: 'bg-amber-500' },
  finalizou:  { label: 'Finalizou',     icon: CheckCircle2, badge: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',             chip: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',                 dot: 'bg-sky-500' },
  nao_iniciou:{ label: 'Não iniciou',   icon: Circle,       badge: 'bg-muted text-muted-foreground',                          chip: 'border-border bg-muted text-muted-foreground',                                   dot: 'bg-muted-foreground/40' },
}

/** Tempo relativo curto ("agora", "há 3 min", "há 2h", "há 5d") para a última atividade. */
function haQuanto(ms: number | null): string {
  if (!ms) return ''
  const d = Date.now() - ms
  const min = Math.floor(d / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

export function SimuladoProgresso({ simuladoId }: { simuladoId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [dados, setDados] = useState<ProgressoEstudante[]>([])
  const [total, setTotal] = useState(0)

  const [busca, setBusca] = useState('')
  const [filtroSit, setFiltroSit] = useState<FiltroSit>('todos')
  const [campo, setCampo] = useState<Campo>('nome')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [pagina, setPagina] = useState(1)

  const [atualizadoEm, setAtualizadoEm] = useState('')
  async function carregar(silencioso = false) {
    if (!silencioso) setCarregando(true)
    const r = await progressoEstudantesSimulado(simuladoId)
    if (r.error) setErro(r.error)
    else { setDados(r.estudantes ?? []); setTotal(r.total ?? 0); setErro(null); setAtualizadoEm(new Date().toLocaleTimeString('pt-BR')) }
    setCarregando(false)
  }
  // Ao vivo: carrega ao abrir e atualiza sozinho a cada 15s.
  useEffect(() => {
    carregar()
    const t = setInterval(() => carregar(true), 15_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simuladoId])

  // Contagem por situação (para os chips do filtro).
  const contagem = useMemo(() => {
    const c = { todos: dados.length, fazendo: 0, pausado: 0, finalizou: 0, nao_iniciou: 0 } as Record<FiltroSit, number>
    for (const e of dados) c[e.situacao]++
    return c
  }, [dados])

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    let lista = dados.filter((e) => (!q || `${e.nome} ${e.email ?? ''}`.toLowerCase().includes(q)) && (filtroSit === 'todos' || e.situacao === filtroSit))
    lista = [...lista].sort((a, b) => {
      let c = 0
      if (campo === 'nome') c = a.nome.localeCompare(b.nome, 'pt-BR')
      else if (campo === 'email') c = (a.email ?? '').localeCompare(b.email ?? '', 'pt-BR')
      else c = (a[campo] as number) - (b[campo] as number)
      return dir === 'asc' ? c : -c
    })
    return lista
  }, [dados, busca, campo, dir])

  useEffect(() => { setPagina(1) }, [busca, campo, dir, filtroSit])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  function ordenarPor(c: Campo) {
    if (campo === c) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setCampo(c); setDir(c === 'nome' || c === 'email' ? 'asc' : 'desc') }
  }

  const mediaTone = (n: number) => (n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')

  if (carregando && !dados.length) {
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando progresso…</div>
  }
  if (erro) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{erro}</div>
  }

  const Th = ({ c, children, className }: { c: Campo; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button type="button" onClick={() => ordenarPor(c)} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}
        <ArrowUpDown className={cn('h-3 w-3', campo === c ? 'text-primary' : 'text-muted-foreground/50')} />
      </button>
    </TableHead>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail…" className="pl-8" />
        </div>
        <button type="button" onClick={() => carregar()} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
          <RefreshCw className={cn('h-4 w-4', carregando && 'animate-spin')} /> Atualizar
        </button>
      </div>

      {/* Filtro por situação ao vivo — clique em "Fazendo agora" p/ ver só quem está mexendo. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          { key: 'todos', label: 'Todos' },
          { key: 'fazendo', label: 'Fazendo agora' },
          { key: 'pausado', label: 'Pausados' },
          { key: 'finalizou', label: 'Finalizaram' },
          { key: 'nao_iniciou', label: 'Não iniciaram' },
        ] as { key: FiltroSit; label: string }[]).map((c) => {
          const ativo = filtroSit === c.key
          const meta = c.key !== 'todos' ? SIT_META[c.key as SituacaoAoVivo] : null
          return (
            <button key={c.key} type="button" onClick={() => setFiltroSit(c.key)}
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                ativo ? (meta ? meta.chip : 'border-primary bg-primary/10 text-primary') : 'border-border text-muted-foreground hover:bg-muted')}>
              {meta && <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />}
              {c.label}
              <span className="tabular-nums opacity-70">{contagem[c.key]}</span>
            </button>
          )
        })}
      </div>

      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> {filtrados.length} de {dados.length} estudante(s) · {total} questão(ões) no simulado · <span className="font-medium text-emerald-600 dark:text-emerald-400">{contagem.fazendo} fazendo agora</span>
        <span className="ml-1 inline-flex items-center gap-1">· <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /></span> ao vivo (15s){atualizadoEm && ` · ${atualizadoEm}`}</span>
      </p>

      <div className="overflow-hidden rounded-lg border">
        <Table className="w-full table-fixed">
          <colgroup>
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <Th c="nome">Nome</Th>
              <Th c="email">E-mail</Th>
              <TableHead>Situação</TableHead>
              <TableHead>Progresso</TableHead>
              <Th c="respondidas" className="text-right">Respondidas</Th>
              <Th c="acertos" className="text-right">Acertos</Th>
              <Th c="erros" className="text-right">Erros</Th>
              <Th c="emBranco" className="text-right">Em branco</Th>
              <Th c="media" className="text-right">Média</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">Nenhum estudante encontrado.</TableCell></TableRow>
            ) : visiveis.map((e) => {
              const pct = total ? Math.round((e.respondidas / total) * 100) : 0
              const sit = SIT_META[e.situacao]
              const rel = e.situacao === 'fazendo' || e.situacao === 'pausado' ? haQuanto(e.ultimaAtividadeMs) : ''
              return (
                <TableRow key={e.id} className={cn(e.situacao === 'fazendo' && 'bg-emerald-500/[0.04]')}>
                  <TableCell className="truncate font-medium" title={e.nome}>{e.nome}</TableCell>
                  <TableCell className="truncate text-muted-foreground" title={e.email ?? undefined}>{e.email ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium', sit.badge)}>
                        {e.situacao === 'fazendo'
                          ? <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>
                          : <sit.icon className="h-3 w-3" />}
                        {sit.label}
                      </span>
                      {rel && <span className="hidden shrink-0 text-[10px] text-muted-foreground xl:inline" title="Última atividade">{rel}</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{e.respondidas}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{e.acertos}</TableCell>
                  <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">{e.erros}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{e.emBranco}</TableCell>
                  <TableCell className={cn('text-right font-semibold tabular-nums', mediaTone(e.media))}>{e.media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Página {paginaAtual} de {totalPaginas}</span>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setPagina(1)} disabled={paginaAtual <= 1} className="rounded-lg border px-3 py-1 disabled:opacity-40 hover:bg-muted">Início</button>
            <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={paginaAtual <= 1} className="rounded-lg border px-3 py-1 disabled:opacity-40 hover:bg-muted">Anterior</button>
            <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={paginaAtual >= totalPaginas} className="rounded-lg border px-3 py-1 disabled:opacity-40 hover:bg-muted">Próxima</button>
            <button type="button" onClick={() => setPagina(totalPaginas)} disabled={paginaAtual >= totalPaginas} className="rounded-lg border px-3 py-1 disabled:opacity-40 hover:bg-muted">Final</button>
          </div>
        </div>
      )}
    </div>
  )
}
