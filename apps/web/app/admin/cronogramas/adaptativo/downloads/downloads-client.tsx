'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Search, ShieldCheck, ShieldOff, X } from 'lucide-react'
import { obterDashboardDownloads, detalharDownloads, definirPoliticaDownload } from '../actions'
import type { LinhaDownloads, ResumoDownloads, AlunoNoConteudo, EventoDownload, VisaoDownloads } from '@/lib/conteudo/download-analise'

const POR_PAGINA = 25
const fmtBrt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const MOTIVOS: Record<string, string> = { politica: 'Download desativado na plataforma', documento: 'Download desativado no documento', permissao: 'Sem permissão de baixar', nao_liberado: 'Material ainda não liberado', tipo: 'Tipo não baixável', indisponivel: 'Arquivo indisponível' }
const ORIGENS: [string, string][] = [['', 'Todas as origens'], ['cronograma', 'Cronograma'], ['biblioteca', 'Biblioteca'], ['produto', 'Produtos'], ['midia', 'Mídia'], ['outro', 'Outros']]
const VISOES: [VisaoDownloads, string][] = [['conteudo', 'Por conteúdo'], ['meta', 'Por meta'], ['aluno', 'Por aluno']]

function Card({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <div className="rounded-2xl border bg-card p-3 shadow-sm"><p className="text-xs text-muted-foreground">{rotulo}</p><p className="text-xl font-bold tabular-nums">{valor}</p></div>
}

function Th({ rotulo, campo, ordenar, dir, onOrdenar, className = '' }: { rotulo: string; campo: string; ordenar: string; dir: 'asc' | 'desc'; onOrdenar: (c: string) => void; className?: string }) {
  return (
    <th className={`px-3 py-2 ${className}`}>
      <button type="button" onClick={() => onOrdenar(campo)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground">
        {rotulo}<ArrowUpDown className={`h-3 w-3 ${ordenar === campo ? 'text-primary' : 'opacity-40'}`} aria-hidden />{ordenar === campo && <span className="sr-only">{dir === 'asc' ? 'crescente' : 'decrescente'}</span>}
      </button>
    </th>
  )
}

export function DownloadsClient() {
  const [visao, setVisao] = useState<VisaoDownloads>('conteudo')
  const [dias, setDias] = useState(30)
  const [origem, setOrigem] = useState('')
  const [resultado, setResultado] = useState<'' | 'baixado' | 'bloqueado'>('')
  const [busca, setBusca] = useState('')
  const [ordenar, setOrdenar] = useState('ultimo')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [pagina, setPagina] = useState(1)
  const [itens, setItens] = useState<LinhaDownloads[]>([])
  const [total, setTotal] = useState(0)
  const [resumo, setResumo] = useState<ResumoDownloads | null>(null)
  const [migrado, setMigrado] = useState(true)
  const [liberado, setLiberado] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [detalhe, setDetalhe] = useState<LinhaDownloads | null>(null)
  const [salvando, startSalvar] = useTransition()
  const seq = useRef(0)

  const carregar = useCallback(async (busca_: string) => {
    const id = ++seq.current
    setCarregando(true)
    const r = await obterDashboardDownloads({ visao, dias, origem, resultado, busca: busca_, ordenar, dir, pagina, porPagina: POR_PAGINA })
    if (id !== seq.current) return
    setCarregando(false)
    if (!r.ok) { setErro(r.error ?? 'Falha ao carregar.'); return }
    setErro(null); setMigrado(r.migrado); setLiberado(r.alunoPodeBaixar); setItens(r.itens); setTotal(r.total); setResumo(r.resumo)
  }, [visao, dias, origem, resultado, ordenar, dir, pagina])

  useEffect(() => { const t = setTimeout(() => carregar(busca), busca ? 300 : 0); return () => clearTimeout(t) }, [carregar, busca])

  const ordenarPor = (c: string) => { if (c === ordenar) setDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setOrdenar(c); setDir(c === 'titulo' ? 'asc' : 'desc') } setPagina(1) }
  const trocarVisao = (v: VisaoDownloads) => { setVisao(v); setOrdenar('ultimo'); setDir('desc'); setPagina(1); setDetalhe(null) }
  const totalPag = Math.max(1, Math.ceil(total / POR_PAGINA))

  function alternarPolitica() {
    const novo = !liberado
    startSalvar(async () => {
      const r = await definirPoliticaDownload(novo)
      if (!r.ok) { toast.error(r.error ?? 'Falha ao salvar.'); return }
      setLiberado(novo); toast.success(novo ? 'Download liberado para os alunos.' : 'Download desativado para os alunos.')
    })
  }

  const rotuloChave = visao === 'conteudo' ? 'Conteúdo' : visao === 'meta' ? 'Meta' : 'Aluno'

  return (
    <div className="space-y-4">
      {/* Chave da plataforma */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm ${liberado ? 'bg-card' : 'border-destructive/30 bg-destructive/5'}`}>
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${liberado ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>{liberado ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}</span>
          <div>
            <p className="text-sm font-semibold">{liberado ? 'Download liberado para os alunos' : 'Download DESATIVADO para os alunos'}</p>
            <p className="text-xs text-muted-foreground">
              Vale para a Biblioteca, o cronograma, os produtos e os leitores (botões somem e o servidor recusa). Além desta chave, cada documento tem a sua (“Permitir baixar”) e as permissões por grupo/aluno continuam valendo. Testadores não são barrados.
            </p>
          </div>
        </div>
        <button type="button" onClick={alternarPolitica} disabled={salvando}
          className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-60 ${liberado ? 'bg-destructive text-white hover:opacity-90' : 'bg-primary text-primary-foreground hover:opacity-90'}`}>
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}{liberado ? 'Desativar download' : 'Liberar download'}
        </button>
      </div>

      {!migrado && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          O registro de downloads ainda não está ativo: aplique a migração <code className="rounded bg-muted px-1">20261112010000_download_log.sql</code> no SQL Editor.
        </div>
      )}
      {erro && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{erro}</div>}

      {resumo && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Card rotulo="Downloads feitos" valor={resumo.baixados.toLocaleString('pt-BR')} />
          <Card rotulo="Tentativas bloqueadas" valor={resumo.bloqueados.toLocaleString('pt-BR')} />
          <Card rotulo="Alunos" valor={resumo.alunos.toLocaleString('pt-BR')} />
          <Card rotulo="Conteúdos" valor={resumo.conteudos.toLocaleString('pt-BR')} />
          <Card rotulo="Metas do cronograma" valor={resumo.metas.toLocaleString('pt-BR')} />
        </div>
      )}

      {/* Visões (abas de linha) */}
      <div role="tablist" className="flex gap-1 border-b">
        {VISOES.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={visao === k} onClick={() => trocarVisao(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${visao === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1) }} placeholder="Buscar conteúdo, meta, aluno ou e-mail…" aria-label="Buscar"
            className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
        </div>
        <select value={dias} onChange={(e) => { setDias(Number(e.target.value)); setPagina(1) }} aria-label="Período" className="h-9 rounded-lg border bg-background px-2.5 text-sm">
          <option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option><option value={365}>Último ano</option><option value={0}>Todo o período</option>
        </select>
        <select value={origem} onChange={(e) => { setOrigem(e.target.value); setPagina(1) }} aria-label="Origem" className="h-9 rounded-lg border bg-background px-2.5 text-sm">
          {ORIGENS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={resultado} onChange={(e) => { setResultado(e.target.value as '' | 'baixado' | 'bloqueado'); setPagina(1) }} aria-label="Resultado" className="h-9 rounded-lg border bg-background px-2.5 text-sm">
          <option value="">Baixados e bloqueados</option><option value="baixado">Só baixados</option><option value="bloqueado">Só bloqueados</option>
        </select>
      </div>

      {/* Tabela (paginação no servidor) */}
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <Th rotulo={rotuloChave} campo="titulo" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} />
              <Th rotulo="Baixados" campo="baixados" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} className="text-right" />
              <Th rotulo="Bloqueados" campo="bloqueados" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} className="text-right" />
              <Th rotulo={visao === 'aluno' ? 'Conteúdos' : 'Alunos'} campo={visao === 'aluno' ? 'conteudos' : 'alunos'} ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} className="text-right" />
              <Th rotulo="Último" campo="ultimo" ordenar={ordenar} dir={dir} onOrdenar={ordenarPor} />
            </tr>
          </thead>
          <tbody className="divide-y">
            {carregando && !itens.length ? (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</td></tr>
            ) : !itens.length ? (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">Nenhum download registrado neste filtro.</td></tr>
            ) : itens.map((r) => (
              <tr key={r.chave} onClick={() => setDetalhe(r)} className="cursor-pointer transition hover:bg-muted/40">
                <td className="max-w-[420px] px-3 py-2">
                  <p className="truncate font-medium" title={r.titulo ?? r.chave}>{r.titulo ?? (visao === 'meta' ? r.chave : 'Sem título')}</p>
                  <p className="truncate text-xs text-muted-foreground">{visao === 'meta' ? [r.detalhe, r.chave].filter(Boolean).join(' · ') : r.detalhe ?? ''}</p>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.baixados.toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.bloqueados ? <span className="text-destructive">{r.bloqueados.toLocaleString('pt-BR')}</span> : 0}</td>
                <td className="px-3 py-2 text-right tabular-nums">{(visao === 'aluno' ? r.conteudos : r.alunos).toLocaleString('pt-BR')}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtBrt(r.ultimo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{total.toLocaleString('pt-BR')} {total === 1 ? 'linha' : 'linhas'} · página {pagina} de {totalPag}{carregando && itens.length ? ' · atualizando…' : ''}</span>
        <div className="flex items-center gap-1">
          {[{ ic: ChevronsLeft, to: 1, l: 'Início', off: pagina <= 1 }, { ic: ChevronLeft, to: pagina - 1, l: 'Anterior', off: pagina <= 1 }, { ic: ChevronRight, to: pagina + 1, l: 'Próxima', off: pagina >= totalPag }, { ic: ChevronsRight, to: totalPag, l: 'Final', off: pagina >= totalPag }].map(({ ic: Ic, to, l, off }) => (
            <button key={l} type="button" aria-label={l} title={l} disabled={off} onClick={() => setPagina(to)} className="grid h-8 w-8 place-items-center rounded-lg border bg-background hover:bg-muted disabled:opacity-40"><Ic className="h-4 w-4" /></button>
          ))}
        </div>
      </div>

      {detalhe && <Detalhe visao={visao} linha={detalhe} dias={dias} origem={origem} resultado={resultado} onFechar={() => setDetalhe(null)} />}
    </div>
  )
}

/** Análise INDIVIDUAL do conteúdo/meta/aluno escolhido: quem baixou (contagens + datas) e os eventos mais recentes. */
function Detalhe({ visao, linha, dias, origem, resultado, onFechar }: { visao: VisaoDownloads; linha: LinhaDownloads; dias: number; origem: string; resultado: '' | 'baixado' | 'bloqueado'; onFechar: () => void }) {
  const [alunos, setAlunos] = useState<AlunoNoConteudo[]>([])
  const [eventos, setEventos] = useState<EventoDownload[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    detalharDownloads(visao, linha.chave, { dias, origem, resultado }).then((r) => {
      if (!vivo) return
      setCarregando(false)
      if (!r.ok) { setErro(r.error ?? 'Falha ao carregar.'); return }
      setAlunos(r.alunos); setEventos(r.eventos)
    }).catch(() => { if (vivo) { setCarregando(false); setErro('Falha ao carregar.') } })
    return () => { vivo = false }
  }, [visao, linha.chave, dias, origem, resultado])

  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  }, [onFechar])

  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/50 backdrop-blur-sm" onClick={onFechar}>
      <aside role="dialog" aria-label="Detalhe dos downloads" onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{visao === 'conteudo' ? 'Conteúdo' : visao === 'meta' ? 'Meta do cronograma' : 'Aluno'}</p>
            <h2 className="truncate text-lg font-bold" title={linha.titulo ?? linha.chave}>{linha.titulo ?? linha.chave}</h2>
            {linha.detalhe && <p className="truncate text-xs text-muted-foreground">{linha.detalhe}</p>}
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <Card rotulo="Baixados" valor={linha.baixados.toLocaleString('pt-BR')} />
          <Card rotulo="Bloqueados" valor={linha.bloqueados.toLocaleString('pt-BR')} />
          <Card rotulo={visao === 'aluno' ? 'Conteúdos' : 'Alunos'} valor={(visao === 'aluno' ? linha.conteudos : linha.alunos).toLocaleString('pt-BR')} />
        </div>

        {carregando ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
        ) : erro ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{erro}</div>
        ) : (
          <>
            {visao !== 'aluno' && (
              <section className="mb-5">
                <h3 className="mb-2 text-sm font-semibold">Por aluno</h3>
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Aluno</th><th className="px-3 py-2 text-right">Baixados</th><th className="px-3 py-2 text-right">Bloqueados</th><th className="px-3 py-2">Primeiro</th><th className="px-3 py-2">Último</th></tr></thead>
                    <tbody className="divide-y">
                      {alunos.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nenhum aluno neste filtro.</td></tr> : alunos.map((a) => (
                        <tr key={a.estudanteId}>
                          <td className="max-w-[220px] px-3 py-2"><p className="truncate font-medium">{a.nome ?? '—'}</p><p className="truncate text-xs text-muted-foreground">{a.email ?? ''}</p></td>
                          <td className="px-3 py-2 text-right tabular-nums">{a.baixados}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{a.bloqueados ? <span className="text-destructive">{a.bloqueados}</span> : 0}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtBrt(a.primeiro)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtBrt(a.ultimo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {alunos.length >= 100 && <p className="mt-1 text-xs text-muted-foreground">Mostrando os 100 mais recentes.</p>}
              </section>
            )}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Registros recentes</h3>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Quando</th>{visao === 'aluno' ? <th className="px-3 py-2">Material</th> : <th className="px-3 py-2">Aluno</th>}<th className="px-3 py-2">Origem</th><th className="px-3 py-2">Resultado</th></tr></thead>
                  <tbody className="divide-y">
                    {eventos.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Nenhum registro.</td></tr> : eventos.map((e) => (
                      <tr key={e.id}>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtBrt(e.quando)}</td>
                        <td className="max-w-[240px] px-3 py-2"><p className="truncate">{visao === 'aluno' ? (e.titulo ?? '—') : (e.aluno ?? '—')}</p>{e.metaId && <p className="truncate text-xs text-muted-foreground">{e.metaId}</p>}</td>
                        <td className="px-3 py-2 capitalize">{e.origem}</td>
                        <td className="px-3 py-2">
                          {e.resultado === 'baixado'
                            ? <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Baixado</span>
                            : <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive" title={MOTIVOS[e.motivo ?? ''] ?? e.motivo ?? ''}>Bloqueado{e.motivo ? ` · ${MOTIVOS[e.motivo] ?? e.motivo}` : ''}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </aside>
    </div>,
    document.body,
  )
}
