'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, ChevronRight, Folder, FolderOpen, GraduationCap, Loader2, RotateCw, Search, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { confirmar } from '@/components/ui/confirm-dialog'
import { rotuloClasse, rotuloTipoMaterial } from '@/components/biblioteca/menus-drive'
import { CLASSES_DISC, TIPOS_MATERIAL, type ClasseDisc, type DocMetaPasta, type NoMetaPasta, type SalvarConfigPastaInput, type TipoMaterial } from '@/lib/admin/metas-pasta-tipos'
import { salvarConfigPasta } from '../metas-pasta-actions'
import { buscarJson } from '@/lib/admin/metas-pasta-fetch'
import { listarTiposConteudo } from '../tipos-conteudo-actions'
import { PAPEIS_TIPO, type TipoConteudo } from '@/lib/cronograma/tipos-conteudo-tipos'

/** Opção do seletor: catálogo (nome + descrição do papel); cai nos 6 de TIPOS_MATERIAL se o catálogo falhar. */
interface OpcaoTipo { v: string; r: string; meta: string }
const OPCOES_FALLBACK: OpcaoTipo[] = TIPOS_MATERIAL.map((t) => ({ v: t.v, r: t.r, meta: t.meta }))
function useOpcoesTipo(): OpcaoTipo[] {
  const [ops, setOps] = useState<OpcaoTipo[]>(OPCOES_FALLBACK)
  useEffect(() => {
    let vivo = true
    listarTiposConteudo().then((r) => {
      if (!vivo || !r.ok || !r.tipos?.length) return
      setOps(r.tipos.filter((t: TipoConteudo) => t.ativo).sort((a: TipoConteudo, b: TipoConteudo) => a.ordem - b.ordem)
        .map((t: TipoConteudo) => ({ v: t.slug, r: t.nome, meta: PAPEIS_TIPO.find((p) => p.v === t.papel)?.desc ?? '' })))
    }).catch(() => {})
    return () => { vivo = false }
  }, [])
  return ops
}

const PP = 12
type Ord = 'titulo' | 'status' | 'planos'

const ROTA_API = '/api/admin/revisao/cronograma/metas-pasta'

/** Aba "Por pasta": árvore de pastas da Biblioteca (esq.) + configuração de disciplina/tipo de material e documentos (dir.).
 *  LÊ por rotas GET (fetch com timeout); só a gravação usa server action. */
export default function MetasPasta({ podeEditar, pastaInicial, onVerNaMatriz }: { podeEditar: boolean; pastaInicial?: string | null; onVerNaMatriz?: (nomeDisciplina: string) => void }) {
  const [nos, setNos] = useState<NoMetaPasta[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(pastaInicial ?? null)
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [lista, setLista] = useState(false) // mobile: mostra a árvore
  const opcoes = useOpcoesTipo()
  const nomeTipo = useCallback((v?: string | null) => (v ? opcoes.find((o) => o.v === v)?.r ?? rotuloTipoMaterial(v) ?? v : null), [opcoes])

  const recarregar = useCallback(async (signal?: AbortSignal) => {
    const r = await buscarJson<{ nos: NoMetaPasta[] }>(`${ROTA_API}/pastas`, { signal })
    if (!r.ok) { if (!r.abortado) setErro(r.error); return }
    setErro(null); setNos(r.data.nos ?? [])
  }, [])
  useEffect(() => {
    const ctl = new AbortController()
    void recarregar(ctl.signal)
    return () => ctl.abort()
  }, [recarregar])

  const { filhos, porId } = useMemo(() => {
    const filhos = new Map<string | null, NoMetaPasta[]>(); const porId = new Map<string, NoMetaPasta>()
    for (const n of nos ?? []) { porId.set(n.id, n) }
    for (const n of nos ?? []) {
      const pai = n.paiId && porId.has(n.paiId) ? n.paiId : null
      const l = filhos.get(pai) ?? []; l.push(n); filhos.set(pai, l)
    }
    for (const l of filhos.values()) l.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
    return { filhos, porId }
  }, [nos])

  const ancestrais = useMemo(() => {
    const s = new Set<string>(); let cur = sel ? porId.get(sel)?.paiId ?? null : null; let g = 0
    while (cur && g++ < 40) { s.add(cur); cur = porId.get(cur)?.paiId ?? null }
    return s
  }, [sel, porId])
  const aberto = (id: string) => abertos.has(id) || ancestrais.has(id)
  const alternar = (id: string) => setAbertos((s) => { const n = new Set(s); if (aberto(id)) n.delete(id); else n.add(id); return n })

  const atual = sel ? porId.get(sel) ?? null : null

  function linha(n: NoMetaPasta, nivel: number): React.ReactNode {
    const sub = filhos.get(n.id) ?? []
    const ativo = sel === n.id
    const cls = rotuloClasse(n.classe)
    const tm = nomeTipo(n.tipoMaterial)
    return (
      <li key={n.id}>
        <div className={cn('flex items-center gap-1 rounded-lg pr-2 text-sm', ativo ? 'bg-primary/10 text-primary' : 'hover:bg-muted')} style={{ paddingLeft: 4 + nivel * 14 }}>
          <button type="button" aria-label={aberto(n.id) ? 'Recolher' : 'Expandir'} onClick={() => alternar(n.id)} className={cn('grid h-6 w-5 shrink-0 place-items-center text-muted-foreground', sub.length === 0 && 'invisible')}>
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', aberto(n.id) && 'rotate-90')} />
          </button>
          <button type="button" onClick={() => { setSel(n.id); setLista(false) }} aria-current={ativo} className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left font-medium">
            {n.disciplinaId ? <GraduationCap className="h-4 w-4 shrink-0" /> : aberto(n.id) ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />}
            <span className="truncate">{n.nome}</span>
            {n.disciplinaId && <span className="shrink-0 rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Disciplina{cls ? ` · ${cls}` : ''}</span>}
            {tm && <span className="shrink-0 rounded-full bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-400">{tm}</span>}
          </button>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{n.nDocsTotal.toLocaleString('pt-BR')}</span>
        </div>
        {aberto(n.id) && sub.length > 0 && <ul>{sub.map((s) => linha(s, nivel + 1))}</ul>}
      </li>
    )
  }

  if (erro && !nos) return <BlocoErro erro={erro} onTentar={() => { setErro(null); void recarregar() }} />
  if (!nos) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando pastas…</div>

  return (
    <div className="grid w-full gap-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
      <button type="button" onClick={() => setLista((v) => !v)} className="flex h-9 items-center justify-between rounded-lg border bg-card px-3 text-sm font-medium xl:hidden">
        <span className="truncate">{atual ? atual.nome : 'Escolher pasta'}</span><ChevronRight className={cn('h-4 w-4 transition-transform', lista && 'rotate-90')} />
      </button>
      <aside className={cn('flex-col rounded-2xl border bg-card p-2 shadow-sm xl:sticky xl:top-3 xl:flex xl:h-[calc(100vh-11rem)]', lista ? 'flex max-h-[60vh]' : 'hidden')} aria-label="Pastas da Biblioteca">
        <h2 className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pastas</h2>
        <div className="min-h-0 flex-1 overflow-auto pb-1 pr-1">
          {(filhos.get(null) ?? []).length === 0 ? <p className="p-3 text-sm text-muted-foreground">Nenhuma pasta de conteúdo.</p> : <ul>{(filhos.get(null) ?? []).map((n) => linha(n, 0))}</ul>}
        </div>
      </aside>
      <section className="min-w-0">
        {atual
          ? <PainelPasta key={atual.id} opcoes={opcoes} nomeTipo={nomeTipo} no={atual} pai={atual.paiId ? porId.get(atual.paiId) ?? null : null} podeEditar={podeEditar} temSub={(filhos.get(atual.id) ?? []).length > 0} onSalvo={() => recarregar()} onVerNaMatriz={onVerNaMatriz} />
          : <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Escolha uma pasta da Biblioteca para definir se ela é uma disciplina do cronograma e qual tipo de material ela representa.</div>}
      </section>
    </div>
  )
}

function PainelPasta({ opcoes, nomeTipo, no, pai, podeEditar, temSub, onSalvo, onVerNaMatriz }: { opcoes: OpcaoTipo[]; nomeTipo: (v?: string | null) => string | null; no: NoMetaPasta; pai: NoMetaPasta | null; podeEditar: boolean; temSub: boolean; onSalvo: () => Promise<void>; onVerNaMatriz?: (nomeDisciplina: string) => void }) {
  const [ehDisc, setEhDisc] = useState(!!no.disciplinaId)
  const [classe, setClasse] = useState<ClasseDisc>(no.classe ?? 'essencial')
  const [tipo, setTipo] = useState<TipoMaterial | null>(no.tipoMaterial)
  const [aplicar, setAplicar] = useState(false)
  const [pend, start] = useTransition()
  const [refDocs, setRefDocs] = useState(0)

  const alterado = ehDisc !== !!no.disciplinaId || (ehDisc && classe !== no.classe) || tipo !== no.tipoMaterial || aplicar

  function salvar() {
    start(async () => {
      const base: SalvarConfigPastaInput = {
        pastaId: no.id,
        disciplina: ehDisc ? { classe } : null,
        tipoMaterial: tipo,
        aplicarSubpastas: aplicar,
      }
      let r = await salvarConfigPasta(base)
      if (r.ok && r.precisaConfirmar) {
        const ok = await confirmar({
          titulo: 'Esta mudança afeta planos ativos',
          mensagem: `${(r.planosAtivos ?? no.planosAtivos).toLocaleString('pt-BR')} plano(s) de alunos ativos usam documentos desta pasta${aplicar ? ' e subpastas' : ''}. As metas serão recalculadas conforme o novo tipo. Deseja continuar?`,
          confirmar: 'Aplicar mudança', destrutivo: true,
        })
        if (!ok) return
        r = await salvarConfigPasta({ ...base, confirmarImpacto: true })
      }
      if (!r.ok) { toast.error(r.error || 'Não foi possível salvar.'); return }
      toast.success('Configuração da pasta salva.')
      setAplicar(false); setRefDocs((x) => x + 1)
      await onSalvo()
    })
  }

  const descTipo = opcoes.find((t) => t.v === (tipo ?? no.tipoEfetivo))?.meta

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{no.nome}</h2>
          {no.disciplinaId && <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary">Disciplina{rotuloClasse(no.classe) ? ` · ${rotuloClasse(no.classe)}` : ''}</span>}
          <span className="rounded-full bg-sky-500/12 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400">Tipo efetivo: {nomeTipo(no.tipoEfetivo) ?? no.tipoEfetivo}{no.tipoMaterial ? '' : ' (herdado)'}</span>
          {onVerNaMatriz && no.disciplinaEfetiva && (
            <button type="button" onClick={() => onVerNaMatriz(no.disciplinaEfetiva!.nome)} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-3 text-xs font-medium hover:bg-accent">
              <Table2 className="h-3.5 w-3.5" />Ver na matriz
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {pai ? `Dentro de “${pai.nome}”. ` : ''}{no.nDocsDiretos.toLocaleString('pt-BR')} documento(s) nesta pasta, {no.nDocsTotal.toLocaleString('pt-BR')} com subpastas
          {no.disciplinaEfetiva && !no.disciplinaId ? ` · disciplina herdada: ${no.disciplinaEfetiva.nome}` : ''} · {no.planosAtivos.toLocaleString('pt-BR')} plano(s) ativo(s) usam esta pasta.
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Disciplina do cronograma</h3>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={ehDisc} disabled={!podeEditar || pend} onCheckedChange={(c) => setEhDisc(!!c)} aria-label="Esta pasta é uma disciplina do cronograma" />
              Esta pasta é uma disciplina do cronograma
            </label>
            {ehDisc && (
              <div role="radiogroup" aria-label="Classe da disciplina" className="flex flex-wrap gap-2">
                {CLASSES_DISC.map((c) => (
                  <button key={c.v} type="button" role="radio" aria-checked={classe === c.v} disabled={!podeEditar || pend} onClick={() => setClasse(c.v)}
                    className={cn('h-8 rounded-lg border px-3 text-sm font-medium', classe === c.v ? 'border-primary bg-primary/10 text-primary' : 'bg-card hover:bg-accent')}>{c.r}</button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Tipo de material</h3>
            <div role="radiogroup" aria-label="Tipo de material" className="grid gap-1.5 sm:grid-cols-2">
              <button type="button" role="radio" aria-checked={tipo === null} disabled={!podeEditar || pend} onClick={() => setTipo(null)}
                className={cn('rounded-lg border px-3 py-1.5 text-left text-sm', tipo === null ? 'border-primary bg-primary/10 text-primary' : 'bg-card hover:bg-accent')}>
                <span className="font-medium">Herdar</span><span className="block text-[11px] text-muted-foreground">Usa o tipo da pasta acima</span>
              </button>
              {opcoes.map((t) => (
                <button key={t.v} type="button" role="radio" aria-checked={tipo === t.v} disabled={!podeEditar || pend} onClick={() => setTipo(t.v as TipoMaterial)}
                  className={cn('rounded-lg border px-3 py-1.5 text-left text-sm', tipo === t.v ? 'border-primary bg-primary/10 text-primary' : 'bg-card hover:bg-accent')}>
                  <span className="font-medium">{t.r}</span><span className="block text-[11px] text-muted-foreground">{t.meta}</span>
                </button>
              ))}
            </div>
            {descTipo && <p className="text-xs text-muted-foreground">Efeito: {descTipo}.</p>}
            {temSub && (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={aplicar} disabled={!podeEditar || pend} onCheckedChange={(c) => setAplicar(!!c)} aria-label="Aplicar às subpastas" />
                Aplicar às subpastas
              </label>
            )}
          </div>
        </div>

        {podeEditar && (
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={salvar} disabled={pend || !alterado} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {pend && <Loader2 className="h-4 w-4 animate-spin" />}Salvar configuração
            </button>
          </div>
        )}
      </div>

      <TabelaDocs pastaId={no.id} temSub={temSub} recarregar={refDocs} nomeTipo={nomeTipo} />
    </div>
  )
}

function TabelaDocs({ pastaId, temSub, recarregar, nomeTipo }: { pastaId: string; temSub: boolean; recarregar: number; nomeTipo: (v?: string | null) => string | null }) {
  const [q, setQ] = useState('')
  const [busca, setBusca] = useState('')
  const [sub, setSub] = useState(false)
  const [pag, setPag] = useState(1)
  const [ord, setOrd] = useState<Ord>('titulo')
  const [asc, setAsc] = useState(true)
  const [docs, setDocs] = useState<DocMetaPasta[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => { const t = setTimeout(() => { setBusca(q.trim()); setPag(1) }, 300); return () => clearTimeout(t) }, [q])
  // Fetch com AbortController + timeout de 20 s; o `finally` SEMPRE desliga o "Carregando…" (a menos que o efeito tenha sido substituído).
  useEffect(() => {
    const ctl = new AbortController()
    setCarregando(true)
    const qs = new URLSearchParams({ pasta: pastaId, page: String(pag) })
    if (busca) qs.set('q', busca)
    if (sub) qs.set('sub', '1')
    void (async () => {
      try {
        const r = await buscarJson<{ docs: DocMetaPasta[]; total: number }>(`${ROTA_API}/docs?${qs}`, { signal: ctl.signal, timeoutMs: 20_000 })
        if (ctl.signal.aborted) return
        if (!r.ok) { setErro(r.error); setDocs([]); setTotal(0) } else { setErro(null); setDocs(r.data.docs ?? []); setTotal(r.data.total ?? 0) }
      } catch {
        if (!ctl.signal.aborted) { setErro('Falha ao carregar os documentos.'); setDocs([]); setTotal(0) }
      } finally {
        if (!ctl.signal.aborted) setCarregando(false)
      }
    })()
    return () => ctl.abort()
  }, [pastaId, pag, busca, sub, recarregar, tentativa])

  // Ordenação aplicada sobre a página devolvida pelo servidor (a action pagina por título).
  const linhas = useMemo(() => {
    const f = asc ? 1 : -1
    return [...docs].sort((a, b) => (ord === 'planos' ? a.planosAtivos - b.planosAtivos : String(a[ord]).localeCompare(String(b[ord]), 'pt-BR')) * f)
  }, [docs, ord, asc])
  const paginas = Math.max(1, Math.ceil(total / PP))
  const cab = (k: Ord, r: string) => (
    <th className="px-3 py-2 text-left font-semibold">
      <button type="button" onClick={() => { if (ord === k) setAsc(!asc); else { setOrd(k); setAsc(true) } }} className="inline-flex items-center gap-1">
        {r}{ord === k && (asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  )

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <h3 className="mr-auto text-sm font-semibold">Documentos da pasta <span className="font-normal text-muted-foreground">({total.toLocaleString('pt-BR')})</span></h3>
        {temSub && (
          <label className="flex items-center gap-2 text-xs"><Switch checked={sub} onCheckedChange={(c) => { setSub(!!c); setPag(1) }} aria-label="Incluir subpastas" />Incluir subpastas</label>
        )}
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar documento…" aria-label="Buscar documento" className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{cab('titulo', 'Documento')}{cab('status', 'Status')}<th className="px-3 py-2 text-left font-semibold">Tipo efetivo</th>{cab('planos', 'Planos ativos')}</tr></thead>
          <tbody className={cn(carregando && 'opacity-50')}>
            {erro ? <tr><td colSpan={4} className="p-4 text-destructive">
                <span>{erro}</span>
                <button type="button" onClick={() => setTentativa((n) => n + 1)} className="ml-3 inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent"><RotateCw className="h-3.5 w-3.5" />Tentar de novo</button>
              </td></tr>
              : linhas.length === 0 ? <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">{carregando ? 'Carregando…' : 'Nenhum documento.'}</td></tr>
              : linhas.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{d.titulo}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.status}</td>
                  <td className="px-3 py-2"><span className="rounded-full bg-sky-500/12 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-400">{nomeTipo(d.tipoEfetivo) ?? d.tipoEfetivo}</span></td>
                  <td className="px-3 py-2 tabular-nums">{d.planosAtivos.toLocaleString('pt-BR')}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 border-t p-3 text-xs text-muted-foreground">
        <span>Página {pag} de {paginas}</span>
        <div className="flex gap-2">
          <button type="button" disabled={pag <= 1 || carregando} onClick={() => setPag(pag - 1)} className="h-8 rounded-lg border px-3 disabled:opacity-50">Anterior</button>
          <button type="button" disabled={pag >= paginas || carregando} onClick={() => setPag(pag + 1)} className="h-8 rounded-lg border px-3 disabled:opacity-50">Próxima</button>
        </div>
      </div>
    </div>
  )
}

export function BlocoErro({ erro, onTentar }: { erro: string; onTentar: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      <span>{erro}</span>
      <button type="button" onClick={onTentar} className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent"><RotateCw className="h-3.5 w-3.5" />Tentar de novo</button>
    </div>
  )
}
