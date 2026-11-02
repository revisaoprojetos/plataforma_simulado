'use client'

// Aba VITRINE do Produto (Estúdio): área do aluno por seções (banner / carrossel), como a member area da Curseduca.
// Reusa salvarVitrineAction (replace do conjunto de seções + deriva os itens liberados) e os tipos de produção.
// LAZY + BUSCA NO SERVIDOR: a aba só monta na 1ª abertura; resolve apenas os NOMES dos itens já escolhidos e os
// candidatos (simulados/pastas/cronogramas) vêm de busca paginada no banco (ilike + count + .range) — sem listão.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2, Save, Search, Boxes, Image as ImageIcon, LayoutGrid, ChevronUp, ChevronDown, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SECAO_TAMANHOS, ITENS_PASTA, type SecaoTipo, type SecaoTamanho, type SecaoOrdenacao, type ItemRef, type ItemTipo } from '@/lib/produtos/tipos'
import { salvarVitrineAction } from '@/app/admin/produtos/actions'
import { carregarVitrineAction, buscarRecursosAction } from './lazy-actions'

export type RecursoVitrine = { id: string; nome: string; area?: string | null }
type KindBusca = 'simulado' | 'pasta' | 'cronograma'
export type SecaoVitrineIn = {
  id?: string; tipo: SecaoTipo; nome: string | null; tamanho: SecaoTamanho; ordenacao: SecaoOrdenacao
  config: { imagem?: string; imagem_mobile?: string; link?: string; itens?: ItemRef[] } | null
}

type Draft = {
  _key: string; tipo: SecaoTipo; nome: string; tamanho: SecaoTamanho; ordenacao: SecaoOrdenacao
  config: { imagem?: string; imagem_mobile?: string; link?: string; itens?: ItemRef[] }
}

const ORDENACOES: [string, string][] = [['manual', 'Manual'], ['alfabetica', 'Alfabética'], ['recentes', 'Recentes']]
const uid = () => Math.random().toString(36).slice(2, 10)
const isPasta = (t: string) => ITENS_PASTA.includes(t as ItemTipo)

function tem(s: Draft, tipoItem: ItemTipo, id: string) {
  const itens = s.config.itens ?? []
  return isPasta(tipoItem)
    ? itens.some((it) => isPasta(it.tipo_item) && it.item_id === id)
    : itens.some((it) => it.tipo_item === tipoItem && it.item_id === id)
}
/** Ids já escolhidos na seção para um tipo (lista pequena: só o que o usuário marcou). */
function idsDe(s: Draft, tipoItem: ItemTipo): string[] {
  return (s.config.itens ?? []).filter((it) => (isPasta(tipoItem) ? isPasta(it.tipo_item) : it.tipo_item === tipoItem)).map((it) => it.item_id)
}

export function AbaVitrine({ produtoId, secoesIniciais, podeEditar }: {
  produtoId: string; secoesIniciais: SecaoVitrineIn[]; podeEditar: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [secoes, setSecoes] = useState<Draft[]>(
    secoesIniciais.map((s) => ({ _key: s.id || uid(), tipo: s.tipo, nome: s.nome ?? '', tamanho: s.tamanho, ordenacao: s.ordenacao, config: s.config ?? {} })),
  )
  const [sujo, setSujo] = useState(false)
  // Nomes dos itens (chave `kind:id`) — carregados 1x p/ os já escolhidos; a busca acrescenta os novos.
  const [nomes, setNomes] = useState<Record<string, RecursoVitrine>>({})
  useEffect(() => {
    carregarVitrineAction(produtoId).then((r) => { if ('ok' in r) setNomes((cur) => ({ ...r.nomes, ...cur })) }).catch(() => {})
  }, [produtoId])
  const addNomes = (kind: KindBusca, rs: RecursoVitrine[]) => setNomes((cur) => { const n = { ...cur }; for (const r of rs) n[kind + ':' + r.id] = r; return n })
  const mut = (fn: (s: Draft[]) => Draft[]) => { setSecoes(fn); setSujo(true) }

  const patch = (i: number, p: Partial<Draft>) => mut((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const patchCfg = (i: number, p: Partial<Draft['config']>) => mut((s) => s.map((x, j) => (j === i ? { ...x, config: { ...x.config, ...p } } : x)))
  const mover = (i: number, dir: -1 | 1) => mut((s) => {
    const j = i + dir
    if (j < 0 || j >= s.length) return s
    const c = [...s]; const [it] = c.splice(i, 1); c.splice(j, 0, it); return c
  })
  const remover = (i: number) => mut((s) => s.filter((_, j) => j !== i))
  const addBanner = () => mut((s) => [...s, { _key: uid(), tipo: 'banner', nome: '', tamanho: 'horizontal_large', ordenacao: 'manual', config: {} }])
  const addCarrossel = () => mut((s) => [...s, { _key: uid(), tipo: 'carrossel', nome: 'Nova seção', tamanho: 'vertical_small', ordenacao: 'manual', config: { itens: [] } }])

  function toggleItem(i: number, tipoItem: ItemTipo, id: string) {
    mut((s) => s.map((x, j) => {
      if (j !== i) return x
      const itens = x.config.itens ?? []
      const on = tem(x, tipoItem, id)
      const novos = on
        ? itens.filter((it) => !(it.item_id === id && (isPasta(tipoItem) ? isPasta(it.tipo_item) : it.tipo_item === tipoItem)))
        : [...itens, { tipo_item: tipoItem, item_id: id }]
      return { ...x, config: { ...x.config, itens: novos } }
    }))
  }

  function salvar() {
    start(async () => {
      const r = await salvarVitrineAction(produtoId, secoes.map((s) => ({
        tipo: s.tipo, nome: s.nome.trim() || undefined, tamanho: s.tamanho, ordenacao: s.ordenacao, config: s.config,
      })))
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Vitrine salva.'); setSujo(false); router.refresh()
    })
  }

  const totalItens = useMemo(() => {
    const set = new Set<string>()
    for (const s of secoes) if (s.tipo === 'carrossel') for (const it of s.config.itens ?? []) set.add(`${it.tipo_item}:${it.item_id}`)
    return set.size
  }, [secoes])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Vitrine do aluno</h2>
          <p className="text-xs text-muted-foreground">{secoes.length} seção(ões) · {totalItens} conteúdo(s) nos carrosséis</p>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={addBanner}><Plus className="h-4 w-4" />Banner</Button>
            <Button variant="outline" onClick={addCarrossel}><Plus className="h-4 w-4" />Carrossel</Button>
            <Button onClick={salvar} disabled={pending || !sujo}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar vitrine</Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        A vitrine monta a tela do aluno por seções. O <strong className="text-foreground">conteúdo liberado</strong> é derivado dos itens dos <strong className="text-foreground">carrosséis</strong> somados aos <strong className="text-foreground">grupos</strong> da aba Grupos de acesso.
      </div>

      {secoes.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          <Eye className="mx-auto mb-2 h-6 w-6 opacity-60" />
          Nenhuma seção ainda. Adicione um banner ou um carrossel.
        </div>
      ) : (
        <div className="space-y-3">
          {secoes.map((s, i) => (
            <div key={s._key} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${s.tipo === 'banner' ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400' : 'bg-primary/10 text-primary'}`}>
                    {s.tipo === 'banner' ? <ImageIcon className="h-3 w-3" /> : <LayoutGrid className="h-3 w-3" />}
                    {s.tipo === 'banner' ? 'Banner' : 'Carrossel'}
                  </span>
                  <span className="text-xs text-muted-foreground">#{i + 1}</span>
                </div>
                {podeEditar && (
                  <div className="flex items-center gap-1">
                    <IconBtn label="Mover para cima" disabled={i === 0} onClick={() => mover(i, -1)}><ChevronUp className="h-4 w-4" /></IconBtn>
                    <IconBtn label="Mover para baixo" disabled={i === secoes.length - 1} onClick={() => mover(i, 1)}><ChevronDown className="h-4 w-4" /></IconBtn>
                    <IconBtn label="Remover seção" destrutivo onClick={() => remover(i)}><Trash2 className="h-4 w-4" /></IconBtn>
                  </div>
                )}
              </div>

              {s.tipo === 'banner' ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <ImgField label="Imagem (URL)" value={s.config.imagem ?? ''} onChange={(v) => patchCfg(i, { imagem: v })} disabled={!podeEditar} />
                  <ImgField label="Imagem mobile (URL)" value={s.config.imagem_mobile ?? ''} onChange={(v) => patchCfg(i, { imagem_mobile: v })} disabled={!podeEditar} />
                  <Campo label="Link ao clicar (URL)"><Input value={s.config.link ?? ''} onChange={(e) => patchCfg(i, { link: e.target.value })} placeholder="https://…" disabled={!podeEditar} /></Campo>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Campo label="Nome da seção"><Input value={s.nome} onChange={(e) => patch(i, { nome: e.target.value })} placeholder="Ex.: Simulados da semana" disabled={!podeEditar} /></Campo>
                    <Campo label="Tamanho"><Select value={s.tamanho} onChange={(v) => patch(i, { tamanho: v as SecaoTamanho })} disabled={!podeEditar} opts={SECAO_TAMANHOS.map((t) => [t.v, t.label])} /></Campo>
                    <Campo label="Ordenação"><Select value={s.ordenacao} onChange={(v) => patch(i, { ordenacao: v as SecaoOrdenacao })} disabled={!podeEditar} opts={ORDENACOES} /></Campo>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-3">
                    <Seletor titulo="Simulados" tipoItem="simulado" kind="simulado" selIds={idsDe(s, 'simulado')} nomes={nomes} addNomes={addNomes} toggle={(t, id) => toggleItem(i, t, id)} podeEditar={podeEditar} />
                    <Seletor titulo="Pastas · Biblioteca · Desafios" tipoItem="banco" kind="pasta" selIds={idsDe(s, 'banco')} nomes={nomes} addNomes={addNomes} toggle={(t, id) => toggleItem(i, t, id)} podeEditar={podeEditar} comArea />
                    <Seletor titulo="Cronogramas" tipoItem="cronograma" kind="cronograma" selIds={idsDe(s, 'cronograma')} nomes={nomes} addNomes={addNomes} toggle={(t, id) => toggleItem(i, t, id)} podeEditar={podeEditar} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium">{label}</span>{children}</label>
}

function Select({ value, onChange, opts, disabled }: { value: string; onChange: (v: string) => void; opts: [string, string][]; disabled?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

function ImgField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {value ? <img src={value} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
        </div>
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" disabled={disabled} />
      </div>
    </label>
  )
}

function IconBtn({ children, onClick, disabled, destrutivo, label }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; destrutivo?: boolean; label: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors disabled:opacity-40 ${destrutivo ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-muted hover:text-foreground'}`}>
      {children}
    </button>
  )
}

function Seletor({ titulo, tipoItem, kind, selIds, nomes, addNomes, toggle, podeEditar, comArea }: {
  titulo: string; tipoItem: ItemTipo; kind: KindBusca; selIds: string[]
  nomes: Record<string, RecursoVitrine>; addNomes: (k: KindBusca, rs: RecursoVitrine[]) => void
  toggle: (t: ItemTipo, id: string) => void; podeEditar: boolean; comArea?: boolean
}) {
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState(false) // só busca depois que o usuário foca/digita
  const [rows, setRows] = useState<RecursoVitrine[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [buscando, setBuscando] = useState(false)
  const seq = useRef(0)
  const selSet = useMemo(() => new Set(selIds), [selIds])

  function buscar(pg: number, anexar: boolean) {
    const mine = ++seq.current
    setBuscando(true)
    buscarRecursosAction(kind, q, pg)
      .then((r) => {
        if (mine !== seq.current) return
        const novos = ('ok' in r ? r.rows : []) as RecursoVitrine[]
        addNomes(kind, novos)
        setRows((cur) => (anexar ? [...cur, ...novos] : novos)); setTotal('ok' in r ? r.total : 0); setPagina(pg)
      })
      .catch(() => { if (mine === seq.current) { setRows([]); setTotal(0) } })
      .finally(() => { if (mine === seq.current) setBuscando(false) })
  }
  useEffect(() => {
    if (!aberto) return
    const t = setTimeout(() => buscar(1, false), q ? 250 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, aberto])

  const linha = (id: string, nome: string, area?: string | null) => (
    <label key={id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50">
      <input type="checkbox" checked={selSet.has(id)} onChange={() => toggle(tipoItem, id)} disabled={!podeEditar} className="h-4 w-4 accent-[var(--primary)]" />
      <span className="min-w-0 flex-1 truncate">{nome}</span>
      {comArea && area && <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{area}</span>}
    </label>
  )

  return (
    <div className="rounded-xl border bg-background">
      <div className="flex items-center justify-between gap-2 border-b p-2.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold"><Boxes className="h-4 w-4 text-muted-foreground" />{titulo}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{selIds.length} selec.</span>
      </div>
      <div className="p-2.5">
        {selIds.length > 0 && (
          <div className="mb-2 max-h-28 space-y-0.5 overflow-y-auto border-b pb-2">
            {selIds.map((id) => { const r = nomes[kind + ':' + id]; return linha(id, r?.nome ?? 'Carregando…', r?.area) })}
          </div>
        )}
        {podeEditar && (
          <>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setAberto(true) }} onFocus={() => setAberto(true)} placeholder="Buscar para adicionar…" className="pl-8" />
            </div>
            {aberto && (
              <div className="max-h-56 space-y-0.5 overflow-y-auto">
                {buscando && rows.length === 0 ? <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando…</div>
                  : rows.length === 0 ? <div className="py-4 text-center text-xs text-muted-foreground">Nada aqui.</div>
                  : rows.map((r) => linha(r.id, r.nome, r.area))}
                {rows.length < total && (
                  <button type="button" onClick={() => buscar(pagina + 1, true)} disabled={buscando} className="w-full rounded-lg py-1.5 text-xs font-medium text-primary hover:bg-muted/50 disabled:opacity-50">
                    {buscando ? 'Carregando…' : `Carregar mais (${rows.length} de ${total})`}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
