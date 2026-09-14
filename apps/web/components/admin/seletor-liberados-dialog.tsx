'use client'

import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Check, Loader2, X, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buscarEstudantesLiberacao } from '@/app/admin/sistema/actions'
import { listarAdministradores } from '@/app/admin/administradores/actions'

export type PessoaItem = { id: string; nome: string; email: string | null }

/**
 * Diálogo "Quem pode visualizar" — escolhe o allowlist de uma área em manutenção.
 * `modo='admin'` lista os administradores do tenant; `modo='estudante'` busca alunos sob demanda.
 * NÃO salva sozinho: devolve os ids/itens escolhidos em `onConfirmar` (o form persiste).
 */
export function SeletorLiberadosDialog({
  open, onOpenChange, modo, titulo, descricao, selecionadosIniciais, nomesIniciais, onConfirmar,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  modo: 'admin' | 'estudante'
  titulo: string
  descricao?: string
  selecionadosIniciais: string[]
  nomesIniciais: PessoaItem[]
  onConfirmar: (ids: string[], itens: PessoaItem[]) => void
}) {
  const [sel, setSel] = useState<Map<string, PessoaItem>>(new Map())
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<PessoaItem[]>([])
  const [carregando, setCarregando] = useState(false)

  // Semeia a seleção ao abrir (usa os nomes já resolvidos p/ os chips).
  useEffect(() => {
    if (!open) return
    const m = new Map<string, PessoaItem>()
    for (const id of selecionadosIniciais) {
      const achado = nomesIniciais.find((n) => n.id === id)
      m.set(id, achado ?? { id, nome: 'Selecionado', email: null })
    }
    setSel(m)
    setBusca('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega os resultados (admins = lista filtrada no cliente; estudantes = busca no servidor).
  useEffect(() => {
    if (!open) return
    setCarregando(true)
    const t = setTimeout(async () => {
      try {
        if (modo === 'admin') {
          const r = await listarAdministradores()
          const itens: PessoaItem[] = (r.membros ?? []).map((m) => ({ id: m.userId, nome: m.nome ?? m.email ?? 'Administrador', email: m.email }))
          const q = busca.trim().toLowerCase()
          setResultados(q ? itens.filter((i) => i.nome.toLowerCase().includes(q) || (i.email ?? '').toLowerCase().includes(q)) : itens)
        } else {
          const itens = await buscarEstudantesLiberacao(busca.trim())
          setResultados(itens)
        }
      } catch { setResultados([]) }
      setCarregando(false)
    }, modo === 'estudante' ? 300 : 0)
    return () => clearTimeout(t)
  }, [open, busca, modo])

  function toggle(it: PessoaItem) {
    setSel((prev) => {
      const m = new Map(prev)
      if (m.has(it.id)) m.delete(it.id)
      else m.set(it.id, it)
      return m
    })
  }

  const escolhidos = [...sel.values()]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao ?? 'Estas pessoas continuam vendo a área mesmo em manutenção.'}</DialogDescription>
        </DialogHeader>

        {/* Chips dos selecionados */}
        {escolhidos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {escolhidos.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                {p.nome}
                <button type="button" onClick={() => toggle(p)} className="rounded-full p-0.5 hover:bg-primary/20" aria-label={`Remover ${p.nome}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Busca */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={modo === 'admin' ? 'Filtrar administradores…' : 'Buscar aluno por nome, e-mail ou CPF…'} className="pl-8" />
        </div>

        {/* Resultados */}
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : resultados.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-8 text-center text-sm text-muted-foreground"><Users className="h-5 w-5" /> {modo === 'admin' ? 'Nenhum administrador.' : 'Nenhum aluno encontrado.'}</div>
          ) : (
            resultados.map((it) => {
              const on = sel.has(it.id)
              return (
                <button key={it.id} type="button" onClick={() => toggle(it)}
                  className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors', on ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{it.nome}</span>
                    {it.email && <span className="block truncate text-xs text-muted-foreground">{it.email}</span>}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => { onConfirmar([...sel.keys()], escolhidos); onOpenChange(false) }}>
            Salvar ({escolhidos.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
