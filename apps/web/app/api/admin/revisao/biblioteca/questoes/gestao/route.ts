import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { limparCacheQuestoes } from '@/lib/admin-revisao/biblioteca-questoes'
import { ehTipoTaxG, type TipoTaxG } from '@/lib/admin-revisao/biblioteca-questoes-gestao-tipos'
import { candidatosTermos, listarEtiquetasG, listarTaxonomiaG, previaMesclarEtiquetas, resumoClassificacao, sugestoesQuestoes } from '@/lib/admin-revisao/biblioteca-questoes-gestao'
import { membrosDoGrupo, paginaDuplicados } from '@/lib/admin-revisao/biblioteca-questoes-duplicadas'
import { classificarEmMassa, etiquetaEmMassa, fichaQuestao, mesclarEtiquetas, previaUnificarQuestoes, unificarQuestoes, type PatchClassif } from '@/lib/admin-revisao/biblioteca-questoes-acoes'
import { previewUnificacaoTax, unificarTaxonomia } from '@/app/admin/questoes/taxonomia-actions'
import { atualizarDisciplinaClassificacao } from '@/app/admin/questoes/disciplinas-actions'
import { criarItemTaxonomia, excluirItemTaxonomia, renomearItemTaxonomia, reparentarAssunto } from '@/app/admin/conteudos/classificacao/actions'
import { distribuicaoQuestoes, limparCacheClassificacao, sugestoesRapidas, taxonomiaRapida } from '@/lib/admin-revisao/questoes-classificacao'
import { atualizarEtiqueta, criarEtiqueta, excluirEtiqueta } from '@/app/admin/etiquetas/actions'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX = 500
const csv = (v: string | null) => (v ?? '').split(',').map((x) => x.trim()).filter((x) => UUID.test(x))
const num = (v: string | null, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d }

// BIBLIOTECA › QUESTÕES › GESTÃO (Classificação · Unificar · Etiquetas) — leitura e ações por ROTA DE API (server actions podem ser
// rejeitadas em domínio custom). GET = questoes:view. POST = questoes:update (e as permissões próprias das actions reutilizadas:
// classificacao:manage para criar/renomear/mover/excluir itens da taxonomia). Toda mutação audita (nas ações reutilizadas ou aqui)
// e invalida os caches. Reuso: unificarTaxonomia/previewUnificacaoTax (Questões), criar/renomear/reparentar/excluir (Estúdio › Classificação),
// criar/atualizar/excluir etiqueta (/admin/etiquetas).
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'questoes:view') || !access.tenantId) return NextResponse.json({ ok: false, error: 'sem_permissao' }, { status: 403 })
  const tenantId = access.tenantId
  const sp = new URL(req.url).searchParams
  const svc = createAdminClient()
  const fresh = sp.get('fresh') === '1'
  if (fresh) { limparCacheQuestoes(tenantId); limparCacheClassificacao(tenantId) }
  const s = sp.get('s') ?? ''
  const pg = { page: num(sp.get('page'), 1), pp: num(sp.get('pp'), 14) }
  try {
    if (s === 'resumo') return NextResponse.json({ ok: true, ...(await resumoClassificacao(svc, tenantId, fresh)) })
    if (s === 'distribuicao') return NextResponse.json({ ok: true, ...(await distribuicaoQuestoes(svc, tenantId, fresh)) })
    if (s === 'taxonomia') {
      const tipo = sp.get('tipo'); if (!ehTipoTaxG(tipo)) return NextResponse.json({ ok: false, error: 'Tipo inválido.' }, { status: 400 })
      const opt = { q: sp.get('q') ?? '', sort: sp.get('sort') ?? undefined, dir: sp.get('dir') === 'desc' ? 'desc' as const : sp.get('dir') === 'asc' ? 'asc' as const : undefined, disciplina: UUID.test(sp.get('disciplina') ?? '') ? sp.get('disciplina')! : undefined, semUso: sp.get('semuso') === '1', ...pg }
      // agregação única em cache (classificacao); sem SQL direto cai na implementação antiga
      const rapida = await taxonomiaRapida(tenantId, tipo, opt)
      return NextResponse.json({ ok: true, ...(rapida ?? (await listarTaxonomiaG(svc, tenantId, tipo, { ...opt, fresh }))) })
    }
    if (s === 'termos') {
      const tipo = sp.get('tipo'); if (!ehTipoTaxG(tipo)) return NextResponse.json({ ok: false, error: 'Tipo inválido.' }, { status: 400 })
      return NextResponse.json({ ok: true, ...(await candidatosTermos(svc, tenantId, tipo, { confianca: sp.get('confianca') ?? undefined, q: sp.get('q') ?? '', fresh, page: pg.page, pp: num(sp.get('pp'), 12) })) })
    }
    if (s === 'duplicados') return NextResponse.json({ ok: true, ...(await paginaDuplicados(svc, tenantId, { nivel: sp.get('nivel') ?? undefined, uso: sp.get('uso') ?? undefined, q: sp.get('q') ?? '', resolvidas: sp.get('resolvidas') === '1', fresh, ...pg })) })
    if (s === 'grupo') return NextResponse.json({ ok: true, membros: await membrosDoGrupo(svc, tenantId, csv(sp.get('ids'))) })
    if (s === 'previa_unificar') return NextResponse.json(await previaUnificarQuestoes(svc, tenantId, sp.get('mestre') ?? '', csv(sp.get('dups'))))
    if (s === 'etiquetas') return NextResponse.json({ ok: true, ...(await listarEtiquetasG(svc, tenantId, { q: sp.get('q') ?? '', sort: sp.get('sort') ?? undefined, dir: sp.get('dir') === 'desc' ? 'desc' : 'asc', filtro: sp.get('filtro') ?? undefined, fresh, ...pg })) })
    if (s === 'previa_mesclar_etiqueta') {
      const o = sp.get('origem') ?? '', d = sp.get('destino') ?? ''
      if (!UUID.test(o) || !UUID.test(d)) return NextResponse.json({ ok: false, error: 'Etiqueta inválida.' }, { status: 400 })
      return NextResponse.json({ ok: true, ...(await previaMesclarEtiquetas(svc, tenantId, o, d)) })
    }
    if (s === 'sugestoes') return NextResponse.json({ ok: true, sugestoes: await sugestoesRapidas(svc, tenantId, csv(sp.get('ids'))) })
    if (s === 'ficha') return NextResponse.json(await fichaQuestao(svc, tenantId, sp.get('id') ?? ''))
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Falha ao carregar.' }, { status: 500 })
  }
  return NextResponse.json({ ok: false, error: 'Seção inválida.' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId) return NextResponse.json({ ok: false, error: 'Tenant não resolvido.' }, { status: 400 })
  if (!accessCan(access, 'questoes:update')) return NextResponse.json({ ok: false, error: 'Você não tem permissão para editar questões.' }, { status: 403 })
  const tenantId = access.tenantId
  const b = await req.json().catch(() => ({}))
  const acao = String(b?.acao ?? '')
  const svc = createAdminClient()
  const ator = { tenantId, userId: access.userId ?? null }
  const ids: string[] = Array.isArray(b.ids) ? [...new Set<string>(b.ids.filter((x: unknown): x is string => typeof x === 'string' && UUID.test(x)))] : []
  const fim = (r: { ok: boolean; error?: string; [k: string]: any }) => { limparCacheQuestoes(tenantId); limparCacheClassificacao(tenantId); return NextResponse.json(r, { status: r.ok ? 200 : (r.error === 'Sem permissão.' ? 403 : 400) }) }
  try {
    switch (acao) {
      case 'classificar': {
        if (!ids.length) return NextResponse.json({ ok: false, error: 'Selecione ao menos uma questão.' }, { status: 400 })
        if (ids.length > MAX) return NextResponse.json({ ok: false, error: `Máximo de ${MAX} questões por vez.` }, { status: 400 })
        const p = (b.patch ?? {}) as Record<string, unknown>; const patch: PatchClassif = {}
        for (const k of ['disciplinaId', 'assuntoId', 'bancaId', 'orgaoId', 'ano', 'dificuldade', 'cargo', 'status'] as const) if (Object.prototype.hasOwnProperty.call(p, k)) (patch as any)[k] = p[k] === '' ? null : p[k]
        return fim(await classificarEmMassa(svc, ator, ids, patch, b.soPreencher === true))
      }
      case 'unificar_questoes': {
        if (b.modo !== 'completa' && b.modo !== 'arquivar') return NextResponse.json({ ok: false, error: 'Modo inválido.' }, { status: 400 })
        const dups = Array.isArray(b.dupIds) ? b.dupIds.filter((x: unknown): x is string => typeof x === 'string' && UUID.test(x)) : []
        return fim(await unificarQuestoes(svc, ator, String(b.mestreId ?? ''), dups, b.modo))
      }
      case 'previa_termos': {
        if (!ehTipoTaxG(b.tipo)) return NextResponse.json({ ok: false, error: 'Tipo inválido.' }, { status: 400 })
        return NextResponse.json(await previewUnificacaoTax(b.tipo, Array.isArray(b.dupIds) ? b.dupIds.map(String) : []))
      }
      case 'unificar_termos': {
        if (!ehTipoTaxG(b.tipo)) return NextResponse.json({ ok: false, error: 'Tipo inválido.' }, { status: 400 })
        return fim(await unificarTaxonomia(b.tipo, String(b.canonicaId ?? ''), Array.isArray(b.dupIds) ? b.dupIds.map(String) : []))
      }
      case 'tax_criar': {
        if (!ehTipoTaxG(b.tipo) || !['disciplina', 'assunto', 'banca', 'orgao'].includes(b.tipo)) return NextResponse.json({ ok: false, error: 'Tipo inválido.' }, { status: 400 })
        return fim(await criarItemTaxonomia(b.tipo as any, String(b.nome ?? ''), { disciplinaId: b.disciplinaId && UUID.test(b.disciplinaId) ? b.disciplinaId : null }))
      }
      case 'tax_renomear': {
        const tipo = b.tipo as TipoTaxG; const nome = String(b.nome ?? '').trim()
        if (!ehTipoTaxG(tipo) || tipo === 'ano') return NextResponse.json({ ok: false, error: 'Tipo inválido.' }, { status: 400 })
        if (!nome) return NextResponse.json({ ok: false, error: 'Informe um nome.' }, { status: 400 })
        if (['disciplina', 'assunto', 'banca', 'orgao'].includes(tipo)) return fim(await renomearItemTaxonomia(tipo as any, String(b.id ?? ''), nome))
        // cargo / assunto específico são VALORES de texto nas questões: renomear = trocar o valor (mesma action da unificação, com auditoria)
        if (nome === String(b.id)) return NextResponse.json({ ok: true })
        return fim(await unificarTaxonomia(tipo, nome, [String(b.id ?? '')]))
      }
      case 'tax_mover_assunto': return fim(await reparentarAssunto(String(b.id ?? ''), String(b.disciplinaId ?? '')))
      case 'tax_excluir': {
        if (!ehTipoTaxG(b.tipo) || !['disciplina', 'assunto', 'banca', 'orgao'].includes(b.tipo)) return NextResponse.json({ ok: false, error: 'Só itens do cadastro podem ser excluídos (cargo e assunto específico são valores nas questões — renomeie ou unifique).' }, { status: 400 })
        return fim(await excluirItemTaxonomia(b.tipo as any, String(b.id ?? '')))
      }
      case 'disc_atributos': return fim(await atualizarDisciplinaClassificacao(String(b.id ?? ''), (b.patch ?? {}) as any))
      case 'etiqueta_criar': return fim(await criarEtiqueta(String(b.nome ?? ''), String(b.cor ?? ''), b.funcao ?? null))
      case 'etiqueta_atualizar': return fim(await atualizarEtiqueta(String(b.id ?? ''), String(b.nome ?? ''), String(b.cor ?? ''), b.funcao ?? null))
      case 'etiqueta_excluir': return fim(await excluirEtiqueta(String(b.id ?? '')))
      case 'etiqueta_mesclar': return fim(await mesclarEtiquetas(svc, ator, String(b.origemId ?? ''), String(b.destinoId ?? '')))
      case 'etiqueta_massa': {
        if (!ids.length) return NextResponse.json({ ok: false, error: 'Selecione ao menos uma questão no Banco.' }, { status: 400 })
        if (ids.length > MAX) return NextResponse.json({ ok: false, error: `Máximo de ${MAX} questões por vez.` }, { status: 400 })
        return fim(await etiquetaEmMassa(svc, ator, ids, String(b.etiquetaId ?? ''), b.modo === 'remover'))
      }
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Falha ao executar.' }, { status: 500 })
  }
  return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 })
}
