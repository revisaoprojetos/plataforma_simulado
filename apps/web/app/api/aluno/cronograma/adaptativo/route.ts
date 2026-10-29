import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { gerarAdaptativo, patchMetaAdaptativo, somarTempoMeta, pausarAdaptativo, carregarDocs, sincronizarDoc, listarPlanosAdaptativo, fixarPlanoAdaptativo, arquivarPlanoAdaptativo, renomearPlanoAdaptativo } from '@/lib/cronograma/adaptativo/dados'
import { atualizarPainelSnapshot } from '@/lib/painel/snapshot'
import { carregarConteudoBanco } from '@/lib/cronograma/adaptativo/conteudo-banco'
import type { Cfg, DataISO } from '@/lib/cronograma/adaptativo/engine'

// POST /api/aluno/cronograma/adaptativo — mutações do Cronograma Adaptativo 2.0.
// Rota de API (não server action — landmine de domínio custom). Despacha por `acao`:
//  gerar  { cfg, titulo?, ancora? }          -> gera/recalcula o plano
//  meta   { metaId, patch{...} }             -> estado/parcial/grau/estrelas/res·err/modo/nota
//  tempo  { metaId, segAdd }                 -> soma tempo de estudo (modo foco)
//  pausar { pausar: boolean, hoje? }         -> pausa/retoma
export const dynamic = 'force-dynamic'

const DATA = /^\d{4}-\d{2}-\d{2}$/

// GET — carrega os 3 docs do modelo (estado/progresso/notas) p/ a ponte do iframe.
export async function GET() {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false, message: 'Não autenticado.' }, { status: 401 })
  const svc = createAdminClient()
  const [docs, conteudo] = await Promise.all([
    carregarDocs(svc, sessao.tenantId, sessao.estudanteId),
    carregarConteudoBanco(svc, sessao.tenantId),
  ])
  // conteudo: AS/WLP + disciplinas(classificacao/cor) p/ o iframe montar grupos e grade.
  return NextResponse.json({ ok: true, ...docs, conteudo: { AS: conteudo.AS, WLP: conteudo.WLP, disciplinas: conteudo.disciplinas } })
}

export async function POST(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false, message: 'Não autenticado.' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, message: 'Requisição inválida.' }, { status: 400 }) }
  const acao = String(body.acao || '')
  const svc = createAdminClient()
  const { tenantId, estudanteId } = sessao

  try {
    if (acao === 'gerar') {
      const cfg = body.cfg as Cfg | undefined
      if (!cfg || !cfg.start || !Array.isArray(cfg.horas)) return NextResponse.json({ ok: false, message: 'Configuração inválida.' }, { status: 400 })
      const ancora = typeof body.ancora === 'string' && DATA.test(body.ancora) ? (body.ancora as DataISO) : null
      const titulo = typeof body.titulo === 'string' ? body.titulo.trim().slice(0, 80) : undefined
      const novo = body.novo === true
      const r = await gerarAdaptativo(svc, tenantId, estudanteId, cfg, { titulo, ancora, novo })
      if (r.ok) { try { await atualizarPainelSnapshot(svc, tenantId, estudanteId) } catch { /* best-effort */ } }
      return r.ok ? NextResponse.json({ ok: true, planoId: r.planoId }) : NextResponse.json({ ok: false, message: r.error }, { status: 500 })
    }
    if (acao === 'listar') {
      const planos = await listarPlanosAdaptativo(svc, tenantId, estudanteId)
      return NextResponse.json({ ok: true, planos })
    }
    if (acao === 'fixar') {
      const planoId = String(body.planoId || '')
      if (!planoId) return NextResponse.json({ ok: false, message: 'Plano ausente.' }, { status: 400 })
      const r = await fixarPlanoAdaptativo(svc, tenantId, estudanteId, planoId)
      if (r.ok) { try { await atualizarPainelSnapshot(svc, tenantId, estudanteId) } catch { /* best-effort */ } }
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, message: r.error }, { status: r.error === 'nao_encontrado' ? 404 : 500 })
    }
    if (acao === 'arquivar') {
      const planoId = String(body.planoId || '')
      if (!planoId) return NextResponse.json({ ok: false, message: 'Plano ausente.' }, { status: 400 })
      const r = await arquivarPlanoAdaptativo(svc, tenantId, estudanteId, planoId, body.arquivar !== false)
      if (r.ok) { try { await atualizarPainelSnapshot(svc, tenantId, estudanteId) } catch { /* best-effort */ } }
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, message: r.error }, { status: r.error === 'nao_encontrado' ? 404 : 500 })
    }
    if (acao === 'renomear') {
      const planoId = String(body.planoId || '')
      const titulo = String(body.titulo || '')
      if (!planoId) return NextResponse.json({ ok: false, message: 'Plano ausente.' }, { status: 400 })
      const r = await renomearPlanoAdaptativo(svc, tenantId, estudanteId, planoId, titulo)
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, message: r.error }, { status: 500 })
    }
    if (acao === 'meta') {
      const metaId = String(body.metaId || '')
      if (!metaId) return NextResponse.json({ ok: false, message: 'Meta ausente.' }, { status: 400 })
      const p = (body.patch || {}) as Record<string, unknown>
      const patch: Record<string, unknown> = {}
      if ('estado' in p) patch.estado = p.estado === 'done' || p.estado === 'missed' ? p.estado : null
      if ('parcial_v' in p) { patch.parcial_v = p.parcial_v ? String(p.parcial_v).slice(0, 80) : null; patch.parcial_em = patch.parcial_v ? (typeof p.parcial_em === 'string' && DATA.test(p.parcial_em) ? p.parcial_em : new Date().toISOString().slice(0, 10)) : null }
      if ('grau' in p) patch.grau = p.grau == null ? null : Math.max(0, Math.min(10, Math.round(Number(p.grau))))
      if ('estrelas' in p) patch.estrelas = p.estrelas == null ? null : Math.max(0, Math.min(5, Math.round(Number(p.estrelas))))
      if ('res' in p) patch.res = p.res == null ? null : Math.max(0, Math.round(Number(p.res)))
      if ('err' in p) patch.err = p.err == null ? null : Math.max(0, Math.round(Number(p.err)))
      if ('modo' in p) patch.modo = p.modo ? String(p.modo).slice(0, 20) : null
      if ('nota' in p) patch.nota = p.nota ? String(p.nota).slice(0, 4000) : null
      const r = await patchMetaAdaptativo(svc, tenantId, estudanteId, metaId, patch)
      // WRITE-BEHIND do Painel: concluir/alterar uma meta muda feitasHoje/pctSemana/pendencias do
      // "Meu painel de estudos" (que agora lê o Adaptativo FIXADO). Recomputa o snapshot na hora para
      // que o router.refresh() do cliente já leia os números atualizados. Best-effort (não bloqueia a resposta).
      if (r.ok) { try { await atualizarPainelSnapshot(svc, tenantId, estudanteId) } catch { /* best-effort */ } }
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, message: r.error }, { status: r.error === 'sem_plano' ? 400 : 500 })
    }
    if (acao === 'tempo') {
      const metaId = String(body.metaId || '')
      const segAdd = Number(body.segAdd || 0)
      if (!metaId || !Number.isFinite(segAdd)) return NextResponse.json({ ok: false, message: 'Dados inválidos.' }, { status: 400 })
      const r = await somarTempoMeta(svc, tenantId, estudanteId, metaId, segAdd)
      return r.ok ? NextResponse.json({ ok: true, tempoSeg: r.tempoSeg }) : NextResponse.json({ ok: false, message: r.error }, { status: 400 })
    }
    if (acao === 'pausar') {
      const hoje = typeof body.hoje === 'string' && DATA.test(body.hoje) ? (body.hoje as DataISO) : undefined
      const r = await pausarAdaptativo(svc, tenantId, estudanteId, !!body.pausar, hoje)
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, message: r.error }, { status: 400 })
    }
    if (acao === 'sync') {
      const parte = String(body.parte || '')
      const doc = (body.doc || {}) as Record<string, unknown>
      const r = await sincronizarDoc(svc, tenantId, estudanteId, parte, doc)
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, message: r.error }, { status: r.error === 'sem_plano' || r.error === 'cfg_invalido' ? 400 : 500 })
    }
    return NextResponse.json({ ok: false, message: 'Ação desconhecida.' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || 'Erro inesperado.' }, { status: 500 })
  }
}
