import { NextRequest, NextResponse, after } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { gerarAdaptativo, patchMetaAdaptativo, somarTempoMeta, pausarAdaptativo, carregarDocs, sincronizarDoc, listarPlanosAdaptativo, fixarPlanoAdaptativo, arquivarPlanoAdaptativo, apagarPlanoAdaptativo, renomearPlanoAdaptativo } from '@/lib/cronograma/adaptativo/dados'
import { atualizarPainelSnapshot } from '@/lib/painel/snapshot'
import { refrescarAposMudarFoco } from '@/lib/cronograma/foco-refresh'
import { carregarConteudoBanco } from '@/lib/cronograma/adaptativo/conteudo-banco'
import { lerParamsMotor } from '@/lib/cronograma/adaptativo/config-metas'
import { catalogoIdDoTenant } from '@/lib/cronograma/adaptativo/catalogo-override-db'
import { lerFiltros } from '@/lib/cronograma/adaptativo/qf-db'
import { remember } from '@/lib/cache/relatorio-cache'
import { registrarGeracao, type AcaoGeracao } from '@/lib/cronograma/adaptativo/log-geracao'
import type { Cfg, DataISO } from '@/lib/cronograma/adaptativo/engine'
import { CATALOGO_HTML, GRUPOS_HTML } from '@/lib/cronograma/adaptativo/catalogo-html'

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
  const t0 = Date.now()
  const [docs, conteudo, params, catalogoId, filtrosQf] = await Promise.all([
    carregarDocs(svc, sessao.tenantId, sessao.estudanteId),
    // O conteúdo (aulas/leis/disciplinas) é do TENANT, não do aluno, e custa ~4 s para montar: cache curto no Redis
    // (degrada p/ cálculo direto sem Redis). Edições do admin aparecem em até 2 min.
    remember('crono-conteudo:' + sessao.tenantId, 120, () => carregarConteudoBanco(svc, sessao.tenantId)), // já inclui o overlay do admin (Catálogo de metas)
    lerParamsMotor(svc, sessao.tenantId), // v3: parâmetros do tenant → o iframe gera o plano com os MESMOS valores do servidor
    catalogoIdDoTenant(svc, sessao.tenantId),
    lerFiltros(svc, sessao.tenantId), // filtros de "questões da plataforma" por aula (tabela própria; cache 30s)
  ])
  if (Date.now() - t0 > 4000) console.warn(`[cronograma GET] lento: ${Date.now() - t0}ms (tenant ${sessao.tenantId})`)
  // O iframe só precisa saber QUAIS aulas oferecem questões da plataforma e a CHAVE estável de cada uma (vai na
  // URL da tela de resolução) — o filtro em si fica no servidor. `qfAulas[i]` = chave, só p/ aulas com filtro.
  const chaves = conteudo.chaves ?? []
  const qfAulas: Record<number, string> = {}
  conteudo.AS.forEach((_, i) => { const k = chaves[i]; if (k && filtrosQf[k]) qfAulas[i] = k })
  // conteudo: AS/WLP (+ WLPdoc = id do doc LegProc de cada bloco, p/ abrir no leitor) + disciplinas(classificacao/cor).
  // ordem = distribuição das aulas do modelo; agu = grupos de disciplinas específicas (pares, ex.: Internacional).
  const nomes = new Set(conteudo.disciplinas.map((d) => d.nome))
  const agu = GRUPOS_HTML.agu.map((g) => g.filter((n) => nomes.has(n))).filter((g) => g.length)
  return NextResponse.json({ ok: true, ...docs, conteudo: { AS: conteudo.AS, ordem: conteudo.ordem ?? null, WLP: conteudo.WLP, WLPdoc: conteudo.WLPdoc ?? [], LP: conteudo.LP ?? [], JPdoc: conteudo.JPdoc ?? [], disciplinas: conteudo.disciplinas, agu, catalogo: catalogoId, params, qfAulas } })
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
      const fixar = body.fixar === true
      const r = await gerarAdaptativo(svc, tenantId, estudanteId, cfg, { titulo, ancora, novo, fixar })
      // Snapshot do Painel é PESADO → roda DEPOIS da resposta (after). O "+ Novo cronograma" responde na
      // hora (sem espera longa até a tela de configuração); o painel atualiza no próximo load.
      if (r.ok) after(async () => { try { await refrescarAposMudarFoco(svc, tenantId, estudanteId) } catch { /* best-effort */ } })
      return r.ok ? NextResponse.json({ ok: true, planoId: r.planoId, fixado: r.fixado ?? true, jaTinhaFixado: r.jaTinhaFixado ?? false }) : NextResponse.json({ ok: false, message: r.error }, { status: 500 })
    }
    if (acao === 'listar') {
      const planos = await listarPlanosAdaptativo(svc, tenantId, estudanteId)
      return NextResponse.json({ ok: true, planos })
    }
    if (acao === 'fixar') {
      const planoId = String(body.planoId || '')
      if (!planoId) return NextResponse.json({ ok: false, message: 'Plano ausente.' }, { status: 400 })
      const r = await fixarPlanoAdaptativo(svc, tenantId, estudanteId, planoId)
      if (r.ok) { try { await refrescarAposMudarFoco(svc, tenantId, estudanteId) } catch { /* best-effort */ } }
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, message: r.error }, { status: r.error === 'nao_encontrado' ? 404 : 500 })
    }
    if (acao === 'arquivar') {
      const planoId = String(body.planoId || '')
      if (!planoId) return NextResponse.json({ ok: false, message: 'Plano ausente.' }, { status: 400 })
      const r = await arquivarPlanoAdaptativo(svc, tenantId, estudanteId, planoId, body.arquivar !== false)
      if (r.ok) { try { await refrescarAposMudarFoco(svc, tenantId, estudanteId) } catch { /* best-effort */ } }
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, message: r.error }, { status: r.error === 'nao_encontrado' ? 404 : 500 })
    }
    if (acao === 'apagar') {
      const planoId = String(body.planoId || '')
      if (!planoId) return NextResponse.json({ ok: false, message: 'Plano ausente.' }, { status: 400 })
      const r = await apagarPlanoAdaptativo(svc, tenantId, estudanteId, planoId)
      // Só o plano em FOCO alimenta o snapshot do painel: apagar outro não exige recomputar (resposta imediata).
      if (r.ok && r.eraFixado) { try { await refrescarAposMudarFoco(svc, tenantId, estudanteId) } catch { /* best-effort */ } }
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, message: r.error }, { status: r.error === 'nao_encontrado' ? 404 : 500 })
    }
    if (acao === 'renomear') {
      const planoId = String(body.planoId || '')
      const titulo = String(body.titulo || '')
      if (!planoId) return NextResponse.json({ ok: false, message: 'Plano ausente.' }, { status: 400 })
      const r = await renomearPlanoAdaptativo(svc, tenantId, estudanteId, planoId, titulo)
      if (r.ok) { try { await refrescarAposMudarFoco(svc, tenantId, estudanteId) } catch { /* best-effort */ } } // o nome do plano em foco aparece no painel
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
      if ('concluido_em' in p && typeof p.concluido_em === 'string' && DATA.test(p.concluido_em.slice(0, 10))) patch.concluido_em = p.concluido_em.slice(0, 10) // data REAL (o servidor carimba hoje se faltar)
      if ('cert' in p) patch.cert = p.cert == null ? null : Math.max(0, Math.round(Number(p.cert)) || 0)
      if ('modo' in p) patch.modo = p.modo ? String(p.modo).slice(0, 20) : null
      if ('nota' in p) patch.nota = p.nota ? String(p.nota).slice(0, 4000) : null
      const r = await patchMetaAdaptativo(svc, tenantId, estudanteId, metaId, patch)
      // WRITE-BEHIND do Painel: concluir/alterar uma meta muda feitasHoje/pctSemana/pendencias do
      // "Meu painel de estudos" (que lê o Adaptativo FIXADO). O recálculo do snapshot é PESADO, então
      // roda DEPOIS da resposta (after) — o cliente recebe o OK na hora (concluir ágil) e o painel já
      // sai atualizado no próximo load. O upsert da meta (a verdade) é o único passo síncrono.
      if (r.ok) after(async () => { try { await atualizarPainelSnapshot(svc, tenantId, estudanteId) } catch { /* best-effort */ } })
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
      // O iframe cria/edita o plano via sync (não via 'gerar'). Write-behind do Painel DEPOIS da resposta
      // (after): o auto-save do iframe não espera o recálculo pesado; o painel sai atualizado no próximo load.
      if (r.ok) after(async () => { try { await atualizarPainelSnapshot(svc, tenantId, estudanteId) } catch { /* best-effort */ } })
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, message: r.error }, { status: r.error === 'sem_plano' || r.error === 'cfg_invalido' ? 400 : 500 })
    }
    return NextResponse.json({ ok: false, message: 'Ação desconhecida.' }, { status: 400 })
  } catch (e) {
    // Falha com motivo no log de gerações (best-effort, em after). 'gerar' já é registrado dentro de gerarAdaptativo.
    const ACOES: Record<string, AcaoGeracao> = { fixar: 'fixar', arquivar: 'arquivar', apagar: 'apagar', pausar: 'pausar', sync: 'sync' }
    if (ACOES[acao]) registrarGeracao(svc, { tenantId, estudanteId, acao: ACOES[acao], origem: acao === 'sync' ? 'iframe' : 'aluno', planoId: typeof body.planoId === 'string' ? body.planoId : null, ok: false, erro: (e as Error)?.message || 'Erro inesperado.' })
    return NextResponse.json({ ok: false, message: (e as Error)?.message || 'Erro inesperado.' }, { status: 500 })
  }
}
