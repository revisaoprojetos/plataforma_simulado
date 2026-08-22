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
function geradoEm(iso: string): { data: string; hora: string } {
  const d = new Date(iso)
  return {
    data: d.toLocaleDateString('pt-BR'),
    hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
}

/**
 * "9 Matérias Essenciais (4 horas)" → { carga: '4h', nome: '9 Matérias Essenciais' }.
 *
 * A carga vira etiqueta na lateral: é o primeiro filtro de quem procura ("qual era o de 4h?")
 * e, repetida por extenso dentro do nome em toda linha, era metade do ruído. Nome fora do
 * padrão fica inteiro, sem etiqueta — melhor sem do que com adivinhação.
 */
function separarCarga(nome: string): { carga: string | null; nome: string } {
  const m = /^(.*?)\s*\((\d+(?:[.,]\d+)?)\s*horas?\)\s*$/i.exec(nome)
  if (!m) return { carga: null, nome }
  return { carga: `${m[2].replace(',', '.')}h`, nome: m[1].trim() }
}

/**
 * "Meus cronogramas": o que o aluno já gerou, para reabrir.
 *
 * É a resposta à maior dor do gerador legado — lá, fechar a página perdia o cronograma.
 *
 * Vive na tela "Meus cronogramas", irmã do gerador: gerar um plano novo e voltar a um que já
 * existe são tarefas diferentes, e numa página só a lista competia com o formulário.
 *
 * A aba de arquivados não é enfeite: arquivar tira o cronograma da lista, e como a única porta
 * para "Restaurar" é a tela do próprio cronograma, que só se alcança por aqui, sem ela arquivar
 * seria um caminho sem volta.
 */
export function MinhasEmissoes({ itens }: { itens: EmissaoResumo[] }) {
  const ativas = useMemo(() => itens.filter((e) => !e.arquivada), [itens])
  const arquivadas = useMemo(() => itens.filter((e) => e.arquivada), [itens])
  const [aba, setAba] = useState<'ativas' | 'arquivadas'>(ativas.length ? 'ativas' : 'arquivadas')
  const [busca, setBusca] = useState('')

  const lista = useMemo(() => {
    const base = aba === 'ativas' ? ativas : arquivadas
    const t = busca.trim().toLowerCase()
    if (!t) return base
    return base.filter(
      (e) =>
        (e.titulo ?? '').toLowerCase().includes(t) || e.cronograma_nome.toLowerCase().includes(t),
    )
  }, [aba, ativas, arquivadas, busca])

  if (!itens.length) return null


  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <CalendarCheck className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">Meus cronogramas</p>
          <p className="text-xs text-muted-foreground">
            {aba === 'ativas'
              ? `${ativas.length === 1 ? '1 cronograma salvo' : `${ativas.length} cronogramas salvos`} — clique para abrir, renomear ou arquivar`
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

      <div className="relative border-b px-4 py-2.5">
        <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pelo nome que você deu ou pelo cronograma"
          className="pl-7"
        />
      </div>

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
          {lista.map((e) => {
            const inicio = e.formulario?.inicio as string | undefined
            const { carga, nome } = separarCarga(e.cronograma_nome)
            const g = geradoEm(e.criado_em)
            const semanas = e.resumo?.semanasConteudo ?? e.resumo?.totalSemanas
            const revisoes = e.resumo?.semanasRevisao ?? 0
            // Três linhas de texto do mesmo peso viravam parede. Aqui a linha tem hierarquia:
            // etiqueta da carga, título, uma linha de apoio, e o carimbo da geração à direita.
            const apoio = [
              e.titulo ? nome : null,
              inicio ? `começa ${fmtBr(inicio)}` : null,
              semanas ? `${semanas} semanas${revisoes ? ` + ${revisoes} rev.` : ''}` : null,
            ].filter(Boolean)
            return (
              <Link
                key={e.id}
                href={`/aluno/cronograma/${e.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-muted/40"
              >
                {carga ? (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                    {carga}
                  </span>
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium">
                    <span className="truncate">{e.titulo || nome}</span>
                    {e.arquivada && (
                      <Badge variant="secondary" className="shrink-0 gap-1 px-1.5 py-0 text-[10px]">
                        <Archive className="h-2.5 w-2.5" />
                        Arquivado
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{apoio.join(' · ')}</p>
                </div>

                <div className="hidden shrink-0 text-right leading-tight sm:block">
                  <p className="text-xs text-muted-foreground">{g.data}</p>
                  <p className="text-[11px] text-muted-foreground/60">{g.hora}</p>
                </div>

                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            )
          })}
        </div>
      )}

    </Card>
  )
}
