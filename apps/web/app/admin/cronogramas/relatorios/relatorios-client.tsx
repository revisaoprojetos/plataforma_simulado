'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { BarChart3, ChevronLeft, ChevronRight, Loader2, Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SecaoHeader } from '@/components/admin/secao-header'
import { buscarAlunosRelatorio, type DadosRelatorio, type LinhaAluno } from './actions'

const POR_PAGINA = 50

function pct(feitas: number, total: number): number {
  return total > 0 ? Math.round((feitas / total) * 100) : 0
}

function fmtQuando(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** Barra de progresso enxuta — o número ao lado é o que se lê; a barra é o que se compara. */
function Barra({ feitas, total }: { feitas: number; total: number }) {
  const p = pct(feitas, total)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${p}%` }} />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {p}% <span className="opacity-70">({feitas.toLocaleString('pt-BR')}/{total.toLocaleString('pt-BR')})</span>
      </span>
    </div>
  )
}

export function RelatoriosClient({ dados }: { dados: DadosRelatorio }) {
  const [alunos, setAlunos] = useState<LinhaAluno[]>(dados.alunos)
  const [total, setTotal] = useState(dados.alunos[0]?.total_linhas ?? 0)
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [carregando, setCarregando] = useState(false)

  // Busca com espera entre teclas e descarte de resposta fora de ordem — a de "an" pode
  // voltar depois da de "ana" e sobrescrever o resultado certo.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requisicao = useRef(0)

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      const id = ++requisicao.current
      setCarregando(true)
      const r = await buscarAlunosRelatorio(busca, pagina, POR_PAGINA)
      if (id !== requisicao.current) return
      setCarregando(false)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível carregar.')
        return
      }
      setAlunos(r.itens ?? [])
      setTotal(r.total ?? 0)
    }, 250)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [busca, pagina])

  const maxDia = useMemo(() => Math.max(1, ...dados.dias.map((d) => Math.max(d.emissoes, d.concluidas))), [dados.dias])
  const ultimaPagina = Math.max(0, Math.ceil(total / POR_PAGINA) - 1)
  const g = dados.geral

  return (
    <div className="space-y-6">
      {/* ── Números do topo */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ['Emissões', g.emissoes, `${g.emissoes_30d.toLocaleString('pt-BR')} nos últimos 30 dias`],
            ['Alunos que emitiram', g.alunos, `${g.alunos_30d.toLocaleString('pt-BR')} nos últimos 30 dias`],
            ['Cronogramas usados', g.cronogramas_usados, 'do catálogo, com ao menos 1 emissão'],
            ['Metas concluídas', g.concluidas, `${pct(g.concluidas, g.planejadas)}% do que foi planejado`],
          ] as [string, number, string][]
        ).map(([rotulo, valor, apoio]) => (
          <Card key={rotulo} className="p-4">
            <p className="text-3xl font-bold tabular-nums">{valor.toLocaleString('pt-BR')}</p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {rotulo}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/80">{apoio}</p>
          </Card>
        ))}
      </div>

      {/* ── Movimento diário */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
        <SecaoHeader
          icon={BarChart3}
          titulo="Movimento dos últimos 30 dias"
          subtitulo="Emissões e metas marcadas como concluídas, por dia"
        />
        <div className="flex items-end gap-[3px] px-4 py-4" style={{ height: 120 }}>
          {dados.dias.map((d) => (
            <div key={d.dia} className="flex h-full flex-1 flex-col justify-end gap-[2px]" title={`${d.dia}: ${d.emissoes} emissão(ões), ${d.concluidas} meta(s) concluída(s)`}>
              <div
                className="w-full rounded-t-sm bg-emerald-500/70"
                style={{ height: `${(d.concluidas / maxDia) * 55}%` }}
              />
              <div className="w-full rounded-t-sm bg-primary" style={{ height: `${(d.emissoes / maxDia) * 55}%` }} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> emissões
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/70" /> metas concluídas
          </span>
          <span className="ml-auto">dias sem movimento aparecem vazios, de propósito</span>
        </div>
      </Card>

      {/* ── Por cronograma */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
        <SecaoHeader
          icon={BarChart3}
          titulo="Por cronograma"
          subtitulo="O que o catálogo entrega de fato — e onde os alunos param"
        />
        {dados.cronogramas.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhuma emissão ainda. Assim que um aluno gerar, os números aparecem aqui.
          </p>
        ) : (
          <div className="divide-y">
            {dados.cronogramas.map((c) => (
              <div key={c.cronograma_id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/cronogramas/${c.cronograma_id}`} className="truncate font-medium hover:underline">
                    {c.nome}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {c.emissoes.toLocaleString('pt-BR')} emissão(ões) · {c.alunos.toLocaleString('pt-BR')} aluno(s)
                  </p>
                </div>
                {c.carga_horaria != null && (
                  <Badge variant="outline" className="shrink-0">
                    {c.carga_horaria}h
                  </Badge>
                )}
                <Barra feitas={c.concluidas} total={c.planejadas} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Por aluno */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
        <SecaoHeader
          icon={Users}
          titulo="Por aluno"
          subtitulo="Quem emitiu, quando, e quanto do plano já marcou como feito"
          acao={
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value)
                  setPagina(0)
                }}
                placeholder="Buscar por nome ou e-mail"
                className="h-8 w-56 pl-7"
              />
            </div>
          }
        />

        {carregando && alunos.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </p>
        ) : alunos.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {busca.trim() ? 'Nenhum aluno com esse nome ou e-mail emitiu cronograma.' : 'Nenhum aluno emitiu cronograma ainda.'}
          </p>
        ) : (
          <div className="divide-y">
            {alunos.map((a) => (
              <div key={a.estudante_id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.email ?? 'sem e-mail'} · {a.emissoes.toLocaleString('pt-BR')} emissão(ões) · última em{' '}
                    {fmtQuando(a.ultima)}
                  </p>
                </div>
                <Barra feitas={a.concluidas} total={a.planejadas} />
              </div>
            ))}
          </div>
        )}

        {total > POR_PAGINA && (
          <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5">
            <span className="text-xs text-muted-foreground">
              {(pagina * POR_PAGINA + 1).toLocaleString('pt-BR')}–
              {Math.min((pagina + 1) * POR_PAGINA, total).toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0 || carregando}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPagina((p) => Math.min(ultimaPagina, p + 1))}
                disabled={pagina >= ultimaPagina || carregando}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        O denominador do progresso é quantas metas o cronograma tem <strong>hoje</strong>. Reimportar um
        cronograma muda esse número — o progresso é uma leitura do estado atual, não uma foto do dia da
        emissão. Emissões de testador ficam de fora de todos os números.
      </p>
    </div>
  )
}
