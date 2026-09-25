'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Check, UserPlus, Search, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { vincularEstudantes, buscarEstudantesLote } from '@/app/admin/banco-questoes/estudantes-actions'

interface Aluno { id: string; nome: string; email?: string | null; telefone?: string | null; classificacao?: string | null; jaVinculado: boolean }

const POR_PAGINA = 20

/**
 * Seletor de estudantes com busca/paginação NO SERVIDOR (egress: não traz os ~19k de uma vez).
 * A seleção vive num `Set<id>` que persiste entre páginas/buscas — como só há toggle individual
 * (sem "selecionar todos"), selecionar por id cruzando páginas é seguro.
 */
export function SelecionarEstudantesClient({ bancoId, alunos, total }: { bancoId: string; alunos: Aluno[]; total: number }) {
  const [pending, start] = useTransition()
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [rows, setRows] = useState<Aluno[]>(alunos)
  const [totalAtual, setTotalAtual] = useState(total)
  const [carregando, setCarregando] = useState(false)
  const [maisCarregando, setMaisCarregando] = useState(false)
  const router = useRouter()
  const reqId = useRef(0) // descarta respostas fora de ordem (busca rápida)

  // Busca no servidor com debounce (reseta para a 1ª página).
  useEffect(() => {
    const termo = busca.trim()
    const id = ++reqId.current
    // Estado inicial (sem busca) já veio do server → evita refetch redundante no 1º render.
    if (termo === '' && rows === alunos) return
    setCarregando(true)
    const t = setTimeout(async () => {
      const r = await buscarEstudantesLote(bancoId, { busca: termo, offset: 0, limit: POR_PAGINA })
      if (id !== reqId.current) return // resposta obsoleta
      if (r.ok) { setRows(r.rows ?? []); setTotalAtual(r.total ?? 0) }
      setCarregando(false)
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  const carregarMais = useCallback(async () => {
    setMaisCarregando(true)
    const r = await buscarEstudantesLote(bancoId, { busca: busca.trim(), offset: rows.length, limit: POR_PAGINA })
    if (r.ok) { setRows((p) => [...p, ...(r.rows ?? [])]); setTotalAtual(r.total ?? totalAtual) }
    setMaisCarregando(false)
  }, [bancoId, busca, rows.length, totalAtual])

  function toggle(a: Aluno) {
    if (a.jaVinculado) return
    setSel((p) => { const n = new Set(p); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n })
  }

  function vincular() {
    if (sel.size === 0) { toast.error('Selecione ao menos um estudante.'); return }
    start(async () => {
      const r = await vincularEstudantes(bancoId, [...sel])
      if (r.ok) { toast.success(`${r.vinculados ?? 0} estudante(s) vinculado(s)`); setSel(new Set()); router.refresh() }
      else toast.error(r.error ?? 'Erro')
    })
  }

  const temMais = rows.length < totalAtual

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Estudantes da plataforma ({totalAtual.toLocaleString('pt-BR')})</CardTitle>
        <div className="relative w-64 max-w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou e-mail…" className="pl-8" />
          {carregando && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
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
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{carregando ? 'Buscando…' : 'Nenhum estudante encontrado.'}</TableCell></TableRow>
            ) : (
              rows.map((a) => {
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
        {temMais && (
          <div className="flex justify-center p-3">
            <Button variant="outline" size="sm" onClick={carregarMais} disabled={maisCarregando}>
              {maisCarregando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Carregar mais ({(totalAtual - rows.length).toLocaleString('pt-BR')} restantes)
            </Button>
          </div>
        )}
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
