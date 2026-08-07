'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BarraBusca, FiltroSelect, Vazio, Iniciais, Anel, corAcerto } from '@/components/admin/relatorios/lista-kit'
import { cn } from '@/lib/utils'
import { carregarLoteEstudantes, type EstudanteBase } from '@/app/admin/estudantes/actions'

export type AgregadoEstudante = { simulados: number; notaMedia: number | null; ultima: string | null }
export type ResumoEstudante = { id: string; nome: string; simulados: number; notaMedia: number | null; ultima: string | null }

const POR_PAGINA = 25
const LOTE = 1000 // teto do PostgREST — carrega o restante em segundo plano
const nota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))
const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')

type OrdCampo = 'nome' | 'simulados' | 'nota' | 'ultima'

/** Cabeçalho de coluna ordenável (mesmo padrão da área de Estudantes do banco). */
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

export function EstudantesLista({ inicial, agregados, total }: {
  inicial: EstudanteBase[]
  agregados: Record<string, AgregadoEstudante>
  total: number
}) {
  const router = useRouter()
  const aplicar = useMemo(() => (b: EstudanteBase): ResumoEstudante => ({
    id: b.id, nome: b.nome ?? 'Estudante',
    simulados: agregados[b.id]?.simulados ?? 0,
    notaMedia: agregados[b.id]?.notaMedia ?? null,
    ultima: agregados[b.id]?.ultima ?? null,
  }), [agregados])

  const [rows, setRows] = useState<ResumoEstudante[]>(() => inicial.map(aplicar))
  const [carregando, setCarregando] = useState(inicial.length < total)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [ordCampo, setOrdCampo] = useState<OrdCampo>('nota')
  const [ordDir, setOrdDir] = useState<'asc' | 'desc'>('desc')
  const [pagina, setPagina] = useState(1)

  function ordenar(campo: OrdCampo) {
    if (ordCampo === campo) setOrdDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setOrdCampo(campo); setOrdDir(campo === 'nome' ? 'asc' : 'desc') }
  }

  // Carrega o restante em segundo plano (em lotes), sem travar a primeira exibição.
  // Robusto ao React Strict Mode (double-invoke do dev): refs compartilhadas SOBREVIVEM ao remount
  // simulado, então o 2º efeito retoma de onde o 1º (cancelado pela limpeza) parou — em vez de um
  // "rodouRef" que bloqueava o restart e deixava a lista travada no 1º lote (30/N). Dedup por id,
  // retry em hiccup e `comContagem=false` nos lotes de fundo (só o 1º precisa do total).
  const offsetRef = useRef(inicial.length)
  const doneRef = useRef(inicial.length >= total)
  const totalRef = useRef(total); totalRef.current = total
  const aplicarRef = useRef(aplicar); aplicarRef.current = aplicar
  useEffect(() => {
    if (doneRef.current) return
    let cancel = false
    ;(async () => {
      while (!cancel && offsetRef.current < totalRef.current) {
        let lote: EstudanteBase[]
        try { lote = (await carregarLoteEstudantes(offsetRef.current, LOTE, false)).rows }
        catch { await new Promise((r) => setTimeout(r, 600)); continue } // hiccup transitório → retenta
        if (cancel) return
        if (!lote.length) break
        offsetRef.current += lote.length
        setRows((prev) => {
          const vistos = new Set(prev.map((r) => r.id))
          const novos = lote.filter((r) => !vistos.has(r.id)).map(aplicarRef.current)
          return novos.length ? [...prev, ...novos] : prev
        })
      }
      if (!cancel) { doneRef.current = true; setCarregando(false) }
    })()
    return () => { cancel = true }
  }, [])

  const lista = useMemo(() => {
    const termo = q.trim().toLowerCase()
    const r = rows.filter((e) => (!termo || e.nome.toLowerCase().includes(termo)) && (filtro === 'todos' || e.simulados > 0))
    const dir = ordDir === 'asc' ? 1 : -1
    const val = (e: ResumoEstudante): string | number => {
      if (ordCampo === 'nome') return e.nome.toLowerCase()
      if (ordCampo === 'simulados') return e.simulados
      if (ordCampo === 'ultima') return e.ultima ? new Date(e.ultima).getTime() : -1
      return e.notaMedia ?? -1
    }
    return [...r].sort((a, b) => {
      const va = val(a), vb = val(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'pt-BR') * dir
    })
  }, [rows, q, filtro, ordCampo, ordDir])

  useEffect(() => { setPagina(1) }, [q, filtro, ordCampo, ordDir])
  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = lista.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  return (
    <div className="space-y-3">
      <BarraBusca valor={q} onValor={setQ} placeholder="Buscar estudante pelo nome…">
        <FiltroSelect valor={filtro} onValor={setFiltro} opcoes={[
          { valor: 'todos', rotulo: 'Todos' },
          { valor: 'ativos', rotulo: 'Com atividade' },
        ]} />
      </BarraBusca>

      <div className="overflow-hidden rounded-2xl border bg-card">
        {/* Faixa: contagem + carregamento em segundo plano. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
          <span>{lista.length > 0 ? <>Exibindo <b className="tabular-nums text-foreground">{(paginaAtual - 1) * POR_PAGINA + 1}–{Math.min(paginaAtual * POR_PAGINA, lista.length)}</b> de <b className="tabular-nums text-foreground">{lista.length}</b></> : ' '}</span>
          {carregando && (
            <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando estudantes… <b className="tabular-nums text-foreground">{rows.length}</b>/<b className="tabular-nums">{total}</b></span>
          )}
        </div>

        {visiveis.length === 0 ? (
          <Vazio>{carregando ? 'Carregando…' : 'Nenhum estudante encontrado.'}</Vazio>
        ) : (
          <div className="max-h-[62vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <ColOrd label="Estudante" campo="nome" ordCampo={ordCampo} ordDir={ordDir} onSort={ordenar} />
                  <ColOrd label="Simulados" campo="simulados" ordCampo={ordCampo} ordDir={ordDir} onSort={ordenar} className="w-28 text-center" />
                  <ColOrd label="Nota média" campo="nota" ordCampo={ordCampo} ordDir={ordDir} onSort={ordenar} className="w-32 text-center" />
                  <ColOrd label="Última atividade" campo="ultima" ordCampo={ordCampo} ordDir={ordDir} onSort={ordenar} className="w-40" />
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((e) => {
                  const pct = e.notaMedia != null ? Math.round(e.notaMedia * 10) : 0
                  return (
                    <TableRow key={e.id} onClick={() => router.push(`/admin/relatorios/estudantes?estudante=${e.id}`)}
                      className="group cursor-pointer">
                      <TableCell>
                        <Link href={`/admin/relatorios/estudantes?estudante=${e.id}`} onClick={(ev) => ev.stopPropagation()}
                          className="flex items-center gap-2.5">
                          <Iniciais nome={e.nome} />
                          <span className="min-w-0 truncate font-medium group-hover:text-primary">{e.nome}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-center tabular-nums font-medium">{e.simulados}</TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          {e.notaMedia != null
                            ? <Anel pct={pct} cor={corAcerto(pct)} tamanho={40}>{nota(e.notaMedia)}</Anel>
                            : <span className="text-xs text-muted-foreground">sem nota</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtData(e.ultima)}</TableCell>
                      <TableCell className="text-center">
                        <ArrowRight className="mx-auto h-4 w-4 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </TableCell>
                    </TableRow>
                  )
                })}
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
