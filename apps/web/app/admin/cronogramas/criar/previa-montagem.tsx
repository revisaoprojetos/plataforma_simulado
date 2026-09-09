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
  links = [],
  rotuloPlataforma = (s) => s,
}: {
  metas: MetaMontada[]
  semanas: number[]
  linhas: { id: string; tipo: string; duracao: string | null; somenteComDado?: boolean }[]
  diasNome: string[]
  rotuloTipo: (s: string) => string
  usaLinksTipo: (s: string) => boolean
  /** Links (QC/TEC/PDF/vídeo) montados por (disciplina, aula) — para exibir nas linhas com `usaLinks`. */
  links?: { disciplina: string; aula: string | null; tema: string; urls: Record<string, string> }[]
  rotuloPlataforma?: (slug: string) => string
}) {
  // Linhas "informativas" (LegProc): a célula mostra só a informação (a legislação), sem "Aula N".
  const soConteudo = useMemo(() => new Set(linhas.filter((l) => l.somenteComDado).map((l) => l.tipo)), [linhas])
  // Lookup dos links por (disciplina, aula) — a linha de Resolução guarda os links à parte da meta.
  const chaveLink = (disc: string, aula: string | null) => `${disc.trim().toLowerCase()}|${(aula ?? '').trim().toLowerCase()}`
  const linkPorChave = useMemo(() => {
    const m = new Map<string, { tema: string; urls: Record<string, string> }>()
    for (const l of links) m.set(chaveLink(l.disciplina, l.aula), { tema: l.tema, urls: l.urls })
    return m
  }, [links])
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
    if (usaLinksTipo(m.tipo)) {
      const link = linkPorChave.get(chaveLink(m.disciplina, m.aula))
      const urls = link ? Object.entries(link.urls).filter(([, u]) => (u ?? '').trim()) : []
      return (
        <>
          <span className="font-medium">{m.disciplina}: Aula {m.aula}</span>
          {link?.tema ? <span className="block text-muted-foreground">{link.tema}</span> : null}
          {urls.length > 0 ? (
            <span className="mt-0.5 flex flex-wrap gap-1">
              {urls.map(([slug, url]) => (
                <a key={slug} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="rounded bg-primary/10 px-1 py-px text-[10px] font-medium text-primary hover:underline">
                  {rotuloPlataforma(slug)}
                </a>
              ))}
            </span>
          ) : m.questaoIds?.length ? (
            <span className="block text-muted-foreground">{m.questaoIds.length} questão(ões)</span>
          ) : (
            <span className="block italic text-muted-foreground/60">sem links cadastrados</span>
          )}
        </>
      )
    }
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
