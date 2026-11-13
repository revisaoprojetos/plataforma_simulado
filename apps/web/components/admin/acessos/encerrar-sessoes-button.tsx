'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'

/** "Encerrar todas as sessões do aluno": revoga os tokens já emitidos (rota de API com acessos:manage + auditoria). */
export function EncerrarSessoesButton({ estudanteId, nome }: { estudanteId: string; nome: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)

  async function acionar() {
    const ok = await confirmar({
      titulo: 'Encerrar todas as sessões?',
      mensagem: `${nome} será desconectada de todos os aparelhos em até 1 minuto e precisará entrar de novo. Atenção: o login da plataforma é leve (sem senha) — quem souber o e-mail${' '}(e CPF/telefone, se exigidos) consegue entrar novamente. Esta ação fica registrada na auditoria.`,
      confirmar: 'Encerrar sessões',
      destrutivo: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await fetch('/api/admin/acessos/encerrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estudante_id: estudanteId }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.message ?? 'Não foi possível encerrar as sessões.')
      toast.success(`Sessões encerradas (${j.sessoes ?? 0} registrada${j.sessoes === 1 ? '' : 's'}).`)
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button type="button" variant="destructive" size="sm" onClick={acionar} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      Encerrar todas as sessões
    </Button>
  )
}
