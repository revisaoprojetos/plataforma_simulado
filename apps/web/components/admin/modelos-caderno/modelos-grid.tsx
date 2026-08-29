'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Search, FolderPlus, Plus, Home, ChevronRight, ChevronDown, X, Check, Loader2, Folder, LayoutTemplate, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { ModeloCard, PastaModeloCard, MODALIDADE_META } from '@/components/admin/modelos-caderno/modelo-card'
import { EditarPastaModeloDialog } from '@/components/admin/modelos-caderno/editar-pasta-modelo-dialog'
import { NovoModeloDialog } from '@/components/admin/modelos-caderno/novo-modelo-dialog'
import { ModelosPadrao } from '@/components/admin/modelos-caderno/modelos-padrao'
import { moverModelo, excluirPastaModelo, type ModeloRow, type PastaModeloRow } from '@/app/admin/modelos-caderno/actions'

const MODALIDADES_FILTRO = ['folha_respostas', 'caderno_questoes', 'caderno_completo', 'diagnostico'] as const

export function ModelosGrid({ modelos, pastas, pastaAtual: pastaAtualInicial }: { modelos: ModeloRow[]; pastas: PastaModeloRow[]; pastaAtual: string | null }) {
  const router = useRouter()
  // Pasta atual = estado no CLIENTE (dados já vêm todos e filtramos aqui) → abrir pasta é instantâneo,
  // sem re-executar o server component. A URL é sincronizada via History API (compartilhável/refresh).
  const [pastaAtual, setPastaAtual] = useState<string | null>(pastaAtualInicial)
  useEffect(() => {
    const onPop = () => setPastaAtual(new URLSearchParams(window.location.search).get('pasta'))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const [busca, setBusca] = useState('')
  const [filtroMod, setFiltroMod] = useState<string>('')
  const [, start] = useTransition()
  const [aba, setAba] = useState<'meus' | 'padrao'>('meus')
  // Sublinhado deslizante das tabs: mede a tab ativa e desliza a linha até ela (transição CSS).
  const tabsRef = useRef<Record<string, HTMLButtonElement | null>>({})
  const [underline, setUnderline] = useState<{ left: number; width: number }>({ left: 0, width: 0 })
  useEffect(() => {
    const medir = () => { const el = tabsRef.current[aba]; if (el) setUnderline({ left: el.offsetLeft, width: el.offsetWidth }) }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [aba])
  const [novaPasta, setNovaPasta] = useState(false)
  const [novoModelo, setNovoModelo] = useState(false)
  const [editarPasta, setEditarPasta] = useState<PastaModeloRow | null>(null)
  const [mover, setMover] = useState<ModeloRow | null>(null)

  const pastaById = useMemo(() => new Map(pastas.map((p) => [p.id, p])), [pastas])
  const current = pastaAtual ? pastaById.get(pastaAtual) ?? null : null

  const trilha = useMemo(() => {
    const t: { id: string; nome: string }[] = []
    let node = current
    const visto = new Set<string>()
    while (node && !visto.has(node.id)) { visto.add(node.id); t.unshift({ id: node.id, nome: node.nome }); node = node.pai_id ? pastaById.get(node.pai_id) ?? null : null }
    return t
  }, [current, pastaById])

  const q = busca.trim().toLowerCase()
  const foldersNivel = pastas
    .filter((p) => (current ? p.pai_id === current.id : !p.pai_id))
    .filter((p) => !q || p.nome.toLowerCase().includes(q))
  const modelosNivel = modelos
    .filter((m) => (current ? m.pasta_id === current.id : !m.pasta_id))
    .filter((m) => !filtroMod || m.modalidade === filtroMod)
    .filter((m) => !q || m.nome.toLowerCase().includes(q))
  const countPorPasta = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of modelos) if (m.pasta_id) map.set(m.pasta_id, (map.get(m.pasta_id) ?? 0) + 1)
    return map
  }, [modelos])

  function irPara(id: string | null) {
    setPastaAtual(id)
    if (typeof window !== 'undefined') window.history.pushState(null, '', id ? `/admin/modelos-caderno?pasta=${id}` : '/admin/modelos-caderno')
  }
  async function excluirPasta(p: PastaModeloRow) {
    if (!(await confirmar({ titulo: 'Excluir pasta?', mensagem: `"${p.nome}" será excluída. Os modelos e subpastas dentro dela voltam para a raiz.`, confirmar: 'Excluir', destrutivo: true }))) return
    start(async () => {
      const r = await excluirPastaModelo(p.id)
      if (r.ok) { toast.success('Pasta excluída'); router.refresh() } else toast.error(r.error ?? 'Erro')
    })
  }

  const vazio = foldersNivel.length === 0 && modelosNivel.length === 0

  return (
    <div className="space-y-4">
      {/* Abas: minha biblioteca × modelos padrão do sistema — sublinhado deslizante animado. */}
      <div className="relative inline-flex items-center gap-1 border-b text-sm">
        {([['meus', 'Meus modelos'], ['padrao', 'Modelos padrão']] as const).map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            ref={(el) => { tabsRef.current[k] = el }}
            onClick={() => setAba(k)}
            className={cn('px-3 py-2 font-medium transition-colors', aba === k ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            {lbl}
          </button>
        ))}
        <span className="pointer-events-none absolute -bottom-px h-0.5 rounded-full bg-primary transition-all duration-300 ease-out" style={{ left: underline.left, width: underline.width }} />
      </div>

      {aba === 'padrao' ? (
        <ModelosPadrao pastaAtual={pastaAtual} />
      ) : (
        <>
      {/* Barra: trilha + busca + filtros + ações */}
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm">
          <button type="button" onClick={() => irPara(null)} className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-muted', !current && 'font-semibold text-foreground')}>
            <Home className="h-3.5 w-3.5" /> Modelos
          </button>
          {trilha.map((t) => (
            <span key={t.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <button type="button" onClick={() => irPara(t.id)} className={cn('truncate rounded-md px-2 py-1 transition-colors hover:bg-muted', t.id === current?.id && 'font-semibold text-foreground')}>{t.nome}</button>
            </span>
          ))}
        </nav>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="h-9 w-44 rounded-lg border bg-background/50 pl-8 pr-3 text-sm outline-none transition-colors focus:border-primary/60 focus:ring-1 focus:ring-primary/30" />
        </div>
        <div className="relative">
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select value={filtroMod} onChange={(e) => setFiltroMod(e.target.value)} className="h-9 appearance-none rounded-lg border bg-background/50 pl-8 pr-3 text-sm outline-none focus:border-primary/60">
            <option value="">Todas modalidades</option>
            {MODALIDADES_FILTRO.map((m) => <option key={m} value={m}>{MODALIDADE_META[m].label}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => setNovaPasta(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted">
          <FolderPlus className="h-4 w-4" /> Nova pasta
        </button>
        <button type="button" onClick={() => setNovoModelo(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo modelo
        </button>
      </div>

      {vazio ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/30 p-12 text-center">
          <LayoutTemplate className="h-9 w-9 text-muted-foreground/40" />
          <p className="text-sm font-medium">Nenhum modelo {current ? 'nesta pasta' : 'ainda'}</p>
          <p className="max-w-sm text-xs text-muted-foreground">Crie um modelo do zero, ou use um dos <strong>Modelos padrão</strong> e salve como editável. Organize tudo em pastas.</p>
          <button type="button" onClick={() => setNovoModelo(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
            <Plus className="h-4 w-4" /> Novo modelo
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Mesma grade nas duas seções → pasta e card com a MESMA largura. Só separadas por espaço. */}
          {foldersNivel.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {foldersNivel.map((p) => (
                <PastaModeloCard key={p.id} pasta={{ id: p.id, nome: p.nome, cor: p.cor }} count={countPorPasta.get(p.id) ?? 0}
                  onAbrir={() => irPara(p.id)} onPersonalizar={() => setEditarPasta(p)} onExcluir={() => excluirPasta(p)} />
              ))}
            </div>
          )}
          {modelosNivel.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {modelosNivel.map((m) => <ModeloCard key={m.id} modelo={m} onMover={() => setMover(m)} />)}
            </div>
          )}
        </div>
      )}
        </>
      )}

      {(novaPasta || editarPasta) && (
        <EditarPastaModeloDialog
          criar={novaPasta}
          criarEmPai={novaPasta ? pastaAtual : null}
          pasta={editarPasta ? { id: editarPasta.id, nome: editarPasta.nome, cor: editarPasta.cor } : null}
          onClose={() => { setNovaPasta(false); setEditarPasta(null) }}
          onSaved={() => router.refresh()}
        />
      )}
      {mover && <MoverModeloDialog modelo={mover} pastas={pastas} atualId={mover.pasta_id} onClose={() => setMover(null)} />}
      {novoModelo && <NovoModeloDialog pastaAtual={pastaAtual} onClose={() => setNovoModelo(false)} />}
    </div>
  )
}

function MoverModeloDialog({ modelo, pastas, atualId, onClose }: { modelo: ModeloRow; pastas: PastaModeloRow[]; atualId: string | null; onClose: () => void }) {
  const router = useRouter()
  const [sel, setSel] = useState<string | null>(atualId)
  const [pending, start] = useTransition()
  const arvore = useMemo(() => construirArvorePastas(pastas), [pastas])
  // Pastas recolhidas (por id). Padrão: tudo expandido; o usuário minimiza o que quiser.
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setRecolhidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  function salvar() {
    start(async () => {
      const r = await moverModelo(modelo.id, sel)
      if (r.ok) { toast.success(sel ? 'Movido para a pasta' : 'Movido para a raiz'); router.refresh(); onClose() } else toast.error(r.error ?? 'Erro ao mover')
    })
  }
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex h-[600px] max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Folder className="h-4 w-4" /> Mover “{modelo.nome}”</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-auto p-4">
          <Opcao ativo={sel === null} onClick={() => setSel(null)} label="Raiz (sem pasta)" />
          {pastas.length === 0 && <p className="px-1 py-2 text-center text-xs text-muted-foreground">Nenhuma pasta criada ainda.</p>}
          {arvore.map((n) => <ArvoreNodo key={n.id} node={n} sel={sel} onSelect={setSel} recolhidos={recolhidos} onToggle={toggle} />)}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={pending || sel === atualId} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Mover
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Opcao({ ativo, onClick, label, expansor }: { ativo: boolean; onClick: () => void; label: string; expansor?: ReactNode }) {
  // Div clicável (não <button>) para permitir aninhar o botão do chevron sem HTML inválido.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className={cn('flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40', ativo ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}
    >
      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{ativo && <Check className="h-3 w-3" />}</span>
      <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      {expansor}
    </div>
  )
}

// ── Árvore de pastas (pai → subpastas) para o pop-up de mover ─────────────────
type NodoPasta = PastaModeloRow & { filhos: NodoPasta[] }

/** Monta a hierarquia (pai_id) a partir da lista plana, ordenando por nome em cada nível. */
function construirArvorePastas(pastas: PastaModeloRow[]): NodoPasta[] {
  const map = new Map<string, NodoPasta>()
  pastas.forEach((p) => map.set(p.id, { ...p, filhos: [] }))
  const raiz: NodoPasta[] = []
  map.forEach((n) => {
    const pai = n.pai_id ? map.get(n.pai_id) : null
    if (pai) pai.filhos.push(n)
    else raiz.push(n)
  })
  const ordenar = (arr: NodoPasta[]) => { arr.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); arr.forEach((x) => ordenar(x.filhos)) }
  ordenar(raiz)
  return raiz
}

/** Nó recursivo: a opção da pasta + as subpastas recuadas à direita, com linha de ligação à esquerda.
 *  A linha vertical é desenhada por item: PARA no cotovelo da última subpasta (não fica pendurada);
 *  nas demais, desce até a próxima irmã. */
function ArvoreNodo({ node, sel, onSelect, recolhidos, onToggle, filho = false, ultimo = false }: {
  node: NodoPasta; sel: string | null; onSelect: (id: string) => void
  recolhidos: Set<string>; onToggle: (id: string) => void; filho?: boolean; ultimo?: boolean
}) {
  const temFilhos = node.filhos.length > 0
  const aberto = !recolhidos.has(node.id)
  return (
    <div className={cn('relative', filho && 'pl-5')}>
      {filho && (
        <>
          {/* Linha vertical: para no cotovelo se for a última; senão continua até a próxima irmã. */}
          <span className={cn('pointer-events-none absolute left-0 top-0 w-px bg-border', ultimo ? 'h-[19px]' : '-bottom-1.5')} />
          {/* Cotovelo horizontal ligando a linha à opção. */}
          <span className="pointer-events-none absolute left-0 top-[19px] h-px w-5 bg-border" />
        </>
      )}
      <Opcao
        ativo={sel === node.id}
        onClick={() => onSelect(node.id)}
        label={node.nome}
        expansor={temFilhos ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(node.id) }}
            className="-my-1.5 -mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={aberto ? 'Recolher subpastas' : 'Expandir subpastas'}
          >
            {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : undefined}
      />
      {temFilhos && aberto && (
        <div className="ml-2.5 mt-1.5 space-y-1.5">
          {node.filhos.map((f, i) => <ArvoreNodo key={f.id} node={f} sel={sel} onSelect={onSelect} recolhidos={recolhidos} onToggle={onToggle} filho ultimo={i === node.filhos.length - 1} />)}
        </div>
      )}
    </div>
  )
}
