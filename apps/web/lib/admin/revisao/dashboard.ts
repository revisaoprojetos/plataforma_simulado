import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { remember, chaveRelatorio } from '@/lib/cache/relatorio-cache'
import { sqlQuery } from '@/lib/data/sql'
import { hojeBrt, somaDias, diaSemana, diaBrt, quandoRel, diaRel, nomeCurto, MESES } from './datas'

// DASHBOARD (Plataforma Revisão) — TODA a computação vive aqui (backend-first). A página só LÊ o resultado
// pronto (memoizado no Redis, TTL curto). Cada bloco é tolerante: tabela/migration ausente → zero/lista vazia,
// nunca quebra a página. Escopo: tenant SEMPRE explícito.

export type TipoEvento = 'live' | 'aula' | 'sim' | 'mentoria' | 'prazo'
export const EVENTO_TIPOS: { id: TipoEvento; rotulo: string }[] = [
  { id: 'live', rotulo: 'Live' },
  { id: 'aula', rotulo: 'Aula ao vivo' },
  { id: 'sim', rotulo: 'Simulado' },
  { id: 'mentoria', rotulo: 'Mentoria' },
  { id: 'prazo', rotulo: 'Prazo' },
]

export type EventoCal = { id: string; data: string; hora: string; titulo: string; tipo: TipoEvento; grupos: string[] }
export type DiaCal = { iso: string; dia: number; sem: number; hoje: boolean; fora: boolean; eventos: EventoCal[] }

export type MassaLinha = { id: string; data: string; titulo: string; descricao: string; tipo: string; materiais: number; alunosAvisados: number }

export type DashboardRevisao = {
  hoje: string
  kpis: { cursosAbertos: number; alunosAtivos: number; estudaramHoje: number; questoes: number; pdfs: number }
  /** Grade pronta: 7 dias da semana atual e 42 do mês (domingo→sábado). */
  semana: DiaCal[]
  mes: DiaCal[]
  mesRotulo: string
  proximos: EventoCal[]
  totalProximos: number
  duvidas: {
    semResposta: number
    maisAntiga: string | null
    respondidas7d: number
    problemasAbertos: number
    mediaAval: number | null
    notasBaixas: number
    porDisciplina: { nome: string; n: number }[]
    ultimas: { id: string; tema: string; disciplina: string; aluno: string; quando: string; onde: string }[]
  }
  massa: { ultima: (MassaLinha & { quando: string }) | null; linhas: MassaLinha[] }
}

async function seguro<T>(fn: () => PromiseLike<T> | T, vazio: T): Promise<T> {
  try { return await fn() } catch (e) { console.warn('[revisao/dashboard] bloco falhou:', (e as Error)?.message ?? e); return vazio }
}

type Svc = ReturnType<typeof createAdminClient>

async function contar(q: PromiseLike<{ count: number | null; error?: unknown }>): Promise<number> {
  const { count, error } = await q
  if (error) throw new Error((error as { message?: string }).message ?? 'erro de consulta')
  return count ?? 0
}

/** Lista de uma consulta PostgREST; erro vira exceção (o `seguro` registra e devolve o vazio). */
async function lista<T = any>(q: PromiseLike<{ data: T[] | null; error?: unknown }>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new Error((error as { message?: string }).message ?? 'erro de consulta')
  return data ?? []
}

// ── KPIs ────────────────────────────────────────────────────────────────────────────────────────
async function kpis(svc: Svc, t: string, hoje: string): Promise<DashboardRevisao['kpis']> {
  const agoraIso = new Date().toISOString()
  const [cursosAbertos, alunosAtivos, estudaramHoje, questoes, pdfs] = await Promise.all([
    // curso em aberto = produto ativo cujo acesso não expirou (validade 'data_fixa' no passado = fechado)
    seguro(async () => {
      const { data } = await svc.from('simulado_produtos').select('validade_tipo, validade_data').eq('tenant_id', t).eq('ativo', true).limit(2000)
      return (data ?? []).filter((p: any) => p.validade_tipo !== 'data_fixa' || !p.validade_data || p.validade_data > agoraIso).length
    }, 0),
    // aluno ativo = estudante (não excluído) com ao menos 1 assinatura/acesso ativo; sem assinaturas cadastradas
    // (tenant sem integração) cai para o total de estudantes não excluídos.
    seguro(async () => {
      const r = await sqlQuery<{ n: string }>(
        `SELECT count(DISTINCT a.estudante_id)::text AS n
           FROM simulado_assinaturas a
           JOIN simulado_estudantes e ON e.id = a.estudante_id AND e.tenant_id = $1 AND e.deletado = false
          WHERE a.tenant_id = $1 AND a.status = 'ativo' AND (a.expira_em IS NULL OR a.expira_em > now())`,
        [t],
      )
      if (r && Number(r[0]?.n ?? 0) > 0) return Number(r[0].n)
      return contar(svc.from('simulado_estudantes').select('id', { count: 'exact', head: true }).eq('tenant_id', t).eq('deletado', false))
    }, 0),
    // estudaram hoje = alunos distintos com tempo de estudo registrado hoje (dia BRT)
    seguro(async () => {
      const r = await sqlQuery<{ n: string }>(
        `SELECT count(DISTINCT estudante_id)::text AS n FROM simulado_tempo_estudo WHERE tenant_id = $1 AND dia = $2::date AND segundos > 0`,
        [t, hoje],
      )
      if (r) return Number(r[0]?.n ?? 0)
      const { data } = await svc.from('simulado_tempo_estudo').select('estudante_id').eq('tenant_id', t).eq('dia', hoje).gt('segundos', 0).limit(50000)
      return new Set((data ?? []).map((x: any) => x.estudante_id)).size
    }, 0),
    seguro(() => contar(svc.from('simulado_questoes').select('id', { count: 'exact', head: true }).eq('tenant_id', t).eq('deletado', false)), 0),
    seguro(() => contar(svc.from('simulado_conteudo_documentos').select('id', { count: 'exact', head: true }).eq('tenant_id', t).eq('categoria', 'conteudo').eq('deletado', false).eq('status', 'publicado').neq('tipo_origem', 'video')), 0),
  ])
  return { cursosAbertos, alunosAtivos, estudaramHoje, questoes, pdfs }
}

// ── Calendário ──────────────────────────────────────────────────────────────────────────────────
async function eventos(svc: Svc, t: string, hoje: string) {
  const [y, m] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))]
  const primeiro = `${y}-${String(m).padStart(2, '0')}-01`
  const gradeIni = somaDias(primeiro, -diaSemana(primeiro))
  const gradeFim = somaDias(gradeIni, 41)

  const sel = 'id, data, hora, titulo, tipo, grupo_id'
  const [grade, prox, totalProx] = await Promise.all([
    seguro(() => lista(svc.from('simulado_eventos_calendario').select(sel).eq('tenant_id', t)
      .gte('data', gradeIni).lte('data', gradeFim).order('data').order('hora').order('id').limit(1000)), [] as any[]),
    seguro(() => lista(svc.from('simulado_eventos_calendario').select(sel).eq('tenant_id', t)
      .gte('data', hoje).order('data').order('hora').order('id').limit(4)), [] as any[]),
    seguro(() => contar(svc.from('simulado_eventos_calendario').select('id', { count: 'exact', head: true }).eq('tenant_id', t).gte('data', hoje)), 0),
  ])

  // nomes dos grupos (chunk 80)
  const ids = [...new Set([...grade, ...prox].map((e: any) => e.grupo_id as string | null).filter(Boolean) as string[])]
  const nomes = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 80) {
    const { data } = await svc.from('simulado_grupos').select('id, nome').eq('tenant_id', t).in('id', ids.slice(i, i + 80))
    for (const g of (data ?? []) as any[]) nomes.set(g.id, g.nome)
  }
  const map = (e: any): EventoCal => ({
    id: e.id, data: e.data, hora: String(e.hora ?? '').slice(0, 5), titulo: e.titulo,
    tipo: (['live', 'aula', 'sim', 'mentoria', 'prazo'].includes(e.tipo) ? e.tipo : 'live') as TipoEvento,
    grupos: (e.grupo_id ? [nomes.get(e.grupo_id)] : []).filter(Boolean) as string[],
  })
  const evs = grade.map(map)
  const porDia = new Map<string, EventoCal[]>()
  for (const e of evs) porDia.set(e.data, [...(porDia.get(e.data) ?? []), e])

  const dia = (iso: string, fora: boolean): DiaCal => ({ iso, dia: Number(iso.slice(8)), sem: diaSemana(iso), hoje: iso === hoje, fora, eventos: porDia.get(iso) ?? [] })
  const semIni = somaDias(hoje, -diaSemana(hoje))
  return {
    semana: Array.from({ length: 7 }, (_, i) => dia(somaDias(semIni, i), false)),
    mes: Array.from({ length: 42 }, (_, i) => { const iso = somaDias(gradeIni, i); return dia(iso, Number(iso.slice(5, 7)) !== m) }),
    mesRotulo: `${MESES[m - 1]} ${y}`,
    proximos: prox.map(map),
    totalProximos: totalProx,
  }
}

// ── Central de Dúvidas (resumo) ─────────────────────────────────────────────────────────────────
async function duvidas(svc: Svc, t: string): Promise<DashboardRevisao['duvidas']> {
  const ha7 = new Date(Date.now() - 7 * 864e5).toISOString()
  const [semResposta, respondidas7d, problemasAbertos, abertas, ultimasRaw, aval] = await Promise.all([
    seguro(() => contar(svc.from('simulado_duvidas').select('id', { count: 'exact', head: true }).eq('tenant_id', t).eq('status', 'aberta')), 0),
    seguro(() => contar(svc.from('simulado_duvidas').select('id', { count: 'exact', head: true }).eq('tenant_id', t).in('status', ['respondida', 'resolvida']).gte('atualizado_em', ha7)), 0),
    seguro(() => contar(svc.from('simulado_material_reportes').select('id', { count: 'exact', head: true }).eq('tenant_id', t).in('status', ['aberto', 'em_analise'])), 0),
    seguro(() => fetchAll<{ id: string; disciplina_id: string | null; criado_em: string }>(() =>
      svc.from('simulado_duvidas').select('id, disciplina_id, criado_em').eq('tenant_id', t).eq('status', 'aberta').order('id', { ascending: true })), []),
    seguro(() => lista(svc.from('simulado_duvidas').select('id, titulo, disciplina_id, estudante_id, origem, criado_em')
      .eq('tenant_id', t).eq('status', 'aberta').order('criado_em', { ascending: false }).order('id').limit(3)), [] as any[]),
    seguro(async () => {
      const r = await sqlQuery<{ media: string | null; baixas: string }>(
        `SELECT avg(nota)::text AS media, count(*) FILTER (WHERE nota <= 2)::text AS baixas FROM simulado_material_avaliacoes WHERE tenant_id = $1`, [t])
      if (r) return { media: r[0]?.media != null ? Number(r[0].media) : null, baixas: Number(r[0]?.baixas ?? 0) }
      const rows = await fetchAll<{ nota: number }>(() => svc.from('simulado_material_avaliacoes').select('nota, id').eq('tenant_id', t).order('id', { ascending: true }))
      return { media: rows.length ? rows.reduce((s, x) => s + x.nota, 0) / rows.length : null, baixas: rows.filter((x) => x.nota <= 2).length }
    }, { media: null as number | null, baixas: 0 }),
  ])

  const discIds = [...new Set([...abertas.map((d) => d.disciplina_id), ...ultimasRaw.map((d: any) => d.disciplina_id)].filter(Boolean))] as string[]
  const nomesDisc = new Map<string, string>()
  for (let i = 0; i < discIds.length; i += 80) {
    const { data } = await svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', t).in('id', discIds.slice(i, i + 80))
    for (const d of (data ?? []) as any[]) nomesDisc.set(d.id, d.nome)
  }
  const estIds = [...new Set(ultimasRaw.map((d: any) => d.estudante_id).filter(Boolean))] as string[]
  const nomesEst = new Map<string, string>()
  if (estIds.length) {
    const { data } = await svc.from('simulado_estudantes').select('id, nome').eq('tenant_id', t).in('id', estIds)
    for (const e of (data ?? []) as any[]) nomesEst.set(e.id, e.nome)
  }

  const cont = new Map<string, number>()
  for (const d of abertas) { const n = d.disciplina_id ? nomesDisc.get(d.disciplina_id) ?? 'Sem disciplina' : 'Sem disciplina'; cont.set(n, (cont.get(n) ?? 0) + 1) }
  const maisAntiga = abertas.length ? abertas.reduce((a, b) => (a.criado_em < b.criado_em ? a : b)).criado_em : null

  const ORIGEM: Record<string, string> = { pdf: 'PDF', aula: 'Aula', questao: 'Questão', geral: 'Geral' }
  return {
    semResposta, maisAntiga: maisAntiga ? diaRel(diaBrt(maisAntiga)) : null, respondidas7d, problemasAbertos,
    mediaAval: aval.media, notasBaixas: aval.baixas,
    porDisciplina: [...cont.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR')),
    ultimas: ultimasRaw.map((d: any) => ({
      id: d.id, tema: d.titulo, disciplina: d.disciplina_id ? nomesDisc.get(d.disciplina_id) ?? '—' : '—',
      aluno: nomeCurto(nomesEst.get(d.estudante_id)), quando: quandoRel(d.criado_em),
      onde: (d.origem?.label as string | undefined)?.trim() || ORIGEM[d.origem?.tipo as string] || 'Geral',
    })),
  }
}

// ── Atualizações em massa ───────────────────────────────────────────────────────────────────────
// Fonte REAL = Central de Atualizações (simulado_conteudo_atualizacoes). "Em massa" = o MESMO texto registrado no
// mesmo dia (Brasília) em 2+ materiais. Alunos avisados = alunos distintos que receberam a notificação
// 'material_atualizado' (simulado_notificacoes) de algum desses materiais naquele dia.
const TIPO_MASSA: Record<string, string> = { legislacao: 'Legislação', jurisprudencia: 'Jurisprudência', correcao: 'Correção', conteudo_novo: 'Correção' }
async function massa(_svc: Svc, t: string): Promise<DashboardRevisao['massa']> {
  const r = await seguro(() => sqlQuery<{ d: string; texto: string; tipo: string; n: string; docs: string | null; avisados: string }>(
    `WITH g AS (
       SELECT (a.criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS d, a.texto, a.tipo,
              array_agg(DISTINCT a.documento_id) AS docs, count(DISTINCT a.documento_id) AS n
         FROM simulado_conteudo_atualizacoes a
        WHERE a.tenant_id = $1
        GROUP BY 1, 2, 3 HAVING count(DISTINCT a.documento_id) >= 2
        ORDER BY 1 DESC LIMIT 4)
     SELECT g.d::text AS d, g.texto, g.tipo, g.n::text AS n,
            (SELECT string_agg(titulo, ', ') FROM (SELECT titulo FROM simulado_conteudo_documentos WHERE id = ANY(g.docs) ORDER BY titulo LIMIT 2) z) AS docs,
            (SELECT count(DISTINCT nt.estudante_id) FROM simulado_notificacoes nt
              WHERE nt.tenant_id = $1 AND nt.tipo = 'material_atualizado'
                AND (nt.criado_em AT TIME ZONE 'America/Sao_Paulo')::date = g.d
                AND nt.link IN (SELECT '/aluno/nova/painel/leitor/' || x::text FROM unnest(g.docs) x))::text AS avisados
       FROM g ORDER BY g.d DESC`, [t]), null)
  const linhas: MassaLinha[] = (r ?? []).map((x) => ({
    id: `${x.d}|${x.texto.slice(0, 40)}`, data: x.d, titulo: x.texto.length > 90 ? `${x.texto.slice(0, 90)}…` : x.texto,
    descricao: `${x.docs ?? ''}${Number(x.n) > 2 ? ` e mais ${Number(x.n) - 2}` : ''}`, tipo: TIPO_MASSA[x.tipo] ?? 'Correção',
    materiais: Number(x.n), alunosAvisados: Number(x.avisados),
  }))
  const ult = linhas[0]
  return { ultima: ult ? { ...ult, quando: diaRel(ult.data) } : null, linhas }
}

async function calcular(t: string): Promise<DashboardRevisao> {
  const svc = createAdminClient()
  const hoje = hojeBrt()
  const [k, cal, d, m] = await Promise.all([kpis(svc, t, hoje), eventos(svc, t, hoje), duvidas(svc, t), massa(svc, t)])
  return { hoje, kpis: k, ...cal, duvidas: d, massa: m }
}

/** Dashboard pronto (memoizado 2 min por tenant+dia). A página só lê. */
export async function carregarDashboardRevisao(tenantId: string): Promise<DashboardRevisao> {
  return remember(chaveRelatorio(tenantId, 'revisao-inicio', hojeBrt()), 120, () => calcular(tenantId))
}

