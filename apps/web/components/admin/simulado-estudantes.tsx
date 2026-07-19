'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Search, ArrowUpDown, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { listarEstudantesSimulado, type EstudanteLinkado } from '@/app/admin/simulados/actions'

type Campo = 'nome' | 'email' | 'situacao' | 'nota'
const POR_PAGINA = 11

const situacaoCfg: Record<string, { label: string; cls: string }> = {
  finalizou: { label: 'Finalizou', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  em_andamento: { label: 'Em andamento', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  nao_iniciou: { label: 'Não iniciou', cls: 'bg-muted text-muted-foreground' },
}

export function SimuladoEstudantes({ simuladoId }: { simuladoId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [dados, setDados] = useState<EstudanteLinkado[]>([])

  const [busca, setBusca] = useState('')
  const [fClass, setFClass] = useState<'todos' | 'passaporte' | 'normal'>('todos')
  const [fSit, setFSit] = useState<'todos' | 'finalizou' | 'em_andamento' | 'nao_iniciou'>('todos')
  const [campo, setCampo] = useState<Campo>('nome')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    listarEstudantesSimulado(simuladoId)
      .then((r) => { if (!vivo) return; if (r.error) setErro(r.error); else setDados(r.estudantes ?? []) })
      .catch(() => vivo && setErro('Falha ao carregar estudantes.'))
      .finally(() => vivo && setCarregando(false))
    return () => { vivo = false }
  }, [simuladoId])

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    let lista = dados.filter((e) => {
      if (fClass !== 'todos' && (e.classificacao ?? 'normal') !== fClass) return false
      if (fSit !== 'todos' && e.situacao !== fSit) return false
      if (q && !`${e.nome} ${e.email ?? ''} ${e.cpf ?? ''} ${e.telefone ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
    lista = [...lista].sort((a, b) => {
      let c = 0
      if (campo === 'nome') c = a.nome.localeCompare(b.nome, 'pt-BR')
      else if (campo === 'email') c = (a.email ?? '').localeCompare(b.email ?? '', 'pt-BR')
      else if (campo === 'situacao') c = a.situacao.localeCompare(b.situacao)
      else if (campo === 'nota') c = (a.nota ?? -1) - (b.nota ?? -1)
      return dir === 'asc' ? c : -c
    })
    return lista
  }, [dados, busca, fClass, fSit, campo, dir])

  // Reset de página quando muda filtro/busca.
  useEffect(() => { setPagina(1) }, [busca, fClass, fSit, campo, dir])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  function ordenarPor(c: Campo) {
    if (campo === c) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setCampo(c); setDir('asc') }
  }

  const nPassaporte = dados.filter((e) => e.classificacao === 'passaporte').length

  if (carregando) {
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando estudantes…</div>
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
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail, CPF ou telefone…" className="pl-8" />
        </div>
        <select value={fClass} onChange={(e) => setFClass(e.target.value as any)} className="h-9 rounded-lg border bg-background px-2.5 text-sm">
          <option value="todos">Toda classificação</option>
          <option value="passaporte">Passaporte</option>
          <option value="normal">Normal</option>
        </select>
        <select value={fSit} onChange={(e) => setFSit(e.target.value as any)} className="h-9 rounded-lg border bg-background px-2.5 text-sm">
          <option value="todos">Toda situação</option>
          <option value="finalizou">Finalizou</option>
          <option value="em_andamento">Em andamento</option>
          <option value="nao_iniciou">Não iniciou</option>
        </select>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        {filtrados.length} de {dados.length} estudante(s) linkado(s){nPassaporte ? ` · ${nPassaporte} passaporte` : ''}
      </p>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <Th c="nome">Nome</Th>
              <Th c="email">E-mail</Th>
              <TableHead>CPF</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Classificação</TableHead>
              <Th c="situacao">Situação</Th>
              <Th c="nota" className="text-right">Nota</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Nenhum estudante encontrado.</TableCell></TableRow>
            ) : visiveis.map((e) => {
              const sit = situacaoCfg[e.situacao] ?? situacaoCfg.nao_iniciou
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{e.email ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{e.cpf ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{e.telefone ?? '—'}</TableCell>
                  <TableCell>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', e.classificacao === 'passaporte' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' : 'bg-muted text-muted-foreground')}>
                      {e.classificacao === 'passaporte' ? 'Passaporte' : 'Normal'}
                    </span>
                  </TableCell>
                  <TableCell><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', sit.cls)}>{sit.label}</span></TableCell>
                  <TableCell className="text-right tabular-nums">{e.nota != null ? e.nota.toFixed(1) : '—'}</TableCell>
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
            <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={paginaAtual <= 1}
              className="rounded-lg border px-3 py-1 disabled:opacity-40 hover:bg-muted">Anterior</button>
            <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={paginaAtual >= totalPaginas}
              className="rounded-lg border px-3 py-1 disabled:opacity-40 hover:bg-muted">Próxima</button>
          </div>
        </div>
      )}
    </div>
  )
}
