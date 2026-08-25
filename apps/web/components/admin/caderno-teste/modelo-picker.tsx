'use client'

import { useEffect, useState } from 'react'
import { X, FileText, ClipboardList, BookOpenCheck, BarChart3, Check, Download, FilePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Previa } from '@/lib/caderno-teste/previa'
import { PreviaBlocos } from '@/lib/caderno-teste/previa-blocos'
import { MODALIDADES, metaDaModalidade, novoItem, presetDoModelo, type Modalidade } from '@/lib/caderno-teste/tipos'

const ICONE: Record<Modalidade, any> = { caderno_questoes: FileText, caderno_completo: BookOpenCheck, folha_respostas: ClipboardList, diagnostico: BarChart3 }
const SEM_QUESTOES: never[] = [] // referência estável (evita re-render em loop no PreviaBlocos)

/** Miniatura "montada" do modelo — uma prévia A4 real, escalada e não-interativa. */
function MiniPrevia({ modalidade, modeloId }: { modalidade: Modalidade; modeloId: string }) {
  const LARG = 240
  const zoom = LARG / 794
  const preset = presetDoModelo(modalidade, modeloId) // modelo pronto → render por blocos (v1)
  const it = novoItem(modalidade, modeloId) // p/ variantes doc-backed (docEdit) e diagnóstico
  return (
    <div style={{ width: LARG, height: 316, overflow: 'hidden', background: '#fff', borderRadius: 6 }} className="pointer-events-none border">
      <div style={{ width: 794, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
        {preset
          ? <PreviaBlocos presetId={preset} questoes={SEM_QUESTOES} titulo={metaDaModalidade(modalidade).nome} docOverride={it.docEdit} />
          : <Previa item={it} questoes={SEM_QUESTOES} />}
      </div>
    </div>
  )
}

export function ModeloPicker({ open, onClose, atual, onSelecionar, onEmBranco, travarModalidade = false }: {
  open: boolean
  onClose: () => void
  atual: { modalidade: Modalidade; modelo: string }
  onSelecionar: (modalidade: Modalidade, modelo: string) => void
  /** Cria um caderno totalmente EM BRANCO (do zero), independente da aba/modalidade. */
  onEmBranco: () => void
  /** Trava na modalidade do caderno (edição): esconde as abas e mostra só os modelos dela. */
  travarModalidade?: boolean
}) {
  const [tabState, setTab] = useState<Modalidade>(atual.modalidade)
  useEffect(() => { if (open) setTab(atual.modalidade) }, [open, atual.modalidade])
  // Travado (edição de um slot): a modalidade é fixa; livre (caderno novo): abas para escolher o tipo.
  const tab = travarModalidade ? atual.modalidade : tabState
  const mostrarEmBranco = !travarModalidade || atual.modalidade === 'diagnostico'
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null

  const meta = metaDaModalidade(tab)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Escolher modelo</h2>
            <p className="text-xs text-muted-foreground">{travarModalidade ? `Modelos de ${metaDaModalidade(atual.modalidade).nome} — você ajusta os detalhes depois.` : 'Selecione a modalidade (abas) e o modelo. Você ajusta os detalhes depois.'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {mostrarEmBranco && (
              <button type="button" onClick={onEmBranco} title="Criar um caderno totalmente em branco (do zero) — você adiciona os blocos depois"
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/5">
                <FilePlus className="h-4 w-4" /> <span className="hidden sm:inline">Modelo em branco</span><span className="sm:hidden">Em branco</span>
              </button>
            )}
            <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {/* Abas por modalidade — escondidas quando travado (edição de um slot: modalidade fixa). */}
        {!travarModalidade && (
          <div className="flex gap-1 border-b bg-muted/30 px-3 pt-2">
            {MODALIDADES.map((m) => {
              const Icon = ICONE[m.id]
              const ativo = tab === m.id
              return (
                <button key={m.id} type="button" onClick={() => setTab(m.id)}
                  className={cn('flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3.5 py-2 text-sm transition-colors', ativo ? 'border-border bg-background font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                  <Icon className="h-4 w-4" /> {m.nome}
                </button>
              )
            })}
          </div>
        )}

        <div className="scroll-claro flex-1 overflow-y-auto p-5">
          <p className="mb-3 text-[11px] text-muted-foreground">{meta.descricao}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {meta.modelos.map((mo) => {
              const sel = atual.modalidade === tab && atual.modelo === mo.id
              const dl = (fmt: string) => `/api/admin/caderno-teste/exportar?modalidade=${tab}&modelo=${mo.id}&formato=${fmt}`
              return (
                <div key={mo.id} className={cn('group flex flex-col overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-md', sel ? 'border-primary ring-2 ring-primary' : 'hover:border-primary/50')}>
                  <button type="button" onClick={() => onSelecionar(tab, mo.id)} className="block text-left">
                    <div className="relative flex justify-center bg-muted/40 p-2">
                      <MiniPrevia modalidade={tab} modeloId={mo.id} />
                      {sel && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"><Check className="h-4 w-4" /></span>}
                    </div>
                    <div className="border-t px-3 py-2">
                      <p className="text-sm font-semibold leading-tight">{mo.nome}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{mo.descricao}</p>
                    </div>
                  </button>
                  <div className="flex border-t text-[11px]">
                    <a href={dl('word')} onClick={(e) => e.stopPropagation()} className="flex flex-1 items-center justify-center gap-1 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Download className="h-3 w-3" /> Word</a>
                    <a href={dl('html')} onClick={(e) => e.stopPropagation()} className="flex flex-1 items-center justify-center gap-1 border-l py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Download className="h-3 w-3" /> HTML</a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
