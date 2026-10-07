'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Upload, PencilLine, ArrowRight, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ImportarQuestoesTab } from '@/components/admin/importar-questoes-tab'
import { ImportarDePlataformaTab } from '@/components/admin/importar-de-plataforma-tab'

/** `podeImportarPlataforma` (super-admin) libera a aba "Plataformas" — importar questões de outro tenant. */
export function NovaQuestaoDialog({ podeImportarPlataforma = false }: { podeImportarPlataforma?: boolean }) {
  const [open, setOpen] = useState(false)
  const [modo, setModo] = useState<'criar' | 'importar' | 'plataformas'>('criar')

  const abas = [
    { k: 'criar', label: 'Criar questão', icon: PencilLine },
    { k: 'importar', label: 'Importar questões', icon: Upload },
    ...(podeImportarPlataforma ? [{ k: 'plataformas', label: 'Plataformas', icon: ArrowLeftRight }] : []),
  ] as const

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" /> Nova Questão
      </DialogTrigger>
      <DialogContent className={cn('flex max-h-[85vh] w-full flex-col gap-0 p-0', modo === 'plataformas' ? 'sm:max-w-5xl' : 'sm:max-w-3xl')}>
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Nova questão</DialogTitle>
          <DialogDescription>Crie uma questão manualmente, importe de um arquivo{podeImportarPlataforma ? ' ou traga de outra plataforma' : ''}.</DialogDescription>
        </DialogHeader>

        {/* Abas */}
        <div className="flex gap-1 px-6 pt-4">
          {abas.map((t) => (
            <button key={t.k} type="button" onClick={() => setModo(t.k as 'criar' | 'importar' | 'plataformas')}
              className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                modo === t.k ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {modo === 'importar' ? (
          <ImportarQuestoesTab bancoId={null} onDone={() => setOpen(false)} />
        ) : modo === 'plataformas' ? (
          <ImportarDePlataformaTab onDone={() => setOpen(false)} />
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
