'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Boxes, Plus, Search, Users, Loader2, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PRODUTO_TIPOS, type Produto, type ProdutoTipo } from '@/lib/produtos/tipos'
import { salvarProdutoAction } from './actions'

type Row = Produto & { membros: number; fontes: number; itens: number }
const labelTipo = (t: string) => PRODUTO_TIPOS.find((x) => x.v === t)?.label ?? t
const labelValidade = (p: Produto) =>
  p.validade_tipo === 'vitalicio' ? 'Vitalício'
  : p.validade_tipo === 'dias' ? `${p.validade_dias ?? 0} dias`
  : p.validade_data ? new Date(p.validade_data).toLocaleDateString('pt-BR') : 'Data fixa'

export function ProdutosClient({ produtosIniciais, podeEditar }: { produtosIniciais: Row[]; podeEditar: boolean }) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<'todos' | ProdutoTipo>('todos')
  const [criando, setCriando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [pending, start] = useTransition()

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return produtosIniciais.filter((p) =>
      (tipo === 'todos' || p.tipo === tipo) && (!q || p.nome.toLowerCase().includes(q)))
  }, [produtosIniciais, busca, tipo])

  function criar() {
    const nome = novoNome.trim()
    if (!nome) return
    start(async () => {
      const r = await salvarProdutoAction({ nome, tipo: 'extensivo' })
      if ('error' in r && r.error) { toast.error(r.error); return }
      router.push(`/admin/produtos/${(r as { id: string }).id}`)
    })
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Produtos / Extensivos</h1>
            <p className="text-sm text-muted-foreground">Pacotes que liberam conteúdo, videoaulas e simulados — de integrações (Curseduca/Guru) ou gestão manual.</p>
          </div>
        </div>
        {podeEditar && !criando && (
          <Button onClick={() => setCriando(true)}><Plus className="h-4 w-4" />Novo produto</Button>
        )}
      </div>

      {criando && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <label className="mb-2 block text-sm font-semibold">Nome do novo produto</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input autoFocus value={novoNome} onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); criar() } }}
              placeholder="Ex.: Extensivo Advocacia Pública 2026" disabled={pending} />
            <Button onClick={criar} disabled={pending || !novoNome.trim()}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Criar e configurar
            </Button>
            <Button variant="ghost" onClick={() => { setCriando(false); setNovoNome('') }} disabled={pending}>Cancelar</Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto…" className="pl-9" />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} className="h-9 rounded-lg border bg-background px-3 text-sm">
          <option value="todos">Todos os tipos</option>
          {PRODUTO_TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {filtrados.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {produtosIniciais.length === 0 ? 'Nenhum produto ainda. Crie o primeiro.' : 'Nenhum produto corresponde ao filtro.'}
          </div>
        ) : (
          <ul className="divide-y">
            {filtrados.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => router.push(`/admin/produtos/${p.id}`)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50">
                  <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: p.cor || 'var(--primary)' }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.nome}</span>
                      {!p.ativo && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">inativo</span>}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{labelTipo(p.tipo)}</span>
                      <span>· {labelValidade(p)}</span>
                      {p.tier !== 'normal' && <span>· {p.tier}</span>}
                      <span>· {p.fontes} fonte(s)</span>
                      <span>· {p.itens} item(ns)</span>
                    </span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1.5 text-sm text-muted-foreground sm:flex">
                    <Users className="h-4 w-4" />{p.membros}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
