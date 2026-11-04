'use client'

// BARALHO › editor (Baralho.png). Lista de cartões (reordenável) + editor frente/verso/fonte/disciplina
// + painel de configuração/publicação. Backend-first: cada escrita chama a server action; a página
// recarrega do servidor. REUSA os modais Publicar/Importar do índice.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Plus, Copy, Trash2, Check, Eye, GripVertical, Download, Upload, X, RotateCw, Layers,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import type { BaralhoDetalhe, BaralhoAlcance, CartaoBaralho } from '@/lib/flashcards/baralhos'
import {
  criarCartaoAction, atualizarCartaoAction, removerCartaoAction, reordenarCartoesAction,
  atualizarBaralhoAction, excluirBaralhoAction, duplicarBaralhoAction, definirAlcanceGruposAction, listarGruposAction,
} from '../actions'
import { PublicarDialog, ImportarCartoesDialog, baixarCsvBaralho } from '../flashcards-client'

type Form = { frente: string; verso: string; fonte: string; disciplina: string }
const VAZIO: Form = { frente: '', verso: '', fonte: '', disciplina: '' }

export function BaralhoEditor({ baralho, abrirNovo, podeEditar }: { baralho: BaralhoDetalhe; abrirNovo: boolean; podeEditar: boolean }) {
  const router = useRouter()
  const cards = baralho.cartoes
  const [editId, setEditId] = useState<string | null>(cards[0]?.id ?? null)
  const [novoAberto, setNovoAberto] = useState(false)       // editando um cartão novo (ainda não salvo)
  const [form, setForm] = useState<Form>(cards[0] ? toForm(cards[0]) : VAZIO)
  const [pubAberto, setPubAberto] = useState(false)
  const [importAberto, setImportAberto] = useState(false)
  const [previewAberto, setPreviewAberto] = useState(false)
  const [pend, start] = useTransition()
  const iniciouNovo = useRef(false)

  // Resync quando a lista do servidor muda (após refresh). Mantém o cartão selecionado se ainda existir.
  useEffect(() => {
    if (novoAberto) return
    const atual = cards.find((c) => c.id === editId) ?? cards[0] ?? null
    setEditId(atual?.id ?? null)
    setForm(atual ? toForm(atual) : VAZIO)
  }, [cards.map((c) => c.id + c.frente + c.verso + c.fonte + c.disciplina).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  // ?novo=1 → começa um cartão novo.
  useEffect(() => { if (abrirNovo && podeEditar && !iniciouNovo.current) { iniciouNovo.current = true; iniciarNovo() } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const idx = useMemo(() => cards.findIndex((c) => c.id === editId), [cards, editId])

  function selecionar(c: CartaoBaralho) { setNovoAberto(false); setEditId(c.id); setForm(toForm(c)) }
  function iniciarNovo() { setNovoAberto(true); setEditId(null); setForm(VAZIO) }
  function navegar(delta: number) { const n = cards[idx + delta]; if (n) selecionar(n) }

  const salvar = () => start(async () => {
    if (!form.frente.trim() || !form.verso.trim()) { toast.error('Frente e verso são obrigatórios.'); return }
    if (novoAberto || !editId) {
      const r = await criarCartaoAction(baralho.id, { frente: form.frente, verso: form.verso, fonte: form.fonte || null, disciplina: form.disciplina || null })
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Cartão criado.'); setNovoAberto(false); if (r.id) setEditId(r.id); router.refresh()
    } else {
      const r = await atualizarCartaoAction(editId, { frente: form.frente, verso: form.verso, fonte: form.fonte || null, disciplina: form.disciplina || null })
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Cartão salvo.'); router.refresh()
    }
  })

  const excluirCartao = () => start(async () => {
    if (!editId) { setNovoAberto(false); setForm(cards[0] ? toForm(cards[0]) : VAZIO); setEditId(cards[0]?.id ?? null); return }
    if (!(await confirmar({ titulo: 'Excluir cartão', mensagem: 'Remover este cartão do baralho?', destrutivo: true, confirmar: 'Excluir' }))) return
    const r = await removerCartaoAction(editId); r.ok ? (toast.success('Cartão removido.'), router.refresh()) : toast.error(r.error)
  })

  const duplicarCartao = () => start(async () => {
    const base = cards.find((c) => c.id === editId)
    if (!base) return
    const r = await criarCartaoAction(baralho.id, { frente: base.frente, verso: base.verso, fonte: base.fonte, disciplina: base.disciplina })
    r.ok ? (toast.success('Cartão duplicado.'), router.refresh()) : toast.error(r.error)
  })

  const reordenar = (novaOrdem: CartaoBaralho[]) => start(async () => {
    const itens = novaOrdem.map((c, i) => ({ id: c.id, ordem: i }))
    const r = await reordenarCartoesAction(itens); r.ok ? router.refresh() : toast.error(r.error)
  })

  function exportarCsv() { baixarCsvBaralho(baralho.nome, cards) }

  return (
    <div className="w-full space-y-5">
      {/* Breadcrumb + cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/admin/conteudos/flashcards" aria-label="Voltar" className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-card text-foreground hover:bg-muted"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="mt-1 hidden h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:inline-flex"><Layers className="h-5 w-5" /></span>
          <div className="min-w-0">
            <nav className="flex items-center gap-1 text-xs text-muted-foreground">
              <Link href="/admin/conteudos/flashcards" className="hover:text-foreground">Flashcards</Link>
              <ChevronRight className="h-3 w-3" /><span className="text-foreground">{baralho.nome}</span>
            </nav>
            <div className="mt-1 text-[11px] font-extrabold uppercase tracking-[.2em]" style={{ color: 'var(--gold-ink, var(--pn-9a7400,#9A7400))' }}>Baralho</div>
            <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-foreground">{baralho.nome}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
              <span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-bold', baralho.status === 'publicado' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{baralho.status === 'publicado' ? 'Publicado' : 'Rascunho'}</span>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11.5px] font-semibold">{baralho.totalCartoes} cartões</span>
              <span>{baralho.alcance === 'todos' ? 'Todos os alunos' : 'Somente grupos'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPreviewAberto(true)} disabled={!cards.length} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"><Eye className="h-4 w-4" /> Pré-visualizar</button>
          {baralho.status === 'publicado' ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3.5 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400"><Check className="h-4 w-4" /> Publicado</span>
          ) : (
            <button onClick={() => setPubAberto(true)} disabled={!podeEditar} style={{ background: 'linear-gradient(180deg,color-mix(in oklab,var(--primary) 85%,white),var(--primary))' }} className="inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13px] font-extrabold text-primary-foreground shadow-[0_8px_18px_-8px_var(--primary)] disabled:opacity-50"><Check className="h-4 w-4" /> Publicar baralho</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        {/* Lista de cartões (reordenável) */}
        <div className="space-y-2">
          <ListaCartoes cards={cards} editId={editId} podeEditar={podeEditar} onSelecionar={selecionar} onReordenar={reordenar} />
          <button onClick={iniciarNovo} disabled={!podeEditar} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed bg-card px-3 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/5 disabled:opacity-50"><Plus className="h-4 w-4" /> Novo cartão</button>
        </div>

        {/* Editor do cartão */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">{novoAberto || idx < 0 ? 'Novo cartão' : `Cartão ${String(idx + 1).padStart(2, '0')}`}</h2>
              <div className="flex items-center gap-1.5">
                <button onClick={() => navegar(-1)} disabled={idx <= 0} className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1.5 text-sm hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Anterior</button>
                <button onClick={() => navegar(1)} disabled={idx < 0 || idx >= cards.length - 1} className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1.5 text-sm hover:bg-muted disabled:opacity-40">Próximo <ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary">Frente · Pergunta</span>
                <textarea value={form.frente} disabled={!podeEditar} onChange={(e) => setForm({ ...form, frente: e.target.value })} rows={7} className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary">Verso · Resposta</span>
                <textarea value={form.verso} disabled={!podeEditar} onChange={(e) => setForm({ ...form, verso: e.target.value })} rows={7} className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Fonte (aparece no verso)</span>
                <input value={form.fonte} disabled={!podeEditar} onChange={(e) => setForm({ ...form, fonte: e.target.value })} placeholder="STF · ARE 1.537.713/MG · Tema 1.412 RG" className="h-9 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Disciplina</span>
                <input value={form.disciplina} disabled={!podeEditar} onChange={(e) => setForm({ ...form, disciplina: e.target.value })} placeholder="Direito Constitucional" className="h-9 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button onClick={duplicarCartao} disabled={!podeEditar || novoAberto || !editId || pend} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"><Copy className="h-4 w-4" /> Duplicar cartão</button>
                <button onClick={excluirCartao} disabled={!podeEditar || pend} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Excluir cartão</button>
              </div>
              <button onClick={salvar} disabled={!podeEditar || pend} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"><Check className="h-4 w-4" /> Salvar cartão</button>
            </div>
          </div>

          {/* Gerar cartões */}
          <div className="rounded-[20px] border bg-card p-4">
            <div className="mb-3">
              <div className="text-sm font-semibold text-foreground">Gerar cartões</div>
              <div className="text-xs text-muted-foreground">Importe um CSV com frente e verso (fonte e disciplina opcionais) para criar vários cartões de uma vez.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setImportAberto(true)} disabled={!podeEditar} className="inline-flex h-9 items-center gap-1.5 rounded-xl border bg-card px-3 text-[13px] font-bold text-foreground hover:bg-muted disabled:opacity-50"><Upload className="h-4 w-4" /> Importar CSV</button>
            </div>
          </div>
        </div>

        {/* Configuração do baralho */}
        <ConfigBaralho baralho={baralho} podeEditar={podeEditar} onChanged={() => router.refresh()} onExportar={exportarCsv} onPreview={() => setPreviewAberto(true)}
          onDuplicar={() => start(async () => { const r = await duplicarBaralhoAction(baralho.id); r.ok && r.id ? router.push(`/admin/conteudos/flashcards/${r.id}`) : toast.error(r.error) })}
          onExcluir={() => start(async () => {
            if (!(await confirmar({ titulo: 'Excluir baralho', mensagem: 'O baralho vai para a Lixeira. Continuar?', destrutivo: true, confirmar: 'Excluir' }))) return
            const r = await excluirBaralhoAction(baralho.id); r.ok ? (toast.success('Baralho excluído.'), router.push('/admin/conteudos/flashcards')) : toast.error(r.error)
          })} />
      </div>

      {pubAberto && <PublicarDialog baralho={baralho} onClose={() => setPubAberto(false)} onPublicado={() => { setPubAberto(false); router.refresh() }} />}
      {importAberto && <ImportarCartoesDialog baralho={baralho} onClose={() => setImportAberto(false)} onImportado={() => { setImportAberto(false); router.refresh() }} />}
      {previewAberto && <PreviewDialog cards={cards} nome={baralho.nome} onClose={() => setPreviewAberto(false)} />}
    </div>
  )
}

function toForm(c: CartaoBaralho): Form { return { frente: c.frente, verso: c.verso, fonte: c.fonte ?? '', disciplina: c.disciplina ?? '' } }

// ───────────────────────────── Lista reordenável (drag nativo) ─────────────────────────────
function ListaCartoes({ cards, editId, podeEditar, onSelecionar, onReordenar }: {
  cards: CartaoBaralho[]; editId: string | null; podeEditar: boolean
  onSelecionar: (c: CartaoBaralho) => void; onReordenar: (ordem: CartaoBaralho[]) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  if (!cards.length) return <div className="rounded-xl border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">Sem cartões ainda.</div>

  function soltarEm(alvo: CartaoBaralho) {
    if (!dragId || dragId === alvo.id) return
    const atual = [...cards]
    const de = atual.findIndex((c) => c.id === dragId)
    const para = atual.findIndex((c) => c.id === alvo.id)
    if (de < 0 || para < 0) return
    const [mov] = atual.splice(de, 1); atual.splice(para, 0, mov)
    onReordenar(atual)
  }

  return (
    <div className="space-y-2">
      {cards.map((c, i) => (
        <div
          key={c.id}
          draggable={podeEditar}
          onDragStart={() => setDragId(c.id)}
          onDragOver={(e) => { if (dragId) e.preventDefault() }}
          onDrop={() => { soltarEm(c); setDragId(null) }}
          onDragEnd={() => setDragId(null)}
          onClick={() => onSelecionar(c)}
          className={cn('flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition-colors', c.id === editId ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/40', dragId === c.id && 'opacity-50')}
        >
          {podeEditar && <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />}
          <span className="mt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
          <span className="line-clamp-3 text-sm font-medium text-foreground">{c.frente || '(sem frente)'}</span>
        </div>
      ))}
    </div>
  )
}

// ───────────────────────────── Painel de configuração (direita) ─────────────────────────────
function ConfigBaralho({ baralho, podeEditar, onChanged, onExportar, onPreview, onDuplicar, onExcluir }: {
  baralho: BaralhoDetalhe; podeEditar: boolean; onChanged: () => void; onExportar: () => void; onPreview: () => void; onDuplicar: () => void; onExcluir: () => void
}) {
  const [nome, setNome] = useState(baralho.nome)
  const [descricao, setDescricao] = useState(baralho.descricao ?? '')
  const [alcance, setAlcance] = useState<BaralhoAlcance>(baralho.alcance)
  const [grupos, setGrupos] = useState<{ id: string; nome: string }[] | null>(null)
  const [selGrupos, setSelGrupos] = useState<Set<string>>(new Set(baralho.grupoIds))
  const [, start] = useTransition()
  useEffect(() => { setNome(baralho.nome); setDescricao(baralho.descricao ?? ''); setAlcance(baralho.alcance); setSelGrupos(new Set(baralho.grupoIds)) }, [baralho.id, baralho.nome, baralho.descricao, baralho.alcance, baralho.grupoIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (alcance === 'grupos' && grupos === null) listarGruposAction().then((r) => setGrupos(r.grupos)) }, [alcance, grupos])

  const salvar = (patch: { nome?: string; descricao?: string | null; alcance?: BaralhoAlcance }) =>
    start(async () => { const r = await atualizarBaralhoAction(baralho.id, patch); if (!r.ok) toast.error(r.error); else onChanged() })
  const toggleGrupo = (id: string) => { const n = new Set(selGrupos); n.has(id) ? n.delete(id) : n.add(id); setSelGrupos(n); start(async () => { const r = await definirAlcanceGruposAction(baralho.id, [...n]); if (!r.ok) toast.error(r.error); else onChanged() }) }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
      <div className="text-xs font-semibold uppercase tracking-wide text-primary">Configuração</div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Nome do baralho</span>
        <input value={nome} disabled={!podeEditar} onChange={(e) => setNome(e.target.value)} onBlur={() => nome.trim() && nome !== baralho.nome && salvar({ nome })} className="h-9 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Descrição (opcional)</span>
        <textarea value={descricao} disabled={!podeEditar} onChange={(e) => setDescricao(e.target.value)} onBlur={() => descricao !== (baralho.descricao ?? '') && salvar({ descricao })} rows={2} className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
      </label>

      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">Quem alcança</div>
        <div className="space-y-2">
          <button type="button" disabled={!podeEditar} onClick={() => { setAlcance('todos'); salvar({ alcance: 'todos' }) }} className={cn('flex w-full items-center gap-2 rounded-xl border p-2.5 text-left text-sm disabled:opacity-60', alcance === 'todos' ? 'border-primary bg-primary/5 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/50')}><Dot on={alcance === 'todos'} /> Todos os alunos</button>
          <button type="button" disabled={!podeEditar} onClick={() => { setAlcance('grupos'); salvar({ alcance: 'grupos' }) }} className={cn('flex w-full items-center gap-2 rounded-xl border p-2.5 text-left text-sm disabled:opacity-60', alcance === 'grupos' ? 'border-primary bg-primary/5 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/50')}><Dot on={alcance === 'grupos'} /> Somente grupos de acesso</button>
        </div>
        {alcance === 'grupos' && (
          grupos === null ? <div className="mt-2 text-xs text-muted-foreground">Carregando grupos…</div>
            : !grupos.length ? <div className="mt-2 rounded-lg border border-dashed bg-muted/30 p-2 text-xs text-muted-foreground">Nenhum grupo cadastrado.</div>
              : <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">{grupos.map((g) => <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50"><input type="checkbox" checked={selGrupos.has(g.id)} disabled={!podeEditar} onChange={() => toggleGrupo(g.id)} className="h-4 w-4 accent-[var(--brand-primary,var(--primary))]" /><span className="truncate text-foreground">{g.nome}</span></label>)}</div>
        )}
      </div>

      <div className="space-y-1.5 border-t pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Situação</div>
        <LinhaStat label="Situação" valor={baralho.status === 'publicado' ? 'Publicado' : 'Rascunho'} />
        <LinhaStat label="Cartões" valor={String(baralho.totalCartoes)} />
        <LinhaStat label="Alunos usando" valor={String(baralho.alunosUsando)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={onDuplicar} disabled={!podeEditar} className="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-card px-2.5 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"><Copy className="h-4 w-4" /> Duplicar</button>
        <button onClick={onExportar} className="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-card px-2.5 py-2 text-sm font-medium hover:bg-muted"><Download className="h-4 w-4" /> Exportar CSV</button>
        <button onClick={onPreview} className="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-card px-2.5 py-2 text-sm font-medium hover:bg-muted"><Eye className="h-4 w-4" /> Pré-visualizar</button>
        <button onClick={onExcluir} disabled={!podeEditar} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-card px-2.5 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Excluir</button>
      </div>
    </div>
  )
}
function Dot({ on }: { on: boolean }) { return <span className={cn('grid h-4 w-4 shrink-0 place-items-center rounded-full border-2', on ? 'border-primary' : 'border-muted-foreground/40')}>{on && <span className="h-2 w-2 rounded-full bg-primary" />}</span> }
function LinhaStat({ label, valor }: { label: string; valor: string }) { return <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-semibold text-foreground">{valor}</span></div> }

// ───────────────────────────── Pré-visualização (flip) ─────────────────────────────
function PreviewDialog({ cards, nome, onClose }: { cards: CartaoBaralho[]; nome: string; onClose: () => void }) {
  const [i, setI] = useState(0)
  const [virado, setVirado] = useState(false)
  const c = cards[i]
  const ir = (d: number) => { setI((v) => Math.min(Math.max(0, v + d), cards.length - 1)); setVirado(false) }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-lg">
        <div className="text-xs text-muted-foreground">Pré-visualizar · {nome}</div>
        <DialogTitle>Cartão {i + 1} de {cards.length}</DialogTitle>
        <button onClick={() => setVirado((v) => !v)} className="mt-3 flex min-h-56 w-full flex-col items-center justify-center gap-3 rounded-2xl border bg-muted/30 p-6 text-center transition hover:bg-muted/50">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">{virado ? 'Verso · Resposta' : 'Frente · Pergunta'}</span>
          <span className="text-base font-medium text-foreground">{virado ? c?.verso : c?.frente}</span>
          {virado && (c?.fonte || c?.disciplina) && <span className="text-xs text-muted-foreground">{[c?.fonte, c?.disciplina].filter(Boolean).join(' · ')}</span>}
          <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><RotateCw className="h-3.5 w-3.5" /> Clique para virar</span>
        </button>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={() => ir(-1)} disabled={i <= 0} className="inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Anterior</button>
          <button onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"><X className="mr-1 inline h-3.5 w-3.5" />Fechar</button>
          <button onClick={() => ir(1)} disabled={i >= cards.length - 1} className="inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40">Próximo <ChevronRight className="h-4 w-4" /></button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
