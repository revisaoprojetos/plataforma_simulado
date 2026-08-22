'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Archive, CalendarCheck, ChevronRight, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fmtBr } from '@/lib/cronograma/datas'
import type { EmissaoResumo } from './emissoes-actions'

/** Instante da geração — timestamptz, então vale o fuso do aluno (não é data civil do plano). */
function fmtGeradoEm(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * "Meus cronogramas": o que o aluno já gerou, para reabrir.
 *
 * É a resposta à maior dor do gerador legado — lá, fechar a página perdia o cronograma.
 *
 * Dois modos. Na tela do gerador entra COMPACTO (os últimos poucos + "ver todos"), porque ali
 * a lista é um atalho, não o assunto. Na página do histórico entra COMPLETO, com busca e a aba
 * de arquivados.
 *
 * A aba de arquivados não é enfeite: arquivar tira o cronograma da lista, e como a única porta
 * para "Restaurar" é a tela do próprio cronograma, que só se alcança por aqui, sem ela arquivar
 * seria um caminho sem volta.
 */
export function MinhasEmissoes({
  itens,
  limite,
  hrefTodos,
}: {
  itens: EmissaoResumo[]
  /** Quantos mostrar. Ausente = todos, com busca e abas. */
  limite?: number
  /** Para onde o "ver todos" leva, no modo compacto. */
  hrefTodos?: string
}) {
  const compacto = limite != null
  const ativas = useMemo(() => itens.filter((e) => !e.arquivada), [itens])
  const arquivadas = useMemo(() => itens.filter((e) => e.arquivada), [itens])
  const [aba, setAba] = useState<'ativas' | 'arquivadas'>(ativas.length ? 'ativas' : 'arquivadas')
  const [busca, setBusca] = useState('')

  const lista = useMemo(() => {
    const base = compacto ? ativas : aba === 'ativas' ? ativas : arquivadas
    const t = busca.trim().toLowerCase()
    if (!t) return base
    return base.filter(
      (e) =>
        (e.titulo ?? '').toLowerCase().includes(t) || e.cronograma_nome.toLowerCase().includes(t),
    )
  }, [compacto, aba, ativas, arquivadas, busca])

  if (!itens.length) return null

  const visiveis = compacto ? lista.slice(0, limite) : lista
  const ocultos = itens.length - visiveis.length

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <CalendarCheck className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">Meus cronogramas</p>
          <p className="text-xs text-muted-foreground">
            {compacto
              ? `${ativas.length === 1 ? '1 cronograma salvo' : `${ativas.length} cronogramas salvos`} — clique para abrir`
              : aba === 'ativas'
                ? 'Clique para abrir, renomear ou arquivar'
                : 'Arquivados continuam salvos — abra para restaurar'}
          </p>
        </div>

        {!compacto && arquivadas.length > 0 && (
          <div className="flex shrink-0 overflow-hidden rounded-lg border">
            {(
              [
                ['ativas', `Ativos (${ativas.length})`],
                ['arquivadas', `Arquivados (${arquivadas.length})`],
              ] as const
            ).map(([chave, rotulo]) => (
              <button
                key={chave}
                onClick={() => setAba(chave)}
                className={`h-8 px-3 text-xs transition ${
                  aba === chave ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        )}
      </div>

      {!compacto && (
        <div className="relative border-b px-4 py-2.5">
          <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pelo nome que você deu ou pelo cronograma"
            className="pl-7"
          />
        </div>
      )}

      {lista.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {busca.trim()
            ? 'Nenhum cronograma com esse nome.'
            : aba === 'ativas'
              ? 'Nenhum cronograma ativo — seus arquivados continuam na outra aba.'
              : 'Nenhum cronograma arquivado.'}
        </p>
      ) : (
        <div className="divide-y">
          {visiveis.map((e) => {
            const inicio = e.formulario?.inicio as string | undefined
            return (
              <Link
                key={e.id}
                href={`/aluno/cronograma/${e.id}`}
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.titulo || e.cronograma_nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.titulo && `${e.cronograma_nome} · `}
                    {inicio && `começa em ${fmtBr(inicio)} · `}
                    gerado em {fmtGeradoEm(e.criado_em)}
                  </p>
                  {e.resumo?.subtitulo && (
                    <p className="truncate text-xs text-muted-foreground/80">{e.resumo.subtitulo}</p>
                  )}
                </div>
                {e.arquivada && (
                  <Badge variant="secondary" className="shrink-0">
                    <Archive className="mr-1 h-3 w-3" />
                    Arquivado
                  </Badge>
                )}
                {e.resumo?.conclusao && (
                  <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
                    termina em {fmtBr(e.resumo.conclusao)}
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            )
          })}
        </div>
      )}

      {/* No compacto o rodapé leva à página do histórico — inclusive quando só sobraram
          arquivados, senão eles ficariam sem porta de entrada. */}
      {compacto && hrefTodos && (ocultos > 0 || arquivadas.length > 0) && (
        <Link
          href={hrefTodos}
          className="flex items-center justify-center gap-1 border-t px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-muted/40"
        >
          Ver todos os {itens.length} cronogramas
          {arquivadas.length > 0 && ` (${arquivadas.length} arquivado${arquivadas.length > 1 ? 's' : ''})`}
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </Card>
  )
}
