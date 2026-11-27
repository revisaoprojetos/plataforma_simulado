'use client'

// ABA "PARTES" do gerenciamento do documento (Biblioteca). Uma parte = nome + faixa [trecho inicial .. final] dentro
// da lei inteira (ex.: "Art. 1º → Art. 20"). Nada de tempo/regra aqui. Backend-first: tudo vem das rotas
// /api/admin/biblioteca/partes (lista com status/medida/uso já calculados no servidor) — o render só exibe.
// Rotas de API (não server actions). Arquivar = nunca apaga; avisa quando há metas usando a parte.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowDown, ArrowUp, Archive, Loader2, Pencil, Plus, RotateCcw, Search, Wand2 } from 'lucide-react'
import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'

const API = '/api/admin/biblioteca/partes'

type Parte = {
  id: string; nome: string; ordem: number; arquivada: boolean
  trecho_ini_uid: string; trecho_fim_uid: string; rotulo_ini: string | null; rotulo_fim: string | null
  metasEmUso: number
  resolucao: { ok: boolean; motivo: string; indices: [number, number] | null; recuperadoPorRotulo: { ini: boolean; fim: boolean } } | null
  medida: { artigos: number; palavras: number; caracteres: number } | null
}
type Trecho = { uid: string; tipo: string | null; rotulo: string | null; ordem: number; previa: string }
type Sugestao = {
  nome: string; iniUid: string; fimUid: string; rotuloIni: string | null; rotuloFim: string | null
  medida: { artigos: number; palavras: number; caracteres: number }; conflitaComExistente: boolean
}
type ModoSug = 'titulo' | 'capitulo' | 'cada_n_artigos'

const fmt = (n: number) => n.toLocaleString('pt-BR')
const faixaTxt = (p: Pick<Parte, 'rotulo_ini' | 'rotulo_fim'>) => `${p.rotulo_ini || '(início)'} → ${p.rotulo_fim || '(fim)'}`

async function api<T = any>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
    const data = (await r.json().catch(() => ({}))) as T
    return { ok: r.ok, status: r.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'Falha de rede.' } as T }
  }
}

function statusDe(p: Parte): { rotulo: string; cls: string } {
  if (!p.resolucao) return { rotulo: '—', cls: 'bg-muted text-muted-foreground' }
  if (!p.resolucao.ok) return { rotulo: 'Quebrada', cls: 'bg-destructive/10 text-destructive' }
  if (p.resolucao.recuperadoPorRotulo.ini || p.resolucao.recuperadoPorRotulo.fim) return { rotulo: 'Recuperada por rótulo', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' }
  return { rotulo: 'Ok', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' }
}

export function PartesAba({ documentoId }: { documentoId: string }) {
  const [partes, setPartes] = useState<Parte[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ausente, setAusente] = useState(false)
  const [arquivadas, setArquivadas] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [editor, setEditor] = useState<{ parte: Parte | null } | null>(null)
  const [sugerir, setSugerir] = useState(false)

  const carregar = useCallback(async () => {
    const r = await api<any>(`${API}?documentoId=${documentoId}${arquivadas ? '&arquivadas=1' : ''}`)
    if (r.ok) { setPartes(r.data.partes ?? []); setErro(null); setAusente(false); return }
    if (r.status === 503 || r.data?.codigo === 'tabela_ausente') { setAusente(true); setPartes([]); return }
    setErro(r.data?.error || 'Não foi possível carregar as partes.'); setPartes([])
  }, [documentoId, arquivadas])
  useEffect(() => { void carregar() }, [carregar])

  const ativas = useMemo(() => (partes ?? []).filter((p) => !p.arquivada), [partes])

  async function mover(p: Parte, delta: -1 | 1) {
    const i = ativas.findIndex((x) => x.id === p.id), j = i + delta
    if (i < 0 || j < 0 || j >= ativas.length) return
    setOcupado(true)
    // ordens densas (índice na lista) — troca a posição das duas vizinhas.
    const a = await api(API, { method: 'PATCH', body: JSON.stringify({ id: ativas[i].id, ordem: j }) })
    const b = await api(API, { method: 'PATCH', body: JSON.stringify({ id: ativas[j].id, ordem: i }) })
    setOcupado(false)
    if (!a.ok || !b.ok) toast.error('Não foi possível reordenar.')
    await carregar()
  }

  async function arquivar(p: Parte) {
    const uso = p.metasEmUso > 0
    const ok = await confirmar({
      titulo: 'Arquivar parte',
      mensagem: uso
        ? `A parte “${p.nome}” está em uso por ${p.metasEmUso} ${p.metasEmUso === 1 ? 'meta' : 'metas'}. Arquivar não apaga nada, mas essas metas deixam de poder escolhê-la. Arquivar mesmo assim?`
        : `Arquivar a parte “${p.nome}”? Ela pode ser restaurada depois.`,
      confirmar: 'Arquivar', destrutivo: true,
    })
    if (!ok) return
    setOcupado(true)
    const r = await api(`${API}?id=${p.id}`, { method: 'DELETE' })
    setOcupado(false)
    if (!r.ok) return void toast.error((r.data as any)?.error || 'Não foi possível arquivar.')
    toast.success('Parte arquivada.'); await carregar()
  }

  async function restaurar(p: Parte) {
    setOcupado(true)
    const r = await api(API, { method: 'PATCH', body: JSON.stringify({ id: p.id, arquivada: false }) })
    setOcupado(false)
    if (!r.ok) return void toast.error((r.data as any)?.error || 'Não foi possível restaurar.')
    toast.success('Parte restaurada.'); await carregar()
  }

  const colunas: DataTableColumn<Parte>[] = [
    {
      key: 'ordem', header: 'Ordem', width: '6.5rem',
      render: (p) => {
        const i = ativas.findIndex((x) => x.id === p.id)
        return p.arquivada ? <span className="text-muted-foreground">—</span> : (
          <span className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" disabled={ocupado || i <= 0} onClick={() => mover(p, -1)} aria-label="Subir"><ArrowUp /></Button>
            <Button variant="ghost" size="icon-sm" disabled={ocupado || i < 0 || i >= ativas.length - 1} onClick={() => mover(p, 1)} aria-label="Descer"><ArrowDown /></Button>
          </span>
        )
      },
    },
    { key: 'nome', header: 'Nome', render: (p) => <span className={p.arquivada ? 'text-muted-foreground line-through' : 'font-medium'}>{p.nome}</span>, title: (p) => p.nome },
    { key: 'faixa', header: 'Faixa', render: (p) => <span className="font-mono text-xs">{faixaTxt(p)}</span>, title: (p) => faixaTxt(p) },
    {
      key: 'medida', header: 'Artigos / palavras', width: '11rem',
      render: (p) => p.medida ? <span className="tabular-nums">{fmt(p.medida.artigos)} art. · {fmt(p.medida.palavras)} pal.</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'uso', header: 'Metas em uso', width: '8rem', align: 'center',
      render: (p) => <span className={p.metasEmUso > 0 ? 'font-semibold tabular-nums' : 'tabular-nums text-muted-foreground'}>{fmt(p.metasEmUso)}</span>,
    },
    {
      key: 'status', header: 'Faixa', width: '12rem',
      render: (p) => { const s = statusDe(p); return <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ${s.cls}`}>{p.arquivada ? 'Arquivada' : s.rotulo}</span> },
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Partes do documento</h3>
          <p className="text-xs text-muted-foreground">Recortes da lei (ex.: Art. 1º → Art. 20) que as metas podem escolher. O documento continua inteiro.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={arquivadas} onChange={(e) => setArquivadas(e.target.checked)} /> Mostrar arquivadas
        </label>
        <Button variant="outline" onClick={() => setSugerir(true)} disabled={ausente}><Wand2 /> Sugerir divisão</Button>
        <Button onClick={() => setEditor({ parte: null })} disabled={ausente}><Plus /> Nova parte</Button>
      </div>

      {ausente && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <strong>Recurso de partes ainda não disponível.</strong>
            <p className="text-muted-foreground">Aplique a migration 16 (<code>docs/sql-aplicar-twdr/16-conteudo-partes-classificacao.sql</code>) no banco e recarregue.</p>
          </div>
        </div>
      )}
      {erro && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{erro}</div>}

      {partes === null ? (
        <div className="flex items-center gap-2 rounded-2xl border bg-card p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando partes…</div>
      ) : !ausente && (
        <DataTable<Parte>
          rows={partes} total={partes.length} getRowId={(p) => p.id} columns={colunas}
          selectable={false} perPageOptions={[1000]} defaultPerPage={1000}
          nomeSingular="parte" nomePlural="partes"
          empty={<span className="text-sm text-muted-foreground">Nenhuma parte ainda. Crie uma ou use “Sugerir divisão”.</span>}
          rowActions={(p) => p.arquivada
            ? [{ label: 'Restaurar', icon: <RotateCcw />, onClick: () => restaurar(p) }]
            : [
              { label: 'Editar', icon: <Pencil />, onClick: () => setEditor({ parte: p }) },
              { label: 'Arquivar', icon: <Archive />, destructive: true, separatorBefore: true, onClick: () => arquivar(p) },
            ]}
        />
      )}

      {editor && (
        <EditorParte documentoId={documentoId} parte={editor.parte} onClose={() => setEditor(null)}
          onSalvo={async () => { setEditor(null); await carregar() }} />
      )}
      {sugerir && (
        <SugerirDialog documentoId={documentoId} onClose={() => setSugerir(false)}
          onCriado={async () => { setSugerir(false); await carregar() }} />
      )}
    </div>
  )
}

// ── Seletor de ponta da faixa (digita o rótulo/texto e escolhe na lista de trechos do documento) ─────────────────────

type Ponta = { uid: string; rotulo: string | null } | null

function SeletorTrecho({ documentoId, titulo, valor, onChange }: {
  documentoId: string; titulo: string; valor: Ponta; onChange: (p: Ponta) => void
}) {
  const [q, setQ] = useState('')
  const [todos, setTodos] = useState(false)
  const [itens, setItens] = useState<Trecho[] | null>(null)
  const [total, setTotal] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const id = ++seq.current
    const t = setTimeout(async () => {
      const r = await api<any>(`${API}/trechos?documentoId=${documentoId}&limit=30&q=${encodeURIComponent(q)}${todos ? '&todos=1' : ''}`)
      if (id !== seq.current) return
      if (!r.ok) { setErro(r.data?.error || 'Falha ao listar trechos.'); setItens([]); return }
      setErro(null); setItens(r.data.itens ?? []); setTotal(r.data.total ?? 0)
    }, 250)
    return () => clearTimeout(t)
  }, [documentoId, q, todos])

  return (
    <div className="space-y-2 rounded-2xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</span>
        <span className="truncate text-xs">{valor ? <strong>{valor.rotulo || valor.uid}</strong> : <span className="text-muted-foreground">nenhum escolhido</span>}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o rótulo (ex.: Art. 20) ou parte do texto" className="pl-8" />
        </div>
        <label className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
          <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> todos os blocos
        </label>
      </div>
      <div className="max-h-44 overflow-y-auto rounded-xl border bg-background">
        {itens === null ? <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…</div>
          : erro ? <div className="p-3 text-xs text-destructive">{erro}</div>
          : itens.length === 0 ? <div className="p-3 text-xs text-muted-foreground">Nenhum trecho encontrado.</div>
          : itens.map((t) => {
            const rot = t.rotulo || (t.previa.match(/^\s*Art(?:igo)?\.?\s*\d+[^\s]*(?:\s*-\s*[A-Z]\b)?/i)?.[0] ?? null)
            const ativo = valor?.uid === t.uid
            return (
              <button key={t.uid} type="button" onClick={() => onChange({ uid: t.uid, rotulo: rot })}
                className={`flex w-full items-baseline gap-2 border-b px-3 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted ${ativo ? 'bg-primary/10' : ''}`}>
                <span className="w-16 shrink-0 text-[10px] uppercase text-muted-foreground">{t.tipo ?? '—'}</span>
                <span className="w-24 shrink-0 truncate font-mono font-semibold">{rot ?? '—'}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.previa}</span>
              </button>
            )
          })}
      </div>
      {itens && total > itens.length && <p className="text-[11px] text-muted-foreground">Mostrando {itens.length} de {fmt(total)} — refine a busca.</p>}
    </div>
  )
}

function EditorParte({ documentoId, parte, onClose, onSalvo }: {
  documentoId: string; parte: Parte | null; onClose: () => void; onSalvo: () => void | Promise<void>
}) {
  const [nome, setNome] = useState(parte?.nome ?? '')
  const [ini, setIni] = useState<Ponta>(parte ? { uid: parte.trecho_ini_uid, rotulo: parte.rotulo_ini } : null)
  const [fim, setFim] = useState<Ponta>(parte ? { uid: parte.trecho_fim_uid, rotulo: parte.rotulo_fim } : null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    if (!nome.trim() || !ini || !fim) { setErro('Informe o nome e escolha o trecho inicial e o final.'); return }
    setSalvando(true); setErro(null)
    const corpo = { nome: nome.trim(), iniUid: ini.uid, fimUid: fim.uid, rotuloIni: ini.rotulo, rotuloFim: fim.rotulo }
    const r = parte
      ? await api(API, { method: 'PATCH', body: JSON.stringify({ id: parte.id, ...corpo }) })
      : await api(API, { method: 'POST', body: JSON.stringify({ documentoId, ...corpo }) })
    setSalvando(false)
    if (!r.ok) { setErro((r.data as any)?.error || 'Não foi possível salvar.'); return }
    toast.success(parte ? 'Parte atualizada.' : 'Parte criada.')
    await onSalvo()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{parte ? 'Editar parte' : 'Nova parte'}</DialogTitle>
          <DialogDescription>Escolha onde a parte começa e termina. O documento não é alterado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da parte (ex.: Dos direitos fundamentais)" maxLength={120} aria-label="Nome da parte" />
          <SeletorTrecho documentoId={documentoId} titulo="Início" valor={ini} onChange={setIni} />
          <SeletorTrecho documentoId={documentoId} titulo="Fim" valor={fim} onChange={setFim} />
          {erro && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{erro}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Sugerir divisão (pré-visualização + aceite em lote) ──────────────────────────────────────────────────────────────

function SugerirDialog({ documentoId, onClose, onCriado }: { documentoId: string; onClose: () => void; onCriado: () => void | Promise<void> }) {
  const [modo, setModo] = useState<ModoSug>('capitulo')
  const [n, setN] = useState(10)
  const [gerando, setGerando] = useState(false)
  const [criando, setCriando] = useState(false)
  const [lista, setLista] = useState<Sugestao[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set())

  async function gerar() {
    setGerando(true); setAviso(null)
    const r = await api<any>(`${API}/sugerir`, { method: 'POST', body: JSON.stringify({ documentoId, modo, ...(modo === 'cada_n_artigos' ? { n } : {}) }) })
    setGerando(false)
    if (!r.ok) { setLista([]); setAviso(r.data?.error || 'Não foi possível sugerir.'); return }
    const s: Sugestao[] = r.data.sugestoes ?? []
    setLista(s); setAviso(r.data.aviso ?? null)
    setMarcadas(new Set(s.map((x, i) => (x.conflitaComExistente ? -1 : i)).filter((i) => i >= 0)))
  }

  async function aceitar() {
    if (!lista) return
    const escolhidas = lista.filter((_, i) => marcadas.has(i))
    if (!escolhidas.length) return
    setCriando(true)
    let ok = 0; const falhas: string[] = []
    for (const s of escolhidas) { // sequencial: cada criação valida sobreposição contra as anteriores
      const r = await api(API, { method: 'POST', body: JSON.stringify({ documentoId, nome: s.nome, iniUid: s.iniUid, fimUid: s.fimUid, rotuloIni: s.rotuloIni, rotuloFim: s.rotuloFim }) })
      if (r.ok) ok++; else falhas.push(`${s.nome}: ${(r.data as any)?.error || 'erro'}`)
    }
    setCriando(false)
    if (ok) toast.success(`${ok} ${ok === 1 ? 'parte criada' : 'partes criadas'}.`)
    if (falhas.length) toast.error(`${falhas.length} não criada(s): ${falhas[0]}`)
    if (ok) await onCriado()
  }

  const toggle = (i: number) => setMarcadas((p) => { const c = new Set(p); c.has(i) ? c.delete(i) : c.add(i); return c })

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !criando) onClose() }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Sugerir divisão</DialogTitle>
          <DialogDescription>O sistema propõe partes a partir da estrutura da lei. Nada é gravado até você aceitar.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border p-0.5">
            {([['titulo', 'Por título'], ['capitulo', 'Por capítulo'], ['cada_n_artigos', 'A cada N artigos']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setModo(k); setLista(null) }}
                className={`h-8 rounded-lg px-3 text-sm font-semibold ${modo === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
            ))}
          </div>
          {modo === 'cada_n_artigos' && (
            <Input type="number" min={1} max={500} value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))} className="w-24" aria-label="Artigos por parte" />
          )}
          <Button onClick={gerar} disabled={gerando}>{gerando ? <Loader2 className="animate-spin" /> : <Wand2 />} Gerar sugestões</Button>
        </div>
        {aviso && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{aviso}</div>}
        {lista !== null && (
          <div className="max-h-80 overflow-y-auto rounded-2xl border">
            {lista.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma sugestão para este critério.</div>
              : lista.map((s, i) => (
                <label key={i} className={`flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 ${s.conflitaComExistente ? 'opacity-60' : 'cursor-pointer hover:bg-muted'}`}>
                  <input type="checkbox" checked={marcadas.has(i)} disabled={s.conflitaComExistente} onChange={() => toggle(i)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.nome}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{s.rotuloIni || '(início)'} → {s.rotuloFim || '(fim)'}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{fmt(s.medida.artigos)} art. · {fmt(s.medida.palavras)} pal.</span>
                  {s.conflitaComExistente && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">sobrepõe parte existente</span>}
                </label>
              ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={criando}>Cancelar</Button>
          <Button onClick={aceitar} disabled={criando || !lista || marcadas.size === 0}>
            {criando && <Loader2 className="animate-spin" />} Criar {marcadas.size || ''} {marcadas.size === 1 ? 'parte' : 'partes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
