'use client'

import { useMemo } from 'react'
import type { MetaMontada } from '@/lib/cronograma/montador'

/**
 * Prévia "Modelo": por semana, uma tabela dias × linhas (sem datas) — o revezamento como fica no
 * catálogo, antes de `gerarGrade` datar. É o que a coluna de controles produz ao vivo enquanto o
 * admin mexe nas linhas e conteúdos.
 */
export function PreviaMontagem({
  metas,
  semanas,
  linhas,
  diasNome,
  rotuloTipo,
  usaLinksTipo,
}: {
  metas: MetaMontada[]
  semanas: number[]
  linhas: { id: string; tipo: string; duracao: string | null; somenteComDado?: boolean }[]
  diasNome: string[]
  rotuloTipo: (s: string) => string
  usaLinksTipo: (s: string) => boolean
}) {
  // Linhas "informativas" (LegProc): a célula mostra só a informação (a legislação), sem "Aula N".
  const soConteudo = useMemo(() => new Set(linhas.filter((l) => l.somenteComDado).map((l) => l.tipo)), [linhas])
  const porSemana = useMemo(() => {
    const m = new Map<number, MetaMontada[]>()
    for (const x of metas) {
      const l = m.get(x.semana) ?? []
      l.push(x)
      m.set(x.semana, l)
    }
    return m
  }, [metas])
  // Todas as semanas com metas, de uma vez (sem "Ver mais").
  const visiveis = semanas.filter((s) => porSemana.has(s))

  const celula = (m: MetaMontada) => {
    if ((m.conteudo ?? '').toUpperCase().startsWith('CONTINUAÇÃO')) return <span className="text-muted-foreground">{m.conteudo}</span>
    // LegProc: mostra a informação (legislação), não "Aula N – Disciplina".
    if (soConteudo.has(m.tipo)) return <span>{m.conteudo || `Aula ${m.aula}`}</span>
    if (usaLinksTipo(m.tipo)) return <span className="font-medium">{m.disciplina}: Aula {m.aula}</span>
    return (
      <>
        <span className="font-medium">Aula {m.aula} – {m.disciplina}</span>
        {m.conteudo && <span className="block text-muted-foreground">{m.conteudo}</span>}
      </>
    )
  }

  return (
    <div className="space-y-2">
      {visiveis.map((sem) => {
        const daSemana = porSemana.get(sem) ?? []
        return (
          <div key={sem} className="overflow-hidden rounded-xl border">
            <div className="bg-primary/10 px-3 py-1.5 text-xs font-semibold">Semana {sem}</div>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-[11px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="w-24 px-2 py-1 text-left font-medium text-muted-foreground">Tipo</th>
                    {diasNome.map((d, i) => <th key={i} className="px-2 py-1 text-left font-medium text-muted-foreground">{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {/* Todas as linhas SEMPRE aparecem (mesmo vazias), para a semana 1 não ficar
                      diferente das demais. */}
                  {linhas.map((linha) => {
                    const daLinha = daSemana.filter((m) => m.tipo === linha.tipo)
                    return (
                      <tr key={linha.id} className="border-b align-top last:border-0">
                        <td className="px-2 py-1 text-muted-foreground">{rotuloTipo(linha.tipo)}{linha.duracao ? ` (${linha.duracao})` : ''}</td>
                        {diasNome.map((_, dia) => {
                          const cel = daLinha.filter((m) => m.dia === dia)
                          return (
                            <td key={dia} className="px-2 py-1">
                              {cel.map((m, k) => <div key={k} className="leading-tight">{celula(m)}</div>)}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
