'use client'

import { useState, useTransition, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { UserPlus, Upload, Download, Search, Check, Loader2, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { vincularEstudantes, importarEstudantesLote } from '@/app/admin/banco-questoes/estudantes-actions'

interface Aluno { id: string; nome: string; email?: string | null; telefone?: string | null; classificacao?: string | null; jaVinculado: boolean }

function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (c === ',' && !q) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur); return out
}
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim() })
    return row
  })
}

const MODELO = 'email,nome,telefone,documento,classificacao\njoao@exemplo.com,João Silva,11999990000,12345678900,normal\n'

export function AdicionarEstudantesDialog({ bancoId, alunos }: { bancoId: string; alunos: Aluno[] }) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

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
      if (r.ok) { toast.success(`${r.vinculados ?? 0} vinculado(s)`); window.location.assign(`/admin/banco-questoes/${bancoId}?tab=estudantes`) }
      else toast.error(r.error ?? 'Erro')
    })
  }

  function baixarModelo() {
    const url = URL.createObjectURL(new Blob([MODELO], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'modelo-estudantes.csv'; a.click(); URL.revokeObjectURL(url)
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ''))
      const mapped = rows.map((r) => ({ email: r.email, nome: r.nome, telefone: r.telefone, cpf: r.cpf || r.documento, classificacao: r.classificacao }))
      if (!mapped.some((r) => r.email)) { toast.error('CSV sem coluna "email" ou vazio.'); return }
      start(async () => {
        const res = await importarEstudantesLote(bancoId, mapped)
        if (res.ok) { toast.success(`${res.criados ?? 0} criado(s), ${res.vinculados ?? 0} vinculado(s)`); window.location.assign(`/admin/banco-questoes/${bancoId}?tab=estudantes`) }
        else toast.error(res.error ?? 'Erro ao importar')
      })
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSel(new Set()) }}>
      <DialogTrigger render={<Button />}>
        <UserPlus className="mr-2 h-4 w-4" /> Adicionar estudantes
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Adicionar estudantes</DialogTitle>
          <DialogDescription>Importe um arquivo CSV ou selecione estudantes já cadastrados na plataforma.</DialogDescription>
        </DialogHeader>

        {/* Upload CSV */}
        <div className="px-6 pt-4">
          <div className="rounded-lg border border-dashed p-5 text-center">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            <Upload className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="mb-1 text-sm text-muted-foreground">Colunas suportadas (CSV): <code className="text-xs">email*</code>, nome, telefone, documento, classificacao</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={baixarModelo}><Download className="mr-2 h-4 w-4" /> Modelo CSV</Button>
              <Button type="button" onClick={() => fileRef.current?.click()} disabled={pending}>
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />} Selecionar arquivo
              </Button>
            </div>
          </div>
        </div>

        {/* Tabela de estudantes existentes */}
        <div className="flex items-center justify-between gap-3 px-6 pb-2 pt-4">
          <p className="text-sm font-medium">Estudantes da plataforma ({alunos.length})</p>
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="pl-8" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3">
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum estudante.</TableCell></TableRow>
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
                      <TableCell className="text-muted-foreground">{a.jaVinculado ? <Badge className="bg-green-600">já vinculado</Badge> : (a.telefone ?? '—')}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t px-6 py-3">
          <span className="text-sm text-muted-foreground">{sel.size === 0 ? 'Nenhum estudante selecionado' : `${sel.size} selecionado(s)`}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={vincular} disabled={pending || sel.size === 0}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Vincular
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
