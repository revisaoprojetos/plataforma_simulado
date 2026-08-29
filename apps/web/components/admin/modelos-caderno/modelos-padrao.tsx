'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { LayoutTemplate, X, Pencil, Loader2 } from 'lucide-react'
import { docDoPreset, idsDeterministicos } from '@/lib/caderno-teste/previa-blocos'
import { MODALIDADES, MODELOS_PADRAO_OCULTOS, novoItem, presetDoModelo, type Modalidade } from '@/lib/caderno-teste/tipos'
import { criarModeloComConfig } from '@/app/admin/modelos-caderno/actions'
import { MODALIDADE_META, ModeloMiniPrevia, VisualizadorModelo } from './modelo-card'

/** Seção somente-leitura com os MODELOS PADRÃO (hardcoded em MODALIDADES). Clique → prévia; editar = cópia → editor. */
export function ModelosPadrao({ pastaAtual }: { pastaAtual: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  // Editar um modelo padrão = criar a CÓPIA editável na hora e abrir DIRETO no editor (sem pop-up).
  function editar(modalidade: Modalidade, modeloId: string, nomeSel: string) {
    start(async () => {
      const it = novoItem(modalidade, modeloId)
      const preset = presetDoModelo(modalidade, modeloId)
      if (preset && !it.docEdit) it.docEdit = idsDeterministicos(docDoPreset(preset)!)
      else if (it.docEdit) it.docEdit = idsDeterministicos(it.docEdit)
      const config = { v: 1, item: it, origem: 'padrao_copia', padraoRef: { modalidade, modeloId } }
      const r = await criarModeloComConfig(nomeSel, config, modalidade, 'padrao_copia', pastaAtual)
      if (r.ok && r.id) { toast.success('Cópia criada'); router.push(`/admin/modelos-caderno/${r.id}`) }
      else toast.error(r.error ?? 'Erro ao criar cópia')
    })
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Modelos prontos do sistema (não editáveis). Clique num modelo para <strong>pré-visualizar</strong>; editar cria uma <strong>cópia editável</strong> e abre no editor.</p>
      {MODALIDADES.map((mod) => {
        const modelos = mod.modelos.filter((m) => !MODELOS_PADRAO_OCULTOS.has(m.id))
        if (!modelos.length) return null
        const Icone = MODALIDADE_META[mod.id]?.icon ?? LayoutTemplate
        return (
          <section key={mod.id}>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icone className="h-4 w-4" /></span>
              <h3 className="text-sm font-semibold">{mod.nome}</h3>
              <span className="hidden text-xs text-muted-foreground sm:inline">· {mod.descricao}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {modelos.map((m) => <PadraoCard key={m.id} modalidade={mod.id} modeloId={m.id} nome={m.nome} descricao={m.descricao} editando={pending} onEditar={() => editar(mod.id, m.id, m.nome)} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Prévia (viewer Drive) de um modelo padrão + botão "Editar" (salvar cópia). */
function PreviaPadraoDialog({ item, nome, modalidade, editando, onFechar, onEditar }: { item: any; nome: string; modalidade: Modalidade; editando?: boolean; onFechar: () => void; onEditar: () => void }) {
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onFechar])
  if (!montado) return null
  const meta = MODALIDADE_META[modalidade] ?? { label: 'Modelo', icon: LayoutTemplate }
  const Icone = meta.icon
  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-neutral-900/70 backdrop-blur-sm">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 bg-neutral-950/90 px-3 text-neutral-100">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={onFechar} className="rounded-full p-2 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white" aria-label="Fechar"><X className="h-5 w-5" /></button>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/25 text-primary-foreground"><Icone className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{nome}</p>
            <p className="truncate text-[11px] leading-tight text-neutral-400">{meta.label} · Modelo padrão</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onEditar} disabled={editando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
            {editando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />} Editar (salvar cópia)
          </button>
        </div>
      </div>
      <VisualizadorModelo item={item} onFechar={onFechar} />
    </div>,
    document.body,
  )
}

function PadraoCard({ modalidade, modeloId, nome, descricao, editando, onEditar }: { modalidade: Modalidade; modeloId: string; nome: string; descricao: string; editando?: boolean; onEditar: () => void }) {
  // Mesmo item/prévia do card de "Meus modelos" (ModeloMiniPrevia): preset + docEdit determinístico.
  const item = novoItem(modalidade, modeloId)
  const preset = presetDoModelo(modalidade, modeloId)
  if (preset && !item.docEdit) item.docEdit = idsDeterministicos(docDoPreset(preset)!)
  const meta = MODALIDADE_META[modalidade] ?? { label: 'Modelo', icon: LayoutTemplate }
  const Icone = meta.icon
  // 1 clique = prévia; clique duplo rápido = editar (salvar cópia). Igual aos "Meus modelos".
  const [previewAberto, setPreviewAberto] = useState(false)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (clickTimer.current) clearTimeout(clickTimer.current) }, [])
  return (
    <>
      <button
        type="button" title={descricao}
        onClick={() => { if (clickTimer.current) return; clickTimer.current = setTimeout(() => { clickTimer.current = null; setPreviewAberto(true) }, 220) }}
        onDoubleClick={() => { if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null } onEditar() }}
        className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-md hover:ring-1 hover:ring-primary/20">
        {/* Prévia da 1ª folha (igual ao card de Meus modelos) */}
        <div className="relative aspect-[3/4] overflow-hidden border-b bg-muted/40">
          <ModeloMiniPrevia item={item} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/[0.04] to-transparent transition-opacity group-hover:from-black/[0.08]" />
          <span className="absolute right-2 top-2 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground opacity-0 shadow transition-opacity group-hover:opacity-100">Salvar como</span>
        </div>
        {/* Info */}
        <div className="flex flex-1 flex-col gap-1.5 p-3">
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"><Icone className="h-3 w-3" /> {meta.label}</span>
          <h3 className="line-clamp-2 text-sm font-bold leading-tight">{nome}</h3>
          <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{descricao}</p>
        </div>
      </button>

      {previewAberto && (
        <PreviaPadraoDialog
          item={item} nome={nome} modalidade={modalidade} editando={editando}
          onFechar={() => setPreviewAberto(false)}
          onEditar={onEditar}
        />
      )}
    </>
  )
}
