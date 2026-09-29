'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ListOrdered, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { salvarRegraSequencialModulo } from '@/app/admin/leitura/actions'
import { useRegistrarSalvavel } from '@/components/admin/config-modulo-salvar'

/**
 * REGRA SEQUENCIAL da trilha do módulo. LIGADO = o aluno só abre o próximo dia depois de concluir o
 * anterior (leitura + quiz) — desbloqueio rígido, um nó por vez, validado no servidor. DESLIGADO
 * (padrão) = liberdade total: o aluno faz os dias em qualquer ordem (só continua limitado a dias não
 * liberados/agendados). Salva junto com o "Salvar" da aba de configuração do módulo.
 */
export function ModuloRegraSequencialForm({ pastaId, atual }: { pastaId: string; atual: boolean }) {
  const [ativo, setAtivo] = useState(!!atual)
  const [salvando, setSalvando] = useState(false)
  const baseRef = useRef(!!atual)
  const dirty = ativo !== baseRef.current

  async function salvar(): Promise<boolean> {
    setSalvando(true)
    const r = await salvarRegraSequencialModulo(pastaId, ativo)
    setSalvando(false)
    if (r.ok) { baseRef.current = ativo; return true }
    toast.error(r.error ?? 'Erro ao salvar a regra sequencial.'); return false
  }
  const dentroProvider = useRegistrarSalvavel(`${pastaId}:regra-sequencial`, dirty, salvar)
  async function salvarSozinho() { if (await salvar()) toast.success('Regra da trilha salva') }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <button type="button" onClick={() => setAtivo((v) => !v)} className="flex w-full items-start gap-3 text-left">
        <span className={cn('mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors', ativo ? 'bg-primary' : 'bg-muted')}>
          <span className={cn('h-5 w-5 rounded-full bg-white shadow transition-transform', ativo && 'translate-x-5')} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold"><ListOrdered className="h-4 w-4 text-primary" /> Regra sequencial da trilha</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {ativo
              ? 'LIGADO — o aluno só abre o próximo dia depois de concluir o anterior (leitura + quiz). Validado no servidor: não dá pra pular a ordem.'
              : 'DESLIGADO (padrão) — liberdade total: o aluno faz os dias em qualquer ordem. Continua limitado só a dias não liberados/agendados.'}
          </span>
        </span>
      </button>
      {!dentroProvider && (
        <div className="flex justify-end">
          <button type="button" onClick={salvarSozinho} disabled={salvando || !dirty}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
          </button>
        </div>
      )}
    </div>
  )
}
