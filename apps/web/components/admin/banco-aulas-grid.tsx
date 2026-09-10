'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ChevronRight, ChevronUp, ChevronDown, Home, Library, FolderPlus, FilePlus2, Pencil, Trash2, FolderInput, Pen, Eye, EyeOff, BookOpenText,
} from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import {
  type BancoAulas, type ModuloLeitura, criarDocumento, criarModuloLeitura, renomearModuloLeitura, excluirModuloLeitura,
  moverAulaParaModulo, reordenarAulasLeitura, reordenarModulosLeitura,
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
export function BancoAulasGrid({ data, pastaAtual }: { data: BancoAulas; pastaAtual: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const bancos = data.pastas ?? []
  const aulas = data.aulas ?? []
  const modulos = data.modulos ?? []
  const breadcrumb = data.breadcrumb ?? []
  const dentroDeBanco = !!pastaAtual

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) =>
    start(async () => { const r = await fn(); if (r.ok) { if (okMsg) toast.success(okMsg); router.refresh() } else toast.error(r.error ?? 'Erro') })

  function novoBanco() {
    const nome = window.prompt('Nome do módulo:')?.trim(); if (!nome) return
    run(() => criarModuloLeitura(nome, pastaAtual), 'Módulo criado')
  }
  function novaAula() {
    start(async () => {
      const r = await criarDocumento('Nova aula', pastaAtual)
      if (r.ok && r.id) router.push(`/admin/leitura/${r.id}`)
      else toast.error(r.error ?? 'Erro ao criar aula')
    })
  }
  function renomearBanco(b: ModuloLeitura) {
    const nome = window.prompt('Renomear módulo:', b.nome)?.trim(); if (!nome || nome === b.nome) return
    run(() => renomearModuloLeitura(b.id, nome))
  }
  async function excluirBanco(b: ModuloLeitura) {
    if (!(await confirmar({ titulo: 'Excluir módulo', mensagem: `Excluir "${b.nome}"? Só é possível se estiver vazio (mova as aulas antes).`, confirmar: 'Excluir', destrutivo: true }))) return
    run(() => excluirModuloLeitura(b.id))
  }
  async function excluirAula(id: string, titulo: string) {
    if (!(await confirmar({ titulo: 'Excluir aula', mensagem: `Excluir a aula "${titulo}"?`, confirmar: 'Excluir', destrutivo: true }))) return
    run(() => excluirDocumento(id))
  }
  function moverBanco(idx: number, delta: number) {
    const ids = bancos.map((b) => b.id); const j = idx + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    run(() => reordenarModulosLeitura(ids))
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
            <button onClick={novoBanco} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"><FolderPlus className="h-4 w-4" /> Novo módulo</button>
          </div>
          {bancos.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhum módulo ainda. Crie um <span className="font-medium text-foreground">módulo</span> para guardar as aulas.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {bancos.map((b, i) => (
                <div key={b.id} className="group relative flex items-center gap-3 rounded-2xl border bg-card p-3.5 shadow-sm transition-colors hover:border-primary/40">
                  <Link href={`/admin/leitura?pasta=${b.id}`} className="absolute inset-0 z-0" aria-label={b.nome} />
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: b.cor ?? '#6d28d9' }}><Library className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{b.nome}</p>
                    <p className="text-xs text-muted-foreground">{b.aulas} aula(s)</p>
                  </div>
                  <div className="relative z-10 flex items-center gap-0.5">
                    <button onClick={() => moverBanco(i, -1)} disabled={i === 0 || pending} title="Subir" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                    <button onClick={() => moverBanco(i, 1)} disabled={i === bancos.length - 1 || pending} title="Descer" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded-md p-1 text-muted-foreground hover:bg-muted"><Pencil className="h-4 w-4" /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => renomearBanco(b)}><Pencil className="mr-2 h-4 w-4" /> Renomear</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => excluirBanco(b)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
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
