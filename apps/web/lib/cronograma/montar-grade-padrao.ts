import 'server-only'

/**
 * Fonte ÚNICA de leitura dos dados do admin (metas, tipos, links de aula, questões) para montar a
 * grade do cronograma PADRÃO (Revisão). Usada pela geração/prévia (actions.ts) e pela reabertura
 * de emissão (emissoes-actions.ts) — antes cada uma tinha a sua cópia e as duas ignoravam
 * `disciplina_id`, ao contrário do admin (chaveLink prefere o id), o que quebrava o casamento
 * (disciplina, aula) quando a grafia diverge.
 */

import { fetchAll } from '@/lib/supabase/fetch-all'
import { chaveRelatorio, remember } from '@/lib/cache/relatorio-cache'
import { indexarLinks } from './formato-meta'
import { gerarGrade } from './gerador'
import { congelarCalendario, gerarGradeCongelada, type CalendarioCongelado } from './calendario-congelado'
import { contarQuestoesPorMeta, aplicarQtdQuestoes } from './questoes-meta'
import { mapaTiposMeta } from './carregar-tipos'
import type { Grade, LinkAula, MapaTipos, MetaFonte, OpcoesGeracao } from './tipos'

export const CAMPOS_CRONOGRAMA = 'id, slug, nome, total_semanas, dias_curso, dias_nome, semanas_revisao, carga_horaria'

/** Links de aula do tenant, indexados pela chave (disciplina_id | disciplina, aula). */
export async function carregarLinksAula(svc: any, tenantId: string) {
  return indexarLinks(await carregarListaLinksAula(svc, tenantId))
}

/** Lista CRUA (JSON-safe) dos links de aula do tenant — a forma cacheável; `indexarLinks` monta o Map depois. */
export async function carregarListaLinksAula(svc: any, tenantId: string): Promise<LinkAula[]> {
  const [aulas, urls, plataformas] = await Promise.all([
    fetchAll<{ id: string; disciplina: string; disciplina_id: string | null; aula: string; tema: string | null }>(() =>
      svc.from('simulado_cronograma_links').select('id, disciplina, disciplina_id, aula, tema').eq('tenant_id', tenantId).order('id') as any,
    ),
    fetchAll<{ link_id: string; plataforma_id: string; url: string }>(() =>
      svc.from('simulado_cronograma_aula_links').select('link_id, plataforma_id, url').eq('tenant_id', tenantId).order('id') as any,
    ),
    fetchAll<{ id: string; nome: string; slug: string; cor: string | null; ordem: number }>(() =>
      svc.from('simulado_cronograma_plataformas').select('id, nome, slug, cor, ordem').eq('tenant_id', tenantId).eq('ativo', true).order('ordem') as any,
    ),
  ])

  const porId = new Map(plataformas.map((p) => [p.id, p]))
  const urlsPorLink = new Map<string, { plataforma: any; url: string }[]>()
  for (const u of urls) {
    const p = porId.get(u.plataforma_id)
    if (!p) continue
    const lista = urlsPorLink.get(u.link_id)
    if (lista) lista.push({ plataforma: p, url: u.url })
    else urlsPorLink.set(u.link_id, [{ plataforma: p, url: u.url }])
  }

  return aulas.map((a) => ({
    disciplina: a.disciplina,
    disciplina_id: a.disciplina_id ?? null,
    aula: a.aula,
    tema: a.tema,
    urls: urlsPorLink.get(a.id) ?? [],
  }))
}

export type DadosGrade = { metas: MetaFonte[]; tipos: MapaTipos; links: ReturnType<typeof indexarLinks>; qtd: Map<string, number> }
export type OpcoesDados = {
  /** Lê metas/links/contagem de questões do cache curto (60 s) compartilhado entre alunos. Só a reabertura de emissão usa. */
  cache?: boolean
  /** versao_grade do cronograma (entra na chave do cache: edição do catálogo no admin invalida). */
  versao?: number | null
}

/**
 * Tudo que a grade precisa do banco, em paralelo. Com `cache`, metas/links/contagem de questões vêm do cache curto
 * (60 s, por tenant+cronograma+versão): abrir a MESMA grade para N alunos não repete ~25 round-trips por aluno.
 */
export async function carregarDadosGrade(svc: any, tenantId: string, cronogramaId: string, o: OpcoesDados = {}): Promise<DadosGrade> {
  const ver = o.versao ?? 0
  const viaCache = <T,>(partes: (string | number)[], calcular: () => Promise<T>) =>
    o.cache ? remember<T>(chaveRelatorio(tenantId, 'crono-rev', ...partes), 60, calcular) : calcular()
  const [metas, tipos, lista] = await Promise.all([
    viaCache(['metas', cronogramaId, ver], () => carregarMetas(svc, tenantId, cronogramaId)),
    mapaTiposMeta(tenantId),
    viaCache(['links'], () => carregarListaLinksAula(svc, tenantId)),
  ])
  const entradas = await viaCache(['qtdq', cronogramaId, ver, metas.length], async () =>
    [...(await contarQuestoesPorMeta(svc, tenantId, metas.map((m) => m.id))).entries()])
  return { metas, tipos, links: indexarLinks(lista), qtd: new Map(entradas) }
}

/** Todas as metas do cronograma (fetchAll: o maior tem 1.142 e o PostgREST corta em 1.000). */
export function carregarMetas(svc: any, tenantId: string, cronogramaId: string) {
  return fetchAll<MetaFonte>(() =>
    svc
      .from('simulado_cronograma_metas')
      .select('id, semana, dia, tipo, disciplina, disciplina_id, aula, conteudo, duracao, ordem, simulado_id, simulado_externo_nome, simulado_externo_url')
      .eq('tenant_id', tenantId)
      .eq('cronograma_id', cronogramaId)
      .order('semana')
      .order('dia')
      .order('ordem')
      .order('id') as any,
  )
}

/**
 * Cronograma + metas + tipos + links + chip de questões → grade pronta. Não grava nada.
 *
 * - Sem `calendario`: gera a grade "ao vivo" (prévia / primeira emissão) e devolve o
 *   `calendario` resultante, que o chamador pode gravar para CONGELAR as datas.
 * - Com `calendario` (emissão já gerada): reaplica as datas congeladas às metas vivas; datas
 *   das semanas nunca se deslocam, mesmo que o catálogo ganhe/perca semanas.
 */
export async function montarGradePadrao(
  svc: any,
  tenantId: string,
  cron: any,
  opcoes: OpcoesGeracao,
  calendario?: CalendarioCongelado | null,
  extra?: OpcoesDados & { /** Carga já iniciada pelo chamador (em paralelo ao gate de acesso). */ dados?: Promise<DadosGrade> },
): Promise<{ ok: true; grade: Grade; calendario: CalendarioCongelado } | { ok: false; erro: string }> {
  const { metas, tipos, links, qtd } = await (extra?.dados ?? carregarDadosGrade(svc, tenantId, cron.id, extra))
  const fonte = {
    ...cron,
    carga_horaria: Number(cron.carga_horaria),
    dias_curso: cron.dias_curso ?? [],
    dias_nome: cron.dias_nome ?? [],
    semanas_revisao: cron.semanas_revisao ?? [],
  }
  let grade: Grade
  let cal: CalendarioCongelado
  if (calendario) {
    grade = gerarGradeCongelada(fonte, metas, tipos, links, calendario).grade
    cal = calendario
  } else {
    let r: ReturnType<typeof gerarGrade>
    try {
      r = gerarGrade(fonte, metas, tipos, links, opcoes)
    } catch {
      // Data de início corrompida na emissão (parseISO lança): erro de valor, não 500.
      return { ok: false, erro: 'A data de início deste cronograma é inválida. Gere um novo cronograma.' }
    }
    if (!r.ok) return r
    grade = r.grade
    cal = congelarCalendario(grade, fonte)
  }
  aplicarQtdQuestoes(grade, qtd)
  return { ok: true, grade, calendario: cal }
}
