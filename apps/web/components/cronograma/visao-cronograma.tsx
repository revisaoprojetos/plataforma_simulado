'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarRange, List } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { GradeCronograma } from '@/components/cronograma/grade-cronograma'
import { CalendarioCronograma } from '@/components/cronograma/calendario-cronograma'
import { alternarCheckMeta, type ChecksDaEmissao } from '@/app/aluno/(portal)/cronograma/checks-actions'
import type { NotasDaEmissao } from '@/app/aluno/(portal)/cronograma/notas-actions'
import { salvarPreferencias } from '@/app/aluno/(portal)/cronograma/preferencias-actions'
import { PREFERENCIAS_PADRAO, type PreferenciasEmissao } from '@/lib/cronograma/preferencias'
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
  notasIniciais,
  preferenciasIniciais,
}: {
  grade: Grade
  paletaSlug: string
  /** Sem emissão salva não há onde gravar — a tela mostra o plano sem as caixas. */
  emissaoId: string | null
  checksIniciais?: ChecksDaEmissao
  notasIniciais?: NotasDaEmissao
  preferenciasIniciais?: PreferenciasEmissao
}) {
  const [visao, setVisao] = useState<'lista' | 'calendario'>('lista')

  /**
   * Preferências de leitura — que semanas estão fechadas e se a contagem aparece.
   *
   * Gravadas com ATRASO: fechar dez semanas seguidas são dez cliques, e uma ida ao servidor
   * por clique só serviria para engasgar a tela. O estado responde na hora; a gravação vai
   * meio segundo depois da última mudança.
   */
  const [prefs, setPrefs] = useState<PreferenciasEmissao>(preferenciasIniciais ?? PREFERENCIAS_PADRAO)
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null)
  const primeira = useRef(true)

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false
      return
    }
    if (!emissaoId) return
    if (gravacao.current) clearTimeout(gravacao.current)
    gravacao.current = setTimeout(() => {
      // Falhar aqui não atrapalha a leitura: a tela segue como o aluno deixou nesta sessão.
      void salvarPreferencias(emissaoId, prefs)
    }, 600)
    return () => {
      if (gravacao.current) clearTimeout(gravacao.current)
    }
  }, [prefs, emissaoId])

  function alternarColapso(semana: number) {
    setPrefs((p) => {
      const set = new Set(p.semanasColapsadas)
      if (set.has(semana)) set.delete(semana)
      else set.add(semana)
      return { ...p, semanasColapsadas: [...set].sort((a, b) => a - b) }
    })
  }
  const [checks, setChecks] = useState<ChecksDaEmissao>(checksIniciais ?? {})
  const [notas, setNotas] = useState<NotasDaEmissao>(notasIniciais ?? {})

  /* A nota vive aqui em cima, junto dos checks, pelo mesmo motivo: lista e calendário leem o
     MESMO estado, então escrever numa aparece na outra sem recarregar. */
  function guardarNota(metaId: string, texto: string) {
    setNotas((n) => {
      const novo = { ...n }
      if (texto) novo[metaId] = texto
      else delete novo[metaId]
      return novo
    })
  }

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
  const pctRotulo = feitas > 0 && pct === 0 ? '<1%' : `${pct}%`

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
      <Card className="p-4">
        <div className="flex flex-row flex-wrap items-center gap-4">
          {emissaoId ? (
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-semibold tabular-nums">{feitas.toLocaleString('pt-BR')}</span>
                <span className="text-muted-foreground">
                  {' '}de {total.toLocaleString('pt-BR')} metas concluídas
                </span>
                <span className="ml-2 font-medium tabular-nums text-primary">{pctRotulo}</span>
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  // Um fio de barra em vez de nada: com 2 de 581 o progresso existe e some se
                  // a largura for só a porcentagem arredondada.
                  style={{ width: feitas > 0 ? `max(3px, ${pct}%)` : '0%' }}
                />
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
        </div>
      </Card>

      {visao === 'lista' ? (
        <GradeCronograma
          grade={grade}
          paletaSlug={paletaSlug}
          titulo="Seu plano semana a semana"
          checks={checks}
          aoAlternarCheck={aoAlternar}
          emissaoId={emissaoId}
          notas={notas}
          aoSalvarNota={guardarNota}
          colapsadas={prefs.semanasColapsadas}
          aoAlternarColapso={emissaoId ? alternarColapso : undefined}
          ocultarContagem={prefs.ocultarContagem}
          aoAlternarContagem={
            emissaoId ? () => setPrefs((p) => ({ ...p, ocultarContagem: !p.ocultarContagem })) : undefined
          }
        />
      ) : (
        <CalendarioCronograma
          grade={grade}
          paletaSlug={paletaSlug}
          checks={checks}
          aoAlternarCheck={aoAlternar}
          emissaoId={emissaoId}
          notas={notas}
          aoSalvarNota={guardarNota}
        />
      )}
    </div>
  )
}
