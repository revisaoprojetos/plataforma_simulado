'use client'

import { useEffect, useState } from 'react'
import { X, FileText, ClipboardList, BookOpenCheck, BarChart3, Check, Download, FilePlus, Library } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Previa } from '@/lib/caderno-teste/previa'
import { PreviaBlocos } from '@/lib/caderno-teste/previa-blocos'
import { MODALIDADES, metaDaModalidade, modelosVisiveis, novoItem, presetDoModelo, type Modalidade } from '@/lib/caderno-teste/tipos'
import { MODELOS_CADERNO_ATIVO } from '@/lib/flags'
import { carregarModelosArea, type ModeloRow, type PastaModeloRow } from '@/app/admin/modelos-caderno/actions'
import { ModeloMiniPrevia } from '@/components/admin/modelos-caderno/modelo-card'
import { Search, Folder as FolderIcon, ChevronRight, ArrowLeft } from 'lucide-react'

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

export function ModeloPicker({ open, onClose, atual, onSelecionar, onEmBranco, onSelecionarBiblioteca, biblioteca, travarModalidade = false }: {
  open: boolean
  onClose: () => void
  atual: { modalidade: Modalidade; modelo: string }
  onSelecionar: (modalidade: Modalidade, modelo: string) => void
  /** Cria um caderno totalmente EM BRANCO (do zero), independente da aba/modalidade. */
  onEmBranco: () => void
  /** Aplica um modelo da BIBLIOTECA (área "Modelos de Caderno") — carrega a config salva. */
  onSelecionarBiblioteca?: (modeloId: string) => void
  /** Biblioteca PRÉ-CARREGADA (pelo construtor, ao montar) — evita esperar o fetch ao abrir. */
  biblioteca?: { modelos: ModeloRow[]; pastas: PastaModeloRow[] } | null
  /** Trava na modalidade do caderno (edição): esconde as abas e mostra só os modelos dela. */
  travarModalidade?: boolean
}) {
  const [tabState, setTab] = useState<Modalidade>(atual.modalidade)
  const [vista, setVista] = useState<'padroes' | 'meus'>('padroes')
  const [pastaAtual, setPastaAtual] = useState<string | null>(null) // pasta aberta na biblioteca
  const [busca, setBusca] = useState('')
  useEffect(() => { if (open) { setTab(atual.modalidade); setVista(MODELOS_CADERNO_ATIVO && onSelecionarBiblioteca ? 'meus' : 'padroes'); setPastaAtual(null); setBusca('') } }, [open, atual.modalidade, onSelecionarBiblioteca])

  // Biblioteca "Modelos de Caderno": usa a versão PRÉ-CARREGADA pelo construtor (instantâneo); só
  // busca aqui como fallback (se o construtor não passou nada), 1× ao abrir.
  const [bib, setBib] = useState<{ modelos: ModeloRow[]; pastas: PastaModeloRow[] } | null>(biblioteca ?? null)
  useEffect(() => { if (biblioteca) setBib(biblioteca) }, [biblioteca])
  useEffect(() => {
    if (!open || !MODELOS_CADERNO_ATIVO || !onSelecionarBiblioteca || bib) return
    carregarModelosArea().then((r) => { if (r.ok) setBib({ modelos: r.modelos, pastas: r.pastas }) }).catch(() => {})
  }, [open, onSelecionarBiblioteca, bib])
  const temBiblioteca = MODELOS_CADERNO_ATIVO && !!onSelecionarBiblioteca
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

  // ── Biblioteca ("Modelos de Caderno"): navegação por pastas + busca ──────────────────────────
  const q = busca.trim().toLowerCase()
  const pastasArea = bib?.pastas ?? []
  const byId = new Map(pastasArea.map((p) => [p.id, p]))
  // Modelos desta modalidade (inclui os sem modalidade = genéricos).
  const bibModelos = (bib?.modelos ?? []).filter((m) => m.modalidade === tab || !m.modalidade)
  // Busca = lista plana (ignora pasta). Sem busca = nível atual (drill-down).
  const subpastas = q ? [] : pastasArea.filter((p) => (p.pai_id ?? null) === pastaAtual)
  const modelosNivel = q
    ? bibModelos.filter((m) => m.nome.toLowerCase().includes(q))
    : bibModelos.filter((m) => (m.pasta_id ?? null) === pastaAtual)
  const countPasta = (pid: string) => bibModelos.filter((m) => (m.pasta_id ?? null) === pid).length
  // Trilha (breadcrumb) da pasta aberta.
  const trilha: PastaModeloRow[] = []
  { let cur: string | null = pastaAtual; while (cur) { const p = byId.get(cur); if (!p) break; trilha.unshift(p); cur = p.pai_id ?? null } }
  const itemDoModelo = (m: ModeloRow) => (m.config as { item?: any } | null | undefined)?.item

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
                <button key={m.id} type="button" onClick={() => { setTab(m.id); setPastaAtual(null); setBusca('') }}
                  className={cn('flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3.5 py-2 text-sm transition-colors', ativo ? 'border-border bg-background font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                  <Icon className="h-4 w-4" /> {m.nome}
                </button>
              )
            })}
          </div>
        )}

        {/* Sub-abas: Modelos padrões (embutidos) × Meus modelos (biblioteca com pastas). */}
        {temBiblioteca && (
          <div className="flex items-center gap-1 border-b bg-background px-4 pt-2">
            {([['padroes', 'Modelos padrões', FileText], ['meus', 'Meus modelos', Library]] as const).map(([v, label, Ico]) => (
              <button key={v} type="button" onClick={() => setVista(v)}
                className={cn('flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3.5 py-2 text-sm transition-colors', vista === v ? 'border-border bg-background font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                <Ico className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        )}

        <div className="scroll-claro flex-1 overflow-y-auto p-5">
          {!temBiblioteca || vista === 'padroes' ? (
            <>
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
            </>
          ) : (
            <div className="space-y-3">
              {/* Busca (filtra todos os seus modelos desta modalidade). */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar modelo…" className="h-9 w-full rounded-lg border bg-background pl-8 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring" />
                {busca && <button type="button" onClick={() => setBusca('')} aria-label="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"><X className="h-4 w-4" /></button>}
              </div>

              {/* Caminho das pastas + voltar (só sem busca). */}
              {!q && (
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {pastaAtual && (
                    <button type="button" onClick={() => setPastaAtual(trilha.length >= 2 ? trilha[trilha.length - 2].id : null)} className="mr-1 inline-flex items-center gap-1 rounded-md border px-2 py-1 transition hover:bg-muted">
                      <ArrowLeft className="h-3.5 w-3.5" /> Voltar
                    </button>
                  )}
                  <button type="button" onClick={() => setPastaAtual(null)} className={cn('rounded px-1 hover:text-foreground', !pastaAtual && 'font-medium text-foreground')}>Início</button>
                  {trilha.map((p) => (
                    <span key={p.id} className="flex items-center gap-1">
                      <ChevronRight className="h-3 w-3" />
                      <button type="button" onClick={() => setPastaAtual(p.id)} className={cn('rounded px-1 hover:text-foreground', p.id === pastaAtual && 'font-medium text-foreground')}>{p.nome}</button>
                    </span>
                  ))}
                </div>
              )}

              {!bib ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Carregando…</p>
              ) : subpastas.length === 0 && modelosNivel.length === 0 ? (
                <p className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">{q ? `Nada encontrado para “${busca}”.` : 'Pasta vazia. Crie modelos na área Modelos de Caderno.'}</p>
              ) : (
                <div className="space-y-3">
                  {/* Pastas — cards CURTOS numa linha, separados dos modelos (igual à área Modelos de Caderno). */}
                  {subpastas.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {subpastas.map((p) => (
                        <button key={p.id} type="button" onClick={() => setPastaAtual(p.id)}
                          className="flex items-center gap-2.5 rounded-xl border bg-muted/40 px-3 py-2.5 text-left transition hover:border-primary/50 hover:bg-primary/10">
                          <FolderIcon className="h-5 w-5 shrink-0" style={{ color: p.cor ?? 'var(--primary)' }} fill={p.cor ?? 'var(--primary)'} fillOpacity={0.9} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={`${p.nome} · ${countPasta(p.id)} modelo(s)`}>{p.nome}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{countPasta(p.id)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Modelos — grade de cards com o preview da 1ª folha. */}
                  {modelosNivel.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {modelosNivel.map((m) => {
                        const it = itemDoModelo(m)
                        return (
                          <button key={m.id} type="button" onClick={() => onSelecionarBiblioteca?.(m.id)}
                            className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
                            <div className="relative aspect-[3/4] overflow-hidden border-b bg-muted/40">
                              {it?.modalidade
                                ? <ModeloMiniPrevia item={it} />
                                : m.capa_card_url
                                  ? <img src={m.capa_card_url} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
                                  : <BarChart3 className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/40" />}
                            </div>
                            <div className="px-3 py-2">
                              <p className="truncate text-sm font-semibold leading-tight">{m.nome}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">{metaDaModalidade((m.modalidade as Modalidade) || tab).nome}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
