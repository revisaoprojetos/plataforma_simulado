'use client'

import { useMemo, useState } from 'react'
import { CalendarRange, List } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { GradeCronograma } from '@/components/cronograma/grade-cronograma'
import { CalendarioCronograma } from '@/components/cronograma/calendario-cronograma'
import { alternarCheckMeta, type ChecksDaEmissao } from '@/app/aluno/(portal)/cronograma/checks-actions'
import type { Grade, MetaDatada } from '@/lib/cronograma/tipos'

/**
 * O plano do aluno, em lista ou em calendário, com a marcação de concluídas.
 *
 * As duas visões leem a MESMA grade e o MESMO mapa de checks — não há segundo cálculo, e
 * portanto não há como divergirem. Marcar numa aparece na outra sem recarregar.
 *
 * A marcação é OTIMISTA: o check aparece na hora e é desfeito se o servidor recusar.
 * Numa lista de centenas de metas, esperar a ida e volta a cada clique tornaria marcar uma
 * semana inteira insuportável.
 */
export function VisaoCronograma({
  grade,
  paletaSlug,
  emissaoId,
  checksIniciais,
}: {
  grade: Grade
  paletaSlug: string
  /** Sem emissão salva não há onde gravar — a tela mostra o plano sem as caixas. */
  emissaoId: string | null
  checksIniciais?: ChecksDaEmissao
}) {
  const [visao, setVisao] = useState<'lista' | 'calendario'>('lista')
  const [checks, setChecks] = useState<ChecksDaEmissao>(checksIniciais ?? {})

  const total = useMemo(
    () => grade.semanas.reduce((n, s) => n + (s.kind === 'conteudo' ? s.metas.length : 0), 0),
    [grade],
  )
  const feitas = useMemo(() => {
    const ids = new Set<string>()
    for (const s of grade.semanas) if (s.kind === 'conteudo') for (const m of s.metas) if (checks[m.id]) ids.add(m.id)
    return ids.size
  }, [grade, checks])
  const pct = total ? Math.round((feitas / total) * 100) : 0

  function alternar(meta: MetaDatada, marcar: boolean) {
    if (!emissaoId) return
    const anterior = checks[meta.id]
    setChecks((c) => {
      const n = { ...c }
      if (marcar) n[meta.id] = new Date().toISOString()
      else delete n[meta.id]
      return n
    })

    void (async () => {
      const r = await alternarCheckMeta(emissaoId, meta.id, marcar, { data: meta.data, titulo: meta.titulo })
      if (r.ok) {
        // O instante que vale é o do SERVIDOR — o relógio do navegador pode estar errado, e é
        // esse carimbo que vai para a auditoria.
        if (marcar && r.marcadaEm) setChecks((c) => ({ ...c, [meta.id]: r.marcadaEm as string }))
        return
      }
      toast.error(r.error ?? 'Não foi possível salvar a marcação.')
      setChecks((c) => {
        const n = { ...c }
        if (anterior) n[meta.id] = anterior
        else delete n[meta.id]
        return n
      })
    })()
  }

  const aoAlternar = emissaoId ? alternar : undefined

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4 p-4">
        {emissaoId ? (
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-medium">
                {feitas.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')} metas concluídas
              </p>
              <span className="text-xs text-muted-foreground">{pct}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            Abra este cronograma em &quot;Meus cronogramas&quot; para marcar as metas concluídas.
          </p>
        )}

        <div className="flex shrink-0 overflow-hidden rounded-lg border">
          {(
            [
              ['lista', 'Lista', List],
              ['calendario', 'Calendário', CalendarRange],
            ] as const
          ).map(([chave, rotulo, Icone]) => (
            <button
              key={chave}
              onClick={() => setVisao(chave)}
              className={`flex h-8 items-center gap-1.5 px-3 text-xs transition ${
                visao === chave ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              <Icone className="h-3.5 w-3.5" />
              {rotulo}
            </button>
          ))}
        </div>
      </Card>

      {visao === 'lista' ? (
        <GradeCronograma
          grade={grade}
          paletaSlug={paletaSlug}
          titulo="Seu plano semana a semana"
          checks={checks}
          aoAlternarCheck={aoAlternar}
        />
      ) : (
        <CalendarioCronograma grade={grade} paletaSlug={paletaSlug} checks={checks} aoAlternarCheck={aoAlternar} />
      )}
    </div>
  )
}
