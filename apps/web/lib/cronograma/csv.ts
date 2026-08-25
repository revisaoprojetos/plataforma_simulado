/**
 * CSV do cronograma (spec §7.3).
 *
 * Nove colunas, uma linha por meta, **sem aplicar os filtros da tela** — o CSV é a grade
 * inteira. Semanas de revisão e recesso não aparecem, porque não têm metas.
 *
 * Uma divergência deliberada da tela, que a própria spec registra: aqui os links vêm em
 * QUALQUER tipo de meta, não só nas de questões (R11 vale para a tela e o DOCX).
 *
 * Módulo PURO — o mesmo dado gera o arquivo no servidor e a prévia no cliente.
 */

import { fmtBr } from './datas'
import type { Grade } from './tipos'

export const COLUNAS_CSV = [
  'Cronograma',
  'Semana',
  'Data',
  'Dia',
  'Tipo',
  'Disciplina',
  'Conteúdo',
] as const

/**
 * Monta as linhas do CSV. As colunas de link são dinâmicas: uma por plataforma
 * cadastrada, em vez das duas fixas ("Link QC" / "Link TEC") do gerador legado.
 */
export function montarCsv(grade: Grade, nomeCronograma: string): { cabecalho: string[]; linhas: string[][] } {
  // Descobre as plataformas presentes, na ordem de exibição delas.
  const plataformas = new Map<string, { nome: string; ordem: number }>()
  for (const s of grade.semanas) {
    if (s.kind !== 'conteudo') continue
    for (const m of s.metas) {
      for (const u of m.links?.urls ?? []) plataformas.set(u.plataforma.id, { nome: u.plataforma.nome, ordem: u.plataforma.ordem })
    }
  }
  const ordenadas = [...plataformas.entries()].sort((a, b) => a[1].ordem - b[1].ordem)

  const cabecalho = [...COLUNAS_CSV, ...ordenadas.map(([, p]) => `Link ${p.nome}`)]
  const linhas: string[][] = []

  for (const s of grade.semanas) {
    if (s.kind !== 'conteudo') continue // revisão e recesso não têm metas
    for (const m of s.metas) {
      const porPlataforma = new Map((m.links?.urls ?? []).map((u) => [u.plataforma.id, u.url]))
      linhas.push([
        nomeCronograma,
        String(s.numero),
        fmtBr(m.data),
        m.diaNome,
        m.tipoDef.nome,
        m.disciplina,
        [m.titulo, m.complemento].filter(Boolean).join(' — '),
        ...ordenadas.map(([id]) => porPlataforma.get(id) ?? ''),
      ])
    }
  }

  return { cabecalho, linhas }
}

/**
 * Serializa no formato que o Excel pt-BR abre certo: BOM UTF-8, separador `;` e CRLF —
 * o mesmo de `lib/exportar.ts`, que o resto do admin já usa.
 */
export function serializarCsv(cabecalho: string[], linhas: string[][]): string {
  const escapar = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const corpo = [cabecalho, ...linhas].map((l) => l.map(escapar).join(';')).join('\r\n')
  return `﻿${corpo}`
}
