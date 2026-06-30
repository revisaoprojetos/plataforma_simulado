'use client'

import { useState, useTransition, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Check, UserPlus, Search, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { vincularEstudantes } from '@/app/admin/banco-questoes/estudantes-actions'

interface Aluno { id: string; nome: string; email?: string | null; telefone?: string | null; classificacao?: string | null; jaVinculado: boolean }

export function SelecionarEstudantesClient({ bancoId, alunos }: { bancoId: string; alunos: Aluno[] }) {
  const [pending, start] = useTransition()
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    return q ? alunos.filter((a) => a.nome.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q)) : alunos
  }, [busca, alunos])

  function toggle(a: Aluno) {
    if (a.jaVinculado) return
    setSel((p) => { const n = new Set(p); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n })
  }

  function vincular() {
    if (sel.size === 0) { toast.error('Selecione ao menos um estudante.'); return }
    start(async () => {
      const r = await vincularEstudantes(bancoId, [...sel])
      if (r.ok) { toast.success(`${r.vinculados ?? 0} estudante(s) vinculado(s)`); window.location.assign(`/admin/banco-questoes/${bancoId}?tab=estudantes`) }
      else toast.error(r.error ?? 'Erro')
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Estudantes da plataforma ({alunos.length})</CardTitle>
        <div className="relative w-64 max-w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="pl-8" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Classificação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhum estudante encontrado.</TableCell></TableRow>
            ) : (
              filtrados.map((a) => {
                const on = sel.has(a.id)
                return (
                  <TableRow key={a.id} onClick={() => toggle(a)} className={cn(!a.jaVinculado && 'cursor-pointer', on && 'bg-primary/5')}>
                    <TableCell>
                      <span className={cn('flex h-5 w-5 items-center justify-center rounded border',
                        a.jaVinculado ? 'border-green-500 bg-green-500 text-white' : on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                        {(on || a.jaVinculado) && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{a.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{a.email ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{a.telefone ?? '—'}</TableCell>
                    <TableCell>{a.jaVinculado ? <Badge className="bg-green-600">já vinculado</Badge> : <span className="text-muted-foreground">{a.classificacao ?? '—'}</span>}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
      {sel.size > 0 && (
        <div className="sticky bottom-4 z-10 flex justify-center p-3">
          <Button size="lg" className="shadow-lg" onClick={vincular} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Vincular {sel.size} ao banco
          </Button>
        </div>
      )}
    </Card>
  )
}
