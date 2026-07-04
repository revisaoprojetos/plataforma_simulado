'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { EditarEstudanteDialog } from '@/components/admin/editar-estudante-dialog'

type Estudante = {
  id: string
  nome: string
  email: string | null
  cpf: string | null
  telefone: string | null
  data_nascimento: string | null
  classificacao: string | null
  matricula_externa: string | null
  created_at: string | null
}

export function EditarEstudanteButton({ estudante }: { estudante: Estudante }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border bg-card/60 px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:border-primary hover:text-primary">
        <Pencil className="h-4 w-4" /> Editar
      </button>
      {open && <EditarEstudanteDialog estudante={estudante} onClose={() => setOpen(false)} />}
    </>
  )
}
