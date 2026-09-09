'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronRight, FolderPlus, FilePlus2, Folder, ChevronUp, ChevronDown, Pencil, Trash2, FolderInput, Home } from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import { LeituraCard } from '@/components/admin/leitura-card'
import {
  type BancoAulas, type ModuloLeitura, criarDocumento, criarModuloLeitura, renomearModuloLeitura, excluirModuloLeitura,
  moverAulaParaModulo, reordenarAulasLeitura, reordenarModulosLeitura,
} from '@/app/admin/leitura/actions'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Banco de aulas do LegProc: módulos (pastas) + aulas (documentos), com breadcrumb e reordenação. */
export function BancoAulasGrid({ data, pastaAtual }: { data: BancoAulas; pastaAtual: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const pastas = data.pastas ?? []
  const aulas = data.aulas ?? []
  const modulos = data.modulos ?? []
  const breadcrumb = data.breadcrumb ?? []

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) =>
    start(async () => { const r = await fn(); if (r.ok) { if (okMsg) toast.success(okMsg); router.refresh() } else toast.error(r.error ?? 'Erro') })

  function novoModulo() {
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
  function renomear(m: ModuloLeitura) {
    const nome = window.prompt('Renomear módulo:', m.nome)?.trim(); if (!nome || nome === m.nome) return
    run(() => renomearModuloLeitura(m.id, nome))
  }
  async function excluir(m: ModuloLeitura) {
    if (!(await confirmar({ titulo: 'Excluir módulo', mensagem: `Excluir "${m.nome}"? Só é possível se estiver vazio.`, confirmar: 'Excluir', destrutivo: true }))) return
    run(() => excluirModuloLeitura(m.id))
  }
  function moverModulo(idx: number, delta: number) {
    const ids = pastas.map((p) => p.id); const j = idx + delta
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
        <Link href="/admin/leitura" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground"><Home className="h-3.5 w-3.5" /> Banco de aulas</Link>
        {breadcrumb.map((b) => (
          <span key={b.id} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href={`/admin/leitura?pasta=${b.id}`} className="rounded-md px-1.5 py-0.5 font-medium text-foreground hover:bg-muted">{b.nome}</Link>
          </span>
        ))}
      </div>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={novoModulo} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"><FolderPlus className="h-4 w-4" /> Novo módulo</button>
        <button onClick={novaAula} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"><FilePlus2 className="h-4 w-4" /> Nova aula</button>
      </div>

      {/* Módulos (pastas) */}
      {pastas.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Módulos</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pastas.map((m, i) => (
              <div key={m.id} className="group relative flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40">
                <Link href={`/admin/leitura?pasta=${m.id}`} className="absolute inset-0 z-0" aria-label={m.nome} />
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: m.cor ?? '#6d28d9' }}><Folder className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.nome}</p>
                  <p className="text-xs text-muted-foreground">{m.subpastas > 0 && `${m.subpastas} submódulo(s) · `}{m.aulas} aula(s)</p>
                </div>
                <div className="relative z-10 flex items-center gap-0.5">
                  <button onClick={() => moverModulo(i, -1)} disabled={i === 0 || pending} title="Subir" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                  <button onClick={() => moverModulo(i, 1)} disabled={i === pastas.length - 1 || pending} title="Descer" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="rounded-md p-1 text-muted-foreground hover:bg-muted"><Pencil className="h-4 w-4" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => renomear(m)}><Pencil className="mr-2 h-4 w-4" /> Renomear</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => excluir(m)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aulas (documentos) */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aulas {aulas.length > 0 && <span className="text-muted-foreground/70">(ordem = sequência na trilha)</span>}</p>
        {aulas.length === 0 && pastas.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Vazio. Crie um <span className="font-medium text-foreground">módulo</span> ou uma <span className="font-medium text-foreground">aula</span>.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {aulas.map((a, i) => (
              <div key={a.id} className="space-y-1.5">
                <LeituraCard doc={a} />
                <div className="flex items-center justify-between gap-1 rounded-lg border bg-card px-1.5 py-1">
                  <span className="pl-1 text-[11px] font-mono text-muted-foreground">#{i + 1}</span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => moverAulaOrdem(i, -1)} disabled={i === 0 || pending} title="Subir" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                    <button onClick={() => moverAulaOrdem(i, 1)} disabled={i === aulas.length - 1 || pending} title="Descer" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded-md p-1 text-muted-foreground hover:bg-muted" title="Mover para módulo"><FolderInput className="h-4 w-4" /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-72 overflow-auto">
                        <DropdownMenuItem onClick={() => run(() => moverAulaParaModulo(a.id, null), 'Movido')}>Raiz (sem módulo)</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {modulos.filter((mm) => mm.id !== a.pasta_id).map((mm) => (
                          <DropdownMenuItem key={mm.id} onClick={() => run(() => moverAulaParaModulo(a.id, mm.id), 'Movido')}>{mm.nome}</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
