'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { BarraSetorSlot } from '@/components/admin/barra-setor-slot'
import { eyebrowDoSetor } from '@/lib/admin/eyebrow-setor'
import { Suspense } from 'react'
import { useDentroDoShellCronogramas } from '@/components/admin/cronograma/shell-context'
import { CronogramasNav } from '@/components/admin/cronograma/cronogramas-nav'
import { VistasCronograma } from '@/components/admin/cronograma/vistas-cronograma'
import { EYEBROW_CRONOGRAMAS } from '@/lib/admin/cronogramas-nav'

/**
 * MODELO DE INÍCIO DE ÁREA do admin (referência: "Gerenciar produtos"). Ver docs/modelo-inicio-de-area.md.
 *
 *   EYEBROW (setor da sidebar, dourado, caixa alta)         [ações à direita]
 *   H1 (36px extrabold)
 *   descrição opcional (text-sm muted)
 *   ── BarraSetorSlot (1ª fileira de abas: irmãos do cluster) ──
 *   ── abas da área (2ª fileira, `abas`) ──
 *
 * Cores 100% por token (seguem tenant/paleta e dark/light): H1 = `text-foreground`; eyebrow = `--gold-ink`
 * (definido em `.estudio-scope`; fora dele cai no fallback `--pn-9a7400`/`--pn-f1c232` da paleta nova).
 */
export function CabecalhoArea({
  eyebrow,
  titulo,
  descricao,
  acoes,
  abas,
  semBarraSetor = false,
  denso = false,
  className,
}: {
  /** undefined = rótulo do setor da rota (ex.: "Alunos"); string = sobrescreve; null = sem eyebrow. */
  eyebrow?: string | null
  titulo: string
  /** Subtítulo opcional, abaixo do H1. */
  descricao?: React.ReactNode
  acoes?: React.ReactNode
  /** Abas próprias da área (2ª fileira) — ex.: <ConteudosTabs/>, <AbasLinha/>, sub-abas. */
  abas?: React.ReactNode
  /** Não renderiza a BarraSetor (telas que já mostram as abas dos mesmos irmãos). */
  semBarraSetor?: boolean
  /** Telas com tabela larga: título 24/28px e gaps menores. */
  denso?: boolean
  className?: string
}) {
  const pathname = usePathname()
  // Dentro do shell de Cronogramas (ordem do modelo): eyebrow "Cronogramas" → H1 → descrição/ações → BarraSetor
  // [Gerador|Adaptativo] → abas (CronogramasNav); as telas da aba (VistasCronograma) entram logo após o cabeçalho, no conteúdo. UMA instância por página: é este cabeçalho que a posiciona.
  const dentroShell = useDentroDoShellCronogramas()
  const rotulo = dentroShell ? EYEBROW_CRONOGRAMAS : eyebrow === null ? undefined : eyebrowDoSetor(pathname, eyebrow)
  const semTopo = !titulo && !descricao && !acoes // cabeçalho só de eyebrow + barra (ex.: topo do shell de Cronogramas)
  return (
    <>
    <div className={cn('flex flex-col', denso ? 'gap-3' : 'gap-4', dentroShell && 'gap-5', className)}>
      {!semTopo || rotulo ? (
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          {rotulo && (
            <span className="text-[11px] font-extrabold uppercase tracking-[.2em] text-[color:var(--gold-ink,var(--pn-9a7400,#9A7400))] dark:text-[color:var(--gold-ink,var(--pn-f1c232,#F1C232))]">
              {rotulo}
            </span>
          )}
          {titulo && <h1
            className={cn(
              'm-0 truncate font-extrabold leading-[1.05] tracking-[-0.035em] text-foreground',
              denso ? 'text-[24px] sm:text-[28px]' : 'text-[28px] sm:text-[36px]',
            )}
          >
            {titulo}
          </h1>}
          {descricao && <p className="m-0 text-sm text-muted-foreground">{descricao}</p>}
        </div>
        {acoes && <div className="ml-auto flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      ) : null}
      {(dentroShell || !semBarraSetor) && <BarraSetorSlot />}
      {dentroShell && <Suspense fallback={null}><CronogramasNav /></Suspense>}
      {abas}
    </div>
    {/* Telas da aba de Cronogramas = abas INTERNAS do conteúdo (fora do cabeçalho: não é uma 3ª fileira dele). */}
    {dentroShell && <Suspense fallback={null}><VistasCronograma /></Suspense>}
    </>
  )
}
