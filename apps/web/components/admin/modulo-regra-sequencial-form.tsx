'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ListOrdered, Lock, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { salvarRegraSequencialModulo, salvarQuizRefazerModulo } from '@/app/admin/leitura/actions'
import { useRegistrarSalvavel } from '@/components/admin/config-modulo-salvar'

/**
 * Regras do módulo de leitura (2 toggles):
 *  - REGRA SEQUENCIAL: LIGADO = o aluno só abre o próximo dia depois de concluir o anterior
 *    (validado no servidor). DESLIGADO (padrão) = liberdade total (qualquer ordem).
 *  - BLOQUEAR REFAZER: LIGADO = depois de responder, a questão não pode ser re-respondida (o aluno
 *    não refaz o quiz). DESLIGADO (padrão) = pode refazer. Salva junto com o "Salvar" da aba Config.
 */
export function ModuloRegraSequencialForm({ pastaId, atual, refazerBloqueado }: { pastaId: string; atual: boolean; refazerBloqueado: boolean }) {
  const [seq, setSeq] = useState(!!atual)
  const [semRefazer, setSemRefazer] = useState(!!refazerBloqueado)
  const [salvando, setSalvando] = useState(false)
  const baseSeq = useRef(!!atual)
  const baseRef2 = useRef(!!refazerBloqueado)
  const dirty = seq !== baseSeq.current || semRefazer !== baseRef2.current

  async function salvar(): Promise<boolean> {
    setSalvando(true)
    let ok = true
    if (seq !== baseSeq.current) { const r = await salvarRegraSequencialModulo(pastaId, seq); if (r.ok) baseSeq.current = seq; else { ok = false; toast.error(r.error ?? 'Erro ao salvar a regra sequencial.') } }
    if (semRefazer !== baseRef2.current) { const r = await salvarQuizRefazerModulo(pastaId, semRefazer); if (r.ok) baseRef2.current = semRefazer; else { ok = false; toast.error(r.error ?? 'Erro ao salvar o bloqueio de refazer.') } }
    setSalvando(false)
    return ok
  }
  const dentroProvider = useRegistrarSalvavel(`${pastaId}:regras-modulo`, dirty, salvar)
  async function salvarSozinho() { if (await salvar()) toast.success('Regras salvas') }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      {/* Toggle 1 — regra sequencial */}
      <button type="button" onClick={() => setSeq((v) => !v)} className="flex w-full items-start gap-3 text-left">
        <span className={cn('mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors', seq ? 'bg-primary' : 'bg-muted')}>
          <span className={cn('h-5 w-5 rounded-full bg-white shadow transition-transform', seq && 'translate-x-5')} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold"><ListOrdered className="h-4 w-4 text-primary" /> Regra sequencial da trilha</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {seq
              ? 'LIGADO — o aluno só abre o próximo dia depois de concluir o anterior (leitura + quiz). Validado no servidor.'
              : 'DESLIGADO (padrão) — liberdade total: o aluno faz os dias em qualquer ordem.'}
          </span>
        </span>
      </button>

      <div className="border-t" />

      {/* Toggle 2 — bloquear refazer o quiz */}
      <button type="button" onClick={() => setSemRefazer((v) => !v)} className="flex w-full items-start gap-3 text-left">
        <span className={cn('mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors', semRefazer ? 'bg-primary' : 'bg-muted')}>
          <span className={cn('h-5 w-5 rounded-full bg-white shadow transition-transform', semRefazer && 'translate-x-5')} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold"><Lock className="h-4 w-4 text-primary" /> Bloquear refazer o quiz</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {semRefazer
              ? 'LIGADO — depois de responder, o aluno NÃO pode refazer o quiz (as respostas ficam travadas).'
              : 'DESLIGADO (padrão) — o aluno pode refazer o quiz normalmente.'}
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
