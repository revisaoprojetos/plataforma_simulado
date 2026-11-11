'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, MapPin, Pencil, Trash2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { DuracaoDivergente, GrupoMeta } from '@/app/admin/cronogramas/metas/actions-tipos'
import { excluirMetaAvulsa, padronizarDuracao, padronizarFormatoDisciplina } from '@/app/admin/cronogramas/metas/actions'

// Ações da sub-aba Auditoria de metas: as MESMAS server actions da tela atual (metas/actions.ts); só a lista mudou de casa.

/** Padroniza o formato de aula (01 × 1) de uma disciplina em todos os cronogramas. */
export function PadronizarDisciplina({ disciplina, metas, podeEditar }: { disciplina: string; metas: number; podeEditar: boolean }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  async function padronizar(comZero: boolean) {
    const exemplo = comZero ? '01' : '1'
    const sim = await confirmar({
      titulo: `Padronizar "${disciplina}"`,
      mensagem: `Todas as aulas desta disciplina passam a usar o formato ${exemplo} — ${metas.toLocaleString('pt-BR')} metas, em todos os cronogramas. Aulas como "1.1" não são tocadas.`,
    })
    if (!sim) return
    iniciar(async () => {
      const r = await padronizarFormatoDisciplina(disciplina, comZero)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível padronizar.'); return }
      toast.success(`${r.alterados?.toLocaleString('pt-BR')} meta(s) de ${disciplina} no formato ${exemplo}`)
      router.refresh()
    })
  }
  if (!podeEditar) return <span className="text-xs text-muted-foreground">somente leitura</span>
  return (
    <span className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" disabled={pendente} onClick={() => padronizar(true)}>{pendente ? <Loader2 className="animate-spin" /> : <Wand2 />}<span className="font-mono">01</span></Button>
      <Button size="sm" variant="outline" disabled={pendente} onClick={() => padronizar(false)} title="Igual aos links cadastrados">{pendente ? <Loader2 className="animate-spin" /> : <Wand2 />}<span className="font-mono">1</span><span className="text-xs font-normal text-muted-foreground">como os links</span></Button>
    </span>
  )
}

/** Uniformiza a duração de um tipo numa semana de um cronograma para um dos valores existentes. */
export function UniformizarDuracao({ d, podeEditar }: { d: DuracaoDivergente; podeEditar: boolean }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  async function uniformizar(alvo: string) {
    const sim = await confirmar({ titulo: `Uniformizar para "${alvo}"`, mensagem: `As ${d.total} metas de "${d.tipo}" na semana ${d.semana} de "${d.cronograma_nome}" passam a usar "${alvo}".` })
    if (!sim) return
    iniciar(async () => {
      const r = await padronizarDuracao(d.cronograma_id, d.semana, d.tipo, alvo)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível uniformizar.'); return }
      toast.success(`${r.alterados} meta(s) com duração "${alvo}"`)
      router.refresh()
    })
  }
  if (!podeEditar) return <span className="text-xs text-muted-foreground">somente leitura</span>
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {d.valores.map((v) => (
        <Button key={v.duracao} size="sm" variant="outline" disabled={pendente} onClick={() => uniformizar(v.duracao)}>
          {pendente ? <Loader2 className="animate-spin" /> : <Wand2 />}<span className="font-mono">{v.duracao}</span><span className="text-xs font-normal text-muted-foreground">{v.n} hoje</span>
        </Button>
      ))}
    </span>
  )
}

/** "Onde esta meta aparece": diálogo com os cronogramas (semana/dia), link para editar e exclusão da ocorrência. */
export function OndeMeta({ g, podeEditar }: { g: GrupoMeta; podeEditar: boolean }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  async function remover(metaId: string, nomeCron: string) {
    const sim = await confirmar({ titulo: 'Excluir esta meta', mensagem: `Remove a meta de "${g.disciplina}" do cronograma "${nomeCron}". As outras ocorrências não são tocadas.`, destrutivo: true })
    if (!sim) return
    setOcupado(metaId)
    const r = await excluirMetaAvulsa(metaId)
    setOcupado(null)
    if (!r.ok) { toast.error(r.error ?? 'Não foi possível excluir.'); return }
    toast.success('Meta excluída')
    router.refresh()
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}><MapPin />Onde está</Button>
      {aberto && (
        <Dialog open={aberto} onOpenChange={setAberto}>
          <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{g.disciplina}{g.aula_chave ? ` · aula ${g.aula_chave}` : ''}</DialogTitle>
              <DialogDescription>{g.conteudo || 'Sem conteúdo'} — em {g.n_cronogramas} cronograma(s).</DialogDescription>
            </DialogHeader>
            <div className="divide-y rounded-lg border">
              {g.cronogramas.map((c) => (
                <div key={c.meta_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <Link href={`/admin/cronogramas/${c.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{c.nome}</Link>
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">semana {c.semana} · dia {c.dia}</span>
                  {c.aula && <span className="shrink-0 rounded-md border px-1.5 font-mono text-xs">{c.aula}</span>}
                  <Link href={`/admin/cronogramas/${c.id}?meta=${c.meta_id}`} className="inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-muted" title="Editar esta meta no cronograma"><Pencil className="h-3 w-3" />Editar</Link>
                  {podeEditar && (
                    <Button size="icon-sm" variant="ghost" title="Excluir esta ocorrência" aria-label="Excluir esta ocorrência" disabled={ocupado === c.meta_id} onClick={() => remover(c.meta_id, c.nome)}>
                      {ocupado === c.meta_id ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive" />}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
