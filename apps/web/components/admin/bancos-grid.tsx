'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { BancoCard } from '@/components/admin/banco-card'
import { Database, Search } from 'lucide-react'

type Banco = { id: string; nome: string; total: number; cor?: string | null; icone?: string | null; capa?: string | null }

export function BancosGrid({ bancos }: { bancos: Banco[] }) {
  const [busca, setBusca] = useState('')

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? bancos.filter((b) => b.nome.toLowerCase().includes(q)) : bancos
  }, [bancos, busca])

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar banco…" className="pl-9" />
      </div>

      {bancos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Database className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhum banco ainda. Crie o primeiro em “Criar banco”.</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">Nenhum banco encontrado para “{busca}”.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtrados.map((b) => (
            <BancoCard key={b.id} id={b.id} nome={b.nome} total={b.total} cor={b.cor} icone={b.icone} capa={b.capa} />
          ))}
        </div>
      )}
    </div>
  )
}
