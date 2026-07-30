'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Clock, Loader2, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react'
import { BarraBusca, FiltroSelect, Vazio, Iniciais, Anel, corAcerto } from '@/components/admin/relatorios/lista-kit'
import { carregarLoteEstudantes, type EstudanteBase } from '@/app/admin/estudantes/actions'

export type AgregadoEstudante = { simulados: number; notaMedia: number | null; ultima: string | null }
export type ResumoEstudante = { id: string; nome: string; simulados: number; notaMedia: number | null; ultima: string | null }

const POR_PAGINA = 24
const LOTE = 1000 // teto do PostgREST — carrega o restante em segundo plano
const nota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))
const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')

export function EstudantesLista({ inicial, agregados, total }: {
  inicial: EstudanteBase[]
  agregados: Record<string, AgregadoEstudante>
  total: number
}) {
  const aplicar = useMemo(() => (b: EstudanteBase): ResumoEstudante => ({
    id: b.id, nome: b.nome ?? 'Estudante',
    simulados: agregados[b.id]?.simulados ?? 0,
    notaMedia: agregados[b.id]?.notaMedia ?? null,
    ultima: agregados[b.id]?.ultima ?? null,
  }), [agregados])

  const [rows, setRows] = useState<ResumoEstudante[]>(() => inicial.map(aplicar))
  const [carregando, setCarregando] = useState(inicial.length < total)
  const [q, setQ] = useState('')
  const [ordem, setOrdem] = useState('nota')
  const [filtro, setFiltro] = useState('todos')
  const [pagina, setPagina] = useState(1)

  // Carrega o restante em segundo plano (lotes), sem travar a primeira exibição.
  const rodou = useRef(false)
  useEffect(() => {
    if (rodou.current) return
    rodou.current = true
    let cancel = false
    ;(async () => {
      let off = inicial.length
      while (!cancel && off < total) {
        const { rows: lote } = await carregarLoteEstudantes(off, LOTE)
        if (cancel || !lote.length) break
        setRows((prev) => [...prev, ...lote.map(aplicar)])
        off += lote.length
      }
      if (!cancel) setCarregando(false)
    })()
    return () => { cancel = true }
  }, [inicial, total, aplicar])

  const lista = useMemo(() => {
    const termo = q.trim().toLowerCase()
    const r = rows.filter((e) => (!termo || e.nome.toLowerCase().includes(termo)) && (filtro === 'todos' || e.simulados > 0))
    r.sort((a, b) => {
      if (ordem === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR')
      if (ordem === 'simulados') return b.simulados - a.simulados
      return (b.notaMedia ?? -1) - (a.notaMedia ?? -1)
    })
    return r
  }, [rows, q, ordem, filtro])

  useEffect(() => { setPagina(1) }, [q, ordem, filtro])
  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = lista.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  return (
    <div className="space-y-4">
      <BarraBusca valor={q} onValor={setQ} placeholder="Buscar estudante pelo nome…">
        <FiltroSelect valor={filtro} onValor={setFiltro} opcoes={[
          { valor: 'todos', rotulo: 'Todos' },
          { valor: 'ativos', rotulo: 'Com atividade' },
        ]} />
        <FiltroSelect valor={ordem} onValor={setOrdem} opcoes={[
          { valor: 'nota', rotulo: 'Maior nota média' },
          { valor: 'simulados', rotulo: 'Mais simulados' },
          { valor: 'nome', rotulo: 'Ordem alfabética' },
        ]} />
      </BarraBusca>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{lista.length > 0 ? <>Exibindo <b className="tabular-nums text-foreground">{(paginaAtual - 1) * POR_PAGINA + 1}–{Math.min(paginaAtual * POR_PAGINA, lista.length)}</b> de <b className="tabular-nums text-foreground">{lista.length}</b></> : ' '}</span>
        {carregando && (
          <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando estudantes… <b className="tabular-nums text-foreground">{rows.length}</b>/<b className="tabular-nums">{total}</b></span>
        )}
      </div>

      {visiveis.length === 0 ? (
        <Vazio>{carregando ? 'Carregando…' : 'Nenhum estudante encontrado.'}</Vazio>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {visiveis.map((e) => {
            const pct = e.notaMedia != null ? Math.round(e.notaMedia * 10) : 0
            return (
              <Link key={e.id} href={`/admin/relatorios/estudantes?estudante=${e.id}`}
                className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition hover:border-primary/50 hover:shadow-sm">
                <Iniciais nome={e.nome} />
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-1 font-medium">{e.nome}</h3>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span><span className="font-medium text-foreground tabular-nums">{e.simulados}</span> simulados</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtData(e.ultima)}</span>
                  </div>
                </div>
                {e.notaMedia != null ? (
                  <Anel pct={pct} cor={corAcerto(pct)} tamanho={46}>{nota(e.notaMedia)}</Anel>
                ) : (
                  <span className="text-xs text-muted-foreground">sem nota</span>
                )}
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </Link>
            )
          })}
        </div>
      )}

      {lista.length > POR_PAGINA && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
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
