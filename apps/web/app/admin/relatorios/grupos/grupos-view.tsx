'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BarraBusca, FiltroSelect, Iniciais, Vazio } from '@/components/admin/relatorios/lista-kit'
import { BotaoExportar } from '@/components/admin/relatorios/viz'
import { cn } from '@/lib/utils'

export type GrupoDoAluno = { id: string; nome: string; cor: string | null; em: string | null }
export type LinhaGrupoAluno = { id: string; nome: string; total: number; ultimoEm: string | null; grupos: GrupoDoAluno[] }
export type GrupoOpcao = { id: string; nome: string; cor: string | null }

const POR_PAGINA = 25
const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')

type OrdCampo = 'nome' | 'total' | 'recente'

function ColOrd({ label, campo, ordCampo, ordDir, onSort, className }: { label: string; campo: OrdCampo; ordCampo: OrdCampo; ordDir: 'asc' | 'desc'; onSort: (c: OrdCampo) => void; className?: string }) {
  const ativo = ordCampo === campo
  return (
    <TableHead className={className}>
      <button type="button" onClick={() => onSort(campo)} className={cn('group -ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground', ativo ? 'text-foreground' : 'text-muted-foreground')}>
        <span>{label}</span>
        {ativo ? (ordDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ChevronsUpDown className="h-3.5 w-3.5 opacity-40 group-hover:opacity-70" />}
      </button>
    </TableHead>
  )
}

/** Chip de grupo, com a cor do grupo (fallback pro token da marca). */
function ChipGrupo({ g }: { g: GrupoDoAluno }) {
  const cor = g.cor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(g.cor) ? g.cor : undefined
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={cor ? { borderColor: `${cor}55`, backgroundColor: `${cor}18`, color: cor } : undefined}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: cor ?? 'hsl(var(--primary))' }} />
      {g.nome}
    </span>
  )
}

export function GruposView({ linhas, grupos }: { linhas: LinhaGrupoAluno[]; grupos: GrupoOpcao[] }) {
  const [q, setQ] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('todos')
  const [ordCampo, setOrdCampo] = useState<OrdCampo>('recente')
  const [ordDir, setOrdDir] = useState<'asc' | 'desc'>('desc')
  const [pagina, setPagina] = useState(1)

  function ordenar(campo: OrdCampo) {
    if (ordCampo === campo) setOrdDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setOrdCampo(campo); setOrdDir(campo === 'nome' ? 'asc' : 'desc') }
  }

  const lista = useMemo(() => {
    const termo = q.trim().toLowerCase()
    const r = linhas.filter((e) =>
      (!termo || e.nome.toLowerCase().includes(termo)) &&
      (filtroGrupo === 'todos' || e.grupos.some((g) => g.id === filtroGrupo)))
    const dir = ordDir === 'asc' ? 1 : -1
    const val = (e: LinhaGrupoAluno): string | number => {
      if (ordCampo === 'nome') return e.nome.toLowerCase()
      if (ordCampo === 'total') return e.total
      return e.ultimoEm ? new Date(e.ultimoEm).getTime() : -1
    }
    return [...r].sort((a, b) => {
      const va = val(a), vb = val(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir || a.nome.localeCompare(b.nome, 'pt-BR')
      return String(va).localeCompare(String(vb), 'pt-BR') * dir
    })
  }, [linhas, q, filtroGrupo, ordCampo, ordDir])

  useEffect(() => { setPagina(1) }, [q, filtroGrupo, ordCampo, ordDir])
  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = lista.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  // Export (respeita busca + filtro atuais); grupos do mais recente → mais antigo.
  const exportar = (): (string | number | null)[][] => [
    ['Grupos por aluno'],
    filtroGrupo !== 'todos' ? ['Filtro de grupo', grupos.find((g) => g.id === filtroGrupo)?.nome ?? filtroGrupo] : [],
    [],
    ['Estudante', 'Qtd. grupos', 'Último vínculo', 'Grupos (recentes primeiro)'],
    ...lista.map((e) => [e.nome, e.total, fmtData(e.ultimoEm), e.grupos.map((g) => g.nome).join(' · ')]),
  ].filter((l) => l.length)

  const nomeArqGrupo = filtroGrupo !== 'todos' ? `_${(grupos.find((g) => g.id === filtroGrupo)?.nome ?? '').replace(/\s+/g, '-').toLowerCase()}` : ''

  return (
    <div className="space-y-3">
      <BarraBusca valor={q} onValor={setQ} placeholder="Buscar estudante pelo nome…">
        <FiltroSelect valor={filtroGrupo} onValor={setFiltroGrupo} opcoes={[
          { valor: 'todos', rotulo: 'Todos os grupos' },
          ...grupos.map((g) => ({ valor: g.id, rotulo: g.nome })),
        ]} />
        <BotaoExportar nome={`grupos-por-aluno${nomeArqGrupo}`} linhas={exportar} />
      </BarraBusca>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
          <span>{lista.length > 0 ? <>Exibindo <b className="tabular-nums text-foreground">{(paginaAtual - 1) * POR_PAGINA + 1}–{Math.min(paginaAtual * POR_PAGINA, lista.length)}</b> de <b className="tabular-nums text-foreground">{lista.length}</b> aluno(s)</> : ' '}</span>
          {filtroGrupo !== 'todos' && <span>Filtrando por <b className="text-foreground">{grupos.find((g) => g.id === filtroGrupo)?.nome}</b></span>}
        </div>

        {visiveis.length === 0 ? (
          <Vazio>Nenhum aluno encontrado.</Vazio>
        ) : (
          <div className="max-h-[62vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <ColOrd label="Estudante" campo="nome" ordCampo={ordCampo} ordDir={ordDir} onSort={ordenar} />
                  <ColOrd label="Grupos" campo="total" ordCampo={ordCampo} ordDir={ordDir} onSort={ordenar} className="w-24 text-center" />
                  <ColOrd label="Último vínculo" campo="recente" ordCampo={ordCampo} ordDir={ordDir} onSort={ordenar} className="w-36" />
                  <TableHead>Grupos <span className="font-normal text-muted-foreground">(recentes primeiro)</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Iniciais nome={e.nome} />
                        <span className="min-w-0 truncate font-medium">{e.nome}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums font-medium">{e.total}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtData(e.ultimoEm)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {e.grupos.map((g) => <ChipGrupo key={g.id} g={g} />)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {lista.length > POR_PAGINA && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-sm">
            <span className="text-xs text-muted-foreground">Página <b className="tabular-nums text-foreground">{paginaAtual}</b> de <b className="tabular-nums text-foreground">{totalPaginas}</b></span>
            <div className="flex items-center gap-1">
              <PagBtn onClick={() => setPagina(1)} disabled={paginaAtual === 1} title="Início"><ChevronsLeft className="h-4 w-4" /></PagBtn>
              <PagBtn onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={paginaAtual === 1} title="Anterior"><ChevronLeft className="h-4 w-4" /></PagBtn>
              <PagBtn onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={paginaAtual === totalPaginas} title="Próxima"><ChevronRight className="h-4 w-4" /></PagBtn>
              <PagBtn onClick={() => setPagina(totalPaginas)} disabled={paginaAtual === totalPaginas} title="Final"><ChevronsRight className="h-4 w-4" /></PagBtn>
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
