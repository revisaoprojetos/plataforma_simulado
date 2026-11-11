'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { alternarAtivoAction } from './actions'
import { useAcao } from './ui-cursos'

// Botão liga/desliga do curso (lista e cabeçalho). Desativado = some para o aluno; o progresso fica guardado.
export function CursoAtivoSwitch({
  id, nome, ativo, desabilitado, comRotulo = 'lista',
}: { id: string; nome: string; ativo: boolean; desabilitado?: boolean; comRotulo?: 'lista' | 'cabecalho' }) {
  const [on, setOn] = useState(ativo)
  const [pendente, executar] = useAcao()
  function alternar(v: boolean) {
    const antes = on
    setOn(v)
    executar(
      async () => {
        const r = await alternarAtivoAction(id, v)
        if ('error' in r) setOn(antes)
        return r
      },
      v ? `${nome} está visível para os alunos` : `${nome} foi escondido dos alunos. O progresso fica guardado`,
    )
  }
  return (
    <>
      <Switch checked={on} onCheckedChange={alternar} disabled={desabilitado || pendente} aria-label={`${on ? 'Desativar' : 'Ativar'} ${nome}`} />
      {comRotulo === 'cabecalho' ? (
        <span className="text-sm font-bold">{on ? 'Ativo' : 'Desativado'}</span>
      ) : (
        <span className="text-xs text-muted-foreground">{on ? 'Visível para alunos' : 'Escondido'}</span>
      )}
    </>
  )
}
