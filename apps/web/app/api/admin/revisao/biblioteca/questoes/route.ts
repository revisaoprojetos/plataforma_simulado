import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { estadoQDeParams } from '@/lib/admin-revisao/biblioteca-questoes-tipos'
import { assuntosDaDisciplina, limparCacheQuestoes, respostaQuestoes } from '@/lib/admin-revisao/biblioteca-questoes'
import { carregarDetalheQuestao } from '@/app/admin/banco-questoes/actions'
import { excluirQuestoes, verificarUsoQuestoes } from '@/app/admin/questoes/actions'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX = 500
const CHUNK = 80

// BIBLIOTECA › QUESTÕES (banco) — leitura e ações em massa por ROTA DE API (server actions podem ser rejeitadas em domínio custom).
// GET  = questoes:view. `tree=1` inclui árvore + opções dos filtros; `fresh=1` limpa o cache de 30 s; `assuntos=<disciplinaId>` lista os
//        assuntos da disciplina (diálogo Mover); `detalhe=<questaoId>` devolve enunciado/alternativas (expandir da tabela).
// POST = ações em massa. status/mover/etiqueta: questoes:update. excluir (→ Lixeira): REUSA excluirQuestoes (questoes:delete).
//        `uso` REUSA verificarUsoQuestoes (banco/simulado/respostas) para o aviso antes de arquivar/excluir.
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'questoes:view') || !access.tenantId) return NextResponse.json({ error: 'sem_permissao' }, { status: 403 })
  const tenantId = access.tenantId
  const sp = new URL(req.url).searchParams
  const svc = createAdminClient()

  const det = sp.get('detalhe')
  if (det) {
    if (!UUID.test(det)) return NextResponse.json({ ok: false, error: 'Questão inválida.' }, { status: 400 })
    return NextResponse.json(await carregarDetalheQuestao(det))
  }
  const disc = sp.get('assuntos')
  if (disc) return NextResponse.json({ ok: true, assuntos: await assuntosDaDisciplina(svc, tenantId, disc) })

  if (sp.get('fresh') === '1') limparCacheQuestoes(tenantId)
  const e = estadoQDeParams(sp)
  return NextResponse.json(await respostaQuestoes(svc, tenantId, e, sp.get('tree') === '1' ? true : sp.get('opcoes') === '1' ? 'opcoes' : false))
}

async function emLotes<T>(ids: string[], fn: (chunk: string[]) => PromiseLike<{ error: any; data?: T[] | null }>) {
  let n = 0
  for (let i = 0; i < ids.length; i += CHUNK) {
    const r = await fn(ids.slice(i, i + CHUNK))
    if (r.error) return { ok: false as const, error: String(r.error.message || 'Falha ao gravar.'), n }
    n += r.data?.length ?? 0
  }
  return { ok: true as const, n }
}

export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId) return NextResponse.json({ ok: false, error: 'Tenant não resolvido.' }, { status: 400 })
  const tenantId = access.tenantId
  const b = await req.json().catch(() => ({}))
  const acao = String(b?.acao ?? '')
  const ids: string[] = Array.isArray(b.ids) ? [...new Set<string>(b.ids.filter((x: unknown): x is string => typeof x === 'string' && UUID.test(x)))] : []
  if (!ids.length) return NextResponse.json({ ok: false, error: 'Selecione ao menos uma questão.' }, { status: 400 })
  if (ids.length > MAX) return NextResponse.json({ ok: false, error: `Máximo de ${MAX} questões por vez.` }, { status: 400 })
  const svc = createAdminClient()
  const audit = (operacao: 'UPDATE' | 'DELETE', depois: Record<string, unknown>) =>
    registrarAudit({ operacao, entidade: 'simulado_questoes', entidadeId: ids[0], atorId: access.userId ?? null, tenantId, depois: { ...depois, total: ids.length, ids: ids.slice(0, 50) } }).catch(() => {})

  if (acao === 'uso') {
    if (!accessCan(access, 'questoes:view')) return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
    return NextResponse.json(await verificarUsoQuestoes(ids))
  }

  if (acao === 'excluir') {
    const r = await excluirQuestoes(ids)
    limparCacheQuestoes(tenantId)
    return NextResponse.json(r, { status: r.ok ? 200 : 403 })
  }

  if (!accessCan(access, 'questoes:update')) return NextResponse.json({ ok: false, error: 'Você não tem permissão para editar questões.' }, { status: 403 })

  if (acao === 'status') {
    const status = String(b.status ?? '')
    if (!['publicada', 'rascunho', 'arquivada'].includes(status)) return NextResponse.json({ ok: false, error: 'Status inválido.' }, { status: 400 })
    const r = await emLotes(ids, (c) => svc.from('simulado_questoes').update({ status }).eq('tenant_id', tenantId).eq('deletado', false).in('id', c).select('id'))
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error, atualizadas: r.n }, { status: 500 })
    await audit('UPDATE', { acao_em_massa: 'status', status, atualizadas: r.n })
    limparCacheQuestoes(tenantId)
    return NextResponse.json({ ok: true, atualizadas: r.n })
  }

  if (acao === 'mover') {
    const disciplinaId: string | null = b.disciplinaId ? String(b.disciplinaId) : null
    const assuntoId: string | null = b.assuntoId ? String(b.assuntoId) : null
    if (disciplinaId && !UUID.test(disciplinaId)) return NextResponse.json({ ok: false, error: 'Disciplina inválida.' }, { status: 400 })
    if (assuntoId && !UUID.test(assuntoId)) return NextResponse.json({ ok: false, error: 'Assunto inválido.' }, { status: 400 })
    if (assuntoId && !disciplinaId) return NextResponse.json({ ok: false, error: 'Escolha a disciplina do assunto.' }, { status: 400 })
    // Isolamento: o service role ignora RLS → disciplina/assunto precisam ser do tenant, e o assunto da disciplina escolhida.
    if (disciplinaId) {
      const { data: d } = await svc.from('simulado_disciplinas').select('id').eq('tenant_id', tenantId).eq('id', disciplinaId).maybeSingle()
      if (!d) return NextResponse.json({ ok: false, error: 'Disciplina não encontrada.' }, { status: 400 })
    }
    if (assuntoId) {
      const { data: a } = await svc.from('simulado_assuntos').select('id, disciplina_id').eq('tenant_id', tenantId).eq('id', assuntoId).maybeSingle()
      if (!a || (a as any).disciplina_id !== disciplinaId) return NextResponse.json({ ok: false, error: 'O assunto não pertence a essa disciplina.' }, { status: 400 })
    }
    const r = await emLotes(ids, (c) => svc.from('simulado_questoes').update({ disciplina_id: disciplinaId, assunto_id: assuntoId }).eq('tenant_id', tenantId).eq('deletado', false).in('id', c).select('id'))
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error, atualizadas: r.n }, { status: 500 })
    await audit('UPDATE', { acao_em_massa: 'mover_taxonomia', disciplina_id: disciplinaId, assunto_id: assuntoId, atualizadas: r.n })
    limparCacheQuestoes(tenantId)
    return NextResponse.json({ ok: true, atualizadas: r.n })
  }

  if (acao === 'etiqueta') {
    const etiquetaId = String(b.etiquetaId ?? '')
    const remover = b.modo === 'remover'
    if (!UUID.test(etiquetaId)) return NextResponse.json({ ok: false, error: 'Etiqueta inválida.' }, { status: 400 })
    const { data: et } = await svc.from('simulado_etiquetas').select('id').eq('tenant_id', tenantId).eq('id', etiquetaId).eq('deletado', false).maybeSingle()
    if (!et) return NextResponse.json({ ok: false, error: 'Etiqueta não encontrada.' }, { status: 400 })
    // só questões do tenant
    const validas: string[] = []
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data } = await svc.from('simulado_questoes').select('id').eq('tenant_id', tenantId).eq('deletado', false).in('id', ids.slice(i, i + CHUNK)).order('id', { ascending: true })
      validas.push(...((data ?? []) as any[]).map((x) => x.id))
    }
    if (!validas.length) return NextResponse.json({ ok: false, error: 'Nenhuma questão válida.' }, { status: 400 })
    for (let i = 0; i < validas.length; i += CHUNK) {
      const c = validas.slice(i, i + CHUNK)
      const r = remover
        ? await svc.from('simulado_questao_etiquetas').delete().eq('tenant_id', tenantId).eq('etiqueta_id', etiquetaId).in('questao_id', c)
        : await svc.from('simulado_questao_etiquetas').upsert(c.map((questao_id) => ({ tenant_id: tenantId, questao_id, etiqueta_id: etiquetaId })), { onConflict: 'questao_id,etiqueta_id', ignoreDuplicates: true })
      if (r.error) return NextResponse.json({ ok: false, error: r.error.message }, { status: 500 })
    }
    await audit('UPDATE', { acao_em_massa: remover ? 'remover_etiqueta' : 'aplicar_etiqueta', etiqueta_id: etiquetaId, questoes: validas.length })
    limparCacheQuestoes(tenantId)
    return NextResponse.json({ ok: true, atualizadas: validas.length })
  }

  return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 })
}
