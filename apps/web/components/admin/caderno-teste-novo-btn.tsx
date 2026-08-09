'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { criarCadernoTesteNoBanco } from '@/app/admin/cadernos-teste/actions'

/** Cria um caderno de teste vinculado ao banco e já abre o editor. */
export function NovoCadernoTesteBtn({ bancoId }: { bancoId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button size="sm" disabled={pending} onClick={() => start(async () => {
      const r = await criarCadernoTesteNoBanco(bancoId)
      if (r.ok && r.id) { toast.success('Caderno de teste criado'); router.push(`/admin/cadernos-teste/${r.id}`) }
      else toast.error(r.error ?? 'Erro ao criar')
    })}>
      {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Novo
    </Button>
  )
}
