'use client'

import { useRef, useState } from 'react'
import { CalendarRange, List } from 'lucide-react'
import { toast } from 'sonner'
import { Bar, Card } from '@/components/nova/ui'
import { GradeCronograma } from '@/components/cronograma/grade-cronograma'
import { CalendarioCronograma } from '@/components/cronograma/calendario-cronograma'
import type { ChecksDaEmissao } from '@/app/aluno/(portal)/cronograma/checks-actions-tipos'
import type { NotasDaEmissao } from '@/app/aluno/(portal)/cronograma/notas-actions-tipos'
import { PREFERENCIAS_PADRAO, type PreferenciasEmissao } from '@/lib/cronograma/preferencias'
import type { ProgressoEmissao } from '@/lib/cronograma/progresso-tipos'
import type { Grade, MetaDatada } from '@/lib/cronograma/tipos'

/** Marca/desmarca via rota de API (server action não funciona em domínio custom / iframe Curseduca). */
async function postarCheck(corpo: { emissaoId: string; metaId: string; marcar: boolean; data?: string; titulo?: string }): Promise<{ ok: boolean; error?: string; marcadaEm?: string | null; progresso?: ProgressoEmissao | null }> {
  try {
    const res = await fetch('/api/aluno/cronograma/check', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    const j = await res.json().catch(() => null)
    if (j?.ok) return { ok: true, marcadaEm: j.marcadaEm ?? null, progresso: j.progresso ?? null }
    return { ok: false, error: j?.message ?? 'Não foi possível salvar a marcação.' }
  } catch {
    return { ok: false, error: 'Sem conexão. Tente de novo.' }
  }
}

/**
 * O plano do aluno, em lista ou em calendário, com a marcação de concluídas.
 *
 * As duas visões leem a MESMA grade e o MESMO mapa de checks — não há segundo cálculo, e
 * portanto não há como divergirem. Marcar numa aparece na outra sem recarregar.
 *
 * A marcação é OTIMISTA só no check visual (desfeito se o servidor recusar). O PERCENTUAL exibido vem
 * sempre do servidor (progresso recalculado na resposta da rota) — nada é calculado aqui.
 * Numa lista de centenas de metas, esperar a ida e volta a cada clique tornaria marcar uma
 * semana inteira insuportável.
 */
export function VisaoCronograma({
  grade,
  paletaSlug,
  emissaoId,
  checksIniciais,
  notasIniciais,
  prefs = PREFERENCIAS_PADRAO,
  aoAlternarSemana,
  aoDefinirSemanas,
  aoAlternarContagem,
  ocultarDatas,
  progressoInicial,
}: {
  grade: Grade
  paletaSlug: string
  /** Sem emissão salva não há onde gravar — a tela mostra o plano sem as caixas. */
  emissaoId: string | null
  /** Plano "só semanas": esconde datas e a visão Calendário (que é baseada em datas). */
  ocultarDatas?: boolean
  /** Progresso calculado no servidor (contagem agregada). */
  progressoInicial?: ProgressoEmissao | null
  checksIniciais?: ChecksDaEmissao
  notasIniciais?: NotasDaEmissao
  /* As preferências vêm de fora: os cartões do resumo são IRMÃOS desta lista na tela, e
     precisam do mesmo estado. Se cada um guardasse o seu, esconder um número numa parte não
     apareceria na outra. */
  prefs?: PreferenciasEmissao
  aoAlternarSemana?: (semana: number) => void
  aoDefinirSemanas?: (semanas: number[]) => void
  aoAlternarContagem?: () => void
}) {
  const [visao, setVisao] = useState<'lista' | 'calendario'>('lista')
  const [checks, setChecks] = useState<ChecksDaEmissao>(checksIniciais ?? {})
  const [notas, setNotas] = useState<NotasDaEmissao>(notasIniciais ?? {})

  const [progresso, setProgresso] = useState<ProgressoEmissao | null>(progressoInicial ?? null)
  const seq = useRef(0) // respostas fora de ordem (cliques rápidos): só a mais recente vale

  /* Nota e check vivem no MESMO nível: lista e calendário leem o mesmo estado, então marcar
     ou escrever numa visão aparece na outra sem recarregar. */
  function guardarNota(metaId: string, texto: string) {
    setNotas((n) => {
      const novo = { ...n }
      if (texto) novo[metaId] = texto
      else delete novo[metaId]
      return novo
    })
  }

  function alternar(meta: MetaDatada, marcar: boolean) {
    if (!emissaoId) return
    const anterior = checks[meta.id]
    setChecks((c) => {
      const n = { ...c }
      if (marcar) n[meta.id] = new Date().toISOString()
      else delete n[meta.id]
      return n
    })

    const minha = ++seq.current
    void (async () => {
      const r = await postarCheck({ emissaoId, metaId: meta.id, marcar, data: meta.data, titulo: meta.titulo })
      if (r.ok) {
        if (r.progresso && minha === seq.current) setProgresso(r.progresso)
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
      <Card pad={16} style={{ gap: 12 }}>
        <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-3">
          {emissaoId && progresso ? (
            <div className="min-w-0 flex-1" style={{ minWidth: 220 }}>
              <p className="text-sm" style={{ color: 'var(--ink)' }}>
                <span className="font-extrabold tabular-nums">{progresso?.feitas.toLocaleString('pt-BR')}</span>
                <span style={{ color: 'var(--sub)' }}>
                  {' '}de {progresso?.total.toLocaleString('pt-BR')} metas concluídas
                </span>
                <span className="ml-2 font-bold tabular-nums" style={{ color: 'var(--brand)' }}>{progresso?.pctRotulo}</span>
              </p>
              {/* Um fio de barra em vez de nada: com 2 de 581 o progresso existe e some se a largura for só a % arredondada. */}
              <Bar pct={progresso && progresso.feitas > 0 ? Math.max(0.6, progresso.pct) : 0} style={{ marginTop: 8 }} />
            </div>
          ) : emissaoId ? (
            <div className="min-w-0 flex-1" />
          ) : (
            <p className="min-w-0 flex-1 text-sm" style={{ color: 'var(--sub)' }}>
              Abra este cronograma em &quot;Meus cronogramas&quot; para marcar as metas concluídas.
            </p>
          )}

          {/* Abas sublinhadas (padrão Revisão) */}
          <div role="tablist" className={`flex shrink-0 gap-4 ${ocultarDatas ? 'hidden' : ''}`} style={{ borderBottom: '1px solid var(--line)' }}>
            {(
              [
                ['lista', 'Lista', List],
                ['calendario', 'Calendário', CalendarRange],
              ] as const
            ).map(([chave, rotulo, Icone]) => (
              <button
                key={chave}
                role="tab"
                aria-selected={visao === chave}
                onClick={() => setVisao(chave)}
                className="flex h-9 items-center gap-1.5 border-b-2 text-[13px] font-bold transition"
                style={{ borderColor: visao === chave ? 'var(--brand)' : 'transparent', color: visao === chave ? 'var(--brand)' : 'var(--sub)', marginBottom: -1 }}
              >
                <Icone className="h-3.5 w-3.5" />
                {rotulo}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {visao === 'lista' || ocultarDatas ? (
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
          aoAlternarColapso={aoAlternarSemana}
          aoDefinirColapsadas={aoDefinirSemanas}
          ocultarContagem={prefs.ocultarContagem}
          aoAlternarContagem={aoAlternarContagem}
          ocultarDatas={ocultarDatas}
          resolverHref={emissaoId ? (m) => (m.qtdQuestoes ? `/aluno/cronograma/resolver/${m.id}?voltar=${encodeURIComponent(`/aluno/cronograma/${emissaoId}`)}` : null) : undefined}
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
