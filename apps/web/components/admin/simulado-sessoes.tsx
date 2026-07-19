'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Search, ArrowUpDown, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { listarSessoesSimulado, type SessaoLinkada } from '@/app/admin/simulados/actions'

type Campo = 'estudante' | 'status' | 'nota' | 'iniciado_em'
const POR_PAGINA = 11

const statusCfg: Record<string, { label: string; cls: string }> = {
  finalizada: { label: 'Finalizada', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  em_andamento: { label: 'Em andamento', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  aguardando: { label: 'Aguardando', cls: 'bg-muted text-muted-foreground' },
}

export function SimuladoSessoes({ simuladoId }: { simuladoId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [dados, setDados] = useState<SessaoLinkada[]>([])

  const [busca, setBusca] = useState('')
  const [fStatus, setFStatus] = useState<'todos' | 'finalizada' | 'em_andamento' | 'aguardando'>('todos')
  const [fTeste, setFTeste] = useState<'todos' | 'reais' | 'teste'>('todos')
  const [campo, setCampo] = useState<Campo>('iniciado_em')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    listarSessoesSimulado(simuladoId)
      .then((r) => { if (!vivo) return; if (r.error) setErro(r.error); else setDados(r.sessoes ?? []) })
      .catch(() => vivo && setErro('Falha ao carregar sessões.'))
      .finally(() => vivo && setCarregando(false))
    return () => { vivo = false }
  }, [simuladoId])

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    let lista = dados.filter((s) => {
      if (fStatus !== 'todos' && s.status !== fStatus) return false
      if (fTeste === 'teste' && !s.is_teste) return false
      if (fTeste === 'reais' && s.is_teste) return false
      if (q && !s.estudante.toLowerCase().includes(q)) return false
      return true
    })
    lista = [...lista].sort((a, b) => {
      let c = 0
      if (campo === 'estudante') c = a.estudante.localeCompare(b.estudante, 'pt-BR')
      else if (campo === 'status') c = a.status.localeCompare(b.status)
      else if (campo === 'nota') c = (a.nota ?? -1) - (b.nota ?? -1)
      else if (campo === 'iniciado_em') c = new Date(a.iniciado_em ?? 0).getTime() - new Date(b.iniciado_em ?? 0).getTime()
      return dir === 'asc' ? c : -c
    })
    return lista
  }, [dados, busca, fStatus, fTeste, campo, dir])

  useEffect(() => { setPagina(1) }, [busca, fStatus, fTeste, campo, dir])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  function ordenarPor(c: Campo) {
    if (campo === c) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setCampo(c); setDir(c === 'iniciado_em' || c === 'nota' ? 'desc' : 'asc') }
  }

  const nTeste = dados.filter((s) => s.is_teste).length

  if (carregando) {
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando sessões…</div>
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
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por estudante…" className="pl-8" />
        </div>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value as any)} className="h-9 rounded-lg border bg-background px-2.5 text-sm">
          <option value="todos">Todo status</option>
          <option value="finalizada">Finalizada</option>
          <option value="em_andamento">Em andamento</option>
          <option value="aguardando">Aguardando</option>
        </select>
        <select value={fTeste} onChange={(e) => setFTeste(e.target.value as any)} className="h-9 rounded-lg border bg-background px-2.5 text-sm">
          <option value="todos">Reais e teste</option>
          <option value="reais">Só reais</option>
          <option value="teste">Só teste</option>
        </select>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5" />
        {filtrados.length} de {dados.length} sessão(ões){nTeste ? ` · ${nTeste} de teste` : ''}
      </p>

      <div className="overflow-hidden rounded-lg border">
        <Table className="w-full table-fixed">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[15%]" />
            <col className="w-[9%]" />
            <col className="w-[20%]" />
            <col className="w-[20%]" />
            <col className="w-[8%]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <Th c="estudante">Estudante</Th>
              <Th c="status">Status</Th>
              <Th c="nota" className="text-right">Nota</Th>
              <Th c="iniciado_em">Início</Th>
              <TableHead>Fim</TableHead>
              <TableHead>Teste</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Nenhuma sessão encontrada.</TableCell></TableRow>
            ) : visiveis.map((s) => {
              const st = statusCfg[s.status] ?? statusCfg.aguardando
              return (
                <TableRow key={s.id}>
                  <TableCell className="truncate font-medium" title={s.estudante}>{s.estudante}</TableCell>
                  <TableCell className="truncate"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', st.cls)}>{st.label}</span></TableCell>
                  <TableCell className="text-right tabular-nums">{s.nota != null ? s.nota.toFixed(1) : '—'}</TableCell>
                  <TableCell className="truncate text-muted-foreground" title={formatBrt(s.iniciado_em) ?? undefined}>{formatBrt(s.iniciado_em) ?? '—'}</TableCell>
                  <TableCell className="truncate text-muted-foreground" title={formatBrt(s.finalizado_em) ?? undefined}>{formatBrt(s.finalizado_em) ?? '—'}</TableCell>
                  <TableCell>{s.is_teste ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">Teste</span> : '—'}</TableCell>
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
