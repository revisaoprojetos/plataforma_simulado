'use client'

// MATRIZ DE CLASSIFICAÇÃO (Biblioteca › Fase 5). Só EXIBE o que o servidor calculou (herança, páginas, conversão…) e
// dispara a edição em lote via rota de API (/api/admin/biblioteca/classificacao). Tabela = <DataTable> exato
// (busca + filtros + ordenação server-side por searchParams). Cores só por token (badges semânticas = exceção).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, Info, Loader2, Tags, Wand2 } from 'lucide-react'
import { AbasLinha } from '@/components/ui/abas-linha'
import { DataTable, type DataTableColumn, type DataTableSelection } from '@/components/admin/data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { navProgressStart } from '@/lib/nav-progress'
import { cn } from '@/lib/utils'
import { FILTROS_MATRIZ, ROTULO_FILTRO, type FiltroMatriz } from '@/lib/conteudo/classificacao/matriz'
import type { LinhaMatrizClassificacao, MatrizClassificacao } from '@/lib/conteudo/classificacao/matriz-server'

const API = '/api/admin/biblioteca/classificacao'
const NAO_ALTERAR = '__nao_alterar'
const LIMPAR = '__limpar'
const SELECT_CLS = 'h-11 rounded-xl border bg-card px-3 text-[13.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'

type Dados = Extract<MatrizClassificacao, { ok: true }>

async function api<T = any>(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
    return { ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as T }
  } catch { return { ok: false, status: 0, data: { error: 'Falha de rede.' } as T } }
}

const Selo = ({ cls, children, title }: { cls: string; children: React.ReactNode; title?: string }) => (
  <span title={title} className={cn('inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold', cls)}>{children}</span>
)

function CelulaClassificacao({ l }: { l: LinhaMatrizClassificacao }) {
  if (l.origem === 'definida' && l.classificacao) return <Selo cls="bg-primary/15 text-primary" title="Definida neste documento">{l.classificacao.nome}</Selo>
  if (l.origem === 'herdada' && l.classificacao) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground" title={`Herdada de ${l.herdadaDe ?? 'pasta'}`}>
        <Selo cls="bg-muted text-muted-foreground">{l.classificacao.nome}</Selo>
        <span className="truncate text-[11.5px]">herdada de {l.herdadaDe ?? 'pasta'}</span>
      </span>
    )
  }
  if (l.origem === 'legado' && l.classificacao) {
    return (
      <span className="inline-flex items-center gap-1.5" title="Sem classificação: hoje o motor trata como PDFull">
        <Selo cls="bg-amber-500/15 text-amber-700 dark:text-amber-400">Sem classificação</Selo>
        <span className="truncate text-[11.5px] text-muted-foreground">comportamento atual: {l.classificacao.nome}</span>
      </span>
    )
  }
  return <Selo cls="bg-destructive/10 text-destructive" title="Pendência: sem classificação definida nem herdada">Sem classificação</Selo>
}

const INDICE: Record<NonNullable<LinhaMatrizClassificacao['indice']>, { r: string; cls: string }> = {
  ok: { r: 'Ok', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  revisar: { r: 'Revisar', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  critico: { r: 'Crítico', cls: 'bg-destructive/10 text-destructive' },
  erro: { r: 'Erro', cls: 'bg-muted text-muted-foreground' },
}

export function ClassificacaoMatrizClient({ dados, podeEditar, pp }: { dados: MatrizClassificacao; podeEditar: boolean; pp: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const filtroAtual = (FILTROS_MATRIZ as readonly string[]).includes(sp.get('f') ?? '') ? (sp.get('f') as FiltroMatriz) : 'todos'
  const comIndice = sp.get('indice') === '1'
  const comTecnicas = sp.get('tec') === '1'
  const [dlgLote, setDlgLote] = useState<DataTableSelection | null>(null)
  const [dlgSug, setDlgSug] = useState<DataTableSelection | null>(null)

  const href = (mut: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(sp.toString()); mut(p); p.delete('page')
    return `${pathname}${p.toString() ? `?${p}` : ''}`
  }
  const ir = (mut: (p: URLSearchParams) => void) => { navProgressStart(); router.push(href(mut)) }

  const cabecalho = (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>A classificação de um documento <b className="text-foreground">herda da pasta</b> quando não é definida nele. Crie e ajuste as classificações na aba <b className="text-foreground">Classificações</b> e o que cada uma faz (tempo, metas) dentro de cada classificação, na aba <b className="text-foreground">Regras de uso</b>; aqui você só atribui a pastas e documentos. Clique num documento para abrir o gerenciador dele.</span>
      </div>
      <AbasLinha
        aria-label="Filtro dos documentos"
        ativo={filtroAtual}
        itens={FILTROS_MATRIZ.map((k) => ({ key: k, label: ROTULO_FILTRO[k], href: href((p) => { k === 'todos' ? p.delete('f') : p.set('f', k) }), prefetch: false }))}
      />
    </div>
  )

  if (!dados.ok) {
    return (
      <div className="w-full space-y-4">{cabecalho}
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />{dados.error}</div>
      </div>
    )
  }

  const colunas: DataTableColumn<LinhaMatrizClassificacao>[] = [
    { key: 'titulo', header: 'Documento', sortable: true, width: '22rem', render: (l) => <Link href={`/admin/biblioteca/conteudo/${l.id}/gerenciar`} onClick={(e) => e.stopPropagation()} className="font-medium text-foreground hover:underline" title="Abrir o gerenciador do conteúdo">{l.titulo}</Link>, title: (l) => l.titulo },
    { key: 'pasta', header: 'Pasta', width: '13rem', render: (l) => l.pastaNome ?? <Selo cls="bg-amber-500/15 text-amber-700 dark:text-amber-400">Sem pasta</Selo>, title: (l) => l.pastaNome ?? 'Sem pasta' },
    { key: 'classificacao', header: 'Classificação efetiva', width: '20rem', render: (l) => <CelulaClassificacao l={l} /> },
    {
      key: 'formato', header: 'Formato de leitura', width: '11rem',
      render: (l) => !l.formato ? <span className="text-muted-foreground">—</span>
        : <span className={cn(l.formatoOrigem === 'documento' ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{l.formato}{l.formatoOrigem === 'classificacao' && ' (da classificação)'}</span>,
    },
  ]

  // Colunas técnicas (Partes/Páginas/Conversão/Índice): escondidas por padrão; "Colunas técnicas" (?tec=1) as mostra.
  const colunasTecnicas: DataTableColumn<LinhaMatrizClassificacao>[] = [
    { key: 'partes', header: 'Partes', width: '5.5rem', align: 'right', render: (l) => <span className="tabular-nums">{l.nPartes ?? '—'}</span> },
    { key: 'paginas', header: 'Páginas', sortable: true, width: '6.5rem', align: 'right', render: (l) => l.paginas != null ? <span className="tabular-nums">{l.paginas}</span> : <Selo cls="bg-amber-500/15 text-amber-700 dark:text-amber-400">sem</Selo> },
    {
      key: 'conversao', header: 'Conversão', sortable: true, width: '9rem',
      render: (l) => !l.statusConversao ? <span className="text-muted-foreground">—</span>
        : l.statusConversao === 'ok' ? <Selo cls="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">ok</Selo>
        : <Selo cls="bg-amber-500/15 text-amber-700 dark:text-amber-400">{l.statusConversao === 'revisao_necessaria' ? 'revisar' : l.statusConversao}</Selo>,
    },
    {
      key: 'indice', header: 'Índice', width: '7rem',
      render: (l) => l.indice ? <Selo cls={INDICE[l.indice].cls}>{INDICE[l.indice].r}</Selo> : <span className="text-muted-foreground" title="Ative “Calcular índice” para ver">—</span>,
    },
  ]

  return (
    <div className="w-full space-y-4">
      {cabecalho}
      {dados.migracaoPendente && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{dados.avisos[0]}</div>
      )}
      {!dados.migracaoPendente && dados.avisos.map((a) => (
        <div key={a} className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{a}</div>
      ))}

      <DataTable
        rows={dados.linhas}
        total={dados.total}
        columns={comTecnicas ? [...colunas, ...colunasTecnicas] : colunas}
        getRowId={(l) => l.id}
        defaultSort={{ key: 'titulo', dir: 'asc' }}
        perPageOptions={[10, 25, 50, 100]}
        defaultPerPage={pp}
        searchable
        searchPlaceholder="Buscar documento por título…"
        nomeSingular="documento"
        selectable={podeEditar && !dados.migracaoPendente}
        redimensionavel
        onRowClick={(l) => { navProgressStart(); router.push(`/admin/biblioteca/conteudo/${l.id}/gerenciar`) }}
        filters={(
          <>
            <select aria-label="Filtrar por pasta" className={cn(SELECT_CLS, 'max-w-[16rem]')} value={sp.get('pasta') ?? ''} onChange={(e) => ir((p) => { e.target.value ? p.set('pasta', e.target.value) : p.delete('pasta') })}>
              <option value="">Todas as pastas</option>
              {dados.pastas.map((p) => <option key={p.id} value={p.id}>{p.caminho}</option>)}
            </select>
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border bg-card px-3 text-[13.5px] text-foreground">
              <input type="checkbox" className="accent-[var(--primary)]" checked={comTecnicas} onChange={(e) => ir((p) => { if (e.target.checked) p.set('tec', '1'); else { p.delete('tec'); p.delete('indice') } })} />
              Colunas técnicas
            </label>
            {comTecnicas && (
              <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border bg-card px-3 text-[13.5px] text-foreground">
                <input type="checkbox" className="accent-[var(--primary)]" checked={comIndice} onChange={(e) => ir((p) => { e.target.checked ? p.set('indice', '1') : p.delete('indice') })} />
                Calcular índice
              </label>
            )}
          </>
        )}
        bulkActions={(sel) => (
          <>
            <Button size="sm" variant="outline" onClick={() => setDlgSug(sel)}><Wand2 /> Sugerir classificação</Button>
            <Button size="sm" onClick={() => setDlgLote(sel)}><Tags /> Definir / limpar</Button>
          </>
        )}
        empty={<span>Nenhum documento neste filtro.</span>}
      />

      {dlgLote && <LoteDialog sel={dlgLote} dados={dados} filtroUrl={sp} onClose={() => setDlgLote(null)} onFeito={() => { setDlgLote(null); router.refresh() }} />}
      {dlgSug && <SugerirDialog sel={dlgSug} filtroUrl={sp} onClose={() => setDlgSug(null)} onFeito={() => { setDlgSug(null); router.refresh() }} />}
    </div>
  )
}

/** Alvo da ação: ids marcados OU o filtro atual (selecionar todos). */
function alvoDe(sel: DataTableSelection, sp: URLSearchParams | { get(k: string): string | null }) {
  if (!sel.allMatching) return { ids: sel.ids }
  return { filtro: { filtro: sp.get('f') ?? 'todos', q: sp.get('q') ?? '', pastaId: sp.get('pasta'), disciplinaId: sp.get('disc') } }
}

function LoteDialog({ sel, dados, filtroUrl, onClose, onFeito }: { sel: DataTableSelection; dados: Dados; filtroUrl: { get(k: string): string | null }; onClose: () => void; onFeito: () => void }) {
  const [classe, setClasse] = useState(NAO_ALTERAR)
  const [formato, setFormato] = useState('')
  const [fmtAcao, setFmtAcao] = useState<'nao' | 'definir' | 'limpar'>('nao')
  const [salvando, setSalvando] = useState(false)
  const ativos = useMemo(() => dados.catalogo.filter((c) => c.ativo), [dados.catalogo])
  const nada = classe === NAO_ALTERAR && fmtAcao === 'nao'

  async function aplicar() {
    const corpo: Record<string, unknown> = { ...alvoDe(sel, filtroUrl) }
    if (classe !== NAO_ALTERAR) corpo.classificacaoId = classe === LIMPAR ? null : classe
    if (fmtAcao === 'limpar') corpo.formatoLeitura = null
    if (fmtAcao === 'definir') corpo.formatoLeitura = formato.trim().toLowerCase()
    setSalvando(true)
    const r = await api(API, { method: 'PATCH', body: JSON.stringify(corpo) })
    setSalvando(false)
    if (!r.ok) return toast.error(r.data?.error || 'Não foi possível aplicar.')
    toast.success(`${r.data.alterados} documento(s) atualizado(s)${r.data.ignorados ? ` · ${r.data.ignorados} ignorado(s)` : ''}.`)
    sel.clear(); onFeito()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Classificar {sel.count.toLocaleString('pt-BR')} documento(s)</DialogTitle>
          <DialogDescription>Limpar volta a herdar da pasta. Nada muda na leitura do aluno por enquanto.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm font-medium">Classificação
            <select className={cn(SELECT_CLS, 'w-full')} value={classe} onChange={(e) => setClasse(e.target.value)}>
              <option value={NAO_ALTERAR}>Não alterar</option>
              <option value={LIMPAR}>Limpar (herdar da pasta)</option>
              {ativos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-sm font-medium">Formato de leitura
            <select className={cn(SELECT_CLS, 'w-full')} value={fmtAcao} onChange={(e) => setFmtAcao(e.target.value as typeof fmtAcao)}>
              <option value="nao">Não alterar</option>
              <option value="definir">Definir…</option>
              <option value="limpar">Limpar (usar o da classificação)</option>
            </select>
          </label>
          {fmtAcao === 'definir' && (
            <input value={formato} onChange={(e) => setFormato(e.target.value)} placeholder="slug do formato (ex.: texto)" maxLength={40}
              className="h-11 w-full rounded-xl border bg-card px-3 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={aplicar} disabled={salvando || nada || (fmtAcao === 'definir' && !formato.trim())}>{salvando && <Loader2 className="animate-spin" />} Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type Sug = { id: string; titulo: string; slug: string; classificacaoId: string; classificacaoNome: string; motivo: 'titulo' | 'pasta'; evidencia: string }

function SugerirDialog({ sel, filtroUrl, onClose, onFeito }: { sel: DataTableSelection; filtroUrl: { get(k: string): string | null }; onClose: () => void; onFeito: () => void }) {
  const [carregando, setCarregando] = useState(false)
  const [res, setRes] = useState<{ sugestoes: Sug[]; semSugestao: number; jaClassificados: number } | null>(null)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)

  async function gerar() {
    setCarregando(true)
    const r = await api(`${API}/sugerir`, { method: 'POST', body: JSON.stringify(alvoDe(sel, filtroUrl)) })
    setCarregando(false)
    if (!r.ok) return toast.error(r.data?.error || 'Não foi possível sugerir.')
    setRes(r.data); setMarcadas(new Set((r.data.sugestoes as Sug[]).map((s) => s.id)))
  }

  async function confirmar() {
    if (!res) return
    // Agrupa por classificação: 1 PATCH por tipo (ids explícitos).
    const grupos = new Map<string, string[]>()
    for (const s of res.sugestoes) if (marcadas.has(s.id)) grupos.set(s.classificacaoId, [...(grupos.get(s.classificacaoId) ?? []), s.id])
    setSalvando(true)
    let total = 0
    for (const [classificacaoId, ids] of grupos) {
      const r = await api(API, { method: 'PATCH', body: JSON.stringify({ ids, classificacaoId }) })
      if (!r.ok) { setSalvando(false); return toast.error(r.data?.error || 'Falha ao aplicar parte das sugestões.') }
      total += Number(r.data.alterados) || 0
    }
    setSalvando(false)
    toast.success(`${total} documento(s) classificado(s).`)
    sel.clear(); onFeito()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sugerir classificação</DialogTitle>
          <DialogDescription>Só documentos sem tipo (próprio ou da pasta). Regra: título PDFIGHT/PDFLASH/PDFULL; senão o nome da pasta. Nada é gravado até confirmar.</DialogDescription>
        </DialogHeader>
        {!res ? (
          <div className="py-4"><Button onClick={gerar} disabled={carregando}>{carregando ? <Loader2 className="animate-spin" /> : <Wand2 />} Gerar sugestões para {sel.count.toLocaleString('pt-BR')} documento(s)</Button></div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{res.sugestoes.length} sugestão(ões) · {res.semSugestao} sem pista · {res.jaClassificados} já classificado(s) (ignorados)</p>
            <div className="max-h-[50vh] overflow-y-auto rounded-xl border">
              {res.sugestoes.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhuma sugestão.</p> : res.sugestoes.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/40">
                  <input type="checkbox" className="accent-[var(--primary)]" checked={marcadas.has(s.id)} onChange={() => setMarcadas((p) => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })} />
                  <span className="min-w-0 flex-1 truncate" title={s.titulo}>{s.titulo}</span>
                  <Selo cls="bg-primary/15 text-primary">{s.classificacaoNome}</Selo>
                  <span className="hidden shrink-0 text-[11.5px] text-muted-foreground sm:inline" title={s.evidencia}>por {s.motivo === 'titulo' ? 'título' : 'pasta'}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Fechar</Button>
          {res && <Button onClick={confirmar} disabled={salvando || marcadas.size === 0}>{salvando && <Loader2 className="animate-spin" />} Aplicar {marcadas.size} sugestão(ões)</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
