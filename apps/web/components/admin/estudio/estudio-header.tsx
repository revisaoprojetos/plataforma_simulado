import { ConteudosTabs } from '@/components/admin/conteudos-tabs'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'

// Cabeçalho padrão do Estúdio de Conteúdo (AUDITORIA 4.1): eyebrow + título + ações à direita
// e, ABAIXO, as abas da área (Produtos/Materiais/…). Delega ao <CabecalhoArea> (modelo único de início
// de área do admin — docs/modelo-inicio-de-area.md); só fixa o eyebrow padrão "Conteúdos" e as abas do Estúdio.
export function EstudioHeader({ eyebrow = 'Conteúdos', titulo, acoes, subtabs, semAbas = false }: {
  eyebrow?: string
  titulo: string
  acoes?: React.ReactNode
  /** Sub-abas da área (ex.: <MateriaisTabs/>), renderizadas abaixo das abas principais. */
  subtabs?: React.ReactNode
  /** Telas fora do Estúdio de Conteúdo (ex.: Segurança) não mostram as abas de Conteúdos. */
  semAbas?: boolean
}) {
  return (
    <CabecalhoArea
      eyebrow={eyebrow}
      titulo={titulo}
      acoes={acoes}
      abas={<>{!semAbas && <ConteudosTabs />}{subtabs}</>}
    />
  )
}
