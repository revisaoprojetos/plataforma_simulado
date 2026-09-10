'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { EditarPastaDialog } from '@/components/admin/editar-pasta-dialog'
import { PersonalizarAulaDialog } from '@/components/admin/personalizar-aula-dialog'
import { ModuloAcesso } from '@/components/admin/modulo-acesso'
import {
  ChevronRight, ChevronUp, ChevronDown, Home, Library, FolderPlus, FilePlus2, Pencil, Trash2, FolderInput, Eye, EyeOff, BookOpenText, MoreVertical, FolderOpen, FileText, HelpCircle, Settings2, Users,
} from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { type CardView } from '@/lib/card-view'
import {
  type BancoAulas, type ModuloLeitura, criarDocumento, excluirModuloLeitura,
  moverAulaParaModulo, reordenarAulasLeitura, publicarDocumento,
} from '@/app/admin/leitura/actions'
import { excluirDocumento } from '@/app/admin/leitura/actions'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type AulaItem = NonNullable<BancoAulas['aulas']>[number]
type PersonalizarAula = { id: string; titulo: string; descricao: string | null; capa_url: string | null; cor: string | null }
export type ModuloTab = 'aulas' | 'acessos' | 'config'
const MODULO_TABS: { id: ModuloTab; label: string; Icon: typeof BookOpenText }[] = [
  { id: 'aulas', label: 'Aulas', Icon: BookOpenText },
  { id: 'acessos', label: 'Acessos', Icon: Users },
  { id: 'config', label: 'Configurações', Icon: Settings2 },
]

/**
 * Banco de aulas do LegProc no modelo "banco → tabela de aulas":
 *  - Raiz: cards dos BANCOS (containers) + "Novo banco".
 *  - Dentro de um banco: TABELA de aulas (documento HTML + questões), reordenáveis; cada aula abre o editor.
 */
export function BancoAulasGrid({ data, pastaAtual, cardView = 'poster', moduloTab = 'aulas' }: { data: BancoAulas; pastaAtual: string | null; cardView?: CardView; moduloTab?: ModuloTab }) {
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

  // Underline deslizante das abas (compactas): mede a posição/largura da aba ativa.
  const tabsRef = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState<{ left: number; width: number }>({ left: 0, width: 0 })
  useEffect(() => {
    const medir = () => {
      const el = tabsRef.current?.querySelector<HTMLElement>('[data-tab-ativo="1"]')
      if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth })
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [moduloTab, dentroDeBanco])

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) =>
    start(async () => { const r = await fn(); if (r.ok) { if (okMsg) toast.success(okMsg); router.refresh() } else toast.error(r.error ?? 'Erro') })

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
      {/* Breadcrumb + (dentro do módulo) botão Adicionar aula na MESMA linha */}
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
          {/* Abas do módulo (compactas, deep-linkáveis por ?tab=) com underline deslizante animado */}
          <div ref={tabsRef} className="relative flex gap-8 border-b pl-3 text-sm">
            {MODULO_TABS.map(({ id, label, Icon }) => (
              <Link key={id} data-tab-ativo={moduloTab === id ? '1' : '0'} href={`/admin/leitura?pasta=${pastaAtual}&tab=${id}`}
                className={cn('inline-flex items-center gap-1.5 rounded-md py-2 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40', moduloTab === id ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
            <span className="absolute bottom-[-1px] h-0.5 rounded-full bg-primary transition-all duration-300 ease-out" style={{ left: ind.left, width: ind.width }} />
          </div>

          {/* As 3 abas ficam MONTADAS (só escondemos as inativas): Acessos/Configurações pré-carregam ao
              entrar no módulo e ficam em memória enquanto navega; desmontam (limpam) ao sair do módulo. */}
          <div className={cn('space-y-2', moduloTab !== 'aulas' && 'hidden')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{aulas.length} aula(s) neste módulo</p>
              <button onClick={novaAula} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"><FilePlus2 className="h-4 w-4" /> Adicionar aula</button>
            </div>
            {aulas.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhuma aula ainda. Clique em <span className="font-medium text-foreground">"Adicionar aula"</span> para importar o documento e anexar questões.</div>
            ) : (
              <TabelaAulas aulas={aulas} modulos={modulos} pending={pending} onOrdem={moverAulaOrdem} onExcluir={excluirAula} onPersonalizar={personalizarAula} run={run} />
            )}
          </div>

          {pastaAtual && (
            <div className={cn(moduloTab !== 'acessos' && 'hidden')}>
              <ModuloAcesso key={pastaAtual} pastaId={pastaAtual} />
            </div>
          )}

          {moduloAtual && (
            <div className={cn(moduloTab !== 'config' && 'hidden')}>
              <EditarPastaDialog
                key={moduloAtual.id}
                inline rotulo="módulo" generoM cardView={cardView}
                pasta={{ id: moduloAtual.id, nome: moduloAtual.nome, cor: moduloAtual.cor, capa: moduloAtual.capa_card_url, capaLarga: moduloAtual.capa_url }}
                onClose={() => {}}
                onSaved={() => router.refresh()}
              />
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

/** Tabela de aulas em HIERARQUIA: cada aula → "Conteúdo" e "Questões do conteúdo" (como o cronograma). */
function TabelaAulas({ aulas, modulos, pending, onOrdem, onExcluir, onPersonalizar, run }: {
  aulas: NonNullable<BancoAulas['aulas']>
  modulos: { id: string; nome: string }[]
  pending: boolean
  onOrdem: (idx: number, delta: number) => void
  onExcluir: (id: string, titulo: string) => void
  onPersonalizar: (a: AulaItem) => void
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => void
}) {
  const list = aulas ?? []
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      {list.map((a, i) => (
        <AulaLinha key={a.id} a={a} i={i} total={list.length} modulos={modulos} pending={pending} onOrdem={onOrdem} onExcluir={onExcluir} onPersonalizar={onPersonalizar} run={run} />
      ))}
    </div>
  )
}

/** Uma aula: cabeçalho (personalizar/mover/ordenar/excluir) + 2 filhos que levam a cada área. */
function AulaLinha({ a, i, total, modulos, pending, onOrdem, onExcluir, onPersonalizar, run }: {
  a: AulaItem
  i: number
  total: number
  modulos: { id: string; nome: string }[]
  pending: boolean
  onOrdem: (idx: number, delta: number) => void
  onExcluir: (id: string, titulo: string) => void
  onPersonalizar: (a: AulaItem) => void
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => void
}) {
  const [aberto, setAberto] = useState(true)
  const c = a.cor ?? '#6d28d9'
  return (
    <div className="border-b last:border-0">
      {/* Cabeçalho da aula */}
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30">
        <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
        <button onClick={() => setAberto((v) => !v)} className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={aberto ? 'Recolher' : 'Expandir'}>
          {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {a.capa_url
          ? <img src={a.capa_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
          : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: c }}><BookOpenText className="h-4 w-4" /></span>}
        <button onClick={() => onPersonalizar(a)} className="min-w-0 flex-1 text-left" title="Personalizar aula">
          <p className="truncate text-sm font-semibold text-foreground">{a.titulo}</p>
          {a.descricao ? <p className="truncate text-[11px] text-muted-foreground">{a.descricao}</p> : null}
        </button>
        <button type="button" onClick={() => run(() => publicarDocumento(a.id, !a.publicado), a.publicado ? 'Aula em rascunho' : 'Aula publicada')} disabled={pending}
          title={a.publicado ? 'Publicada — clique para voltar a rascunho' : 'Rascunho — clique para publicar'}
          className={cn('hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 sm:inline-flex',
            a.publicado ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400' : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
          {a.publicado ? <><Eye className="h-3 w-3" /> Publicada</> : <><EyeOff className="h-3 w-3" /> Rascunho</>}
        </button>
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
