/**
 * Calendário CONGELADO da emissão — módulo PURO (sem I/O).
 *
 * Problema: a emissão guardava só o formulário e remontava a grade a cada abertura. Se o
 * admin adicionasse/removesse uma semana no catálogo, TODAS as datas seguintes do aluno se
 * deslocavam sem aviso. Aqui, ao gerar a emissão gravamos o calendário (semana → datas) e
 * `gerarGradeCongelada` o reaplica: as DATAS das semanas não mudam; o CONTEÚDO das metas
 * continua vivo (corrigir um texto no catálogo ainda reflete). Metas de semanas que não
 * existiam no calendário congelado NÃO entram em silêncio — viram aviso + `desatualizada`.
 */

import { BLOCOS_REVISAO, datarMetas, montarResumoGrade } from './gerador'
import type { CronogramaFonte, Grade, LinkAula, MapaTipos, MetaFonte, SemanaGrade } from './tipos'

export type SlotConteudo = { kind: 'conteudo'; numero: number; inicio: string; fim: string; semanaCatalogo: number }
export type SlotSemMeta = { kind: 'revisao' | 'recesso'; numero: number; inicio: string; fim: string }
export type SlotCongelado = SlotConteudo | SlotSemMeta

export type CalendarioCongelado = {
  v: 1
  dias_curso: number[]
  dias_nome: string[]
  slots: SlotCongelado[]
}

/** Extrai o calendário de uma grade recém-gerada (semana de conteúdo → semana do catálogo). */
export function congelarCalendario(grade: Grade, cron: Pick<CronogramaFonte, 'dias_curso' | 'dias_nome'>): CalendarioCongelado {
  const slots: SlotCongelado[] = grade.semanas.map((s) => {
    if (s.kind === 'conteudo') {
      return { kind: 'conteudo', numero: s.numero, inicio: s.inicio, fim: s.fim, semanaCatalogo: s.metas[0]?.semana ?? 0 }
    }
    return { kind: s.kind, numero: s.numero, inicio: s.inicio, fim: s.fim }
  })
  return { v: 1, dias_curso: [...cron.dias_curso], dias_nome: [...cron.dias_nome], slots }
}

/** Valida o formato lido do banco (jsonb pode vir de versão futura/corrompida). */
export function calendarioValido(x: unknown): x is CalendarioCongelado {
  const c = x as CalendarioCongelado | null
  return !!c && c.v === 1 && Array.isArray(c.slots) && c.slots.length > 0 && Array.isArray(c.dias_curso) && c.dias_curso.length > 0 &&
    Array.isArray(c.dias_nome) && c.slots.every((s) => s && typeof s.inicio === 'string' && typeof s.fim === 'string' && typeof s.kind === 'string')
}

/**
 * Reaplica o calendário congelado às metas VIVAS do catálogo.
 * `defasagem` descreve o que mudou no catálogo desde a emissão (para o aviso/botão "gerar de novo").
 */
export function gerarGradeCongelada(
  cron: Pick<CronogramaFonte, 'dias_curso' | 'dias_nome'> & Partial<CronogramaFonte>,
  metas: MetaFonte[],
  tipos: MapaTipos,
  links: Map<string, LinkAula>,
  cal: CalendarioCongelado,
): { ok: true; grade: Grade; defasagem: { semanasNovas: number[]; semanasVazias: number[] } } {
  const porSemana = new Map<number, MetaFonte[]>()
  for (const m of metas) {
    const l = porSemana.get(m.semana)
    if (l) l.push(m)
    else porSemana.set(m.semana, [m])
  }
  // dias do calendário congelado mandam: o índice `dia` da meta aponta para ELES.
  const cronFixo = { ...cron, dias_curso: cal.dias_curso, dias_nome: cal.dias_nome } as CronogramaFonte
  const avisos: string[] = []
  const usadas = new Set<number>()
  const semanasVazias: number[] = []

  const semanas: SemanaGrade[] = cal.slots.map((s) => {
    if (s.kind === 'revisao') return { kind: 'revisao', numero: s.numero, inicio: s.inicio, fim: s.fim, blocos: BLOCOS_REVISAO }
    if (s.kind === 'recesso') return { kind: 'recesso', numero: s.numero, inicio: s.inicio, fim: s.fim }
    const c = s as SlotConteudo
    usadas.add(c.semanaCatalogo)
    const doDia = porSemana.get(c.semanaCatalogo) ?? []
    if (!doDia.length) semanasVazias.push(c.semanaCatalogo)
    return { kind: 'conteudo', numero: c.numero, inicio: c.inicio, fim: c.fim, metas: datarMetas(doDia, c.inicio, cronFixo, tipos, links, avisos) }
  })

  const semanasNovas = [...porSemana.keys()].filter((n) => !usadas.has(n)).sort((a, b) => a - b)
  if (semanasNovas.length) {
    const n = semanasNovas.reduce((acc, s) => acc + (porSemana.get(s)?.length ?? 0), 0)
    avisos.push(`O catálogo ganhou ${n} meta(s) nas semana(s) ${semanasNovas.join(', ')} depois que este cronograma foi gerado. Gere novamente para incluí-las (as datas atuais foram mantidas).`)
  }
  if (semanasVazias.length) {
    avisos.push(`A(s) semana(s) ${semanasVazias.join(', ')} do catálogo ficaram sem metas depois que este cronograma foi gerado.`)
  }

  return { ok: true, grade: { semanas, resumo: montarResumoGrade(semanas, cronFixo), avisos: [...new Set(avisos)] }, defasagem: { semanasNovas, semanasVazias } }
}

/** Conclui se a emissão está desatualizada em relação ao cronograma (versões diferentes). */
export function emissaoDesatualizada(versaoCronograma: number | null | undefined, versaoEmissao: number | null | undefined): boolean {
  if (versaoCronograma == null || versaoEmissao == null) return false // sem migration / emissão antiga: não acusa
  return versaoCronograma !== versaoEmissao
}
