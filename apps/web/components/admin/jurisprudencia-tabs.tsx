import { AbasLinha } from '@/components/ui/abas-linha'

export type JurisTab = 'dias' | 'config' | 'designer' | 'acessos' | 'medalhas' | 'ranking' | 'relatorio'

const TABS: { id: JurisTab; label: string }[] = [
  { id: 'dias', label: 'Dias & Teses' },
  { id: 'config', label: 'Configurações' },
  { id: 'designer', label: 'Designer' },
  { id: 'acessos', label: 'Acessos' },
  { id: 'medalhas', label: 'Medalhas' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'relatorio', label: 'Relatório' },
]

// Barra de abas do desafio (padrão único AbasLinha), navega por ?aba=.
export function JurisTabsBar({ desafioId, abaAtual }: { desafioId: string; abaAtual: JurisTab }) {
  return (
    <AbasLinha
      ativo={abaAtual}
      itens={TABS.map((t) => ({ key: t.id, label: t.label, href: `/admin/jurisprudencia?desafio=${desafioId}&aba=${t.id}` }))}
    />
  )
}
