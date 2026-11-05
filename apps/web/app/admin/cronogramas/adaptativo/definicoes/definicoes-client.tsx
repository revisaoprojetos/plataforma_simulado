'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Database, Info, Loader2, RefreshCw, Search } from 'lucide-react'
import { listarDefinicoesMetas, sincronizarDefinicoesMetas } from '../actions'
import type { DefAnalise } from '@/lib/cronograma/adaptativo/meta-def'

type Resumo = { definicoes: number; aulas: number; legprocs: number; ativas: number; semAluno: number; atualizadoEm: string | null } | null
const POR_PAGINA = 25

const fmtBrt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const fmtTempo = (seg: number) => { if (!seg) return '—'; const h = Math.floor(seg / 3600), m = Math.round((seg % 3600) / 60); return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min` }
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—')

function Card({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <div className="rounded-2xl border bg-card p-3 shadow-sm"><p className="text-xs text-muted-foreground">{rotulo}</p><p className="text-xl font-bold tabular-nums">{valor}</p></div>
}

function Th({ rotulo, campo, ordenar, dir, onOrdenar, className = '' }: { rotulo: string; campo?: string; ordenar: string; dir: 'asc' | 'desc'; onOrdenar: (c: string) => void; className?: string }) {
  if (!campo) return <th className={`px-3 py-2 ${className}`}>{rotulo}</th>
  return (
    <th className={`px-3 py-2 ${className}`}>
      <button type="button" onClick={() => onOrdenar(campo)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground">
        {rotulo}<ArrowUpDown className={`h-3 w-3 ${ordenar === campo ? 'text-primary' : 'opacity-40'}`} aria-hidden />{ordenar === campo && <span className="sr-only">{dir === 'asc' ? 'crescente' : 'decrescente'}</span>}
      </button>
    </th>
  )
}

export function DefinicoesClient() {
  const [itens, setItens] = useState<DefAnalise[]>([])
  const [total, setTotal] = useState(0)
  const [disciplinas, setDisciplinas] = useState<string[]>([])
  const [resumo, setResumo] = useState<Resumo>(null)
  const [migrado, setMigrado] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<'' | 'aula' | 'legproc'>('')
  const [disciplina, setDisciplina] = useState('')
  const [situacao, setSituacao] = useState<'' | 'ativa' | 'inativa'>('')
  const [ordenar, setOrdenar] = useState('disciplina')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [pagina, setPagina] = useState(1)
  const [sincronizando, startSinc] = useTransition()
  const seq = useRef(0)

  const carregar = useCallback(async (busca_: string) => {
    const id = ++seq.current
    setCarregando(true)
    const r = await listarDefinicoesMetas({ busca: busca_, tipo, disciplina, situacao, ordenar, dir, pagina, porPagina: POR_PAGINA })
    if (id !== seq.current) return // resposta velha
    setCarregando(false)
    if (!r.ok) { setErro(r.error ?? 'Falha ao carregar.'); return }
    setErro(null); setMigrado(r.migrado); setItens(r.itens); setTotal(r.total); setDisciplinas(r.disciplinas); setResumo(r.resumo)
  }, [tipo, disciplina, situacao, ordenar, dir, pagina])

  // busca com atraso (digitar não dispara uma consulta por tecla); os demais filtros recarregam direto
  useEffect(() => { const t = setTimeout(() => carregar(busca), busca ? 300 : 0); return () => clearTimeout(t) }, [carregar, busca])
  useEffect(() => { setPagina(1) }, [busca, tipo, disciplina, situacao])

  function ordenarPor(c: string) { if (ordenar === c) setDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setOrdenar(c); setDir(c === 'criado_em' || c === 'alunos' || c === 'concluidas' || c === 'tempo_total_seg' ? 'desc' : 'asc') } }
  function sincronizar() {
    startSinc(async () => {
      const r = await sincronizarDefinicoesMetas()
      if (!r.ok) { toast.error(r.error || 'Falha ao sincronizar.'); return }
      toast.success(`${r.aulas} aulas e ${r.legprocs} metas de lei seca sincronizadas${r.desativadas ? ` · ${r.desativadas} inativadas` : ''}.`)
      carregar(busca)
    })
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const ini = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1
  const fim = Math.min(total, pagina * POR_PAGINA)

  if (!migrado) {
    return (
      <p className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" /> Aplique as migrações <span className="font-mono">20261105050000</span> e <span className="font-mono">20261105070000_cronograma_adaptativo_meta_def.sql</span> no Supabase e recarregue.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {erro && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{erro}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card rotulo="Definições" valor={(resumo?.definicoes ?? 0).toLocaleString('pt-BR')} />
        <Card rotulo="Aulas" valor={(resumo?.aulas ?? 0).toLocaleString('pt-BR')} />
        <Card rotulo="Metas de lei seca" valor={(resumo?.legprocs ?? 0).toLocaleString('pt-BR')} />
        <Card rotulo="Ativas" valor={(resumo?.ativas ?? 0).toLocaleString('pt-BR')} />
        <Card rotulo="Ativas sem nenhum aluno" valor={(resumo?.semAluno ?? 0).toLocaleString('pt-BR')} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por disciplina, aula, título ou lei…" aria-label="Buscar metas" className="h-9 w-full rounded-lg border bg-background pl-8 pr-2 text-sm" />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} aria-label="Tipo" className="h-9 rounded-lg border bg-background px-2 text-sm">
          <option value="">Todos os tipos</option><option value="aula">Aulas</option><option value="legproc">Lei seca (LegProc)</option>
        </select>
        <select value={disciplina} onChange={(e) => setDisciplina(e.target.value)} aria-label="Disciplina" className="h-9 max-w-56 rounded-lg border bg-background px-2 text-sm">
          <option value="">Todas as disciplinas</option>{disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)} aria-label="Situação" className="h-9 rounded-lg border bg-background px-2 text-sm">
          <option value="">Ativas e inativas</option><option value="ativa">Só ativas</option><option value="inativa">Só inativas</option>
        </select>
        <button type="button" onClick={sincronizar} disabled={sincronizando}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sincronizar definições
        </button>
      </div>
      {resumo?.atualizadoEm && <p className="text-xs text-muted-foreground">Cadastro atualizado em {fmtBrt(resumo.atualizadoEm)}.</p>}

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full min-w-[68rem] text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <Th rotulo="Tipo" campo="tipo" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} />
              <Th rotulo="Disciplina" campo="disciplina" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} />
              <Th rotulo="Nº" campo="numero" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} />
              <Th rotulo="Título / lei" campo="titulo" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} />
              <Th rotulo="Págs/min" campo="paginas" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} className="text-right" />
              <Th rotulo="Situação" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} />
              <Th rotulo="Criada em" campo="criado_em" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} />
              <Th rotulo="Alunos" campo="alunos" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} className="text-right" />
              <Th rotulo="Concluídas" campo="concluidas" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} className="text-right" />
              <Th rotulo="Tempo" campo="tempo_total_seg" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} className="text-right" />
              <Th rotulo="Acerto" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {carregando && itens.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-10 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</td></tr>
            ) : itens.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">
                {total === 0 && !busca && !tipo && !disciplina && !situacao ? <><Database className="mr-2 inline h-4 w-4" />Cadastro vazio. Clique em “Sincronizar definições” para criar as linhas.</> : 'Nenhuma meta com esses filtros.'}
              </td></tr>
            ) : itens.map((d) => {
              const acertos = d.questoes_resolvidas > 0 ? Math.round(((d.questoes_resolvidas - d.questoes_erradas) / d.questoes_resolvidas) * 100) : null
              return (
                <tr key={d.id} className={`border-b last:border-0 ${d.ativa ? '' : 'opacity-60'}`}>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${d.tipo === 'aula' ? 'bg-primary/10 text-primary' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'}`}>{d.tipo === 'aula' ? 'Aula' : 'Lei seca'}</span></td>
                  <td className="px-3 py-2 font-medium">{d.disciplina ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{d.numero ?? '—'}</td>
                  <td className="max-w-[22rem] px-3 py-2"><span className="block truncate" title={d.titulo ?? d.texto ?? ''}>{d.titulo ?? '—'}</span>{d.tipo === 'legproc' && d.texto && <span className="block truncate text-xs text-muted-foreground" title={d.texto}>{d.texto}</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.tipo === 'aula' ? (d.paginas ?? '—') : d.minutos ? `${d.minutos} min` : '—'}</td>
                  <td className="px-3 py-2"><span className={`text-xs font-medium ${d.ativa ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{d.ativa ? 'Ativa' : 'Inativa'}</span>{d.documento_id ? <span className="ml-1.5 text-[11px] text-muted-foreground">· Biblioteca</span> : <span className="ml-1.5 text-[11px] text-muted-foreground">· catálogo</span>}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmtBrt(d.criado_em)}</td>
                  <td className="px-3 py-2 text-right tabular-nums" title={`${d.planos} plano(s)`}>{d.alunos.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-2 text-right tabular-nums" title={`${d.concluidas} de ${d.metas_nos_planos} metas nos planos`}>{d.concluidas.toLocaleString('pt-BR')} <span className="text-xs text-muted-foreground">{pct(d.concluidas, d.metas_nos_planos)}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtTempo(d.tempo_total_seg)}</td>
                  <td className="px-3 py-2 text-right tabular-nums" title={`${d.questoes_resolvidas} resolvidas · ${d.questoes_erradas} erradas`}>{acertos == null ? '—' : `${acertos}%`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{total === 0 ? 'Nenhum resultado' : `${ini.toLocaleString('pt-BR')}–${fim.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPagina(1)} disabled={pagina <= 1} className="inline-flex h-8 items-center gap-1 rounded-lg border px-2 hover:bg-muted disabled:opacity-40"><ChevronsLeft className="h-4 w-4" /> Início</button>
          <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} className="inline-flex h-8 items-center gap-1 rounded-lg border px-2 hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Anterior</button>
          <span className="px-2 tabular-nums text-muted-foreground">{pagina} / {totalPaginas}</span>
          <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas} className="inline-flex h-8 items-center gap-1 rounded-lg border px-2 hover:bg-muted disabled:opacity-40">Próxima <ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={() => setPagina(totalPaginas)} disabled={pagina >= totalPaginas} className="inline-flex h-8 items-center gap-1 rounded-lg border px-2 hover:bg-muted disabled:opacity-40">Final <ChevronsRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  )
}
