'use server'
import type { PainelLiberacao, EditorAulaBase, EditorLpBase, EditorCatalogo, PainelMetas, SimulacaoAluno, EstadoEspelho } from './actions-tipos'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import {
  lerCfgLiberacao, salvarCfgLiberacao, mapaDocsCronograma, simularLiberacaoAluno, normalizarCfg, hojeBrt,
  type CfgLiberacao, type MotivoLiberacao,
} from '@/lib/cronograma/adaptativo/liberacao'

import { esquecer } from '@/lib/cache/relatorio-cache'
import { lerCfgMetas, salvarCfgMetas } from '@/lib/cronograma/adaptativo/config-metas'
import { diagnosticarCatalogo, type CatalogoMotor } from '@/lib/cronograma/adaptativo/catalogo-diagnostico'
import { carregarConteudoBancoBase } from '@/lib/cronograma/adaptativo/conteudo-banco'
import { lerOverrideRow, salvarOverride } from '@/lib/cronograma/adaptativo/catalogo-override-db'
import { chavesUnicas, normalizarOverride, partirTexto, OVERRIDE_VAZIO, type CatalogoOverride } from '@/lib/cronograma/adaptativo/catalogo-override'
import { CATALOGO_HTML, chaveLeiHTML, chaveDisciplina } from '@/lib/cronograma/adaptativo/catalogo-html'
import origemCat from '@/lib/cronograma/adaptativo/catalogo-origem.json' // origem (planilha/aba/linha) de cada aula e meta — só servidor
import { PARAMS_PADRAO, normalizarParams, type ParamsAdaptativo } from '@/lib/cronograma/adaptativo/params'

async function acesso(acao: 'view' | 'update') {
  const a = await getCurrentAccess()
  const permitido = a.isAdmin || a.permissions.includes('*') || a.permissions.includes(`cronogramas:${acao}`)
  if (!a.tenantId || !permitido) return null
  return { tenantId: a.tenantId, userId: a.userId ?? null }
}


export async function obterPainelLiberacao(): Promise<{ ok: boolean; error?: string; painel?: PainelLiberacao }> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  try {
    const [cfg, mapa, planos, grp] = await Promise.all([
      lerCfgLiberacao(svc, g.tenantId),
      mapaDocsCronograma(svc, g.tenantId),
      svc.from('simulado_cronograma_adaptativo_plano').select('estudante_id').eq('tenant_id', g.tenantId).eq('arquivada', false).eq('exemplo', false),
      svc.from('simulado_grupos').select('id, nome').eq('tenant_id', g.tenantId).order('nome', { ascending: true }).limit(1000),
    ])
    const alunosComPlano = new Set(((planos.data ?? []) as Array<{ estudante_id: string }>).map((p) => p.estudante_id)).size
    let alunosExcecao: PainelLiberacao['alunosExcecao'] = []
    if (cfg.alunos.length) {
      const { data } = await svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', g.tenantId).in('id', cfg.alunos)
      alunosExcecao = ((data ?? []) as Array<{ id: string; nome: string | null; email: string | null }>).map((e) => ({ id: e.id, nome: e.nome || 'Aluno', email: e.email }))
    }
    return {
      ok: true,
      painel: {
        cfg, hoje: hojeBrt(),
        conteudo: { aulas: mapa.aulas, legproc: mapa.legproc, materiais: mapa.materiais },
        alunosComPlano,
        grupos: ((grp.data ?? []) as Array<{ id: string; nome: string | null }>).map((x) => ({ id: x.id, nome: x.nome || 'Grupo' })),
        alunosExcecao,
      },
    }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao carregar.' }
  }
}

export async function salvarPainelLiberacao(cfg: CfgLiberacao): Promise<{ ok: boolean; error?: string }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const antes = await lerCfgLiberacao(svc, g.tenantId)
  const depois = normalizarCfg(cfg)
  const r = await salvarCfgLiberacao(svc, g.tenantId, depois, g.userId)
  if (!r.ok) return r
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_cronograma_liberacao', entidadeId: g.tenantId, tenantId: g.tenantId,
    antes: { ...antes }, depois: { ...depois },
  }).catch(() => {})
  revalidatePath('/admin/cronogramas/adaptativo')
  return { ok: true }
}

export async function obterCatalogoMotor(): Promise<{ ok: boolean; error?: string; catalogo?: CatalogoMotor }> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  try { return { ok: true, catalogo: await diagnosticarCatalogo(createAdminClient(), g.tenantId) } }
  catch (e) { return { ok: false, error: (e as Error)?.message || 'Falha ao carregar.' } }
}

// ── Catálogo de metas (editor): aulas, links de questões, LegProc ────────────────────────────────

export async function obterEditorCatalogo(): Promise<{ ok: boolean; error?: string; editor?: EditorCatalogo }> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  try {
    const [c, row, planos, tab] = await Promise.all([
      carregarConteudoBancoBase(svc, g.tenantId),
      lerOverrideRow(svc, g.tenantId),
      svc.from('simulado_cronograma_adaptativo_plano').select('estudante_id').eq('tenant_id', g.tenantId).eq('arquivada', false).eq('exemplo', false),
      svc.from('simulado_cronograma_adaptativo_catalogo').select('tenant_id').limit(1),
    ])
    const baseAS = c.base?.AS ?? c.AS, baseOrdem = c.base?.ordem ?? c.ordem ?? baseAS.map((_, i) => i), baseLP = c.base?.LP ?? c.LP ?? []
    const modeloIdx = c.base?.modeloIdx ?? c.modeloIdx ?? []
    const chaves = chavesUnicas(baseAS)
    const ativasBase = new Set(baseOrdem)
    const origemLei = new Map<string, { arquivo?: string; aba?: string; linha?: number }>()
    {
      const n = new Map<string, number>()
      for (const k of CATALOGO_HTML.ordemLP) {
        const m = CATALOGO_HTML.legprocs[k]; if (!m) continue
        const chave = chaveLeiHTML(m.disc, m.lei), i = (n.get(chave) || 0) + 1; n.set(chave, i)
        const o = (origemCat.lp as Array<{ arquivo?: string; aba?: string; linha?: number } | null>)[k]
        if (o) origemLei.set(`lp:${chave}:${i}`, o)
      }
    }
    const mats = CATALOGO_HTML.materiais as Record<string, EditorAulaBase['mat']>
    const origemAula = origemCat.mat as Record<string, EditorAulaBase['origem']>
    const aulas: EditorAulaBase[] = baseAS.map((e, i) => {
      const mi = modeloIdx[i] ?? -1, m = mi >= 0 ? mats[String(mi)] : undefined
      return {
        key: chaves[i], idx: i, disc: String(e[0]), num: String(e[1] ?? ''), tema: String(e[2] ?? ''), pags: Number(e[3]) || 0,
        qc: String(e[4] ?? ''), tec: String(e[5] ?? ''), docId: e[6] ? String(e[6]) : null, ativaBase: ativasBase.has(i),
        mat: m ? { pdflashPaginas: m.pdflashPaginas ?? null, pdfightPaginas: m.pdfightPaginas ?? null, videoaula: m.videoaula ?? null, atualizacao: m.atualizacao ?? null } : null,
        origem: mi >= 0 ? (origemAula[String(mi)] ?? null) : null,
      }
    })
    const lp: EditorLpBase[] = baseLP.map((x) => { const p = partirTexto(x.texto); return { id: x.id, disc: x.disc, leiNome: p.leiNome, trecho: p.trecho, doc: x.doc ?? null, origem: origemLei.get(x.id) ?? null } })
    const nomes = new Set<string>(); const disciplinas: string[] = []
    for (const n of [...c.disciplinas.map((d) => d.nome), ...aulas.map((a) => a.disc), ...lp.map((l) => l.disc)]) { const k = chaveDisciplina(n); if (!nomes.has(k)) { nomes.add(k); disciplinas.push(n) } }
    const alunosComPlano = new Set(((planos.data ?? []) as Array<{ estudante_id: string }>).map((p) => p.estudante_id)).size
    return {
      ok: true,
      editor: {
        versao: row?.versao ?? 0, atualizadoEm: row?.atualizadoEm ?? null, tabelaOk: !tab.error, disciplinas, aulas,
        ordemBase: baseOrdem.map((i) => chaves[i]).filter(Boolean), lp, override: row?.dados ?? OVERRIDE_VAZIO, alunosComPlano,
        fonteCatalogo: CATALOGO_HTML.fonte,
      },
    }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao carregar o catálogo.' }
  }
}

export async function salvarEditorCatalogo(draft: unknown, versaoBase: number): Promise<{ ok: boolean; error?: string; conflito?: boolean; versao?: number; alunosComPlano?: number }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  try {
    const ov = normalizarOverride(draft)
    // disciplinas das aulas/metas NOVAS precisam existir no catálogo (não se cria disciplina por aqui)
    if (ov.novas.length || ov.lpNovas.length) {
      const c = await carregarConteudoBancoBase(svc, g.tenantId)
      const conhecidas = new Set([...c.disciplinas.map((d) => d.nome), ...(c.base?.AS ?? c.AS).map((a) => String(a[0])), ...(c.base?.LP ?? c.LP ?? []).map((l) => l.disc)].map((n) => chaveDisciplina(n)))
      const ruim = [...ov.novas.map((n) => n.disc), ...ov.lpNovas.map((n) => n.disc)].find((d) => !conhecidas.has(chaveDisciplina(d)))
      if (ruim) return { ok: false, error: `Disciplina "${ruim}" não existe no catálogo.` }
    }
    const antes = await lerOverrideRow(svc, g.tenantId)
    const r = await salvarOverride(svc, g.tenantId, ov, Math.max(0, Math.trunc(Number(versaoBase) || 0)), g.userId)
    if (!r.ok) return r
    await registrarAudit({
      operacao: 'UPDATE', entidade: 'simulado_cronograma_adaptativo_catalogo', entidadeId: g.tenantId, tenantId: g.tenantId,
      antes: { versao: antes?.versao ?? 0, itens: Object.keys(antes?.dados.aulas ?? {}).length + (antes?.dados.novas.length ?? 0) + Object.keys(antes?.dados.lp ?? {}).length + (antes?.dados.lpNovas.length ?? 0) },
      depois: { versao: r.versao, itens: Object.keys(ov.aulas).length + ov.novas.length + Object.keys(ov.lp).length + ov.lpNovas.length },
    }).catch(() => {})
    const { data } = await svc.from('simulado_cronograma_adaptativo_plano').select('estudante_id').eq('tenant_id', g.tenantId).eq('arquivada', false).eq('exemplo', false)
    await esquecer(`crono-catalogo-diag:${g.tenantId}`).catch(() => {})
    revalidatePath('/admin/cronogramas/adaptativo/catalogo')
    return { ok: true, versao: r.versao, alunosComPlano: new Set(((data ?? []) as Array<{ estudante_id: string }>).map((p) => p.estudante_id)).size }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao salvar o catálogo.' }
  }
}

// ── Metas & inteligência (v3): parâmetros do motor por tenant ────────────────────────────────────

export async function obterPainelMetas(): Promise<{ ok: boolean; error?: string; painel?: PainelMetas }> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  try {
    const [cfg, planos] = await Promise.all([
      lerCfgMetas(svc, g.tenantId),
      svc.from('simulado_cronograma_adaptativo_plano').select('estudante_id').eq('tenant_id', g.tenantId).eq('arquivada', false).eq('exemplo', false),
    ])
    const { atualizadoEm, atualizadoPor: _a, ...params } = cfg
    const alunosComPlano = new Set(((planos.data ?? []) as Array<{ estudante_id: string }>).map((p) => p.estudante_id)).size
    return { ok: true, painel: { params, padrao: PARAMS_PADRAO, atualizadoEm: atualizadoEm ?? null, alunosComPlano } }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao carregar.' }
  }
}

export async function salvarPainelMetas(params: Partial<ParamsAdaptativo>): Promise<{ ok: boolean; error?: string }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const antes = await lerCfgMetas(svc, g.tenantId)
  const depois = normalizarParams({ tiposBloqueados: antes.tiposBloqueados, ...params }) // bloqueios de tipo são geridos em Revisão › Cronograma › Regras: não zera aqui
  const r = await salvarCfgMetas(svc, g.tenantId, depois, g.userId)
  if (!r.ok) return r
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_cronograma_adaptativo_cfg', entidadeId: g.tenantId, tenantId: g.tenantId,
    antes: { ...antes }, depois: { ...depois },
  }).catch(() => {})
  revalidatePath('/admin/cronogramas/adaptativo/metas')
  return { ok: true }
}

export async function buscarAlunosLiberacao(q: string): Promise<{ id: string; nome: string; email: string | null }[]> {
  const g = await acesso('view'); if (!g) return []
  const t = (q ?? '').trim().replace(/[,%()*]/g, ' ').trim()
  if (t.length < 2) return []
  const { data } = await createAdminClient().from('simulado_estudantes').select('id, nome, email')
    .eq('tenant_id', g.tenantId).eq('deletado', false).or(`nome.ilike.%${t}%,email.ilike.%${t}%`).order('nome').limit(15)
  return ((data ?? []) as Array<{ id: string; nome: string | null; email: string | null }>).map((e) => ({ id: e.id, nome: e.nome || 'Aluno', email: e.email }))
}


/** Mostra o que um aluno específico consegue abrir HOJE com a configuração SALVA. */
export async function simularAlunoLiberacao(alunoId: string): Promise<{ ok: boolean; error?: string; sim?: SimulacaoAluno }> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  try {
    return { ok: true, sim: await simularLiberacaoAluno(createAdminClient(), g.tenantId, alunoId) }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao simular.' }
  }
}

// ── METAS DO PLANO EM LINHAS (espelho relacional da grade JSON) ────────────────────────────────────────────────

/** Quantos planos já têm as metas em linhas (tabela simulado_cronograma_adaptativo_plano_meta). */
export async function obterEstadoEspelho(): Promise<EstadoEspelho> {
  const vazio: EstadoEspelho = { ok: false, migrado: true, planos: 0, espelhados: 0, linhas: 0 }
  const g = await acesso('view'); if (!g) return { ...vazio, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const pl = await svc.from('simulado_cronograma_adaptativo_plano').select('id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('exemplo', false)
  const es = await svc.from('simulado_cronograma_adaptativo_plano').select('id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('exemplo', false).not('grade_espelhada_hash', 'is', null)
  if (es.error) return { ...vazio, ok: true, migrado: false, planos: pl.count ?? 0 }
  const li = await svc.from('simulado_cronograma_adaptativo_plano_meta').select('id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId)
  return { ok: true, migrado: !li.error, planos: pl.count ?? 0, espelhados: es.count ?? 0, linhas: li.count ?? 0 }
}

/** Espelha um LOTE de planos (preenchimento inicial). Chamar de novo até `restantes = 0`. */
export async function espelharPlanosLote(): Promise<{ ok: boolean; error?: string; processados?: number; linhas?: number; restantes?: number }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const { espelharLote } = await import('@/lib/cronograma/adaptativo/plano-metas')
  const r = await espelharLote(createAdminClient(), g.tenantId, 20)
  if (!r.ok) return { ok: false, error: r.motivo === 'migracao_pendente' ? 'Aplique a migração 20261105050000_cronograma_adaptativo_plano_meta.sql no Supabase.' : (r.motivo || 'Falha ao espelhar.') }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_cronograma_adaptativo_plano_meta', entidadeId: g.tenantId, tenantId: g.tenantId, atorId: g.userId, depois: { espelhados: r.processados, linhas: r.linhas } }).catch(() => {})
  return { ok: true, processados: r.processados, linhas: r.linhas, restantes: r.restantes }
}

// ── DEFINIÇÃO DAS METAS (cadastro do admin, por plataforma) + ANÁLISE ───────────────────────────────────────────
import { sincronizarMetaDef, listarMetaDef, resumoMetaDef, type FiltroDef, type DefAnalise } from '@/lib/cronograma/adaptativo/meta-def'

export async function sincronizarDefinicoesMetas(): Promise<{ ok: boolean; error?: string; aulas?: number; legprocs?: number; desativadas?: number }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const r = await sincronizarMetaDef(createAdminClient(), g.tenantId)
  if (!r.ok) return { ok: false, error: r.motivo === 'migracao_pendente' ? 'Aplique a migração 20261105070000_cronograma_adaptativo_meta_def.sql no Supabase.' : (r.motivo || 'Falha ao sincronizar.') }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cronograma_adaptativo_meta_def', entidadeId: g.tenantId, tenantId: g.tenantId, atorId: g.userId, depois: { aulas: r.aulas, legprocs: r.legprocs, desativadas: r.desativadas } }).catch(() => {})
  revalidatePath('/admin/cronogramas/adaptativo/definicoes')
  return { ok: true, aulas: r.aulas, legprocs: r.legprocs, desativadas: r.desativadas }
}

export async function listarDefinicoesMetas(f: FiltroDef): Promise<{ ok: boolean; error?: string; migrado: boolean; itens: DefAnalise[]; total: number; disciplinas: string[]; resumo: Awaited<ReturnType<typeof resumoMetaDef>> }> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.', migrado: true, itens: [], total: 0, disciplinas: [], resumo: null }
  const svc = createAdminClient()
  const [lista, resumo] = await Promise.all([listarMetaDef(svc, g.tenantId, f), resumoMetaDef(svc, g.tenantId)])
  if (!lista.ok) return { ok: lista.motivo === 'migracao_pendente', error: lista.motivo === 'migracao_pendente' ? undefined : lista.motivo, migrado: lista.motivo !== 'migracao_pendente', itens: [], total: 0, disciplinas: [], resumo: null }
  return { ok: true, migrado: true, itens: lista.itens, total: lista.total, disciplinas: lista.disciplinas, resumo }
}
