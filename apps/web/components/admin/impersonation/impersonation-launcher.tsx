'use client'

import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImpersonationOverlay } from './impersonation-overlay'

/** Botão "Ver como aluno" no perfil do estudante. Só aparece se o admin tiver permissão
 *  (consulta /my-permissions). Abre a janela flutuante de visualização (somente leitura). */
export function ImpersonationLauncher({ estudanteId, estudanteNome }: { estudanteId: string; estudanteNome: string }) {
  const [pode, setPode] = useState<boolean | null>(null)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    let vivo = true
    fetch('/api/admin/impersonate/my-permissions')
      .then((r) => r.json())
      .then((d) => { if (vivo) setPode(!!d?.scope) })
      .catch(() => { if (vivo) setPode(false) })
    return () => { vivo = false }
  }, [])

  if (!pode) return null

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <Eye className="mr-2 h-4 w-4" /> Ver como aluno
      </Button>
      {aberto && <ImpersonationOverlay estudanteId={estudanteId} estudanteNome={estudanteNome} onClose={() => setAberto(false)} />}
    </>
  )
}
