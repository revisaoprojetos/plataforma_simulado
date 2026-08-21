'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { criarDocumento } from '@/app/admin/leitura/actions'

/** Cria um documento vazio e abre o editor. */
export function NovoDocumentoButton() {
  const [pending, start] = useTransition()
  const router = useRouter()
  function criar() {
    start(async () => {
      const r = await criarDocumento('Novo documento')
      if (r.ok && r.id) router.push(`/admin/leitura/${r.id}`)
      else toast.error(r.error ?? 'Erro ao criar.')
    })
  }
  return (
    <button onClick={criar} disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Novo documento
    </button>
  )
}
