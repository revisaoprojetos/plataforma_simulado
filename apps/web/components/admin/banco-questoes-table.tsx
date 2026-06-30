'use client'

import { useState, useTransition, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Check, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { removerQuestoes } from '@/app/admin/banco-questoes/actions'

interface Q { id: string; enunciado: string; nivel_dificuldade?: string | null; status?: string | null; disciplina?: string | null; assunto?: string | null }

const difCfg: Record<string, { letra: string; cls: string }> = {
  facil: { letra: 'F', cls: 'text-green-600' },
  medio: { letra: 'M', cls: 'text-amber-600' },
  dificil: { letra: 'D', cls: 'text-red-600' },
}
const statusCfg: Record<string, { label: string; cls: string }> = {
  publicada: { label: 'Ativa', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  rascunho: { label: 'Rascunho', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  arquivada: { label: 'Arquivada', cls: 'bg-muted text-muted-foreground' },
}

export function BancoQuestoesTable({ bancoId, questoes, acao }: { bancoId: string; questoes: Q[]; acao?: React.ReactNode }) {
  const [busca, setBusca] = useState('')
  const [disc, setDisc] = useState('all')
  const [status, setStatus] = useState('all')
  const [dif, setDif] = useState('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()

  const disciplinas = useMemo(() => [...new Set(questoes.map((q) => q.disciplina).filter(Boolean))].sort() as string[], [questoes])
  const discItems = useMemo(() => ({ all: 'Todas matérias', ...Object.fromEntries(disciplinas.map((d) => [d, d])) }), [disciplinas])
  const statusItems = { all: 'Status', publicada: 'Ativa', rascunho: 'Rascunho', arquivada: 'Arquivada' }
  const difItems = { all: 'Dific.', facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }

  const filtradas = useMemo(() => {
    const q = busca.toLowerCase().trim()
    return questoes.filter((x) => {
      if (disc !== 'all' && x.disciplina !== disc) return false
      if (status !== 'all' && x.status !== status) return false
      if (dif !== 'all' && x.nivel_dificuldade !== dif) return false
      if (q && !(`${x.enunciado} ${x.disciplina ?? ''} ${x.assunto ?? ''}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [questoes, busca, disc, status, dif])

  function toggle(id: string) {
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSel((p) => p.size === filtradas.length ? new Set() : new Set(filtradas.map((q) => q.id)))
  }
  function remover() {
    if (sel.size === 0) return
    start(async () => {
      const r = await removerQuestoes(bancoId, [...sel])
      if (r.ok) { toast.success(`${sel.size} questão(ões) removida(s)`); window.location.assign(`/admin/banco-questoes/${bancoId}?tab=questoes`) }
      else toast.error(r.error ?? 'Erro')
    })
  }

  return (
    <Card className="overflow-hidden">
      {/* Linha 1: busca + remover + adicionar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 pt-0 pb-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar enunciado, assunto…" className="pl-8" />
        </div>
        {sel.size > 0 && (
          <Button variant="destructive" size="sm" onClick={remover} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Remover {sel.size}
          </Button>
        )}
        {acao}
      </div>

      {/* Linha 2: filtros */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 pt-0 pb-3">
        <Select value={disc} onValueChange={(v) => setDisc(v ?? '')} items={discItems}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas matérias</SelectItem>
            {disciplinas.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v ?? '')} items={statusItems}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="publicada">Ativa</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="arquivada">Arquivada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dif} onValueChange={(v) => setDif(v ?? '')} items={difItems}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas dific.</SelectItem>
            <SelectItem value="facil">Fácil</SelectItem>
            <SelectItem value="medio">Médio</SelectItem>
            <SelectItem value="dificil">Difícil</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <CardContent className="p-0">
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-10">
                  <button type="button" onClick={toggleAll} className={cn('flex h-4 w-4 items-center justify-center rounded border',
                    filtradas.length > 0 && sel.size === filtradas.length ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                    {filtradas.length > 0 && sel.size === filtradas.length && <Check className="h-3 w-3" />}
                  </button>
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Enunciado</TableHead>
                <TableHead className="w-44">Disciplina</TableHead>
                <TableHead className="w-48">Assunto</TableHead>
                <TableHead className="w-12 text-center">Dif.</TableHead>
                <TableHead className="w-20">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Nenhuma questão.</TableCell></TableRow>
              ) : (
                filtradas.map((q, i) => {
                  const on = sel.has(q.id)
                  const d = difCfg[q.nivel_dificuldade ?? '']
                  const st = statusCfg[q.status ?? ''] ?? { label: q.status ?? '—', cls: 'bg-muted text-muted-foreground' }
                  const enun = q.enunciado.length > 70 ? q.enunciado.slice(0, 70) + '…' : q.enunciado
                  return (
                    <TableRow key={q.id} onClick={() => toggle(q.id)} className={cn('cursor-pointer', on && 'bg-primary/5')}>
                      <TableCell>
                        <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-sm">{enun}</TableCell>
                      <TableCell className="text-xs font-medium uppercase text-muted-foreground">{q.disciplina ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{q.assunto ?? '—'}</TableCell>
                      <TableCell className="text-center font-bold">{d ? <span className={d.cls}>{d.letra}</span> : '—'}</TableCell>
                      <TableCell><span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', st.cls)}>{st.label}</span></TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </table>
        </div>
        <div className="border-t px-4 py-2 text-right text-xs text-muted-foreground">{questoes.length} {questoes.length === 1 ? 'questão' : 'questões'}</div>
      </CardContent>
    </Card>
  )
}
