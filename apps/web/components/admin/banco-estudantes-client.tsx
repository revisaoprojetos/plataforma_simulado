'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Check, Eye, Trash2, Loader2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { desvincularEstudante } from '@/app/admin/banco-questoes/estudantes-actions'
import { AdicionarEstudantesDialog } from '@/components/admin/adicionar-estudantes-dialog'
import { AdicionarGrupoBancoDialog, type GrupoOpc } from '@/components/admin/adicionar-grupo-banco-dialog'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'

interface Aluno { id: string; nome: string; email?: string | null; telefone?: string | null; cpf?: string | null; classificacao?: string | null; ultimo_acesso?: string | null }

function iniciais(n: string) {
  return n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')
}
interface AlunoSel { id: string; nome: string; email?: string | null; telefone?: string | null; classificacao?: string | null; jaVinculado: boolean }

function fmtAcesso(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

export function BancoEstudantesClient({ bancoId, vinculados, alunos, grupos = [], cor = '#6d28d9' }: { bancoId: string; vinculados: Aluno[]; alunos: AlunoSel[]; grupos?: GrupoOpc[]; cor?: string }) {
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    return q ? vinculados.filter((a) => a.nome.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q)) : vinculados
  }, [busca, vinculados])

  function toggle(id: string) {
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSel((p) => p.size === filtrados.length ? new Set() : new Set(filtrados.map((a) => a.id)))
  }
  function desvincular() {
    if (sel.size === 0) return
    start(async () => {
      for (const id of sel) await desvincularEstudante(bancoId, id)
      toast.success(`${sel.size} aluno(s) desvinculado(s)`)
      window.location.assign(`/admin/banco-questoes/${bancoId}?tab=estudantes`)
    })
  }

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
      {/* Cabeçalho da seção */}
      <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` }}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><Users className="h-5 w-5" /></span>
        <div>
          <h3 className="text-sm font-semibold leading-tight">Estudantes vinculados</h3>
          <p className="text-xs text-muted-foreground">{vinculados.length} aluno(s) neste banco</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 pb-3 pt-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail…" className="pl-8" />
        </div>
        {sel.size > 0 && (
          <Button variant="destructive" size="sm" onClick={desvincular} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Desvincular {sel.size}
          </Button>
        )}
        <AdicionarGrupoBancoDialog bancoId={bancoId} grupos={grupos} />
        <AdicionarEstudantesDialog bancoId={bancoId} alunos={alunos} />
      </div>

      <CardContent className="p-0">
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-10">
                  <button type="button" onClick={toggleAll} className={cn('flex h-4 w-4 items-center justify-center rounded border',
                    filtrados.length > 0 && sel.size === filtrados.length ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                    {filtrados.length > 0 && sel.size === filtrados.length && <Check className="h-3 w-3" />}
                  </button>
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead className="w-16 text-center">Perfil</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhum aluno vinculado. Clique em “Adicionar estudantes”.</TableCell></TableRow>
              ) : (
                filtrados.map((a) => {
                  const on = sel.has(a.id)
                  return (
                    <TableRow key={a.id} className={cn(on && 'bg-primary/5')}>
                      <TableCell onClick={() => toggle(a.id)} className="cursor-pointer">
                        <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: `${cor}1a`, color: cor }}>{iniciais(a.nome)}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium">{a.nome}</span>
                              <ClassificacaoBadge classificacao={a.classificacao} />
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{a.email ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{a.cpf ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtAcesso(a.ultimo_acesso)}</TableCell>
                      <TableCell className="text-center">
                        <Link href={`/admin/estudantes/${a.id}`} className="inline-flex text-muted-foreground hover:text-primary" title="Ver perfil">
                          <Eye className="h-4 w-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </table>
        </div>
        <div className="border-t px-4 py-2 text-right text-xs text-muted-foreground">{vinculados.length} membro(s)</div>
      </CardContent>
    </Card>
  )
}
