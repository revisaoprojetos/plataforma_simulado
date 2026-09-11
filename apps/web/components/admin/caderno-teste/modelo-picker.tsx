'use client'

import { useEffect, useState } from 'react'
import { X, FileText, ClipboardList, BookOpenCheck, BarChart3, Check, Download, FilePlus, Folder, Library } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Previa } from '@/lib/caderno-teste/previa'
import { PreviaBlocos } from '@/lib/caderno-teste/previa-blocos'
import { MODALIDADES, metaDaModalidade, modelosVisiveis, novoItem, presetDoModelo, type Modalidade } from '@/lib/caderno-teste/tipos'
import { MODELOS_CADERNO_ATIVO } from '@/lib/flags'
import { carregarModelosArea, type ModeloRow, type PastaModeloRow } from '@/app/admin/modelos-caderno/actions'

const ICONE: Record<Modalidade, any> = { caderno_questoes: FileText, caderno_completo: BookOpenCheck, folha_respostas: ClipboardList, diagnostico: BarChart3 }
const SEM_QUESTOES: never[] = [] // referência estável (evita re-render em loop no PreviaBlocos)

/** Miniatura "montada" do modelo — uma prévia A4 real, escalada e não-interativa. */
export function MiniPrevia({ modalidade, modeloId, larg = 240, alt = 316 }: { modalidade: Modalidade; modeloId: string; larg?: number; alt?: number }) {
  const zoom = larg / 794
  const preset = presetDoModelo(modalidade, modeloId) // modelo pronto → render por blocos (v1)
  const it = novoItem(modalidade, modeloId) // p/ variantes doc-backed (docEdit) e diagnóstico
  return (
    <div style={{ width: larg, height: alt, overflow: 'hidden', background: '#fff', borderRadius: 6 }} className="pointer-events-none border">
      <div style={{ width: 794, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
        {preset
          ? <PreviaBlocos presetId={preset} questoes={SEM_QUESTOES} titulo={metaDaModalidade(modalidade).nome} docOverride={it.docEdit} />
          : <Previa item={it} questoes={SEM_QUESTOES} />}
      </div>
    </div>
  )
}

export function ModeloPicker({ open, onClose, atual, onSelecionar, onEmBranco, onSelecionarBiblioteca, travarModalidade = false }: {
  open: boolean
  onClose: () => void
  atual: { modalidade: Modalidade; modelo: string }
  onSelecionar: (modalidade: Modalidade, modelo: string) => void
  /** Cria um caderno totalmente EM BRANCO (do zero), independente da aba/modalidade. */
  onEmBranco: () => void
  /** Aplica um modelo da BIBLIOTECA (área "Modelos de Caderno") — carrega a config salva. */
  onSelecionarBiblioteca?: (modeloId: string) => void
  /** Trava na modalidade do caderno (edição): esconde as abas e mostra só os modelos dela. */
  travarModalidade?: boolean
}) {
  const [tabState, setTab] = useState<Modalidade>(atual.modalidade)
  useEffect(() => { if (open) setTab(atual.modalidade) }, [open, atual.modalidade])

  // Biblioteca "Modelos de Caderno" (tabela própria + pastas) — carregada 1× ao abrir.
  const [bib, setBib] = useState<{ modelos: ModeloRow[]; pastas: PastaModeloRow[] } | null>(null)
  useEffect(() => {
    if (!open || !MODELOS_CADERNO_ATIVO || !onSelecionarBiblioteca || bib) return
    carregarModelosArea().then((r) => { if (r.ok) setBib({ modelos: r.modelos, pastas: r.pastas }) }).catch(() => {})
  }, [open, onSelecionarBiblioteca, bib])
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

  // Modelos da biblioteca ("Modelos de Caderno") desta modalidade (inclui os sem modalidade =
  // genéricos), agrupados pelas pastas que o admin criou.
  const bibModelos = (bib?.modelos ?? []).filter((m) => m.modalidade === tab || !m.modalidade)
  const pastaNome = new Map((bib?.pastas ?? []).map((p) => [p.id, p.nome]))
  const gruposBib = new Map<string, ModeloRow[]>()
  for (const m of bibModelos) { const k = m.pasta_id ?? '__sem'; const arr = gruposBib.get(k) ?? []; arr.push(m); gruposBib.set(k, arr) }
  const gruposOrdenados = [...gruposBib.entries()].sort((a, b) => (a[0] === '__sem' ? 1 : b[0] === '__sem' ? -1 : (pastaNome.get(a[0]) ?? '').localeCompare(pastaNome.get(b[0]) ?? '')))

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
            {modelosVisiveis(tab).map((mo) => {
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

          {/* Biblioteca "Modelos de Caderno" (com pastas) — os modelos que o admin criou/organizou. */}
          {MODELOS_CADERNO_ATIVO && onSelecionarBiblioteca && (
            <div className="mt-6 border-t pt-4">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Library className="h-4 w-4 text-primary" /> Meus modelos</p>
              <p className="mb-3 text-[11px] text-muted-foreground">Da biblioteca “Modelos de Caderno” (organizados por pasta).</p>
              {!bib ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Carregando…</p>
              ) : bibModelos.length === 0 ? (
                <p className="rounded-lg border border-dashed py-4 text-center text-xs text-muted-foreground">Nenhum modelo seu para “{meta.nome}” ainda. Crie na área <strong>Modelos de Caderno</strong>.</p>
              ) : (
                <div className="space-y-4">
                  {gruposOrdenados.map(([k, itens]) => (
                    <div key={k}>
                      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <Folder className="h-3.5 w-3.5" /> {k === '__sem' ? 'Sem pasta' : (pastaNome.get(k) ?? 'Pasta')}
                      </p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {itens.map((m) => (
                          <button key={m.id} type="button" onClick={() => onSelecionarBiblioteca(m.id)}
                            className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
                            <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-muted/40">
                              {m.capa_card_url
                                ? <img src={m.capa_card_url} alt="" className="h-full w-full object-cover object-top" />
                                : <BarChart3 className="h-10 w-10 text-muted-foreground/40" />}
                            </div>
                            <div className="border-t px-3 py-2">
                              <p className="truncate text-sm font-semibold leading-tight">{m.nome}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">{metaDaModalidade((m.modalidade as Modalidade) || tab).nome}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
