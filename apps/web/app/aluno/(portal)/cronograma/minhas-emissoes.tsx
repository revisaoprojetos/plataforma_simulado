'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Archive, CalendarCheck, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fmtBr } from '@/lib/cronograma/datas'
import { listarMinhasEmissoes, type EmissaoResumo, type PaginaEmissoes } from './emissoes-actions'

const POR_PAGINA = 20

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
 * Busca e paginação acontecem no BANCO. Antes a tela pedia as 100 mais recentes e filtrava em
 * memória, o que dava duas mentiras: o 101º cronograma não existia para quem o gerou, e
 * procurar por um antigo devolvia "nenhum encontrado" sobre um registro que está lá.
 *
 * A aba de arquivados não é enfeite: arquivar tira o cronograma da lista, e como a única porta
 * para "Restaurar" é a tela do próprio cronograma, que só se alcança por aqui, sem ela arquivar
 * seria um caminho sem volta.
 */
export function MinhasEmissoes({ inicial }: { inicial: PaginaEmissoes }) {
  const [dados, setDados] = useState<PaginaEmissoes>(inicial)
  const [aba, setAba] = useState<'ativas' | 'arquivadas'>(inicial.ativas > 0 ? 'ativas' : 'arquivadas')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [carregando, setCarregando] = useState(false)
  const primeira = useRef(true)

  // Espera entre teclas e descarte de resposta fora de ordem: a de "an" pode voltar depois da
  // de "ana" e sobrescrever o resultado certo com um mais amplo.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requisicao = useRef(0)

  useEffect(() => {
    // A primeira renderização já veio do servidor — refazer a consulta aqui seria uma ida à toa.
    if (primeira.current) {
      primeira.current = false
      return
    }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      const id = ++requisicao.current
      setCarregando(true)
      const r = await listarMinhasEmissoes({
        busca,
        pagina,
        porPagina: POR_PAGINA,
        arquivadas: aba === 'arquivadas',
      })
      if (id !== requisicao.current) return
      setCarregando(false)
      if (!r.ok || !r.dados) {
        toast.error(r.error ?? 'Não foi possível carregar.')
        return
      }
      setDados(r.dados)
    }, 250)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [busca, pagina, aba])

  const ultimaPagina = Math.max(0, Math.ceil(dados.total / POR_PAGINA) - 1)

  function trocarAba(nova: 'ativas' | 'arquivadas') {
    setAba(nova)
    setPagina(0)
  }

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
      <div className="flex flex-row flex-wrap items-center gap-3 border-b px-4 py-3">
        <CalendarCheck className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">Meus cronogramas</p>
          <p className="text-xs text-muted-foreground">
            {aba === 'ativas'
              ? `${dados.ativas === 1 ? '1 cronograma salvo' : `${dados.ativas.toLocaleString('pt-BR')} cronogramas salvos`} — clique para abrir, renomear ou arquivar`
              : 'Arquivados continuam salvos — abra para restaurar'}
          </p>
        </div>

        {dados.arquivadas > 0 && (
          <div className="flex shrink-0 overflow-hidden rounded-lg border">
            {(
              [
                ['ativas', `Ativos (${dados.ativas})`],
                ['arquivadas', `Arquivados (${dados.arquivadas})`],
              ] as const
            ).map(([chave, rotulo]) => (
              <button
                key={chave}
                onClick={() => trocarAba(chave)}
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
          onChange={(e) => {
            setBusca(e.target.value)
            setPagina(0)
          }}
          placeholder="Buscar pelo nome que você deu ou pelo cronograma"
          className="pl-7"
        />
        {carregando && (
          <Loader2 className="absolute right-6 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {dados.itens.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {busca.trim()
            ? 'Nenhum cronograma com esse nome.'
            : aba === 'ativas'
              ? 'Nenhum cronograma ativo — seus arquivados continuam na outra aba.'
              : 'Nenhum cronograma arquivado.'}
        </p>
      ) : (
        <div className="divide-y">
          {dados.itens.map((e: EmissaoResumo) => {
            const inicio = e.formulario?.inicio as string | undefined
            const { carga, nome } = separarCarga(e.cronograma_nome)
            const g = geradoEm(e.criado_em)
            const semanas = e.resumo?.semanasConteudo ?? e.resumo?.totalSemanas
            const revisoes = e.resumo?.semanasRevisao ?? 0
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

      {dados.total > POR_PAGINA && (
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            {(pagina * POR_PAGINA + 1).toLocaleString('pt-BR')}–
            {Math.min((pagina + 1) * POR_PAGINA, dados.total).toLocaleString('pt-BR')} de{' '}
            {dados.total.toLocaleString('pt-BR')}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
              disabled={pagina === 0 || carregando}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPagina((p) => Math.min(ultimaPagina, p + 1))}
              disabled={pagina >= ultimaPagina || carregando}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
