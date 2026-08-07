'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pedirTexto } from '@/components/ui/confirm-dialog'
import { criarCadernoTeste } from '@/app/admin/cadernos/actions'

export function CriarCadernoTesteBtn() {
  const router = useRouter()
  const [criando, setCriando] = useState(false)
  async function criar() {
    const nome = (await pedirTexto({ titulo: 'Novo caderno (teste)', label: 'Nome', placeholder: 'ex.: Caderno de teste', confirmar: 'Criar' }))?.trim()
    if (!nome) return
    setCriando(true)
    try {
      const r = await criarCadernoTeste(nome)
      if (!r.ok || !r.id) { toast.error(r.error ?? 'Erro ao criar.'); return }
      router.push(`/admin/cadernos-teste/${r.id}`)
    } finally { setCriando(false) }
  }
  return (
    <Button onClick={criar} disabled={criando} size="sm">
      {criando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Criar caderno
    </Button>
  )
}
