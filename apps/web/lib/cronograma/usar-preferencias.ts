'use client'

import { useEffect, useRef, useState } from 'react'
import { salvarPreferencias } from '@/app/aluno/(portal)/cronograma/preferencias-actions'
import { PREFERENCIAS_PADRAO, type PreferenciasEmissao } from '@/lib/cronograma/preferencias'

/**
 * O estado de leitura do aluno numa emissão, com gravação adiada.
 *
 * Vive num hook, e não dentro de um componente, porque os cartões do resumo e a lista de
 * semanas são IRMÃOS na tela — se cada um guardasse o seu, esconder um número numa parte não
 * apareceria na outra, e a gravação disputaria consigo mesma.
 *
 * A gravação espera 600 ms depois da última mudança: fechar dez semanas são dez cliques, e
 * uma ida ao servidor por clique só serviria para engasgar a tela. Falhar não atrapalha a
 * leitura — o aluno segue com a tela como deixou, só não persiste para a próxima visita.
 */
export function usarPreferencias(emissaoId: string | null, iniciais?: PreferenciasEmissao) {
  const [prefs, setPrefs] = useState<PreferenciasEmissao>(iniciais ?? PREFERENCIAS_PADRAO)
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null)
  const primeira = useRef(true)

  useEffect(() => {
    // A primeira renderização veio do banco; regravá-la seria uma ida à toa.
    if (primeira.current) {
      primeira.current = false
      return
    }
    if (!emissaoId) return
    if (gravacao.current) clearTimeout(gravacao.current)
    gravacao.current = setTimeout(() => void salvarPreferencias(emissaoId, prefs), 600)
    return () => {
      if (gravacao.current) clearTimeout(gravacao.current)
    }
  }, [prefs, emissaoId])

  /** Sem emissão salva não há onde gravar — a tela mostra tudo e não oferece os controles. */
  const persistente = !!emissaoId

  function alternarSemana(semana: number) {
    setPrefs((p) => {
      const set = new Set(p.semanasColapsadas)
      if (set.has(semana)) set.delete(semana)
      else set.add(semana)
      return { ...p, semanasColapsadas: [...set].sort((a, b) => a - b) }
    })
  }

  function definirSemanas(semanas: number[]) {
    setPrefs((p) => ({ ...p, semanasColapsadas: [...new Set(semanas)].sort((a, b) => a - b) }))
  }

  function alternarContagem() {
    setPrefs((p) => ({ ...p, ocultarContagem: !p.ocultarContagem }))
  }

  /** Esconde/mostra um dos números do topo ('semanas', 'dias', 'atividades', 'conclusao'). */
  function alternarResumo(chave: string) {
    setPrefs((p) => {
      const set = new Set(p.resumoOculto)
      if (set.has(chave)) set.delete(chave)
      else set.add(chave)
      return { ...p, resumoOculto: [...set] }
    })
  }

  return { prefs, persistente, alternarSemana, definirSemanas, alternarContagem, alternarResumo }
}
