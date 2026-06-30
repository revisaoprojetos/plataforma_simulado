'use client'

import { useState, useTransition, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Search, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { adicionarQuestoes } from '@/app/admin/banco-questoes/actions'

interface Questao {
  id: string
  external_id?: string | null
  enunciado: string
  tipo: string
  nivel_dificuldade?: string | null
  disciplina?: string | null
  assunto?: string | null
}

const difCfg: Record<string, { label: string; cls: string }> = {
  facil: { label: 'Fácil', cls: 'text-green-600' },
  medio: { label: 'Médio', cls: 'text-amber-600' },
  dificil: { label: 'Difícil', cls: 'text-red-600' },
}

export function AdicionarQuestoesDialog({
  bancoId,
  questoes,
  jaNoBanco,
  disciplinas,
}: {
  bancoId: string
  questoes: Questao[]
  jaNoBanco: string[]
  disciplinas: string[]
}) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [disc, setDisc] = useState('all')
  const [dif, setDif] = useState('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const noBanco = useMemo(() => new Set(jaNoBanco), [jaNoBanco])

  const discItems = useMemo(() => ({ all: 'Todas disciplinas', ...Object.fromEntries(disciplinas.map((d) => [d, d])) }), [disciplinas])
  const difItems = { all: 'Todas', facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    return questoes.filter((x) => {
      if (disc !== 'all' && x.disciplina !== disc) return false
      if (dif !== 'all' && x.nivel_dificuldade !== dif) return false
      if (q && !(`${x.enunciado} ${x.external_id ?? ''} ${x.disciplina ?? ''} ${x.assunto ?? ''}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [questoes, busca, disc, dif])

  function toggle(id: string) {
    if (noBanco.has(id)) return
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function adicionar() {
    if (sel.size === 0) return
    start(async () => {
      const r = await adicionarQuestoes(bancoId, [...sel])
      if (r.ok) { toast.success(`${r.adicionadas ?? 0} questão(ões) adicionada(s)`); window.location.assign(`/admin/banco-questoes/${bancoId}?tab=questoes`) }
      else toast.error(r.error ?? 'Erro')
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSel(new Set()) }}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" /> Adicionar questões
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Adicionar questões à pasta</DialogTitle>
          <DialogDescription>Selecione as questões do banco para adicionar a esta pasta.</DialogDescription>
        </DialogHeader>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 px-6 pt-4">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por enunciado, código, disciplina…" className="pl-8" />
          </div>
          <Select value={disc} onValueChange={(v) => setDisc(v ?? '')} items={discItems}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas disciplinas</SelectItem>
              {disciplinas.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
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
        </div>
        <p className="px-6 pb-1 pt-3 text-xs text-muted-foreground">{filtrados.length} questão(ões) disponível(is)</p>

        {/* Lista (tabela com rolagem lateral) */}
        <div className="min-h-0 flex-1 overflow-auto px-3">
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-44">Disciplina</TableHead>
                <TableHead>Questão</TableHead>
                <TableHead className="w-24 text-right">Dificuldade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Nenhuma questão encontrada.</TableCell></TableRow>
              ) : (
                filtrados.map((q) => {
                  const jaTem = noBanco.has(q.id)
                  const on = sel.has(q.id)
                  const enun = q.enunciado.length > 120 ? q.enunciado.slice(0, 120) + '…' : q.enunciado
                  const d = difCfg[q.nivel_dificuldade ?? '']
                  return (
                    <TableRow key={q.id} onClick={() => toggle(q.id)} className={cn(jaTem ? 'opacity-50' : 'cursor-pointer', on && 'bg-primary/5')}>
                      <TableCell>
                        <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border',
                          jaTem ? 'border-green-500 bg-green-500 text-white' : on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                          {(on || jaTem) && <Check className="h-3 w-3" />}
                        </span>
                      </TableCell>
                      <TableCell className="align-top">
                        <span className="flex flex-wrap items-center gap-1 text-xs">
                          {q.external_id && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground">#{q.external_id}</span>}
                          {q.disciplina && <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold uppercase text-primary">{q.disciplina}</span>}
                        </span>
                        {jaTem && <span className="mt-1 block text-xs font-medium text-green-600">já na pasta</span>}
                      </TableCell>
                      <TableCell className="align-top text-sm leading-relaxed">{enun}</TableCell>
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
      </DialogContent>
    </Dialog>
  )
}
