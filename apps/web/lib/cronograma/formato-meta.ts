/**
 * Formatação de uma meta para exibição — R11 a R15.
 *
 * Estas regras vieram do gerador legado e são fiéis a ele: o aluno reconhece o
 * cronograma pelo formato do texto tanto quanto pelo conteúdo.
 *
 * `chaveLink` é o PONTO ÚNICO DE VERDADE do casamento (disciplina, aula) com a tabela
 * de links. Motor, importador e CRUD de links usam esta função — se cada um normalizasse
 * do seu jeito, os três discordariam e os links sumiriam em massa.
 */

import { PSEUDO_DISCIPLINA, type LinkAula, type LinksMeta, type MetaFonte } from './tipos'

/**
 * Chave de casamento (disciplina, aula) — EXATA por definição (R11).
 *
 * "01" NÃO encontra "1": os dados reais têm as duas grafias e elas são aulas diferentes.
 * A única normalização aplicada é aparar espaços e caixa da DISCIPLINA (onde já houve
 * erro de digitação histórico); a AULA é preservada byte a byte.
 */
export function chaveLink(disciplina: string, aula: string | null | undefined): string | null {
  const a = (aula ?? '').trim()
  if (!a) return null
  return `${disciplina.trim().toLowerCase()}\u0000${a}`
}

/** Indexa os links pela mesma chave, para busca O(1) durante a montagem da grade. */
export function indexarLinks(links: LinkAula[]): Map<string, LinkAula> {
  const mapa = new Map<string, LinkAula>()
  for (const l of links) {
    const k = chaveLink(l.disciplina, l.aula)
    if (k) mapa.set(k, l)
  }
  return mapa
}

/**
 * R11 — links só aparecem em metas do tipo `quest`. Sem link, o texto é explícito
 * ("Não há link do QC"), nunca em branco: o aluno precisa saber que não existe, e não
 * ficar achando que a página quebrou.
 */
export function linksDaMeta(m: MetaFonte, links: Map<string, LinkAula>): LinksMeta | null {
  if (m.tipo !== 'quest') return null
  const l = links.get(chaveLink(m.disciplina, m.aula) ?? '\u0000')
  return {
    qc: l?.url_qc ? { url: l.url_qc } : { ausente: 'Não há link do QC' },
    tec: l?.url_tec ? { url: l.url_tec } : { ausente: 'Não há link do TEC' },
  }
}

/** R12 — número de um dígito ganha zero à esquerda na exibição ("1" → "01"). */
export function padAula(aula: string): string {
  return /^\d$/.test(aula) ? `0${aula}` : aula
}

/**
 * R14 — em `legproc` o conteúdo quebra em duas linhas: título e complemento.
 * O corte é no primeiro `Art.`/`Arts.`, ou no trecho entre parênteses ao final.
 */
export function quebrarLegproc(conteudo: string): { titulo: string; complemento: string | null } {
  const art = /\bArts?\./.exec(conteudo)
  if (art && art.index > 0) {
    return { titulo: conteudo.slice(0, art.index).trim().replace(/[–—-]\s*$/, '').trim(), complemento: conteudo.slice(art.index).trim() }
  }
  const par = /\s*\(([^()]*)\)\s*$/.exec(conteudo)
  if (par && par.index > 0) {
    return { titulo: conteudo.slice(0, par.index).trim(), complemento: par[1].trim() }
  }
  return { titulo: conteudo.trim(), complemento: null }
}

/**
 * Monta o texto da coluna "Conteúdo" — R12, R13, R14 e R15 num só lugar.
 *
 * R13: `Atividade` não é disciplina. Quando a meta é dela, o conteúdo vale sozinho,
 * sem o prefixo "Disciplina:" — são 5.015 linhas assim nos dados reais.
 */
export function rotuloConteudo(m: MetaFonte): { titulo: string; complemento: string | null } {
  const ehAtividade = m.disciplina.trim() === PSEUDO_DISCIPLINA
  const conteudo = (m.conteudo ?? '').trim()
  const aula = (m.aula ?? '').trim()

  // R15 — em `quest` com aula, exibe-se "Disciplina: Aula N"; o conteúdo original é ignorado.
  if (m.tipo === 'quest' && aula) {
    return { titulo: ehAtividade ? `Aula ${padAula(aula)}` : `${m.disciplina}: Aula ${padAula(aula)}`, complemento: null }
  }

  // R14 — legproc quebra em título + complemento.
  if (m.tipo === 'legproc' && conteudo) {
    const { titulo, complemento } = quebrarLegproc(conteudo)
    return { titulo: ehAtividade ? titulo : `${m.disciplina}: ${titulo}`, complemento }
  }

  // R12 — o prefixo "Aula NN -" só entra quando NÃO é legproc nem quest.
  const prefixo = aula && m.tipo !== 'legproc' && m.tipo !== 'quest' ? `Aula ${padAula(aula)} - ` : ''
  const corpo = `${prefixo}${conteudo}`.trim()
  if (ehAtividade) return { titulo: corpo || m.disciplina, complemento: null }
  return { titulo: corpo ? `${m.disciplina}: ${corpo}` : m.disciplina, complemento: null }
}
