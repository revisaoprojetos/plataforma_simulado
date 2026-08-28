'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Search, FolderPlus, Plus, Home, ChevronRight, X, Check, Loader2, Folder, LayoutTemplate, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { ModeloCard, PastaModeloCard, MODALIDADE_META } from '@/components/admin/modelos-caderno/modelo-card'
import { EditarPastaModeloDialog } from '@/components/admin/modelos-caderno/editar-pasta-modelo-dialog'
import { criarModeloEmBranco, moverModelo, excluirPastaModelo, type ModeloRow, type PastaModeloRow } from '@/app/admin/modelos-caderno/actions'

const MODALIDADES_FILTRO = ['folha_respostas', 'caderno_questoes', 'caderno_completo', 'diagnostico'] as const

export function ModelosGrid({ modelos, pastas, pastaAtual }: { modelos: ModeloRow[]; pastas: PastaModeloRow[]; pastaAtual: string | null }) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [filtroMod, setFiltroMod] = useState<string>('')
  const [pending, start] = useTransition()
  const [novaPasta, setNovaPasta] = useState(false)
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

  function irPara(id: string | null) { router.push(id ? `/admin/modelos-caderno?pasta=${id}` : '/admin/modelos-caderno') }
  function novoModelo() {
    start(async () => {
      const r = await criarModeloEmBranco(pastaAtual)
      if (r.ok && r.id) router.push(`/admin/modelos-caderno/${r.id}`)
      else toast.error(r.error ?? 'Erro ao criar')
    })
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
        <button type="button" onClick={novoModelo} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Novo modelo
        </button>
      </div>

      {vazio ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/30 p-12 text-center">
          <LayoutTemplate className="h-9 w-9 text-muted-foreground/40" />
          <p className="text-sm font-medium">Nenhum modelo {current ? 'nesta pasta' : 'ainda'}</p>
          <p className="max-w-sm text-xs text-muted-foreground">Crie um modelo do zero, ou use um dos <strong>Modelos padrão</strong> e salve como editável. Organize tudo em pastas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {foldersNivel.map((p) => (
            <PastaModeloCard key={p.id} pasta={{ id: p.id, nome: p.nome, cor: p.cor, capa: p.capa_card_url ?? p.capa_url }} count={countPorPasta.get(p.id) ?? 0}
              onAbrir={() => irPara(p.id)} onPersonalizar={() => setEditarPasta(p)} onExcluir={() => excluirPasta(p)} />
          ))}
          {modelosNivel.map((m) => <ModeloCard key={m.id} modelo={m} onMover={() => setMover(m)} />)}
        </div>
      )}

      {(novaPasta || editarPasta) && (
        <EditarPastaModeloDialog
          criar={novaPasta}
          criarEmPai={novaPasta ? pastaAtual : null}
          pasta={editarPasta ? { id: editarPasta.id, nome: editarPasta.nome, cor: editarPasta.cor, capa: editarPasta.capa_card_url, capaLarga: editarPasta.capa_url } : null}
          onClose={() => { setNovaPasta(false); setEditarPasta(null) }}
          onSaved={() => router.refresh()}
        />
      )}
      {mover && <MoverModeloDialog modelo={mover} pastas={pastas} atualId={mover.pasta_id} onClose={() => setMover(null)} />}
    </div>
  )
}

function MoverModeloDialog({ modelo, pastas, atualId, onClose }: { modelo: ModeloRow; pastas: PastaModeloRow[]; atualId: string | null; onClose: () => void }) {
  const router = useRouter()
  const [sel, setSel] = useState<string | null>(atualId)
  const [pending, start] = useTransition()
  function salvar() {
    start(async () => {
      const r = await moverModelo(modelo.id, sel)
      if (r.ok) { toast.success(sel ? 'Movido para a pasta' : 'Movido para a raiz'); router.refresh(); onClose() } else toast.error(r.error ?? 'Erro ao mover')
    })
  }
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Folder className="h-4 w-4" /> Mover “{modelo.nome}”</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-auto p-4">
          <Opcao ativo={sel === null} onClick={() => setSel(null)} label="Raiz (sem pasta)" />
          {pastas.length === 0 && <p className="px-1 py-2 text-center text-xs text-muted-foreground">Nenhuma pasta criada ainda.</p>}
          {pastas.map((p) => <Opcao key={p.id} ativo={sel === p.id} onClick={() => setSel(p.id)} label={p.nome} />)}
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

function Opcao({ ativo, onClick, label }: { ativo: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors', ativo ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{ativo && <Check className="h-3 w-3" />}</span>
      <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
    </button>
  )
}
