'use client'

import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useImpersonationDock } from '@/components/admin/impersonation/impersonation-dock'
import type { AlunoBusca } from '@/app/admin/impersonation/actions'

/** Botão "Ver como aluno" no perfil do estudante. Usa o dock GLOBAL: abre a conta do aluno
 *  DIRETO em JANELA (flutuante) — persiste ao navegar e traz todas as opções (dividir/expandir/
 *  refresh/trocar). Só aparece se o admin tiver permissão. */
export function ImpersonationLauncher({ aluno }: { aluno: AlunoBusca }) {
  const dock = useImpersonationDock()
  if (!dock.podeAbrir) return null
  return (
    <Button variant="outline" onClick={() => { dock.abrir(aluno); dock.setModo('flutuante') }}>
      <Eye className="mr-2 h-4 w-4" /> Ver como aluno
    </Button>
  )
}
