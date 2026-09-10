'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { EditarPastaDialog } from '@/components/admin/editar-pasta-dialog'
import {
  ChevronRight, ChevronUp, ChevronDown, Home, Library, FolderPlus, FilePlus2, Pencil, Trash2, FolderInput, Pen, Eye, EyeOff, BookOpenText, MoreVertical, FolderOpen,
} from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import { type CardView } from '@/lib/card-view'
import {
  type BancoAulas, type ModuloLeitura, criarDocumento, excluirModuloLeitura,
  moverAulaParaModulo, reordenarAulasLeitura,
} from '@/app/admin/leitura/actions'
import { excluirDocumento } from '@/app/admin/leitura/actions'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Banco de aulas do LegProc no modelo "banco → tabela de aulas":
 *  - Raiz: cards dos BANCOS (containers) + "Novo banco".
 *  - Dentro de um banco: TABELA de aulas (documento HTML + questões), reordenáveis; cada aula abre o editor.
 */
export function BancoAulasGrid({ data, pastaAtual, cardView = 'poster' }: { data: BancoAulas; pastaAtual: string | null; cardView?: CardView }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [criandoModulo, setCriandoModulo] = useState(false)
  const [editandoModulo, setEditandoModulo] = useState<ModuloLeitura | null>(null)
  const bancos = data.pastas ?? []
  const aulas = data.aulas ?? []
  const modulos = data.modulos ?? []
  const breadcrumb = data.breadcrumb ?? []
  const dentroDeBanco = !!pastaAtual

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) =>
    start(async () => { const r = await fn(); if (r.ok) { if (okMsg) toast.success(okMsg); router.refresh() } else toast.error(r.error ?? 'Erro') })

  function novaAula() {
    start(async () => {
      const r = await criarDocumento('Nova aula', pastaAtual)
      if (r.ok && r.id) router.push(`/admin/leitura/${r.id}`)
      else toast.error(r.error ?? 'Erro ao criar aula')
    })
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
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/admin/leitura" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground"><Home className="h-3.5 w-3.5" /> Módulos</Link>
        {breadcrumb.map((b) => (
          <span key={b.id} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href={`/admin/leitura?pasta=${b.id}`} className="rounded-md px-1.5 py-0.5 font-medium text-foreground hover:bg-muted">{b.nome}</Link>
          </span>
        ))}
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
                <ModuloCard
                  key={b.id} m={b} variant={cardView}
                  onPersonalizar={() => setEditandoModulo(b)} onExcluir={() => excluirBanco(b)}
                />
              ))}
            </div>
          )}
          {/* Aulas soltas (sem banco) — legadas: uma tabela para mover pra um banco. */}
          {aulas.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aulas sem módulo</p>
              <TabelaAulas aulas={aulas} modulos={modulos} pending={pending} onOrdem={moverAulaOrdem} onExcluir={excluirAula} run={run} />
            </div>
          )}
        </>
      ) : (
        // ===================== DENTRO DE UM BANCO: tabela de aulas =====================
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{aulas.length} aula(s) neste módulo — a ordem define a sequência na trilha.</p>
            <button onClick={novaAula} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"><FilePlus2 className="h-4 w-4" /> Adicionar aula</button>
          </div>
          {aulas.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhuma aula ainda. Clique em <span className="font-medium text-foreground">"Adicionar aula"</span> para importar o documento e anexar questões.</div>
          ) : (
            <TabelaAulas aulas={aulas} modulos={modulos} pending={pending} onOrdem={moverAulaOrdem} onExcluir={excluirAula} run={run} />
          )}
        </>
      )}
      {/* Criar/personalizar módulo — reusa o editor de pasta do banco (capa do card + banner largo + cor + crop). */}
      {criandoModulo && (
        <EditarPastaDialog area="leitura" paiId={pastaAtual} rotulo="módulo" generoM cardView={cardView} onClose={() => setCriandoModulo(false)} onSaved={() => { setCriandoModulo(false); router.refresh() }} />
      )}
      {editandoModulo && (
        <EditarPastaDialog
          pasta={{ id: editandoModulo.id, nome: editandoModulo.nome, cor: editandoModulo.cor, capa: editandoModulo.capa_card_url, capaLarga: editandoModulo.capa_url }}
          rotulo="módulo" generoM cardView={cardView}
          onClose={() => setEditandoModulo(null)}
          onSaved={() => { setEditandoModulo(null); router.refresh() }}
        />
      )}
    </div>
  )
}

/**
 * Card do módulo — espelha o FolderCard do Banco de Simulado (variantes poster/ticket),
 * mas com semântica de módulo (contagem de aulas, rota da leitura) e reordenar no menu.
 */
function ModuloCard({ m, variant, onPersonalizar, onExcluir }: {
  m: ModuloLeitura
  variant: CardView
  onPersonalizar: () => void
  onExcluir: () => void
}) {
  const c = m.cor ?? '#6d28d9'
  const capa = m.capa_card_url || m.capa_url
  const href = `/admin/leitura?pasta=${m.id}`
  const contagem = `${m.aulas} aula(s)`
  const menu = (
    <DropdownMenuContent align="start" className="w-40">
      <DropdownMenuItem render={<Link href={href} />}><FolderOpen className="mr-2 h-4 w-4" /> Abrir</DropdownMenuItem>
      <DropdownMenuItem onClick={onPersonalizar}><Pencil className="mr-2 h-4 w-4" /> Personalizar</DropdownMenuItem>
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

/** Tabela de aulas (documento + questões), reordenável; cada linha abre o editor. */
function TabelaAulas({ aulas, modulos, pending, onOrdem, onExcluir, run }: {
  aulas: NonNullable<BancoAulas['aulas']>
  modulos: { id: string; nome: string }[]
  pending: boolean
  onOrdem: (idx: number, delta: number) => void
  onExcluir: (id: string, titulo: string) => void
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => void
}) {
  const list = aulas ?? []
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <table className="w-full table-fixed text-sm">
        <colgroup><col className="w-14" /><col /><col className="w-24" /><col className="w-28" /><col className="w-40" /></colgroup>
        <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">#</th>
            <th className="px-3 py-2 text-left font-semibold">Aula (documento)</th>
            <th className="px-3 py-2 text-left font-semibold">Questões</th>
            <th className="px-3 py-2 text-left font-semibold">Status</th>
            <th className="px-3 py-2 text-right font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody>
          {list.map((a, i) => (
            <tr key={a.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i + 1}</td>
              <td className="px-3 py-2">
                <Link href={`/admin/leitura/${a.id}`} className="flex min-w-0 items-center gap-2 font-medium text-foreground hover:text-primary">
                  <BookOpenText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate" title={a.titulo}>{a.titulo}</span>
                </Link>
                {(a.artigos ?? 0) > 0 && <span className="ml-6 text-[11px] text-muted-foreground">{a.artigos} artigo(s)</span>}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{a.questoes ?? 0}</td>
              <td className="px-3 py-2">
                {a.publicado
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"><Eye className="h-3 w-3" /> Publicada</span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><EyeOff className="h-3 w-3" /> Rascunho</span>}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-0.5">
                  <button onClick={() => onOrdem(i, -1)} disabled={i === 0 || pending} title="Subir" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                  <button onClick={() => onOrdem(i, 1)} disabled={i === list.length - 1 || pending} title="Descer" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                  <Link href={`/admin/leitura/${a.id}`} title="Editar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pen className="h-4 w-4" /></Link>
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
