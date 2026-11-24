import 'server-only'
import { sqlQuery } from '@/lib/data/sql'
import { remember } from '@/lib/cache/relatorio-cache'
import { createAdminClient } from '@/lib/supabase/server'
import { montarCobertura } from '@/lib/revisao/cronograma'
import { regrasDaRequisicao } from '@/app/admin/revisao/cronograma/adaptativo/comum'
import {
  agregarPorDisciplina, type LinhaDisciplinaGerador, type ResumoCronograma, type TipoMetaResumo,
} from '@/lib/admin/cronogramas-resumo'

// Resumo de "Cronogramas" (Gerador e Adaptativo) — SQL AGREGADO + cache de 60 s por tenant. A página só lê.
// Sem DATABASE_URL / SQL falhando: fallback PostgREST (head counts). Falha total LANÇA (não é cacheada) e a tela mostra aviso + "—".

const TTL = 60
const n = (v: unknown) => Number(v) || 0

export interface DadosGerador { resumo: ResumoCronograma; disciplinas: LinhaDisciplinaGerador[] }

async function carregarGerador(t: string): Promise<DadosGerador> {
  const [cron, aulas, metas, links, conj] = await Promise.all([
    sqlQuery<{ total: number; liberados: number }>(`SELECT count(*)::int total, count(*) FILTER (WHERE liberado_em IS NOT NULL)::int liberados FROM simulado_cronogramas WHERE tenant_id = $1 AND deletado = false`, [t]),
    sqlQuery<{ disciplina: string; aulas: number; itens: number }>(
      `SELECT coalesce(c.disciplina, c.nome, 'Sem disciplina') disciplina, count(DISTINCT (a.conjunto_id, a.aula))::int aulas, count(*)::int itens
         FROM simulado_cronograma_conjunto_aulas a JOIN simulado_cronograma_conjuntos c ON c.id = a.conjunto_id AND c.deletado = false
        WHERE a.tenant_id = $1 GROUP BY 1`, [t]),
    sqlQuery<{ disciplina: string; tipo: string; n: number }>(
      `SELECT coalesce(m.disciplina, 'Sem disciplina') disciplina, m.tipo, count(*)::int n
         FROM simulado_cronograma_metas m JOIN simulado_cronogramas c ON c.id = m.cronograma_id AND c.deletado = false
        WHERE m.tenant_id = $1 GROUP BY 1, 2`, [t]),
    sqlQuery<{ disciplina: string; n: number }>(`SELECT coalesce(disciplina, 'Sem disciplina') disciplina, count(*)::int n FROM simulado_cronograma_links WHERE tenant_id = $1 GROUP BY 1`, [t]),
    sqlQuery<{ n: number }>(`SELECT count(*)::int n FROM simulado_cronograma_conjuntos WHERE tenant_id = $1 AND deletado = false`, [t]),
  ])
  if (!cron || !aulas || !metas || !links || !conj) return carregarGeradorPostgrest(t)
  const disciplinas = agregarPorDisciplina(aulas.map((a) => ({ ...a, aulas: n(a.aulas), itens: n(a.itens) })), metas.map((m) => ({ ...m, n: n(m.n) })), links.map((l) => ({ ...l, n: n(l.n) })))
  const soma = (k: 'pdfull' | 'pdflash' | 'quest' | 'legproc' | 'juris') => disciplinas.reduce((s, d) => s + d[k], 0)
  // PDFight: não se aplica ao Gerador (null)
  const porTipo: Record<TipoMetaResumo, number | null> = { pdfull: soma('pdfull'), pdflash: soma('pdflash'), pdfight: null, quest: soma('quest'), legproc: soma('legproc'), juris: soma('juris') }
  const c = cron[0]
  return {
    disciplinas,
    resumo: {
      lado: 'gerador', aulas: disciplinas.reduce((s, d) => s + d.aulas, 0), itensAula: disciplinas.reduce((s, d) => s + d.itens, 0),
      disciplinas: n(conj[0]?.n), metasPorTipo: porTipo, links: disciplinas.reduce((s, d) => s + d.links, 0),
      cronogramas: n(c?.total), cronogramasDetalhe: `${n(c?.liberados)} liberados`,
    },
  }
}

/** Fallback PostgREST (head counts): sem DATABASE_URL ou com o SQL direto falhando. Sem detalhe por disciplina; aulas distintas = "—". */
async function carregarGeradorPostgrest(t: string): Promise<DadosGerador> {
  const svc = createAdminClient()
  const cont = async (tabela: string, filtro?: (q: any) => any): Promise<number> => {
    let q: any = svc.from(tabela).select('id', { count: 'exact', head: true }).eq('tenant_id', t)
    if (filtro) q = filtro(q)
    const { count, error } = await q
    if (error) throw new Error(`${tabela}: ${error.message}`)
    return count ?? 0
  }
  const naoDel = (q: any) => q.eq('deletado', false)
  const [total, liberados, conj, itens, links, pdfull, flash, quest, legproc, juris] = await Promise.all([
    cont('simulado_cronogramas', naoDel),
    cont('simulado_cronogramas', (q) => naoDel(q).not('liberado_em', 'is', null)),
    cont('simulado_cronograma_conjuntos', naoDel),
    cont('simulado_cronograma_conjunto_aulas'),
    cont('simulado_cronograma_links'),
    ...(['pdfull', 'flash', 'quest', 'legproc', 'juris'] as const).map((tp) => cont('simulado_cronograma_metas', (q) => q.eq('tipo', tp))),
  ])
  return {
    disciplinas: [],
    resumo: {
      lado: 'gerador', aulas: null, itensAula: itens, disciplinas: conj, links,
      metasPorTipo: { pdfull, pdflash: flash, pdfight: null, quest, legproc, juris },
      cronogramas: total, cronogramasDetalhe: `${liberados} liberados · leitura simplificada`,
    },
  }
}

export interface LeituraResumo<T> { dados: T | null; erro: string | null }

/** Lê com cache SÓ do sucesso (remember não guarda exceção). Falha = log no servidor + aviso na tela; nunca engolida. */
async function lerSeguro<T>(chave: string, carregar: () => Promise<T>): Promise<LeituraResumo<T>> {
  try { return { dados: await remember<T>(chave, TTL, carregar), erro: null } }
  catch (e) {
    console.error(`[resumo-cronogramas] ${chave} falhou:`, e)
    return { dados: null, erro: e instanceof Error ? e.message : 'erro desconhecido' }
  }
}

export const lerGerador = (tenantId: string) => lerSeguro<DadosGerador>(`revisao-cron:ger-resumo:${tenantId}`, () => carregarGerador(tenantId))

async function carregarAdaptativo(t: string): Promise<ResumoCronograma> {
  const svc = createAdminClient()
  const regras = await regrasDaRequisicao(t)
  const [cob, planos, defs, docs] = await Promise.all([
    montarCobertura(svc, t, regras.valores),
    sqlQuery<{ n: number }>(`SELECT count(*)::int n FROM simulado_cronograma_adaptativo_plano WHERE tenant_id = $1 AND arquivada = false`, [t]),
    sqlQuery<{ tipo: string; n: number; d: number }>(`SELECT tipo, count(*)::int n, count(DISTINCT disciplina)::int d FROM simulado_cronograma_adaptativo_meta_def WHERE tenant_id = $1 AND ativa = true GROUP BY 1`, [t]),
    // Documentos publicados por tipo de material (tipo herdado da pasta ancestral mais próxima).
    sqlQuery<{ tipo: string; n: number }>(
      `WITH RECURSIVE p AS (
         SELECT id, cronograma_tipo_material tipo FROM simulado_pastas WHERE tenant_id = $1 AND folder_area = 'conteudo' AND cronograma_tipo_material IS NOT NULL
         UNION ALL
         SELECT c.id, p.tipo FROM simulado_pastas c JOIN p ON c.pai_id = p.id WHERE c.tenant_id = $1 AND c.folder_area = 'conteudo' AND c.cronograma_tipo_material IS NULL)
       SELECT p.tipo, count(d.id)::int n FROM p JOIN simulado_conteudo_documentos d ON d.pasta_id = p.id AND d.tenant_id = $1 AND d.status = 'publicado' AND d.deletado = false GROUP BY 1`, [t]),
  ])
  // SQL direto indisponível/falhou: planos e LegProc via PostgREST; documentos da Biblioteca ficam "—" (null).
  const planosN = planos ? n(planos[0]?.n) : await contarPg(svc, 'simulado_cronograma_adaptativo_plano', t, (q) => q.eq('arquivada', false))
  const legN = defs ? n(defs.find((d) => d.tipo === 'legproc')?.n) : await contarPg(svc, 'simulado_cronograma_adaptativo_meta_def', t, (q) => q.eq('ativa', true).eq('tipo', 'legproc'))
  const linhas = cob.linhas
  const doc = (tipo: string) => n(docs?.find((d) => d.tipo === tipo)?.n)
  return {
    lado: 'adaptativo', aulas: linhas.length,
    disciplinas: cob.disciplinas.length,
    metasPorTipo: {
      pdfull: linhas.filter((l) => l.pag > 0 || l.documentoId).length,
      pdflash: linhas.filter((l) => l.temFlash).length,
      pdfight: linhas.filter((l) => l.temFight).length,
      quest: linhas.filter((l) => l.temQuestoes).length,
      legproc: legN,
      juris: null, // o Adaptativo não tem meta de Jurisprudência no catálogo
    },
    links: docs ? doc('pdfull') + doc('pdflash') + doc('pdfight') + doc('legproc') : null,
    cronogramas: planosN, cronogramasDetalhe: 'planos ativos de alunos',
  }
}

async function contarPg(svc: ReturnType<typeof createAdminClient>, tabela: string, t: string, filtro: (q: any) => any): Promise<number> {
  const { count, error } = await filtro(svc.from(tabela).select('id', { count: 'exact', head: true }).eq('tenant_id', t))
  if (error) throw new Error(`${tabela}: ${error.message}`)
  return count ?? 0
}

export const lerAdaptativo = (tenantId: string) => lerSeguro<ResumoCronograma>(`revisao-cron:ada-resumo:${tenantId}`, () => carregarAdaptativo(tenantId))
