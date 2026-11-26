'use client'

import { useCallback, useState } from 'react'
import { AbasLinhaControlada } from '@/components/ui/abas-linha'
import MatrizDisciplinasView from './matriz-disciplinas'
import MetasPasta from './metas-pasta'

type Aba = 'matriz' | 'pasta'

/**
 * Área única "Disciplinas e metas": aba Matriz (disciplinas × tipos × pastas) | aba Por pasta (árvore da Biblioteca).
 * `?tab=matriz|pasta` e `?pasta=<id>` abrem direto; a troca de aba atualiza a URL sem recarregar a página (history.replaceState).
 */
export default function DisciplinasEMetas({ podeEditar, abaInicial, pastaInicial }: { podeEditar: boolean; abaInicial: Aba; pastaInicial: string | null }) {
  const [aba, setAba] = useState<Aba>(abaInicial)
  const [pasta, setPasta] = useState<string | null>(pastaInicial)
  const [busca, setBusca] = useState<string | undefined>(undefined)
  // Cada aba monta na 1ª visita e fica montada (preserva filtros/seleção ao alternar).
  const [visitadas, setVisitadas] = useState<Set<Aba>>(new Set([abaInicial]))

  const ir = useCallback((a: Aba, p?: string | null) => {
    setAba(a); setVisitadas((s) => new Set(s).add(a))
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href)
      u.searchParams.set('tab', a)
      if (a === 'pasta' && p) u.searchParams.set('pasta', p); else u.searchParams.delete('pasta')
      window.history.replaceState(null, '', u.toString())
    }
  }, [])

  return (
    <div className="space-y-4">
      <AbasLinhaControlada<Aba>
        aria-label="Disciplinas e metas"
        valor={aba}
        onChange={(v) => ir(v)}
        itens={[{ valor: 'matriz', label: 'Matriz' }, { valor: 'pasta', label: 'Por pasta' }]}
      />
      {visitadas.has('matriz') && (
        <div hidden={aba !== 'matriz'}>
          <MatrizDisciplinasView podeEditar={podeEditar} buscaInicial={busca} onVerPasta={(id) => { setPasta(id); ir('pasta', id) }} />
        </div>
      )}
      {visitadas.has('pasta') && (
        <div hidden={aba !== 'pasta'}>
          <MetasPasta key={pasta ?? 'sem'} podeEditar={podeEditar} pastaInicial={pasta} onVerNaMatriz={(nome) => { setBusca(nome); ir('matriz') }} />
        </div>
      )}
    </div>
  )
}
