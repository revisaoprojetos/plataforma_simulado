'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { capaComPos } from '@/lib/leitura/capa-pos'
import { EditarPastaDialog } from '@/components/admin/editar-pasta-dialog'
import { PersonalizarAulaDialog } from '@/components/admin/personalizar-aula-dialog'
import { ModuloAdesivoForm } from '@/components/admin/modulo-adesivo-form'
import { ModuloPontuacaoForm } from '@/components/admin/modulo-pontuacao-form'
import { ModuloIntroForm } from '@/components/admin/modulo-intro-form'
import { ModuloRegulamentoForm } from '@/components/admin/modulo-regulamento-form'
import { ModuloTrilhaForm } from '@/components/admin/modulo-trilha-form'
import { ModuloTrilhaFundoForm } from '@/components/admin/modulo-trilha-fundo-form'
import { ModuloAcesso } from '@/components/admin/modulo-acesso'
import {
  ChevronRight, ChevronUp, ChevronDown, Home, Library, FolderPlus, FilePlus2, Pencil, Trash2, FolderInput, Eye, EyeOff, BookOpenText, MoreVertical, FolderOpen, FileText, HelpCircle, Settings2, Users, X, Clock, CalendarClock,
} from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { type CardView } from '@/lib/card-view'
import {
  type BancoAulas, type ModuloLeitura, type DocEstado, criarDocumento, excluirModuloLeitura,
  moverAulaParaModulo, reordenarAulasLeitura, publicarDocumento, definirPublicacaoDocumento, definirPublicacaoDocumentos,
} from '@/app/admin/leitura/actions'
import { excluirDocumento } from '@/app/admin/leitura/actions'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { ModuloTabsBar, type ModuloTab } from '@/components/admin/modulo-tabs-bar'

type AulaItem = NonNullable<BancoAulas['aulas']>[number]
type PersonalizarAula = { id: string; titulo: string; descricao: string | null; capa_url: string | null; cor: string | null }
export type { ModuloTab }

/**
 * Banco de aulas do LegProc no modelo "banco → tabela de aulas":
 *  - Raiz: cards dos BANCOS (containers) + "Novo banco".
 *  - Dentro de um banco: TABELA de aulas (documento HTML + questões), reordenáveis; cada aula abre o editor.
 */
export function BancoAulasGrid({ data, pastaAtual, cardView = 'poster', moduloTab = 'aulas', semBreadcrumb = false, semTabs = false }: { data: BancoAulas; pastaAtual: string | null; cardView?: CardView; moduloTab?: ModuloTab; semBreadcrumb?: boolean; semTabs?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [criandoModulo, setCriandoModulo] = useState(false)
  const [personalizandoAula, setPersonalizandoAula] = useState<PersonalizarAula | null>(null)
  const bancos = data.pastas ?? []
  const aulas = data.aulas ?? []
  const modulos = data.modulos ?? []
  const breadcrumb = data.breadcrumb ?? []
  const moduloAtual = data.moduloAtual ?? null
  const dentroDeBanco = !!pastaAtual

  // Pré-carrega EM 2º PLANO as áreas de cada aula do módulo (Conteúdo + Questões) — navegar fica
  // instantâneo. Escalonado (não dispara tudo junto) p/ não sobrecarregar o dev/servidor. Cancela ao
  // sair do módulo e refaz ao voltar (o efeito re-roda quando muda o conjunto de aulas/módulo).
  const aulaIdsKey = aulas.map((a) => a.id).join(',')
  useEffect(() => {
    if (!dentroDeBanco || moduloTab !== 'aulas' || !aulaIdsKey) return
    const rotas = aulaIdsKey.split(',').flatMap((id) => [`/admin/leitura/${id}?tab=config`, `/admin/leitura/${id}/questoes`])
    let i = 0, cancel = false, timer: ReturnType<typeof setTimeout>
    const tick = () => {
      if (cancel || i >= rotas.length) return
      try { router.prefetch(rotas[i]) } catch { /* ignora */ }
      i++; timer = setTimeout(tick, 120)
    }
    timer = setTimeout(tick, 300) // deixa a UI pintar antes de aquecer as rotas
    return () => { cancel = true; clearTimeout(timer) }
  }, [dentroDeBanco, moduloTab, aulaIdsKey, router])

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) =>
    start(async () => { const r = await fn(); if (r.ok) { if (okMsg) toast.success(okMsg); router.refresh() } else toast.error(r.error ?? 'Erro') })

  // Seleção múltipla de aulas (excluir/publicar em massa).
  const [sel, setSel] = useState<Set<string>>(new Set())
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleTodas = () => setSel((s) => (s.size >= aulas.length && aulas.length > 0 ? new Set() : new Set(aulas.map((a) => a.id))))
  const limparSel = () => setSel(new Set())
  async function excluirSelecionadas() {
    const ids = [...sel]; if (!ids.length) return
    if (!(await confirmar({ titulo: 'Excluir aulas', mensagem: `Excluir ${ids.length} aula(s) selecionada(s)? Esta ação não pode ser desfeita.`, confirmar: 'Excluir', destrutivo: true }))) return
    start(async () => { let ok = 0; for (const id of ids) { const r = await excluirDocumento(id); if (r.ok) ok++; else { toast.error(r.error ?? 'Erro ao excluir'); break } } router.refresh(); limparSel(); if (ok) toast.success(`${ok} aula(s) excluída(s)`) })
  }
  function publicarSelecionadas(pub: boolean) {
    const ids = [...sel]; if (!ids.length) return
    start(async () => { let ok = 0; for (const id of ids) { const r = await publicarDocumento(id, pub); if (r.ok) ok++; else { toast.error(r.error ?? 'Erro'); break } } router.refresh(); limparSel(); if (ok) toast.success(pub ? `${ok} aula(s) publicada(s)` : `${ok} aula(s) em rascunho`) })
  }
  // Estado de publicação (rascunho/visualizavel/publicada) — 1 aula.
  const aplicarEstado = (id: string, estado: DocEstado) => run(() => definirPublicacaoDocumento(id, { estado }), estado === 'publicada' ? 'Aula publicada' : estado === 'visualizavel' ? 'Aula visualizável' : 'Aula em rascunho')
  // Estado em massa.
  function aplicarEstadoSel(estado: DocEstado) {
    const ids = [...sel]; if (!ids.length) return
    start(async () => { const r = await definirPublicacaoDocumentos(ids, { estado }); if (r.ok) { toast.success(`${r.ok_count ?? ids.length} aula(s) atualizada(s)`); router.refresh(); limparSel() } else toast.error(r.error ?? 'Erro') })
  }
  // Agendamento (individual ou em massa) via diálogo.
  const [agendarIds, setAgendarIds] = useState<string[] | null>(null)
  function confirmarAgendamento(patch: { estado: DocEstado; publicarEm: string | null }) {
    const ids = agendarIds ?? []; setAgendarIds(null); if (!ids.length) return
    start(async () => { const r = await definirPublicacaoDocumentos(ids, patch); if (r.ok) { toast.success(`Publicação agendada (${r.ok_count ?? ids.length} aula(s))`); router.refresh(); limparSel() } else toast.error(r.error ?? 'Erro') })
  }

  function novaAula() {
    start(async () => {
      const r = await criarDocumento('Nova aula', pastaAtual)
      // Não navega: abre o pop-up de personalização (nome/descrição/capa) da aula recém-criada.
      if (r.ok && r.id) { router.refresh(); setPersonalizandoAula({ id: r.id, titulo: 'Nova aula', descricao: null, capa_url: null, cor: null }) }
      else toast.error(r.error ?? 'Erro ao criar aula')
    })
  }
  function personalizarAula(a: AulaItem) {
    setPersonalizandoAula({ id: a.id, titulo: a.titulo, descricao: a.descricao ?? null, capa_url: a.capa_url ?? null, cor: a.cor ?? null })
  }
  async function excluirBanco(b: ModuloLeitura) {
    if (!(await confirmar({ titulo: 'Excluir módulo', mensagem: `Excluir "${b.nome}"? Só é possível se estiver vazio (mova as aulas antes).`, confirmar: 'Excluir', destrutivo: true }))) return
    run(() => excluirModuloLeitura(b.id))
  }
  async function excluirAula(id: string, titulo: string) {
    if (!(await confirmar({ titulo: 'Excluir aula', mensagem: `Excluir a aula "${titulo}"?`, confirmar: 'Excluir', destrutivo: true }))) return
    run(() => excluirDocumento(id))
  }
  function moverAulaOrdem(idx: number, delta: number) {
    const ids = aulas.map((a) => a.id); const j = idx + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    run(() => reordenarAulasLeitura(ids))
  }

  return (
    <div className="space-y-3">
      {/* Breadcrumb — omitido quando a página já o renderiza dentro do banner do topo (semBreadcrumb). */}
      {!semBreadcrumb && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <Link href="/admin/leitura" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground"><Home className="h-3.5 w-3.5" /> Módulos</Link>
            {breadcrumb.map((b) => (
              <span key={b.id} className="inline-flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5" />
                <Link href={`/admin/leitura?pasta=${b.id}`} className="rounded-md px-1.5 py-0.5 font-medium text-foreground hover:bg-muted">{b.nome}</Link>
              </span>
            ))}
          </div>
        </div>
      )}

      {!dentroDeBanco ? (
        // ===================== RAIZ: bancos (containers) =====================
        <>
          <div>
            <button onClick={() => setCriandoModulo(true)} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"><FolderPlus className="h-4 w-4" /> Novo módulo</button>
          </div>
          {bancos.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhum módulo ainda. Crie um <span className="font-medium text-foreground">módulo</span> para guardar as aulas.</div>
          ) : (
            <div className={cardView === 'ticket' ? 'grid gap-3 md:grid-cols-2 xl:grid-cols-3' : 'grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}>
              {bancos.map((b) => (
                <ModuloCard key={b.id} m={b} variant={cardView} onExcluir={() => excluirBanco(b)} />
              ))}
            </div>
          )}
          {/* Aulas soltas (sem banco) — legadas: uma tabela para mover pra um banco. */}
          {aulas.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aulas sem módulo</p>
              <TabelaAulas aulas={aulas} modulos={modulos} pending={pending} onOrdem={moverAulaOrdem} onExcluir={excluirAula} onPersonalizar={personalizarAula} run={run} />
            </div>
          )}
        </>
      ) : (
        // ============ DENTRO DE UM MÓDULO: abas Aulas | Acessos | Configurações ============
        <>
          {/* Abas do módulo — omitidas quando a página as renderiza DENTRO do banner (semTabs). */}
          {!semTabs && pastaAtual && <ModuloTabsBar pastaAtual={pastaAtual} moduloTab={moduloTab} />}

          {/* As 3 abas ficam MONTADAS (só escondemos as inativas): Acessos/Configurações pré-carregam ao
              entrar no módulo e ficam em memória enquanto navega; desmontam (limpam) ao sair do módulo. */}
          <div className={cn('space-y-2', semTabs && '-mt-2', moduloTab !== 'aulas' && 'hidden')}>
            {/* Toolbar sticky (só quando há banner): cola exatamente no RODAPÉ do banner via --lp-banner-bottom
                (o banner publica a própria altura ao rolar) → não entra no banner em nenhum ponto do scroll e
                mantém o mesmo espaçamento no topo e recolhido. Fosca e edge-to-edge; z-20 abaixo do banner. */}
            <div
              className={cn('flex flex-wrap items-center justify-between gap-2', semTabs && 'sticky z-20 -mx-6 border-b bg-background/85 px-6 py-2.5 backdrop-blur-md')}
              style={semTabs ? { top: 'var(--lp-banner-bottom, 4.5rem)' } : undefined}
            >
              <p className="text-sm text-muted-foreground">{aulas.length} aula(s) neste módulo</p>
              <button onClick={novaAula} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"><FilePlus2 className="h-4 w-4" /> Adicionar aula</button>
            </div>
            {aulas.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhuma aula ainda. Clique em <span className="font-medium text-foreground">"Adicionar aula"</span> para importar o documento e anexar questões.</div>
            ) : (
              <TabelaAulas aulas={aulas} modulos={modulos} pending={pending} onOrdem={moverAulaOrdem} onExcluir={excluirAula} onPersonalizar={personalizarAula} run={run}
                sel={sel} onToggleSel={toggleSel} onToggleTodas={toggleTodas} onExcluirSel={excluirSelecionadas} onPublicarSel={publicarSelecionadas} onLimparSel={limparSel}
                onAplicarEstado={aplicarEstado} onAgendar={(id) => setAgendarIds([id])} onEstadoSel={aplicarEstadoSel} onAgendarSel={() => setAgendarIds([...sel])} />
            )}
          </div>

          {pastaAtual && (
            <div className={cn(moduloTab !== 'acessos' && 'hidden')}>
              <ModuloAcesso key={pastaAtual} pastaId={pastaAtual} />
            </div>
          )}

          {moduloAtual && (
            <div className={cn(moduloTab !== 'trilha' && 'hidden')}>
              <ModuloTrilhaForm key={moduloAtual.id} pastaId={moduloAtual.id} atual={moduloAtual.trilhaAparencia} capa={moduloAtual.capa_url ?? moduloAtual.capa_card_url ?? null} aulas={aulas.map((a) => ({ id: a.id, titulo: a.titulo }))} />
            </div>
          )}

          {moduloAtual && (
            <div className={cn(moduloTab !== 'regulamento' && 'hidden')}>
              <ModuloRegulamentoForm key={moduloAtual.id} pastaId={moduloAtual.id} atual={moduloAtual.regulamento} pontuacao={moduloAtual.pontuacao} />
            </div>
          )}

          {moduloAtual && (
            <div className={cn('space-y-4', moduloTab !== 'config' && 'hidden')}>
              <EditarPastaDialog
                key={moduloAtual.id}
                inline rotulo="módulo" generoM cardView={cardView}
                pasta={{ id: moduloAtual.id, nome: moduloAtual.nome, cor: moduloAtual.cor, capa: moduloAtual.capa_card_url, capaLarga: moduloAtual.capa_url }}
                onClose={() => {}}
                onSaved={() => router.refresh()}
              />
              <ModuloTrilhaFundoForm key={`fundo-${moduloAtual.id}`} pastaId={moduloAtual.id} atual={moduloAtual.trilhaAparencia} capa={moduloAtual.capa_url ?? moduloAtual.capa_card_url ?? null} />
              <ModuloIntroForm pastaId={moduloAtual.id} atual={moduloAtual.intro} />
              <ModuloAdesivoForm pastaId={moduloAtual.id} atual={moduloAtual.adesivo_url} />
              <ModuloPontuacaoForm pastaId={moduloAtual.id} atual={moduloAtual.pontuacao} />
            </div>
          )}
        </>
      )}
      {/* Criar/personalizar módulo — reusa o editor de pasta do banco (capa do card + banner largo + cor + crop). */}
      {criandoModulo && (
        <EditarPastaDialog area="leitura" paiId={pastaAtual} rotulo="módulo" generoM cardView={cardView} onClose={() => setCriandoModulo(false)} onSaved={() => { setCriandoModulo(false); router.refresh() }} />
      )}
      {/* Personalizar aula (nome/descrição/capa/cor) — abre ao criar aula e pelo "Personalizar" da tabela. */}
      {personalizandoAula && (
        <PersonalizarAulaDialog
          aula={personalizandoAula}
          onClose={() => setPersonalizandoAula(null)}
          onSaved={() => { setPersonalizandoAula(null); router.refresh() }}
        />
      )}
      {/* Agendar publicação (1 ou várias aulas). */}
      {agendarIds && (
        <AgendarPublicacaoDialog quantidade={agendarIds.length} onCancel={() => setAgendarIds(null)} onConfirm={confirmarAgendamento} />
      )}
    </div>
  )
}

/**
 * Card do módulo — espelha o FolderCard do Banco de Simulado (variantes poster/ticket),
 * mas com semântica de módulo (contagem de aulas, rota da leitura) e reordenar no menu.
 */
function ModuloCard({ m, variant, onExcluir }: {
  m: ModuloLeitura
  variant: CardView
  onExcluir: () => void
}) {
  const c = m.cor ?? '#6d28d9'
  const capa = m.capa_card_url || m.capa_url
  const href = `/admin/leitura?pasta=${m.id}`
  const contagem = `${m.aulas} aula(s)`
  const menu = (
    <DropdownMenuContent align="start" className="w-40">
      <DropdownMenuItem render={<Link href={href} />}><FolderOpen className="mr-2 h-4 w-4" /> Abrir</DropdownMenuItem>
      <DropdownMenuItem render={<Link href={`${href}&tab=config`} />}><Pencil className="mr-2 h-4 w-4" /> Personalizar</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onExcluir} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir módulo</DropdownMenuItem>
    </DropdownMenuContent>
  )

  // ===== Variante TICKET: card baixo/retangular — imagem à esquerda, infos+ações à direita. =====
  if (variant === 'ticket') {
    return (
      <div className="group relative flex h-32 overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:h-36">
        <div className="relative h-full aspect-[4/3] shrink-0 overflow-hidden">
          {capa
            ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105" />
            : <div className="absolute inset-0 flex items-center justify-center text-white/90" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }}><Library className="h-8 w-8" /></div>}
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: `linear-gradient(110deg, transparent 45%, ${c})` }} />
        </div>
        <Link href={href} className="absolute inset-0 z-10" aria-label={m.nome} />
        <div className="pointer-events-auto absolute right-2 top-2 z-30">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label="Ações do módulo">
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            {menu}
          </DropdownMenu>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Módulo</p>
          <h3 className="line-clamp-2 pr-8 text-sm font-bold leading-tight text-foreground sm:text-[15px]">
            <Link href={href} className="pointer-events-auto relative z-20 transition-opacity hover:opacity-80">{m.nome}</Link>
          </h3>
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <BookOpenText className="h-3 w-3" /> {contagem}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      {capa ? (
        <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/90" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }}><Library className="h-10 w-10" /></div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
      <Link href={href} className="absolute inset-0 z-10" aria-label={m.nome} />
      <div className="absolute right-2 top-2 z-30">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 outline-none transition-colors hover:bg-white hover:text-neutral-900 data-popup-open:bg-white data-popup-open:text-neutral-900 focus-visible:ring-2 focus-visible:ring-white/50" aria-label="Ações do módulo">
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          {menu}
        </DropdownMenu>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">Módulo</p>
        <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{m.nome}</h3>
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
          <BookOpenText className="h-3 w-3" /> {contagem}
        </span>
      </div>
    </div>
  )
}

/** Caixa de seleção arredondada (quadrado com borda) — visual consistente para marcar aulas. */
function CaixaSelecao({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label?: string }) {
  return (
    <input type="checkbox" checked={checked} onChange={onChange} aria-label={label}
      ref={(el) => { if (el) el.indeterminate = !!indeterminate }}
      className="relative h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-[6px] border-2 border-muted-foreground/30 bg-card transition-all hover:border-primary/60 checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary focus-visible:ring-2 focus-visible:ring-primary/40 after:absolute after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-[11px] after:font-bold after:leading-none after:text-primary-foreground after:content-[''] checked:after:content-['✓'] indeterminate:after:content-['–']" />
  )
}

/** Diálogo para AGENDAR a publicação (1 ou várias aulas): data/hora + como fica até lá. */
function AgendarPublicacaoDialog({ quantidade, onCancel, onConfirm }: { quantidade: number; onCancel: () => void; onConfirm: (patch: { estado: DocEstado; publicarEm: string | null }) => void }) {
  const [quando, setQuando] = useState('')
  const [ate, setAte] = useState<'rascunho' | 'visualizavel'>('visualizavel')
  const valido = !!quando && !Number.isNaN(Date.parse(quando)) && Date.parse(quando) > Date.now()
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" /> Agendar publicação {quantidade > 1 ? `(${quantidade} aulas)` : ''}</h3>
          <button onClick={onCancel} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Publicar em (data e hora)</span>
          <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className="h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
        </label>
        <div className="mt-4 space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Até lá, a aula fica:</span>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm hover:bg-muted/40">
            <input type="radio" name="ate" checked={ate === 'visualizavel'} onChange={() => setAte('visualizavel')} className="mt-0.5 accent-[var(--primary)]" />
            <span><span className="font-medium">Visualizável (bloqueada)</span><br /><span className="text-[11px] text-muted-foreground">O aluno vê a aula na trilha com "ainda não liberada" até a data.</span></span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm hover:bg-muted/40">
            <input type="radio" name="ate" checked={ate === 'rascunho'} onChange={() => setAte('rascunho')} className="mt-0.5 accent-[var(--primary)]" />
            <span><span className="font-medium">Oculta</span><br /><span className="text-[11px] text-muted-foreground">Não aparece para o aluno até a data.</span></span>
          </label>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Na data marcada, a aula é liberada automaticamente.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button onClick={() => onConfirm({ estado: ate, publicarEm: new Date(quando).toISOString() })} disabled={!valido}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            <CalendarClock className="h-4 w-4" /> Agendar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Tabela de aulas em HIERARQUIA: cada aula → "Conteúdo" e "Questões do conteúdo" (como o cronograma). */
function TabelaAulas({ aulas, modulos, pending, onOrdem, onExcluir, onPersonalizar, run, sel, onToggleSel, onToggleTodas, onExcluirSel, onPublicarSel, onLimparSel, onAplicarEstado, onAgendar, onEstadoSel, onAgendarSel }: {
  aulas: NonNullable<BancoAulas['aulas']>
  modulos: { id: string; nome: string }[]
  pending: boolean
  onOrdem: (idx: number, delta: number) => void
  onExcluir: (id: string, titulo: string) => void
  onPersonalizar: (a: AulaItem) => void
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => void
  sel?: Set<string>
  onToggleSel?: (id: string) => void
  onToggleTodas?: () => void
  onExcluirSel?: () => void
  onPublicarSel?: (pub: boolean) => void
  onLimparSel?: () => void
  onAplicarEstado?: (id: string, estado: DocEstado) => void
  onAgendar?: (id: string) => void
  onEstadoSel?: (estado: DocEstado) => void
  onAgendarSel?: () => void
}) {
  const list = aulas ?? []
  const selecionavel = !!sel && !!onToggleSel
  const nSel = sel?.size ?? 0
  const todasMarcadas = list.length > 0 && nSel >= list.length
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Barra de seleção */}
      {selecionavel && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
            <CaixaSelecao checked={todasMarcadas} indeterminate={nSel > 0 && !todasMarcadas} onChange={onToggleTodas!} label="Selecionar todas" />
            {nSel > 0 ? `${nSel} selecionada(s)` : 'Selecionar todas'}
          </label>
          {nSel > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <button type="button" disabled={pending} onClick={() => (onEstadoSel ? onEstadoSel('publicada') : onPublicarSel?.(true))} className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-400"><Eye className="h-3.5 w-3.5" /> Publicar</button>
              <button type="button" disabled={pending} onClick={() => onEstadoSel?.('visualizavel')} className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium text-sky-600 transition-colors hover:bg-sky-500/10 disabled:opacity-50 dark:text-sky-400"><Clock className="h-3.5 w-3.5" /> Visualizável</button>
              <button type="button" disabled={pending} onClick={onAgendarSel} className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"><CalendarClock className="h-3.5 w-3.5" /> Agendar</button>
              <button type="button" disabled={pending} onClick={() => (onEstadoSel ? onEstadoSel('rascunho') : onPublicarSel?.(false))} className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"><EyeOff className="h-3.5 w-3.5" /> Rascunho</button>
              <button type="button" disabled={pending} onClick={onExcluirSel} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-card px-2.5 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Excluir</button>
              <button type="button" onClick={onLimparSel} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Limpar seleção"><X className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      )}
      {list.map((a, i) => (
        <AulaLinha key={a.id} a={a} i={i} total={list.length} modulos={modulos} pending={pending} onOrdem={onOrdem} onExcluir={onExcluir} onPersonalizar={onPersonalizar} run={run}
          selecionavel={selecionavel} selecionado={sel?.has(a.id) ?? false} onToggleSel={onToggleSel}
          onAplicarEstado={onAplicarEstado} onAgendar={onAgendar} />
      ))}
    </div>
  )
}

/** Uma aula: cabeçalho (personalizar/mover/ordenar/excluir) + 2 filhos que levam a cada área. */
function AulaLinha({ a, i, total, modulos, pending, onOrdem, onExcluir, onPersonalizar, run, selecionavel = false, selecionado = false, onToggleSel, onAplicarEstado, onAgendar }: {
  a: AulaItem
  i: number
  total: number
  modulos: { id: string; nome: string }[]
  pending: boolean
  onOrdem: (idx: number, delta: number) => void
  onExcluir: (id: string, titulo: string) => void
  onPersonalizar: (a: AulaItem) => void
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => void
  selecionavel?: boolean
  selecionado?: boolean
  onToggleSel?: (id: string) => void
  onAplicarEstado?: (id: string, estado: DocEstado) => void
  onAgendar?: (id: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const c = a.cor ?? '#6d28d9'
  // Estado efetivo de publicação (rascunho / visualizável / agendada / publicada).
  const pub = (a as any).publicacao as { estado?: DocEstado; publicarEm?: string | null } | undefined
  const agendada = !a.publicado && !!pub?.publicarEm
  const estadoPub: 'publicada' | 'visualizavel' | 'agendada' | 'rascunho' =
    a.publicado ? 'publicada' : agendada ? 'agendada' : pub?.estado === 'visualizavel' ? 'visualizavel' : 'rascunho'
  const cap = capaComPos(a.capa_url)
  return (
    <div className={cn('border-b last:border-0', selecionado && 'bg-primary/5')}>
      {/* Cabeçalho da aula */}
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30">
        {selecionavel && (
          <CaixaSelecao checked={selecionado} onChange={() => onToggleSel?.(a.id)} label={`Selecionar ${a.titulo}`} />
        )}
        <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
        <button onClick={() => setAberto((v) => !v)} className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={aberto ? 'Recolher' : 'Expandir'}>
          {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {cap.src
          ? <img src={cap.src} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" style={{ objectPosition: cap.pos }} />
          : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: c }}><BookOpenText className="h-4 w-4" /></span>}
        <button onClick={() => onPersonalizar(a)} className="min-w-0 flex-1 text-left" title="Personalizar aula">
          <p className="truncate text-sm font-semibold text-foreground">{a.titulo}</p>
          {a.descricao ? <p className="truncate text-[11px] text-muted-foreground">{a.descricao}</p> : null}
        </button>
        {onAplicarEstado ? (
          <DropdownMenu>
            <DropdownMenuTrigger disabled={pending} title="Estado de publicação"
              className={cn('hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium outline-none transition-colors disabled:opacity-50 sm:inline-flex',
                estadoPub === 'publicada' ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400'
                : estadoPub === 'visualizavel' ? 'bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 dark:text-sky-400'
                : estadoPub === 'agendada' ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400'
                : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
              {estadoPub === 'publicada' ? <><Eye className="h-3 w-3" /> Publicada</>
                : estadoPub === 'visualizavel' ? <><Clock className="h-3 w-3" /> Visualizável</>
                : estadoPub === 'agendada' ? <><CalendarClock className="h-3 w-3" /> Agendada</>
                : <><EyeOff className="h-3 w-3" /> Rascunho</>}
              <ChevronDown className="h-3 w-3 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onAplicarEstado(a.id, 'publicada')}><Eye className="mr-2 h-4 w-4 text-emerald-600" /> Publicar (liberar)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAplicarEstado(a.id, 'visualizavel')}><Clock className="mr-2 h-4 w-4 text-sky-600" /> Visualizável (bloqueada)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAplicarEstado(a.id, 'rascunho')}><EyeOff className="mr-2 h-4 w-4" /> Rascunho (oculta)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAgendar?.(a.id)}><CalendarClock className="mr-2 h-4 w-4" /> Agendar publicação…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button type="button" onClick={() => run(() => publicarDocumento(a.id, !a.publicado), a.publicado ? 'Aula em rascunho' : 'Aula publicada')} disabled={pending}
            className={cn('hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 sm:inline-flex',
              a.publicado ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400' : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
            {a.publicado ? <><Eye className="h-3 w-3" /> Publicada</> : <><EyeOff className="h-3 w-3" /> Rascunho</>}
          </button>
        )}
        <div className="flex shrink-0 items-center gap-0.5">
          <button onClick={() => onOrdem(i, -1)} disabled={i === 0 || pending} title="Subir" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
          <button onClick={() => onOrdem(i, 1)} disabled={i === total - 1 || pending} title="Descer" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
          <button onClick={() => onPersonalizar(a)} title="Personalizar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-md p-1 text-muted-foreground hover:bg-muted" title="Mover para módulo"><FolderInput className="h-4 w-4" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-auto">
              <DropdownMenuItem onClick={() => run(() => moverAulaParaModulo(a.id, null), 'Movido')}>Sem módulo</DropdownMenuItem>
              <DropdownMenuSeparator />
              {modulos.filter((mm) => mm.id !== a.pasta_id).map((mm) => (
                <DropdownMenuItem key={mm.id} onClick={() => run(() => moverAulaParaModulo(a.id, mm.id), 'Movido')}>{mm.nome}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button onClick={() => onExcluir(a.id, a.titulo)} title="Excluir" className="rounded-md p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {/* Filhos: Conteúdo (editor) + Questões do conteúdo (add/importar) */}
      {aberto && (
        <div className="border-t bg-muted/20">
          <Link href={`/admin/leitura/${a.id}?tab=config`} className="group flex items-center gap-2.5 py-2.5 pl-16 pr-3 text-sm transition-colors hover:bg-muted/50">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 font-medium text-foreground">Conteúdo</span>
            <span className="text-[11px] text-muted-foreground">{(a.artigos ?? 0) > 0 ? `${a.artigos} seção(ões)` : 'inserir conteúdo'}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link href={`/admin/leitura/${a.id}/questoes`} className="group flex items-center gap-2.5 border-t py-2.5 pl-16 pr-3 text-sm transition-colors hover:bg-muted/50">
            <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 font-medium text-foreground">Questões do conteúdo</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}
    </div>
  )
}
