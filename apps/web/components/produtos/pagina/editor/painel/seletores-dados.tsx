'use client'

// Seletores de DADOS do produto: módulos de uma seção, itens do carrossel e modelo de cronograma do catálogo.
// Leituras: módulos = DadosPagina.curriculo (já carregado no servidor); itens/cronogramas = ações lazy existentes (busca paginada no banco).
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { buscarRecursosAction, nomesRecursosAction } from '@/app/admin/conteudos/produtos/[id]/lazy-actions'
import type { BlocoAny, ItemCarrossel } from '@/lib/produtos/pagina/tipos'
import { useEditor } from '../store'
import { cx } from './util'

const Check = ({ checked, onChange, children, extra }: { checked: boolean; onChange: () => void; children: React.ReactNode; extra?: React.ReactNode }) => (
  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50">
    <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-[var(--primary)]" />
    <span className="min-w-0 flex-1 truncate">{children}</span>{extra}
  </label>
)

/** Módulos incluídos numa seção "Módulos do curso". Um módulo só pertence a UMA seção (marcar aqui o tira das outras). */
export function SeletorModulos({ bloco }: { bloco: Extract<BlocoAny, { tipo: 'modulos' }> }) {
  const ed = useEditor()
  const [q, setQ] = useState('')
  const todos = useMemo(() => ed.dadosAmostra.curriculo.map((m) => ({ id: m.id, titulo: m.titulo })), [ed.dadosAmostra.curriculo])
  const nome = useMemo(() => new Map(todos.map((m) => [m.id, m.titulo])), [todos])
  const sel = bloco.conteudo.modulo_ids.filter((id) => nome.has(id))
  const donoDe = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of ed.blocos) if (b.tipo === 'modulos' && b.id !== bloco.id) for (const id of b.conteudo.modulo_ids) m.set(id, b.nome || 'outra seção')
    return m
  }, [ed.blocos, bloco.id])
  const filtrados = todos.filter((m) => !q.trim() || m.titulo.toLowerCase().includes(q.trim().toLowerCase()))

  function alternar(id: string) {
    const on = bloco.conteudo.modulo_ids.includes(id)
    ed.atualizarConteudo(bloco.id, 'modulo_ids', on ? bloco.conteudo.modulo_ids.filter((x) => x !== id) : [...bloco.conteudo.modulo_ids, id])
    if (!on) for (const b of ed.blocos) if (b.tipo === 'modulos' && b.id !== bloco.id && b.conteudo.modulo_ids.includes(id)) ed.atualizarConteudo(b.id, 'modulo_ids', b.conteudo.modulo_ids.filter((x) => x !== id))
  }
  function mover(id: string, d: -1 | 1) {
    const l = [...sel]; const i = l.indexOf(id), j = i + d
    if (i < 0 || j < 0 || j >= l.length) return
    ;[l[i], l[j]] = [l[j], l[i]]
    ed.atualizarConteudo(bloco.id, 'modulo_ids', l)
  }
  return (
    <div className="rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
        <span className="font-semibold">{sel.length} de {todos.length} módulos</span>
        <span className="text-muted-foreground">{bloco.conteudo.restantes ? 'recebe os restantes' : ''}</span>
      </div>
      {sel.length > 0 && (
        <div className="max-h-36 space-y-0.5 overflow-y-auto border-b p-1.5">
          {sel.map((id, i) => (
            <div key={id} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm hover:bg-muted/50">
              <span className="min-w-0 flex-1 truncate">{nome.get(id)}</span>
              <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(id, -1)} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label="Descer" disabled={i === sel.length - 1} onClick={() => mover(id, 1)} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label="Remover" onClick={() => alternar(id)} className="rounded p-0.5 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="p-1.5">
        <div className="relative mb-1.5">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar módulo…" className="pl-8" />
        </div>
        <div className="max-h-52 overflow-y-auto">
          {todos.length === 0 ? <div className="py-4 text-center text-xs text-muted-foreground">Este produto ainda não tem módulos.</div>
            : filtrados.length === 0 ? <div className="py-4 text-center text-xs text-muted-foreground">Nenhum módulo encontrado.</div>
            : filtrados.map((m) => (
              <Check key={m.id} checked={sel.includes(m.id)} onChange={() => alternar(m.id)}
                extra={donoDe.has(m.id) && !sel.includes(m.id) ? <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">em {donoDe.get(m.id)}</span> : null}>{m.titulo}</Check>
            ))}
        </div>
      </div>
    </div>
  )
}

type Kind = 'simulado' | 'pasta' | 'cronograma'
const KINDS: { kind: Kind; rotulo: string; tipoItem: string }[] = [
  { kind: 'simulado', rotulo: 'Simulados', tipoItem: 'simulado' },
  { kind: 'pasta', rotulo: 'Pastas', tipoItem: 'banco' },
  { kind: 'cronograma', rotulo: 'Cronogramas', tipoItem: 'cronograma' },
]
const kindDe = (tipoItem: string): Kind => (tipoItem === 'simulado' ? 'simulado' : tipoItem === 'cronograma' ? 'cronograma' : 'pasta')
interface Rec { id: string; nome: string; area?: string | null }

/** Itens do carrossel (simulados, pastas/biblioteca/desafios e cronogramas) com busca no servidor. */
export function SeletorItens({ bloco }: { bloco: Extract<BlocoAny, { tipo: 'carrossel' }> }) {
  const ed = useEditor()
  const [kind, setKind] = useState<Kind>('simulado')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Rec[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [buscando, setBuscando] = useState(false)
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const seq = useRef(0)
  const itens = bloco.conteudo.itens
  const tem = (it: ItemCarrossel) => itens.some((x) => x.item_id === it.item_id && kindDe(x.tipo_item) === kindDe(it.tipo_item))
  const cfg = KINDS.find((k) => k.kind === kind)!

  function buscar(pg: number, anexar: boolean) {
    const mine = ++seq.current
    setBuscando(true)
    buscarRecursosAction(kind, q, pg).then((r) => {
      if (mine !== seq.current) return
      const novos = ('ok' in r ? r.rows : []) as Rec[]
      setNomes((c) => { const n = { ...c }; for (const x of novos) n[`${kind}:${x.id}`] = x.nome; return n })
      setRows((c) => (anexar ? [...c, ...novos] : novos)); setTotal('ok' in r ? r.total : 0); setPagina(pg)
    }).catch(() => { if (mine === seq.current) { setRows([]); setTotal(0) } }).finally(() => { if (mine === seq.current) setBuscando(false) })
  }
  useEffect(() => {
    const t = setTimeout(() => buscar(1, false), q ? 250 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, kind])

  // Resolve só os nomes dos itens já escolhidos (sem baixar listas).
  useEffect(() => {
    const falta: Record<Kind, string[]> = { simulado: [], pasta: [], cronograma: [] }
    for (const it of itens) if (!nomes[`${kindDe(it.tipo_item)}:${it.item_id}`]) falta[kindDe(it.tipo_item)].push(it.item_id)
    for (const k of Object.keys(falta) as Kind[]) {
      if (!falta[k].length) continue
      nomesRecursosAction(k, falta[k]).then((r) => {
        if (!('ok' in r)) return
        setNomes((c) => { const n = { ...c }; for (const x of Object.values((r as { nomes: Record<string, Rec> }).nomes)) n[`${k}:${x.id}`] = x.nome; return n })
      }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens])

  const alternar = (id: string) => {
    const novo = { tipo_item: cfg.tipoItem, item_id: id }
    ed.atualizarConteudo(bloco.id, 'itens', tem(novo) ? itens.filter((x) => !(x.item_id === id && kindDe(x.tipo_item) === kind)) : [...itens, novo])
  }
  function mover(i: number, d: -1 | 1) {
    const l = [...itens]; const j = i + d; if (j < 0 || j >= l.length) return
    ;[l[i], l[j]] = [l[j], l[i]]; ed.atualizarConteudo(bloco.id, 'itens', l)
  }
  return (
    <div className="rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs"><span className="font-semibold">{itens.length} itens no carrossel</span></div>
      {itens.length > 0 && (
        <div className="max-h-36 space-y-0.5 overflow-y-auto border-b p-1.5">
          {itens.map((it, i) => (
            <div key={`${it.tipo_item}:${it.item_id}`} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm hover:bg-muted/50">
              <span className="min-w-0 flex-1 truncate">{nomes[`${kindDe(it.tipo_item)}:${it.item_id}`] ?? 'Carregando…'}</span>
              <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label="Descer" disabled={i === itens.length - 1} onClick={() => mover(i, 1)} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label="Remover" onClick={() => ed.atualizarConteudo(bloco.id, 'itens', itens.filter((_, j) => j !== i))} className="rounded p-0.5 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="p-1.5">
        <div className="mb-1.5 flex gap-1" role="tablist">
          {KINDS.map((k) => (
            <button key={k.kind} type="button" role="tab" aria-selected={kind === k.kind} onClick={() => setKind(k.kind)}
              className={cx('flex-1 border-b-2 px-2 py-1.5 text-xs font-medium transition-colors', kind === k.kind ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{k.rotulo}</button>
          ))}
        </div>
        <div className="relative mb-1.5">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar ${cfg.rotulo.toLowerCase()}…`} className="pl-8" />
        </div>
        <div className="max-h-52 overflow-y-auto">
          {buscando && rows.length === 0 ? <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando…</div>
            : rows.length === 0 ? <div className="py-4 text-center text-xs text-muted-foreground">Nada aqui.</div>
            : rows.map((r) => (
              <Check key={r.id} checked={tem({ tipo_item: cfg.tipoItem, item_id: r.id })} onChange={() => alternar(r.id)}
                extra={kind === 'pasta' && r.area ? <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{r.area}</span> : null}>{r.nome}</Check>
            ))}
          {rows.length < total && (
            <button type="button" onClick={() => buscar(pagina + 1, true)} disabled={buscando} className="w-full rounded-lg py-1.5 text-xs font-medium text-primary hover:bg-muted/50 disabled:opacity-50">
              {buscando ? 'Carregando…' : `Carregar mais (${rows.length} de ${total})`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Modelo de cronograma do catálogo (opcional; só para tenants no fluxo padrão — vazio = cronograma do aluno). */
export function SeletorCronogramaCatalogo({ valor, onChange }: { valor: string | null; onChange: (id: string | null) => void }) {
  const [rows, setRows] = useState<Rec[] | null>(null)
  useEffect(() => {
    buscarRecursosAction('cronograma', '', 1).then((r) => setRows('ok' in r ? (r.rows as Rec[]) : [])).catch(() => setRows([]))
  }, [])
  if (rows === null) return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando modelos…</div>
  const atual = valor && !rows.some((r) => r.id === valor)
  return (
    <select value={valor ?? ''} onChange={(e) => onChange(e.target.value || null)}
      className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
      <option value="">Automático (cronograma do aluno)</option>
      {atual && <option value={valor!}>Modelo selecionado</option>}
      {rows.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
    </select>
  )
}
