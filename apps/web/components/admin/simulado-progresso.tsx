'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Search, ArrowUpDown, Users, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { progressoEstudantesSimulado, type ProgressoEstudante } from '@/app/admin/simulados/actions'

type Campo = 'nome' | 'email' | 'respondidas' | 'acertos' | 'erros' | 'emBranco' | 'media'
const POR_PAGINA = 11

export function SimuladoProgresso({ simuladoId }: { simuladoId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [dados, setDados] = useState<ProgressoEstudante[]>([])
  const [total, setTotal] = useState(0)

  const [busca, setBusca] = useState('')
  const [campo, setCampo] = useState<Campo>('nome')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [pagina, setPagina] = useState(1)

  async function carregar() {
    setCarregando(true)
    const r = await progressoEstudantesSimulado(simuladoId)
    if (r.error) setErro(r.error)
    else { setDados(r.estudantes ?? []); setTotal(r.total ?? 0); setErro(null) }
    setCarregando(false)
  }
  useEffect(() => { carregar() /* eslint-disable-next-line */ }, [simuladoId])

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    let lista = dados.filter((e) => !q || `${e.nome} ${e.email ?? ''}`.toLowerCase().includes(q))
    lista = [...lista].sort((a, b) => {
      let c = 0
      if (campo === 'nome') c = a.nome.localeCompare(b.nome, 'pt-BR')
      else if (campo === 'email') c = (a.email ?? '').localeCompare(b.email ?? '', 'pt-BR')
      else c = (a[campo] as number) - (b[campo] as number)
      return dir === 'asc' ? c : -c
    })
    return lista
  }, [dados, busca, campo, dir])

  useEffect(() => { setPagina(1) }, [busca, campo, dir])

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
        <button type="button" onClick={carregar} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
          <RefreshCw className={cn('h-4 w-4', carregando && 'animate-spin')} /> Atualizar
        </button>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> {filtrados.length} de {dados.length} estudante(s) · {total} questão(ões) no simulado
      </p>

      <div className="overflow-hidden rounded-lg border">
        <Table className="w-full table-fixed">
          <colgroup>
            <col className="w-[19%]" />
            <col className="w-[21%]" />
            <col className="w-[17%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <Th c="nome">Nome</Th>
              <Th c="email">E-mail</Th>
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
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">Nenhum estudante encontrado.</TableCell></TableRow>
            ) : visiveis.map((e) => {
              const pct = total ? Math.round((e.respondidas / total) * 100) : 0
              return (
                <TableRow key={e.id}>
                  <TableCell className="truncate font-medium" title={e.nome}>{e.nome}</TableCell>
                  <TableCell className="truncate text-muted-foreground" title={e.email ?? undefined}>{e.email ?? '—'}</TableCell>
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
