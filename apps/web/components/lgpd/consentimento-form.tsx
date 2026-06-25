'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { aceitarConsentimento } from '@/app/lgpd/consentimento/actions'
import { toast } from 'sonner'

interface Props {
  userId: string
  versao: string
  redirectTo: string
}

export function ConsentimentoForm({ userId, versao, redirectTo }: Props) {
  const [checked, setChecked] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit() {
    if (!checked) return
    startTransition(async () => {
      const result = await aceitarConsentimento(userId, versao)
      if (result.ok) {
        router.push(redirectTo)
      } else {
        toast.error(result.error ?? 'Erro ao registrar consentimento')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="consent"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-input accent-primary cursor-pointer"
        />
        <Label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer">
          Li e aceito a Política de Privacidade (versão {versao}). Compreendo meus direitos sob a
          Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
        </Label>
      </div>

      <Button
        className="w-full"
        disabled={!checked || isPending}
        onClick={handleSubmit}
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Aceitar e Continuar
      </Button>
    </div>
  )
}
