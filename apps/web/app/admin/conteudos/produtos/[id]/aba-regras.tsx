'use client'

// Aba "Regras" do Produto (Estúdio): VISÃO ÚNICA e EDITÁVEL das regras/liberações do Extensivo — acesso (grupos), segmentos, visibilidade,
// disponibilidade, cronograma de referência, exceções e regras de venda — "à prova de erro". Edita SEM sair da aba (matriz-regras.tsx,
// painel-edicao-regras.tsx, publicos-regras.tsx -> regras-edicao-actions.ts, que delega às actions donas de cada regra).
//  · KPIs + ALERTAS de configuração no topo (planilha sem regra, empate de prioridade, exceção anulada, sem público…);
//  · Matriz Módulo/Aula × Público (célula = estado; clique abre o painel de edição; multisseleção + edição em lote);
//  · Públicos (grupos vinculados, liberar para todos, segmentos);
//  · Lista de regras · "O que este público recebe" · "Por que este aluno vê/não vê esta aula" · Histórico · Legenda.
// Backend-first: TODO cálculo vem do servidor (lib/produtos/mapa-regras.ts / explicar-aluno.ts); aqui só renderiza.
// DataTable server-driven (URL: q, page, pp, sort, dir + filtros r*). LAZY: só busca quando a aba está ativa.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, CircleAlert, Download, ExternalLink, Info, Loader2, Search, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import { KpiCard, KpiGrid, Nota, Pilula } from '@/app/admin/revisao/_comp/lista'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { navProgressStart } from '@/lib/nav-progress'
import {
  CAMADAS_INFO, EFEITO_ROTULO, hrefLiberacaoAulas, type AlertaRegra, type CamadaRegra, type EfeitoRegra,
  type ItemHistorico, type LinhaRegra, type MapaRegras,
} from '@/lib/produtos/mapa-regras-tipos'
import type { ExplicacaoAluno, ExplicacaoAulaAluno } from '@/lib/produtos/explicar-aluno'
import { buscarAlunosSelecaoAction } from './segmento-regras-actions'
import {
  buscarAlvosRegrasAction, carregarHistoricoRegrasAction, carregarMapaRegrasAction, explicarAlunoAction, exportarRegrasCsvAction,
} from './regras-actions'
import { MatrizRegras, type PedidoAplicarEm } from './matriz-regras'
import { PublicosRegras } from './publicos-regras'

type Vista = 'matriz' | 'lista' | 'publicos' | 'publico' | 'aluno' | 'historico' | 'legenda'
const VISTAS: Array<[Vista, string]> = [['matriz', 'Matriz'], ['lista', 'Lista de regras'], ['publicos', 'Públicos'], ['publico', 'O que este público recebe'], ['aluno', 'Por que este aluno'], ['historico', 'Histórico'], ['legenda', 'Legenda']]
const selectCls = 'h-11 rounded-xl border bg-card px-3 text-[13.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'
const TIPO_EFEITO: Record<EfeitoRegra, 'ok' | 'warn' | 'mut' | 'bad'> = { liberado: 'ok', cadeado: 'warn', oculto: 'mut', bloqueado: 'bad' }
const CAMADAS = Object.keys(CAMADAS_INFO) as CamadaRegra[]

function PilulaEfeito({ efeito, children }: { efeito: EfeitoRegra; children?: React.ReactNode }) {
  return <Pilula tipo={TIPO_EFEITO[efeito]}>{children ?? EFEITO_ROTULO[efeito]}</Pilula>
}

export function AbaRegras({ produtoId, produtoNome, ativa, podeEditar = false }: { produtoId: string; produtoNome: string; ativa: boolean; podeEditar?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const inicial = (sp.get('rg') as Vista) || 'matriz'
  const [vista, setVista] = useState<Vista>(VISTAS.some(([v]) => v === inicial) ? inicial : 'matriz')
  const [mapa, setMapa] = useState<MapaRegras | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [rev, setRev] = useState(0)
  const [aplicarEm, setAplicarEm] = useState<PedidoAplicarEm | null>(null)
  const seq = useRef(0)
  // O link "Abrir na tela completa" troca só a query (?rg=…): sincroniza a sub-aba com a URL.
  useEffect(() => { const v = sp.get('rg') as Vista | null; if (v && VISTAS.some(([x]) => x === v)) setVista(v) }, [sp])
  function aplicarAgora(colunas: string[]) { setVista('matriz'); setAplicarEm({ colunas, nonce: Date.now() }) }

  const q = sp.get('q') ?? ''
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1)
  const pp = [10, 25, 50].includes(Number(sp.get('pp'))) ? Number(sp.get('pp')) : 25
  const sort = sp.get('sort') ?? '', dir = sp.get('dir') === 'desc' ? 'desc' : 'asc'
  const rcamada = (sp.get('rcamada') ?? '') as CamadaRegra | '', refeito = (sp.get('refeito') ?? '') as EfeitoRegra | '', ralvo = sp.get('ralvo') ?? 'todos'
  const rpub = sp.get('rpub') ?? ''

  // KPIs/alertas vêm sempre; a LISTA de regras usa os filtros da URL (nas demais vistas os filtros ficam fixos -> sem refetch à toa).
  const precisaMapa = vista === 'lista'
  const dl = vista === 'lista'
  useEffect(() => {
    if (!ativa) return
    const mine = ++seq.current
    setLoading(true)
    carregarMapaRegrasAction(produtoId, { q: dl ? q : '', alvo: dl ? ralvo : 'todos', camada: dl ? rcamada : '', efeito: dl ? refeito : '', publico: dl ? rpub : '', sort: dl ? sort : '', dir: dl ? dir : 'asc', page: dl ? page : 1, pp: dl ? pp : 10, cols: '' })
      .then((r) => { if (mine !== seq.current) return; if ('ok' in r) { setMapa(r.mapa); setErro(null) } else setErro(r.error) })
      .catch(() => { if (mine === seq.current) setErro('Falha ao carregar o mapa de regras.') })
      .finally(() => { if (mine === seq.current) setLoading(false) })
  }, [ativa, produtoId, dl, q, page, pp, sort, dir, rcamada, refeito, ralvo, rpub, rev])

  function setParam(chave: string, valor: string) {
    const p = new URLSearchParams(sp.toString())
    valor ? p.set(chave, valor) : p.delete(chave)
    p.delete('page')
    navProgressStart(); router.push(`${pathname}${p.toString() ? `?${p}` : ''}`)
  }
  async function exportar() {
    const r = await exportarRegrasCsvAction(produtoId, { q, alvo: ralvo, camada: rcamada, efeito: refeito, publico: rpub }).catch(() => ({ error: 'Falha de rede.' }) as { error: string })
    if (!('ok' in r)) { toast.error(r.error); return }
    const url = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `regras-${produtoNome.replace(/[^\w]+/g, '-').toLowerCase()}.csv`; a.click(); URL.revokeObjectURL(url)
  }


  return (
    <div className="space-y-4">
      {mapa && (
        <>
          <KpiGrid cols={4}>
            <KpiCard rotulo="Módulos e aulas" valor={mapa.kpis.alvos.toLocaleString('pt-BR')} />
            <KpiCard rotulo="Públicos (grupos e segmentos)" valor={mapa.kpis.publicos.toLocaleString('pt-BR')} />
            <KpiCard rotulo="Regras ativas" valor={mapa.kpis.regrasAtivas.toLocaleString('pt-BR')} />
            <KpiCard rotulo="Alertas de configuração" valor={`${mapa.kpis.alertasErro + mapa.kpis.alertasAviso}`} alerta={mapa.kpis.alertasErro + mapa.kpis.alertasAviso > 0} />
          </KpiGrid>
          {mapa.tabelasAusentes.length > 0 && <Nota tipo="aviso">Parte das regras não pôde ser lida porque a migração ainda não foi aplicada neste banco ({mapa.tabelasAusentes.join(', ')}). O mapa mostra o que existe.</Nota>}
          <PainelAlertas alertas={mapa.alertas} />
        </>
      )}

      <div role="tablist" aria-label="Visões das regras" className="flex gap-4 overflow-x-auto border-b">
        {VISTAS.map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => setVista(v)}
            className={cn('-mb-px shrink-0 border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors', vista === v ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {label}
          </button>
        ))}
      </div>

      {precisaMapa && erro && <Nota tipo="aviso">{erro}</Nota>}

      {/* A matriz fica montada (escondida) ao trocar de sub-aba: não perde seleção nem recarrega. */}
      <div hidden={vista !== 'matriz'}>
        <MatrizRegras produtoId={produtoId} ativa={ativa && vista === 'matriz'} podeEditar={podeEditar} aplicarEm={aplicarEm} onMudou={() => setRev((n) => n + 1)} onIrPublicos={() => setVista('publicos')} />
      </div>

      {vista === 'lista' && (
        <TabelaLista mapa={mapa} loading={loading} erro={erro} produtoId={produtoId}
          filtros={<FiltrosMapa mapa={mapa} ralvo={ralvo} rcamada={rcamada} refeito={refeito} rpub={rpub} setParam={setParam} comPublico
            extra={<Button variant="outline" onClick={() => void exportar()} className="h-11 rounded-xl"><Download className="h-4 w-4" />Exportar CSV</Button>} />} />
      )}

      {vista === 'publicos' && <PublicosRegras produtoId={produtoId} ativa={ativa} podeEditar={podeEditar} onMudou={() => setRev((n) => n + 1)} onAplicarAgora={aplicarAgora} />}

      {vista === 'publico' && (
        <>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Público</span>
            <select value={rpub} onChange={(e) => setParam('rpub', e.target.value)} aria-label="Público" className={cn(selectCls, 'min-w-[18rem]')}>
              <option value="">Escolha um grupo ou segmento…</option>
              {(mapa?.publicos ?? []).filter((p) => p.tipo !== 'todos').map((p) => <option key={p.chave} value={p.chave}>{p.tipo === 'grupo' ? 'Grupo: ' : 'Segmento: '}{p.nome}</option>)}
            </select>
          </label>
          {!rpub ? <Nota tipo="info">Escolha um grupo ou segmento para ver, módulo a módulo e aula a aula, o que ele recebe (liberado, com data, cadeado, oculto ou bloqueado) e por qual regra. Você também pode editar daqui.</Nota>
            : <MatrizRegras key={rpub} produtoId={produtoId} ativa={ativa && vista === 'publico'} podeEditar={podeEditar} aplicarEm={null} somente={rpub} onMudou={() => setRev((n) => n + 1)} onIrPublicos={() => setVista('publicos')} />}
        </>
      )}

      {vista === 'aluno' && <PainelAluno produtoId={produtoId} alunoInicial={sp.get('aluno') ?? ''} />}
      {vista === 'historico' && <Historico produtoId={produtoId} ativa={ativa} />}
      {vista === 'legenda' && <Legenda produtoId={produtoId} />}

    </div>
  )
}

// ───────────────────────────── alertas ─────────────────────────────

function PainelAlertas({ alertas }: { alertas: AlertaRegra[] }) {
  const [todos, setTodos] = useState(false)
  if (!alertas.length) return <Nota tipo="ok">Nenhum alerta: as regras deste produto estão coerentes entre si.</Nota>
  const lista = todos ? alertas : alertas.slice(0, 5)
  return (
    <section className="rounded-2xl border bg-card shadow-sm" aria-label="Alertas de configuração">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Alertas de configuração <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{alertas.length}</span></h3>
        {alertas.length > 5 && <button type="button" onClick={() => setTodos((v) => !v)} className="text-sm font-medium text-primary hover:underline">{todos ? 'Mostrar menos' : `Ver todos (${alertas.length})`}</button>}
      </header>
      <ul className="divide-y">
        {lista.map((a) => {
          const Icone = a.severidade === 'erro' ? CircleAlert : a.severidade === 'aviso' ? AlertTriangle : Info
          return (
            <li key={a.id} className="flex items-start gap-3 px-4 py-3">
              <Icone className={cn('mt-0.5 h-4 w-4 shrink-0', a.severidade === 'erro' ? 'text-destructive' : a.severidade === 'aviso' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.titulo}</p>
                <p className="text-sm text-muted-foreground">{a.detalhe}</p>
              </div>
              {a.href && <Link href={a.href} className="shrink-0 text-sm font-medium text-primary hover:underline">{a.hrefRotulo ?? 'Corrigir'}</Link>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ───────────────────────────── filtros / tabelas ─────────────────────────────

function FiltrosMapa({ mapa, ralvo, rcamada, refeito, rpub, setParam, comPublico, semCamada, extra }: {
  mapa: MapaRegras | null; ralvo: string; rcamada: string; refeito: string; rpub: string; setParam: (k: string, v: string) => void
  comPublico?: boolean; semCamada?: boolean; extra?: React.ReactNode
}) {
  return (
    <>
      <select aria-label="Tipo de alvo" value={ralvo} onChange={(e) => setParam('ralvo', e.target.value === 'todos' ? '' : e.target.value)} className={selectCls}>
        <option value="todos">Módulos e aulas</option><option value="modulo">Só módulos</option><option value="aula">Só aulas</option>
      </select>
      {!semCamada && (
        <select aria-label="Camada" value={rcamada} onChange={(e) => setParam('rcamada', e.target.value)} className={selectCls}>
          <option value="">Todas as camadas</option>
          {CAMADAS.map((c) => <option key={c} value={c}>{CAMADAS_INFO[c].rotulo}</option>)}
        </select>
      )}
      <select aria-label="Efeito" value={refeito} onChange={(e) => setParam('refeito', e.target.value)} className={selectCls}>
        <option value="">Todos os efeitos</option>
        {(Object.keys(EFEITO_ROTULO) as EfeitoRegra[]).map((e) => <option key={e} value={e}>{EFEITO_ROTULO[e]}</option>)}
      </select>
      {comPublico && (
        <select aria-label="Público" value={rpub} onChange={(e) => setParam('rpub', e.target.value)} className={selectCls}>
          <option value="">Todos os públicos</option>
          {(mapa?.publicos ?? []).map((p) => <option key={p.chave} value={p.tipo === 'todos' ? 'todos' : p.chave}>{p.nome}</option>)}
        </select>
      )}
      {extra}
    </>
  )
}

function TabelaLista({ mapa, loading, erro, filtros, produtoId }: { mapa: MapaRegras | null; loading: boolean; erro: string | null; filtros: React.ReactNode; produtoId: string }) {
  const cols: DataTableColumn<LinhaRegra>[] = [
    { key: 'alvo', header: 'Alvo', sortable: true, render: (r) => <span className="flex min-w-0 flex-col"><span className="truncate font-medium">{r.alvoTitulo}</span>{r.disciplina && r.alvoTipo === 'aula' && <span className="truncate text-xs text-muted-foreground">{r.disciplina}</span>}</span>, title: (r) => r.alvoTitulo },
    { key: 'camada', header: 'Camada', sortable: true, width: '12rem', render: (r) => <span title={CAMADAS_INFO[r.camada].desc}><Pilula tipo="vio">{CAMADAS_INFO[r.camada].rotulo}</Pilula></span> },
    { key: 'origem', header: 'Origem (tela dona)', width: '15rem', render: (r) => r.origem.href ? <Link href={r.origem.href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline" title={`${r.origem.tabela}${r.origem.id ? ` · ${r.origem.id.slice(0, 8)}` : ''}`}>{r.origem.rotulo}<ExternalLink className="h-3 w-3" /></Link> : r.origem.rotulo, title: (r) => r.origem.rotulo },
    { key: 'efeito', header: 'Efeito', sortable: true, width: '8rem', render: (r) => <PilulaEfeito efeito={r.efeito} /> },
    { key: 'quando', header: 'Data / condição', sortable: true, width: '13rem', render: (r) => r.quandoRotulo, title: (r) => r.descricao },
    { key: 'quem', header: 'Quem', sortable: true, width: '13rem', render: (r) => <span className="flex items-center gap-1.5"><Pilula tipo="mut">{r.quem.tipo === 'todos' ? 'Todos' : r.quem.tipo === 'grupo' ? 'Grupo' : r.quem.tipo === 'segmento' ? 'Segmento' : r.quem.tipo === 'aluno' ? 'Aluno' : 'Venda'}</Pilula><span className="truncate">{r.quem.nome}</span></span>, title: (r) => r.quem.nome },
    { key: 'prioridade', header: 'Prior.', sortable: true, width: '5.5rem', align: 'right', render: (r) => <span className="tabular-nums">{r.prioridade ?? '—'}</span> },
    { key: 'validade', header: 'Validade', width: '9rem', render: (r) => (r.validade ? formatBrt(r.validade)?.slice(0, 10) ?? '—' : '—') },
  ]
  return (
    <DataTable<LinhaRegra>
      rows={mapa?.lista.rows ?? []} total={mapa?.lista.total ?? 0} loading={loading} error={erro}
      getRowId={(r) => r.id} columns={cols} selectable={false} defaultSort={{ key: 'camada', dir: 'asc' }}
      perPageOptions={[10, 25, 50]} defaultPerPage={25} searchable searchPlaceholder="Buscar por alvo, origem, grupo, segmento…"
      nomeSingular="regra" nomePlural="regras" filters={filtros}
      rowActions={(r) => [
        ...(r.origem.href ? [{ label: 'Editar na tela dona', href: r.origem.href, icon: <ExternalLink className="h-4 w-4" /> }] : []),
        { label: 'Ver cronograma de referência', href: hrefLiberacaoAulas(produtoId, 'cronogramas'), icon: <ExternalLink className="h-4 w-4" /> },
      ]}
    />
  )
}

// ───────────────────────────── por que este aluno ─────────────────────────────

function PainelAluno({ produtoId, alunoInicial }: { produtoId: string; alunoInicial: string }) {
  const [qa, setQa] = useState(''); const [alunos, setAlunos] = useState<Array<{ id: string; nome: string; email: string }>>([])
  const [aluno, setAluno] = useState<{ id: string; nome: string; email: string } | null>(alunoInicial ? { id: alunoInicial, nome: 'Aluno do link', email: alunoInicial.slice(0, 8) } : null)
  const [qv, setQv] = useState(''); const [alvos, setAlvos] = useState<Array<{ id: string; titulo: string; tipo: 'modulo' | 'aula'; disciplina: string }>>([])
  const [alvo, setAlvo] = useState<{ id: string; titulo: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<ExplicacaoAluno | null>(null)
  useEffect(() => { if (qa.trim().length < 2) { setAlunos([]); return } const t = setTimeout(() => { buscarAlunosSelecaoAction(qa).then((r) => setAlunos('ok' in r ? r.rows : [])).catch(() => setAlunos([])) }, 300); return () => clearTimeout(t) }, [qa])
  useEffect(() => { const t = setTimeout(() => { buscarAlvosRegrasAction(produtoId, qv).then((r) => setAlvos('ok' in r ? r.alvos : [])).catch(() => setAlvos([])) }, 300); return () => clearTimeout(t) }, [qv, produtoId])

  async function explicar() {
    if (!aluno || !alvo) return
    setBusy(true); setRes(null)
    const r = await explicarAlunoAction(produtoId, aluno.id, [alvo.id]).catch(() => ({ error: 'Falha de rede.' }) as { error: string })
    setBusy(false)
    if (!('ok' in r)) { toast.error(r.error); return }
    setRes(r.explicacao)
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold">1. Aluno</h3>
          {aluno ? <div className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-sm"><span className="min-w-0 truncate"><b>{aluno.nome}</b> <span className="text-muted-foreground">{aluno.email}</span></span><button type="button" onClick={() => { setAluno(null); setRes(null) }} className="text-primary hover:underline">trocar</button></div> : (
            <>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={qa} onChange={(e) => setQa(e.target.value)} placeholder="Buscar por nome ou e-mail (2+ letras)" className="h-10 pl-9" /></div>
              <ul className="mt-2 max-h-48 divide-y overflow-y-auto rounded-xl border">{alunos.map((a) => <li key={a.id}><button type="button" onClick={() => { setAluno(a); setQa('') }} className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted"><b>{a.nome}</b><span className="text-xs text-muted-foreground">{a.email}</span></button></li>)}</ul>
            </>
          )}
        </section>
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold">2. Aula ou módulo</h3>
          {alvo ? <div className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-sm"><b className="min-w-0 truncate">{alvo.titulo}</b><button type="button" onClick={() => { setAlvo(null); setRes(null) }} className="text-primary hover:underline">trocar</button></div> : (
            <>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={qv} onChange={(e) => setQv(e.target.value)} placeholder="Buscar aula, módulo ou matéria" className="h-10 pl-9" /></div>
              <ul className="mt-2 max-h-48 divide-y overflow-y-auto rounded-xl border">{alvos.map((a) => <li key={a.id}><button type="button" onClick={() => { setAlvo({ id: a.id, titulo: a.titulo }); setQv('') }} className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted"><b>{a.titulo}</b><span className="text-xs text-muted-foreground">{a.tipo === 'modulo' ? 'Módulo' : `Aula · ${a.disciplina}`}</span></button></li>)}</ul>
            </>
          )}
        </section>
      </div>
      <Button onClick={() => void explicar()} disabled={!aluno || !alvo || busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Explicar</Button>
      {res && <ResultadoAluno res={res} />}
    </div>
  )
}

function ResultadoAluno({ res }: { res: ExplicacaoAluno }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{res.aluno.nome} ({res.aluno.email}) em <b className="text-foreground">{res.produto.nome}</b>{res.verTudo && ' — testador global/impersonation: o motor de cronograma abre tudo.'}</p>
      {res.itens.length === 0 && <Nota tipo="aviso">Aula/módulo não encontrado neste produto.</Nota>}
      {res.itens.map((it) => <CartaoCadeia key={it.alvoId} it={it} />)}
    </div>
  )
}

function CartaoCadeia({ it }: { it: ExplicacaoAulaAluno }) {
  return (
    <section className="rounded-2xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0"><h3 className="truncate text-base font-semibold">{it.titulo}</h3><p className="text-xs text-muted-foreground">{it.tipo === 'modulo' ? 'Módulo' : `Aula · ${it.disciplina}`}</p></div>
        <PilulaEfeito efeito={it.estado}>{it.liberada ? 'Aluno VÊ e abre' : it.estado === 'oculto' ? 'Aluno NÃO vê' : 'Aluno vê com cadeado / sem acesso'}</PilulaEfeito>
      </header>
      <p className="px-4 pt-3 text-sm">{it.resumo}</p>
      <ol className="space-y-3 p-4">
        {it.camadas.map((c, i) => (
          <li key={c.chave} className={cn('rounded-xl border p-3', c.vencedora && 'border-primary bg-primary/5')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Camada {i + 1}</span>
              <b className="text-sm">{c.titulo}</b>
              <PilulaEfeito efeito={c.efeito}>{c.rotulo}</PilulaEfeito>
              {c.vencedora && <Pilula tipo="vio"><Trophy className="h-3 w-3" />Decisiva</Pilula>}
              {c.origem?.href && <Link href={c.origem.href} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">{c.origem.rotulo}<ExternalLink className="h-3 w-3" /></Link>}
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{c.passos.map((p, k) => <li key={k}>{p}</li>)}</ul>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ───────────────────────────── histórico / legenda ─────────────────────────────

function Historico({ produtoId, ativa }: { produtoId: string; ativa: boolean }) {
  const sp = useSearchParams(); const router = useRouter(); const pathname = usePathname()
  const [rows, setRows] = useState<ItemHistorico[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true)
  const [migrado, setMigrado] = useState(true); const [erro, setErro] = useState<string | null>(null)
  const q = sp.get('q') ?? ''; const page = Math.max(1, Number(sp.get('page') ?? 1) || 1); const pp = [10, 25, 50].includes(Number(sp.get('pp'))) ? Number(sp.get('pp')) : 25
  const hcamada = sp.get('hcamada') ?? ''
  const carregar = useCallback(() => {
    setLoading(true)
    carregarHistoricoRegrasAction(produtoId, { camada: hcamada, q, page, pp })
      .then((r) => { if ('ok' in r) { setRows(r.rows); setTotal(r.total); setMigrado(r.migrado); setErro(null) } else setErro(r.error) })
      .catch(() => setErro('Falha ao carregar o histórico.')).finally(() => setLoading(false))
  }, [produtoId, hcamada, q, page, pp])
  useEffect(() => { if (ativa) carregar() }, [ativa, carregar])
  const resumo = (v: unknown) => { if (v == null) return '—'; try { const s = JSON.stringify(v); return s.length > 140 ? `${s.slice(0, 140)}…` : s } catch { return '—' } }
  const cols: DataTableColumn<ItemHistorico>[] = [
    { key: 'criadoEm', header: 'Quando', width: '10.5rem', render: (r) => <span className="tabular-nums">{formatBrt(r.criadoEm) ?? '—'}</span> },
    { key: 'camada', header: 'Camada', width: '12rem', render: (r) => <Pilula tipo="vio">{r.camada}</Pilula> },
    { key: 'acao', header: 'Ação', width: '12rem', render: (r) => r.acao },
    { key: 'alvo', header: 'Alvo', render: (r) => r.alvo, title: (r) => r.alvo },
    { key: 'ator', header: 'Quem', width: '12rem', render: (r) => r.ator },
    { key: 'mudanca', header: 'Antes → depois', render: (r) => <span className="text-xs text-muted-foreground">{resumo(r.antes)} → {resumo(r.depois)}</span>, title: (r) => `${resumo(r.antes)} → ${resumo(r.depois)}` },
  ]
  return (
    <>
      {!migrado && <Nota tipo="aviso">O histórico unificado ainda não está ativo neste banco: aplique a migração 20261119050000_regras_log_unificado.sql. As mudanças continuam na auditoria geral.</Nota>}
      <DataTable<ItemHistorico> rows={rows} total={total} loading={loading} error={erro} getRowId={(r) => r.id} columns={cols} selectable={false}
        perPageOptions={[10, 25, 50]} defaultPerPage={25} searchable searchPlaceholder="Buscar por alvo ou ação…" nomeSingular="registro" nomePlural="registros"
        filters={(
          <select aria-label="Camada" value={hcamada} onChange={(e) => { const p = new URLSearchParams(sp.toString()); e.target.value ? p.set('hcamada', e.target.value) : p.delete('hcamada'); p.delete('page'); router.push(`${pathname}?${p}`) }} className={selectCls}>
            <option value="">Todas as camadas</option>
            {[['visibilidade', 'Visibilidade'], ['disponibilidade_seg', 'Regra de segmento'], ['grupos', 'Grupos de acesso'], ['excecao', 'Exceção'], ['cronograma', 'Cronograma de referência']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )} />
    </>
  )
}

function Legenda({ produtoId }: { produtoId: string }) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">Camadas (vocabulário único)</h3>
        <dl className="grid gap-3 md:grid-cols-2">
          {CAMADAS.map((c) => <div key={c}><dt><Pilula tipo="vio">{CAMADAS_INFO[c].rotulo}</Pilula></dt><dd className="mt-1 text-sm text-muted-foreground">{CAMADAS_INFO[c].desc}</dd></div>)}
        </dl>
      </section>
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">Estados que o aluno vê</h3>
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-center gap-2"><PilulaEfeito efeito="liberado" /> Abre normalmente (pode mostrar a data em que liberou).</li>
          <li className="flex items-center gap-2"><PilulaEfeito efeito="cadeado" /> Aparece, mas bloqueado até a data/condição (ou por segmento com cadeado).</li>
          <li className="flex items-center gap-2"><PilulaEfeito efeito="oculto" /> Some da tela do aluno.</li>
          <li className="flex items-center gap-2"><PilulaEfeito efeito="bloqueado" /> Sem acesso (produto bloqueado, exceção de bloquear, segmento que bloqueia).</li>
        </ul>
      </section>
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold">Quem vence quem</h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li><b className="text-foreground">Acesso ao produto</b>: sem acesso (ou produto em atualização/rascunho) nada mais importa. Segmento que BLOQUEIA vence assinatura e grupo.</li>
          <li><b className="text-foreground">Visibilidade por segmento</b>: se barra o aluno, a aula some ou fica com cadeado — nem a exceção de liberar derruba.</li>
          <li><b className="text-foreground">Exceção manual</b> (bloquear vence liberar; módulo vale para as aulas dentro) vence cronograma e disponibilidade.</li>
          <li><b className="text-foreground">Cronograma de referência / planilha / plano do aluno</b>: só tem efeito onde existe regra do tipo Cronograma.</li>
          <li><b className="text-foreground">Regra de segmento</b> substitui a disponibilidade base (menor prioridade vence; empate: a mais antiga). Depois, a <b className="text-foreground">disponibilidade base</b> do módulo/aula.</li>
        </ol>
        <p className="mt-3 text-sm text-muted-foreground">Termo antigo: <b className="text-foreground">&quot;Trilha&quot;</b> = <b className="text-foreground">Cronograma de referência</b> (nas telas do Extensivo).</p>
      </section>
      <p className="text-sm text-muted-foreground">Telas donas das regras: <Link className="text-primary hover:underline" href={`/admin/conteudos/produtos/${produtoId}?aba=grupos`}>Grupos de acesso</Link> · <Link className="text-primary hover:underline" href={`/admin/conteudos/produtos/${produtoId}?aba=visibilidade`}>Visibilidade</Link> · <Link className="text-primary hover:underline" href={`/admin/conteudos/produtos/${produtoId}?aba=conteudos`}>Conteúdos (disponibilidade)</Link> · <Link className="text-primary hover:underline" href={hrefLiberacaoAulas(produtoId)}>Liberação de aulas</Link> · <Link className="text-primary hover:underline" href="/admin/liberacao">Regras de venda</Link>.</p>
    </div>
  )
}
