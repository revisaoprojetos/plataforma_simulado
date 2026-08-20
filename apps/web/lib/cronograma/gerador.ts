/**
 * O motor do gerador de cronogramas — R1 a R7, R10, R11, R16, R17, R21.
 *
 * Módulo PURO: sem I/O, sem `server-only`, sem acesso a banco. Roda igual no servidor
 * (DOCX/CSV) e no cliente (tabela na tela, filtros ao vivo) — o que garante que o
 * documento baixado e a tela mostrem exatamente a mesma coisa.
 *
 * O que este arquivo faz, em uma frase: pega uma grade fixa do catálogo ("semana 7,
 * dia 2") e devolve um calendário datado e reprogramado ("quarta-feira, 24/09/2026"),
 * com as semanas de revisão e recesso que o aluno pediu.
 */

import { addDias, offsetDesdeSegunda, proximaSegunda, type DataISO } from './datas'
import { linksDaMeta, rotuloConteudo } from './formato-meta'
import { subtituloGrade } from './faixa'
import { montarPredicadoRecesso } from './recesso'
import {
  ORDEM_TIPO,
  TIPOS_FORA_DA_CONTAGEM,
  type BlocoRevisao,
  type CronogramaFonte,
  type Grade,
  type LinkAula,
  type MetaDatada,
  type MetaFonte,
  type OpcoesGeracao,
  type SemanaGrade,
  type TipoMeta,
} from './tipos'

/**
 * Guarda contra laço infinito: um recesso "Outras" longo (ou com `ate` no ano errado)
 * faz o alocador nunca consumir uma semana de conteúdo. 10 anos de calendário é folga
 * larga para o maior cronograma real (92 semanas) e barra o caso patológico.
 */
export const MAX_SEMANAS_CALENDARIO = 520

/** Texto fixo das semanas de revisão (spec §3). */
const BLOCOS_REVISAO: BlocoRevisao[] = [
  { titulo: 'Segunda e terça', texto: 'Revise as disciplinas de Direito Constitucional, Administrativo e Tributário.' },
  { titulo: 'Quarta e quinta', texto: 'Revise as disciplinas de Direito Civil, Processo Civil e Empresarial.' },
  { titulo: 'Sexta e sábado', texto: 'Revise as disciplinas de Direito Penal, Processo Penal e as demais matérias do seu edital.' },
]

type SlotPauta = { kind: 'conteudo'; metas: MetaFonte[] } | { kind: 'revisao' }

/**
 * R5 — descarta as semanas de revisão originais do cadastro e renumera o resto.
 *
 * Só sobrevivem as semanas que TÊM metas, e elas passam a ser 1..N sem buracos. Um
 * cronograma cadastrado com 34 semanas e revisões na 12 e na 24 vira 32 blocos de
 * conteúdo numerados 1…32 — é sobre esses 32 que a periodicidade de revisão (R6) conta.
 */
export function compactarSemanas(
  metas: MetaFonte[],
  semanasRevisao: number[],
): { blocos: MetaFonte[][]; avisos: string[] } {
  const revisao = new Set(semanasRevisao)
  const porSemana = new Map<number, MetaFonte[]>()
  const avisos: string[] = []
  const conflitos = new Set<number>()

  for (const m of metas) {
    if (revisao.has(m.semana)) {
      // Dado sujo: a semana está marcada como revisão E tem metas. `semanas_revisao`
      // vence (o gerador conta com isso em R5), mas a equipe precisa saber para corrigir.
      conflitos.add(m.semana)
      continue
    }
    const lista = porSemana.get(m.semana)
    if (lista) lista.push(m)
    else porSemana.set(m.semana, [m])
  }

  if (conflitos.size) {
    const lista = [...conflitos].sort((a, b) => a - b).join(', ')
    avisos.push(`Semana(s) ${lista} estão marcadas como revisão mas possuem metas cadastradas — as metas foram ignoradas.`)
  }

  const blocos = [...porSemana.keys()].sort((a, b) => a - b).map((s) => porSemana.get(s)!)
  return { blocos, avisos }
}

/**
 * R6 — insere uma semana exclusiva de revisão a cada K semanas de conteúdo.
 * Ela entra DEPOIS do bloco e ocupa posição própria na numeração final.
 *
 * FIEL AO GERADOR LEGADO: a revisão entra após CADA bloco fechado de K semanas,
 * inclusive quando esse bloco é o último — ou seja, um cronograma cujo total de
 * semanas de conteúdo seja múltiplo de K TERMINA numa semana de revisão. Pode
 * parecer uma semana órfã, mas é o comportamento que os alunos já conhecem;
 * mudar isso é decisão da equipe pedagógica, não do código.
 */
export function montarPauta(blocos: MetaFonte[][], revisao: OpcoesGeracao['revisao']): SlotPauta[] {
  const pauta: SlotPauta[] = []
  blocos.forEach((metas, i) => {
    pauta.push({ kind: 'conteudo', metas })
    if (revisao.ativo && (i + 1) % revisao.cada === 0) pauta.push({ kind: 'revisao' })
  })
  return pauta
}

/** R10 — dentro da semana: por dia, depois por tipo (ordem fixa), depois pela ordem de origem. */
export function ordenarMetas(metas: MetaFonte[]): MetaFonte[] {
  return [...metas].sort(
    (a, b) =>
      a.dia - b.dia ||
      ORDEM_TIPO.indexOf(a.tipo) - ORDEM_TIPO.indexOf(b.tipo) ||
      a.ordem - b.ordem,
  )
}

/**
 * R3 — data cada meta a partir do índice do dia.
 *
 * `meta.dia` é ÍNDICE em `dias_curso`: pega-se `dias_curso[dia]` (o dia da semana alvo)
 * e avança-se a partir da segunda até encontrá-lo. Por isso um cronograma
 * `[1,2,3,4,5,6,0]` tem o domingo como ÚLTIMO dia da semana, não como primeiro.
 */
function datarMetas(
  metas: MetaFonte[],
  inicioSemana: DataISO,
  cron: CronogramaFonte,
  links: Map<string, LinkAula>,
  avisos: string[],
): MetaDatada[] {
  const ultimo = cron.dias_curso.length - 1
  return ordenarMetas(metas).map((m) => {
    let idx = m.dia
    if (idx > ultimo || idx < 0) {
      // Dado fora do intervalo: cai na última coluna em vez de sumir sem explicação.
      avisos.push(`Meta com dia ${m.dia} fora dos ${cron.dias_curso.length} dias de curso — exibida no último dia.`)
      idx = ultimo
    }
    const { titulo, complemento } = rotuloConteudo(m)
    return {
      ...m,
      data: addDias(inicioSemana, offsetDesdeSegunda(cron.dias_curso[idx])),
      diaNome: cron.dias_nome[idx] ?? '',
      titulo,
      complemento,
      links: linksDaMeta(m, links),
    }
  })
}

/**
 * R7 — aplica o recesso no CALENDÁRIO, não na pauta.
 *
 * Percorre semana a semana do calendário: se a semana cai em recesso, ela é marcada e
 * NÃO consome um slot de conteúdo — o conteúdo é empurrado para a semana seguinte.
 * Efeito: o cronograma fica mais longo e a conclusão é adiada.
 */
function alocarNoCalendario(
  pauta: SlotPauta[],
  segunda: DataISO,
  ehRecesso: (inicio: DataISO) => boolean,
  cron: CronogramaFonte,
  links: Map<string, LinkAula>,
  avisos: string[],
): { ok: true; semanas: SemanaGrade[] } | { ok: false; erro: string } {
  const semanas: SemanaGrade[] = []
  let slot = 0
  let calendario = 0
  let numero = 1

  while (slot < pauta.length) {
    if (calendario >= MAX_SEMANAS_CALENDARIO) {
      return {
        ok: false,
        erro: 'O período de recesso informado é longo demais e o cronograma não conseguiria terminar. Revise as datas de recesso.',
      }
    }
    const inicio = addDias(segunda, calendario * 7)
    const fim = addDias(inicio, 6)
    calendario++

    if (ehRecesso(inicio)) {
      semanas.push({ kind: 'recesso', numero: numero++, inicio, fim })
      continue // não consome slot — o conteúdo escorrega para a próxima semana
    }

    const atual = pauta[slot++]
    semanas.push(
      atual.kind === 'revisao'
        ? { kind: 'revisao', numero: numero++, inicio, fim, blocos: BLOCOS_REVISAO }
        : { kind: 'conteudo', numero: numero++, inicio, fim, metas: datarMetas(atual.metas, inicio, cron, links, avisos) },
    )
  }

  return { ok: true, semanas }
}

/**
 * R21 — a duração impressa no DOCX é uma só por (semana, tipo): usa-se a PRIMEIRA
 * encontrada. Nos dados reais há 54 combinações com durações divergentes na mesma
 * semana e tipo; o comportamento é mantido fiel, mas o CRUD avisa a equipe.
 */
export function duracaoPorTipo(metas: MetaDatada[]): Map<TipoMeta, string> {
  const mapa = new Map<TipoMeta, string>()
  for (const m of metas) {
    const d = (m.duracao ?? '').trim()
    if (d && !mapa.has(m.tipo)) mapa.set(m.tipo, d)
  }
  return mapa
}

/**
 * Monta a grade completa: data (R2–R4) e reprograma (R5–R8) o cronograma do catálogo.
 *
 * Devolve `{ ok: false, erro }` em vez de lançar — o chamador é uma server action ou um
 * componente, e ambos precisam do erro como valor, não como exceção.
 */
export function gerarGrade(
  cron: CronogramaFonte,
  metas: MetaFonte[],
  links: Map<string, LinkAula>,
  op: OpcoesGeracao,
): { ok: true; grade: Grade } | { ok: false; erro: string } {
  if (!cron.dias_curso.length) return { ok: false, erro: 'O cronograma não tem dias de curso configurados.' }

  const segunda = proximaSegunda(op.inicio) // R1
  const { blocos, avisos } = compactarSemanas(metas, cron.semanas_revisao) // R5
  if (!blocos.length) return { ok: false, erro: 'Este cronograma ainda não tem metas cadastradas.' }

  const pauta = montarPauta(blocos, op.revisao) // R6
  const alocado = alocarNoCalendario(pauta, segunda, montarPredicadoRecesso(op), cron, links, avisos) // R7/R8
  if (!alocado.ok) return alocado

  const { semanas } = alocado
  const semanasConteudo = semanas.filter((s) => s.kind === 'conteudo').length
  const semanasRevisao = semanas.filter((s) => s.kind === 'revisao').length
  const semanasRecesso = semanas.filter((s) => s.kind === 'recesso').length

  // R16 — "Atividades" conta só as metas que não são `simulado` nem `juris`.
  let atividades = 0
  for (const s of semanas) {
    if (s.kind !== 'conteudo') continue
    for (const m of s.metas) if (!TIPOS_FORA_DA_CONTAGEM.includes(m.tipo)) atividades++
  }

  // R4 — a conclusão é o último DIA DE CURSO da última semana (não o domingo dela).
  const ultima = semanas[semanas.length - 1]
  const ultimoDia = cron.dias_curso[cron.dias_curso.length - 1]
  const conclusao = addDias(ultima.inicio, offsetDesdeSegunda(ultimoDia))

  return {
    ok: true,
    grade: {
      semanas,
      resumo: {
        totalSemanas: semanas.length, // R17 — já com revisões e recessos
        semanasConteudo,
        semanasRevisao,
        semanasRecesso,
        diasPorSemana: cron.dias_nome.length, // R17
        atividades,
        conclusao,
        subtitulo: subtituloGrade({ semanasConteudo, semanasRevisao, semanasRecesso }), // R9
      },
      avisos: [...new Set(avisos)],
    },
  }
}
