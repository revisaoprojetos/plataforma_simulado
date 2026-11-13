import { ConteudosTabs } from '@/components/admin/conteudos-tabs'

// Cabeçalho padrão do Estúdio de Conteúdo (AUDITORIA 4.1): eyebrow + título + ações à direita
// e, ABAIXO, as abas da área (Produtos/Materiais/…). Todas as telas de topo usam este header,
// então o título sempre fica ACIMA das abas — como no designer.
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-[.2em]" style={{ color: 'var(--gold-ink, var(--pn-9a7400,#9A7400))' }}>{eyebrow}</span>
          <h1 className="m-0 truncate text-[28px] font-extrabold leading-[1.05] tracking-[-0.035em] text-foreground sm:text-[36px]">{titulo}</h1>
        </div>
        {acoes && <div className="ml-auto flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {!semAbas && <ConteudosTabs />}
      {subtabs}
    </div>
  )
}
