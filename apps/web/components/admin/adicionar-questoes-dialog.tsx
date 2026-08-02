'use client'

import { useEffect, useState, useTransition, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Search, Check, Loader2, Upload, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { adicionarQuestoes, buscarQuestoesForaBanco, type QuestaoBancoBuscaItem } from '@/app/admin/banco-questoes/actions'
import { ImportarQuestoesTab } from '@/components/admin/importar-questoes-tab'

const difCfg: Record<string, { label: string; cls: string }> = {
  facil: { label: 'Fácil', cls: 'text-green-600' },
  medio: { label: 'Médio', cls: 'text-amber-600' },
  dificil: { label: 'Difícil', cls: 'text-red-600' },
}

export function AdicionarQuestoesDialog({
  bancoId,
  disciplinas,
}: {
  bancoId: string
  /** Disciplinas do tenant para o filtro (id + nome). */
  disciplinas: { id: string; nome: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [modo, setModo] = useState<'existentes' | 'importar'>('existentes')
  const [busca, setBusca] = useState('')
  const [disc, setDisc] = useState('all')
  const [dif, setDif] = useState('all')
  const [tipoF, setTipoF] = useState('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const router = useRouter()
  // Candidatas buscadas SOB DEMANDA no servidor (já exclui as que estão no banco).
  const [itens, setItens] = useState<QuestaoBancoBuscaItem[]>([])
  const [buscando, setBuscando] = useState(false)

  const difItems = { all: 'Todas', facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }
  const tipoItems = { all: 'Todos tipos', objetiva: 'Objetiva', discursiva: 'Discursiva' }

  useEffect(() => {
    if (!open || modo !== 'existentes') return
    let vivo = true
    setBuscando(true)
    const t = setTimeout(async () => {
      const r = await buscarQuestoesForaBanco(bancoId, { busca, disciplinaId: disc, dificuldade: dif, tipo: tipoF })
      if (!vivo) return
      setItens(r.ok ? (r.itens ?? []) : [])
      setBuscando(false)
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [open, modo, busca, disc, dif, tipoF, bancoId])

  function toggle(id: string) {
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function adicionar() {
    if (sel.size === 0) return
    start(async () => {
      const ids = [...sel]
      const r = await adicionarQuestoes(bancoId, ids)
      if (r.ok) {
        toast.success(`${r.adicionadas ?? 0} questão(ões) adicionada(s)`)
        setOpen(false)
        setSel(new Set())
        setItens((p) => p.filter((q) => !ids.includes(q.id)))
        // Navegação suave (a action faz revalidatePath): sem window.location.assign / reload total.
        router.push(`/admin/banco-questoes/${bancoId}?tab=questoes`)
        router.refresh()
      } else toast.error(r.error ?? 'Erro')
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSel(new Set()) }}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" /> Adicionar questões
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Adicionar questões ao banco</DialogTitle>
          <DialogDescription>Importe questões de um arquivo ou selecione questões já existentes no sistema.</DialogDescription>
        </DialogHeader>

        {/* Abas */}
        <div className="flex gap-1 px-6 pt-4">
          {([
            { k: 'importar', label: 'Importar questões', icon: Upload },
            { k: 'existentes', label: 'Questões do sistema', icon: ListChecks },
          ] as const).map((t) => (
            <button key={t.k} type="button" onClick={() => setModo(t.k)}
              className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                modo === t.k ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {modo === 'importar' ? (
          <ImportarQuestoesTab bancoId={bancoId} onDone={() => setOpen(false)} />
        ) : (
        <>
        {/* Filtros */}
        <div className="flex flex-wrap gap-2 px-6 pt-4">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por enunciado, código, disciplina…" className="pl-8" />
          </div>
          <Select value={disc} onValueChange={(v) => setDisc(v ?? '')} items={{ all: 'Todas disciplinas', ...Object.fromEntries(disciplinas.map((d) => [d.id, d.nome])) }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas disciplinas</SelectItem>
              {disciplinas.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={dif} onValueChange={(v) => setDif(v ?? '')} items={difItems}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="facil">Fácil</SelectItem>
              <SelectItem value="medio">Médio</SelectItem>
              <SelectItem value="dificil">Difícil</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tipoF} onValueChange={(v) => setTipoF(v ?? '')} items={tipoItems}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos tipos</SelectItem>
              <SelectItem value="objetiva">Objetiva</SelectItem>
              <SelectItem value="discursiva">Discursiva</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="px-6 pb-1 pt-3 text-xs text-muted-foreground">{buscando ? 'Buscando…' : `${itens.length} questão(ões) disponível(is)${itens.length >= 40 ? '+' : ''}`}</p>

        {/* Lista (tabela com rolagem lateral) */}
        <div className="min-h-0 flex-1 overflow-auto px-3">
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-44">Disciplina</TableHead>
                <TableHead>Questão</TableHead>
                <TableHead className="w-24">Tipo</TableHead>
                <TableHead className="w-24 text-right">Dificuldade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buscando ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></TableCell></TableRow>
              ) : itens.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhuma questão encontrada.</TableCell></TableRow>
              ) : (
                itens.map((q) => {
                  const on = sel.has(q.id)
                  const enun = q.enunciado.length > 120 ? q.enunciado.slice(0, 120) + '…' : q.enunciado
                  const d = difCfg[q.nivel_dificuldade ?? '']
                  return (
                    <TableRow key={q.id} onClick={() => toggle(q.id)} className={cn('cursor-pointer', on && 'bg-primary/5')}>
                      <TableCell>
                        <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border',
                          on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                      </TableCell>
                      <TableCell className="align-top">
                        <span className="flex flex-wrap items-center gap-1 text-xs">
                          {q.external_id && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground">#{q.external_id}</span>}
                          {q.disciplina && <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold uppercase text-primary">{q.disciplina}</span>}
                        </span>
                      </TableCell>
                      <TableCell className="align-top text-sm leading-relaxed">{enun}</TableCell>
                      <TableCell className="align-top">
                        <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                          q.tipo === 'discursiva' ? 'border-indigo-400 text-indigo-600 dark:text-indigo-300' : 'border-sky-400 text-sky-600 dark:text-sky-300')}>
                          {q.tipo === 'discursiva' ? 'Discursiva' : 'Objetiva'}
                        </span>
                      </TableCell>
                      <TableCell className="align-top text-right text-sm">{d ? <span className={cn('font-medium', d.cls)}>{d.label}</span> : '—'}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t px-6 py-3">
          <span className="text-sm text-muted-foreground">{sel.size === 0 ? 'Nenhuma questão selecionada' : `${sel.size} questão(ões) selecionada(s)`}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={adicionar} disabled={pending || sel.size === 0}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Adicionar
            </Button>
          </div>
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  )
}
