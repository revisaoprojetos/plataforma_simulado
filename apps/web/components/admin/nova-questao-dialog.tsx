'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Upload, PencilLine, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ImportarQuestoesTab } from '@/components/admin/importar-questoes-tab'

export function NovaQuestaoDialog() {
  const [open, setOpen] = useState(false)
  const [modo, setModo] = useState<'criar' | 'importar'>('criar')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" /> Nova Questão
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Nova questão</DialogTitle>
          <DialogDescription>Crie uma questão manualmente ou importe várias de um arquivo.</DialogDescription>
        </DialogHeader>

        {/* Abas */}
        <div className="flex gap-1 px-6 pt-4">
          {([
            { k: 'criar', label: 'Criar questão', icon: PencilLine },
            { k: 'importar', label: 'Importar questões', icon: Upload },
          ] as const).map((t) => (
            <button key={t.k} type="button" onClick={() => setModo(t.k)}
              className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                modo === t.k ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {modo === 'importar' ? (
          <ImportarQuestoesTab bancoId={null} onDone={() => setOpen(false)} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><PencilLine className="h-7 w-7" /></span>
            <div>
              <p className="text-sm font-medium">Criar uma questão no formulário completo</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Enunciado, alternativas, gabarito, disciplina, banca, dificuldade e comentário do professor.</p>
            </div>
            <Link href="/admin/questoes/nova" className={cn(buttonVariants(), 'gap-1.5')}>
              Abrir formulário <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
