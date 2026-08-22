'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Archive, CalendarCheck, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { fmtBr } from '@/lib/cronograma/datas'
import type { EmissaoResumo } from './emissoes-actions'

const PAGINA = 10

/**
 * "Meus cronogramas": o que o aluno já gerou, para reabrir.
 *
 * É a resposta à maior dor do gerador legado — lá, fechar a página perdia o cronograma.
 *
 * A aba de arquivados não é enfeite: arquivar tirava o cronograma desta lista, e como a única
 * porta para "Restaurar" é a tela do próprio cronograma, que só se alcança por aqui, arquivar
 * era um caminho sem volta. Enquanto o registro existe, tem que haver como chegar nele.
 */
export function MinhasEmissoes({ itens }: { itens: EmissaoResumo[] }) {
  const ativas = itens.filter((e) => !e.arquivada)
  const arquivadas = itens.filter((e) => e.arquivada)
  const [aba, setAba] = useState<'ativas' | 'arquivadas'>(ativas.length ? 'ativas' : 'arquivadas')
  const [mostrarTodas, setMostrarTodas] = useState(false)

  if (!itens.length) return null

  const lista = aba === 'ativas' ? ativas : arquivadas
  const visiveis = mostrarTodas ? lista : lista.slice(0, PAGINA)

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <CalendarCheck className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">Meus cronogramas</p>
          <p className="text-xs text-muted-foreground">
            {aba === 'ativas'
              ? `${ativas.length === 1 ? '1 cronograma salvo' : `${ativas.length} cronogramas salvos`} — clique para abrir`
              : 'Arquivados continuam salvos — abra para restaurar'}
          </p>
        </div>

        {arquivadas.length > 0 && (
          <div className="flex shrink-0 overflow-hidden rounded-lg border">
            {(
              [
                ['ativas', `Ativos (${ativas.length})`],
                ['arquivadas', `Arquivados (${arquivadas.length})`],
              ] as const
            ).map(([chave, rotulo]) => (
              <button
                key={chave}
                onClick={() => {
                  setAba(chave)
                  setMostrarTodas(false)
                }}
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

      {lista.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {aba === 'ativas'
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
                    {e.resumo?.subtitulo ?? `gerado em ${new Date(e.criado_em).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                {e.arquivada && (
                  <Badge variant="secondary" className="shrink-0">
                    <Archive className="mr-1 h-3 w-3" />
                    Arquivado
                  </Badge>
                )}
                {e.resumo?.conclusao && (
                  <Badge variant="outline" className="shrink-0">
                    termina em {fmtBr(e.resumo.conclusao)}
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            )
          })}
        </div>
      )}

      {/* Antes a lista cortava em 10 sem dizer, então o 11º cronograma simplesmente não existia. */}
      {!mostrarTodas && lista.length > PAGINA && (
        <div className="border-t px-4 py-2.5 text-center">
          <Button variant="ghost" size="sm" onClick={() => setMostrarTodas(true)}>
            Mostrar os outros {lista.length - PAGINA}
          </Button>
        </div>
      )}
    </Card>
  )
}
