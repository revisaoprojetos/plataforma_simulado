'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ArrowUp, ArrowDown, ChevronsUpDown, ChevronDown, FileText, FileSpreadsheet } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { BarraBusca, FiltroSelect, Iniciais, Vazio } from '@/components/admin/relatorios/lista-kit'
import { baixarCsv } from '@/components/admin/relatorios/viz'
import { cn } from '@/lib/utils'

export type GrupoDoAluno = { id: string; nome: string; cor: string | null; em: string | null }
export type LinhaGrupoAluno = { id: string; nome: string; total: number; ultimoEm: string | null; grupos: GrupoDoAluno[] }
export type GrupoOpcao = { id: string; nome: string; cor: string | null }

const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')

type OrdCampo = 'nome' | 'total' | 'recente'
type FiltroView = { q: string; grupo: string | null; ord: OrdCampo; dir: 'asc' | 'desc' }

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

/**
 * Lista paginada NO SERVIDOR: busca/filtro/ordenação/página vão na URL e a page re-renderiza só com a
 * página visível. A exportação (CSV/Excel) busca o conjunto completo do filtro atual em
 * /api/admin/relatorios/grupos (fora do payload RSC).
 */
export function GruposView({ linhas, total, pagina, porPagina, filtro, grupos }: {
  linhas: LinhaGrupoAluno[]; total: number; pagina: number; porPagina: number; filtro: FiltroView; grupos: GrupoOpcao[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const atual = useSearchParams()
  const [pend, startTransition] = useTransition()
  const [q, setQ] = useState(filtro.q)
  const [exportando, setExportando] = useState(false)
  const filtroGrupo = filtro.grupo ?? 'todos'
  const { ord: ordCampo, dir: ordDir } = filtro

  function navegar(mudancas: Record<string, string | null>) {
    const p = new URLSearchParams(atual?.toString() ?? '')
    for (const [k, v] of Object.entries(mudancas)) { if (v == null || v === '') p.delete(k); else p.set(k, v) }
    const qs = p.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  function ordenar(campo: OrdCampo) {
    if (ordCampo === campo) navegar({ ord: campo, dir: ordDir === 'asc' ? 'desc' : 'asc', pagina: null })
    else navegar({ ord: campo, dir: campo === 'nome' ? 'asc' : 'desc', pagina: null })
  }

  // Busca com debounce → URL (o servidor refaz a consulta).
  const primeira = useRef(true)
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return }
    if (q.trim() === filtro.q.trim()) return
    const t = setTimeout(() => navegar({ q: q.trim() || null, pagina: null }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const irPara = (n: number) => navegar({ pagina: n <= 1 ? null : String(n) })

  async function buscarExport(): Promise<{ linhas: (string | number | null)[][] } | null> {
    setExportando(true)
    try {
      const p = new URLSearchParams()
      if (filtro.q.trim()) p.set('q', filtro.q.trim())
      if (filtro.grupo) p.set('grupo', filtro.grupo)
      p.set('ord', filtro.ord); p.set('dir', filtro.dir)
      const r = await fetch(`/api/admin/relatorios/grupos?${p.toString()}`, { cache: 'no-store' })
      if (!r.ok) throw new Error('falha')
      return await r.json()
    } catch { toast.error('Não foi possível exportar.'); return null } finally { setExportando(false) }
  }
  const nomeArqGrupo = filtroGrupo !== 'todos' ? `_${(grupos.find((g) => g.id === filtroGrupo)?.nome ?? '').replace(/\s+/g, '-').toLowerCase()}` : ''
  const arq = `grupos-por-aluno${nomeArqGrupo}`

  return (
    <div className="space-y-3">
      <BarraBusca valor={q} onValor={setQ} placeholder="Buscar estudante pelo nome…">
        <FiltroSelect valor={filtroGrupo} onValor={(v) => navegar({ grupo: v === 'todos' ? null : v, pagina: null })} opcoes={[
          { valor: 'todos', rotulo: 'Todos os grupos' },
          ...grupos.map((g) => ({ valor: g.id, rotulo: g.nome })),
        ]} />
        <DropdownMenu>
          <DropdownMenuTrigger disabled={exportando} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60">
            <FileSpreadsheet className="h-4 w-4" />
            {exportando ? 'Exportando…' : 'Exportar'} <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={async () => { const d = await buscarExport(); if (d) baixarCsv(arq, d.linhas) }}><FileText className="mr-2 h-4 w-4" /> CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={async () => { const d = await buscarExport(); if (d) { const { baixarExcelSimples } = await import('@/lib/relatorios/excel-kit'); await baixarExcelSimples(arq, d.linhas) } }}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </BarraBusca>

      <div className={cn('overflow-hidden rounded-2xl border bg-card transition-opacity', pend && 'opacity-60')}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
          <span>{total > 0 ? <>Exibindo <b className="tabular-nums text-foreground">{(paginaAtual - 1) * porPagina + 1}–{Math.min(paginaAtual * porPagina, total)}</b> de <b className="tabular-nums text-foreground">{total}</b> aluno(s)</> : ' '}</span>
          {filtroGrupo !== 'todos' && <span>Filtrando por <b className="text-foreground">{grupos.find((g) => g.id === filtroGrupo)?.nome}</b></span>}
        </div>

        {linhas.length === 0 ? (
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
                {linhas.map((e) => (
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

        {total > porPagina && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-sm">
            <span className="text-xs text-muted-foreground">Página <b className="tabular-nums text-foreground">{paginaAtual}</b> de <b className="tabular-nums text-foreground">{totalPaginas}</b></span>
            <div className="flex items-center gap-1">
              <PagBtn onClick={() => irPara(1)} disabled={paginaAtual === 1} title="Início"><ChevronsLeft className="h-4 w-4" /></PagBtn>
              <PagBtn onClick={() => irPara(Math.max(1, paginaAtual - 1))} disabled={paginaAtual === 1} title="Anterior"><ChevronLeft className="h-4 w-4" /></PagBtn>
              <PagBtn onClick={() => irPara(Math.min(totalPaginas, paginaAtual + 1))} disabled={paginaAtual === totalPaginas} title="Próxima"><ChevronRight className="h-4 w-4" /></PagBtn>
              <PagBtn onClick={() => irPara(totalPaginas)} disabled={paginaAtual === totalPaginas} title="Final"><ChevronsRight className="h-4 w-4" /></PagBtn>
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
