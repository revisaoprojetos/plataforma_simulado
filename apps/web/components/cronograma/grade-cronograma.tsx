'use client'

/**
 * A grade do cronograma na tela — usada tanto ao gerar quanto ao reabrir uma emissão
 * salva, para as duas mostrarem exatamente a mesma coisa.
 *
 * Os filtros de semana e tipo agem AO VIVO sobre a grade já calculada. No gerador legado
 * era preciso clicar em "Gerar" de novo para o filtro valer — aqui não.
 */

import { useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fmtBr, fmtIntervalo } from '@/lib/cronograma/datas'
import { acharPaleta } from '@/lib/cronograma/paletas'
import type { Grade } from '@/lib/cronograma/tipos'

/**
 * Os quatro números do topo. Aceita `null` de propósito: na tela do aluno eles ficam visíveis
 * ANTES de gerar, com travessão no lugar do valor — assim o resultado preenche um formato que já
 * estava na tela, em vez de surgir do nada.
 */
export function ResumoGrade({ grade }: { grade: Grade | null }) {
  const numeros: [string, string | number][] = [
    ['Semanas', grade?.resumo.totalSemanas ?? '—'],
    ['Dias por semana', grade?.resumo.diasPorSemana ?? '—'],
    ['Atividades', grade?.resumo.atividades ?? '—'],
    ['Conclusão', grade?.resumo.conclusao ? fmtBr(grade.resumo.conclusao) : '—'],
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {numeros.map(([rotulo, valor]) => (
        <Card key={rotulo} className="p-4">
          <p className={`text-3xl font-bold tabular-nums ${grade ? '' : 'text-muted-foreground/40'}`}>{valor}</p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{rotulo}</p>
        </Card>
      ))}
    </div>
  )
}

export function GradeCronograma({ grade, paletaSlug, titulo }: { grade: Grade; paletaSlug: string; titulo?: string }) {
  const paleta = acharPaleta(paletaSlug)
  const [filtroSemana, setFiltroSemana] = useState('todas')
  const [filtroTipo, setFiltroTipo] = useState('todos')

  const semanas = useMemo(() => {
    let xs = grade.semanas
    if (filtroSemana !== 'todas') xs = xs.filter((s) => String(s.numero) === filtroSemana)
    if (filtroTipo === 'todos') return xs
    return xs
      .map((s) => (s.kind === 'conteudo' ? { ...s, metas: s.metas.filter((m) => m.tipo === filtroTipo) } : s))
      .filter((s) => s.kind !== 'conteudo' || s.metas.length > 0)
  }, [grade, filtroSemana, filtroTipo])

  // Só oferece tipos que existem nesta grade — um filtro que nunca acha nada é ruído.
  // A ordem e o rótulo vêm da definição do tipo, que o motor já anexou a cada meta.
  const tiposPresentes = useMemo(() => {
    const vistos = new Map<string, { slug: string; nome: string; ordem: number }>()
    for (const sem of grade.semanas) {
      if (sem.kind !== 'conteudo') continue
      for (const m of sem.metas) {
        if (!vistos.has(m.tipo)) vistos.set(m.tipo, { slug: m.tipo, nome: m.tipoDef.nome, ordem: m.tipoDef.ordem })
      }
    }
    return [...vistos.values()].sort((a, b) => a.ordem - b.ordem)
  }, [grade])

  if (!grade.semanas.length) return null

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        {titulo && <h2 className="mr-auto text-sm font-semibold">{titulo}</h2>}
        <Select value={filtroSemana} onValueChange={(v) => setFiltroSemana(v ?? 'todas')}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as semanas</SelectItem>
            {grade.semanas.map((s) => (
              <SelectItem key={s.numero} value={String(s.numero)}>
                Semana {s.numero}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v ?? 'todos')}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {tiposPresentes.map((t) => (
              <SelectItem key={t.slug} value={t.slug}>
                {t.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className={`text-xs text-muted-foreground ${titulo ? 'w-full sm:w-auto' : 'ml-auto'}`}>Os filtros valem na hora — não é preciso gerar de novo.</span>
      </div>

      <div className="divide-y">
        {semanas.map((s) => (
          <div key={s.numero}>
            <div
              className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm font-semibold text-white"
              style={{ background: s.kind === 'conteudo' ? paleta.primaria : paleta.revisao }}
            >
              <span>Semana {s.numero}</span>
              <span className="font-normal opacity-90">{fmtIntervalo(s.inicio, s.fim)}</span>
              {s.kind === 'revisao' && <Badge variant="secondary">Revisão</Badge>}
              {s.kind === 'recesso' && <Badge variant="secondary">Recesso</Badge>}
            </div>

            {s.kind === 'recesso' && (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                Não há metas programadas nesta semana; o cronograma será retomado na próxima segunda-feira.
              </p>
            )}

            {s.kind === 'revisao' &&
              s.blocos.map((b) => (
                <div key={b.titulo} className="px-4 py-2">
                  <p className="text-sm font-medium">{b.titulo}</p>
                  <p className="text-sm text-muted-foreground">{b.texto}</p>
                </div>
              ))}

            {s.kind === 'conteudo' &&
              s.metas.map((m) => (
                <div key={m.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5" style={{ background: paleta.celula }}>
                  <div className="w-24 shrink-0 text-xs">
                    <p className="font-medium">{fmtBr(m.data)}</p>
                    <p className="text-muted-foreground">{m.diaNome}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {m.tipoDef.nome}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{m.titulo}</p>
                    {m.complemento && <p className="text-xs text-muted-foreground">{m.complemento}</p>}
                    {m.tipo === 'simulado' && m.simulado_externo_url && (
                      <a href={m.simulado_externo_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                        {m.simulado_externo_nome ?? 'Abrir simulado'} <ExternalLink className="inline h-3 w-3" />
                      </a>
                    )}
                  </div>
                  {m.links && (
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {m.links.urls.map((u) => (
                        <a
                          key={u.plataforma.id}
                          href={u.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border bg-background/70 px-2 py-0.5 text-xs text-primary hover:bg-background"
                        >
                          {u.plataforma.nome}
                        </a>
                      ))}
                      {m.links.ausente && <span className="text-xs italic text-muted-foreground">{m.links.ausente}</span>}
                    </div>
                  )}
                  {m.duracao && <span className="shrink-0 text-xs text-muted-foreground">{m.duracao}</span>}
                </div>
              ))}
          </div>
        ))}
      </div>
    </Card>
  )
}
