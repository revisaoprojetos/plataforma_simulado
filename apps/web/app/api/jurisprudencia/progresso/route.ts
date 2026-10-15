import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { checkPermission } from '@/lib/auth/permissions'
import { temAcessoDesafio, perfilAlunos, lerDesafioJogo } from '@/lib/jurisprudencia/conteudo'
import { ehTestadorModulo } from '@/lib/leitura/testadores'
import { diaBRT, streakDe } from '@/lib/jurisprudencia/sequencia'

// Progresso do aluno no Desafio de Jurisprudência (tabela simulado_jurisprudencia_progresso).
//   dom  = {"<dia>": [índices de teses dominadas]}
//   best = {"<dia>": melhorPontuação}
//   recorde = int
export const dynamic = 'force-dynamic'

// GET /api/jurisprudencia/progresso?desafio=<id> -> { dom, best, recorde } (defaults vazios).
export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  // Prévia do admin (Designer): sem progresso/perfil de aluno, MAS devolve os docs de leitura por dia
  // para que a TELA DO DIA (Leitura + Desafio) apareça na visualização. leituras vazio = estado real
  // (quiz travado até ler); o preview destrava clicando "demonstração" e a Leitura abre em nova aba.
  if (!sessao) {
    if (!(await checkPermission('leitura:view'))) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    const desafioId = request.nextUrl.searchParams.get('desafio')
    const leituraDocs: Record<string, string> = {}
    const leituraRapidaDocs: Record<string, string> = {}
    if (desafioId) {
      const svc = createAdminClient()
      const jogo = await lerDesafioJogo(svc, desafioId)
      const diasObj = jogo?.dias && typeof jogo.dias === 'object' ? (jogo.dias as Record<string, any>) : {}
      const docPorDia: Record<string, string> = {}
      for (const [k, d] of Object.entries(diasObj)) { const did = (d as any)?.documento_id; if (typeof did === 'string' && did) docPorDia[k] = did }
      const docIds = [...new Set(Object.values(docPorDia))]
      if (docIds.length) {
        // No designer, mostra o botão de leitura mesmo p/ rascunho (só exclui deletado) — é visualização.
        const { data: docs } = await svc.from('simulado_documentos').select('id, deletado, quiz_config').in('id', docIds)
        const vivos = new Set(((docs ?? []) as any[]).filter((d) => !d.deletado).map((d) => d.id))
        const comRapida = new Set(((docs ?? []) as any[]).filter((d) => !d.deletado && typeof d.quiz_config?.leitura_rapida === 'string' && d.quiz_config.leitura_rapida.trim()).map((d) => d.id))
        for (const [dia, did] of Object.entries(docPorDia)) { if (vivos.has(did)) leituraDocs[dia] = did; if (comRapida.has(did)) leituraRapidaDocs[dia] = did }
      }
    }
    return NextResponse.json({ dom: {}, best: {}, recorde: 0, perfil: null, leituras: {}, leituraDocs, leituraRapidaDocs })
  }

  const desafioId = request.nextUrl.searchParams.get('desafio')
  if (!desafioId) return NextResponse.json({ error: 'Desafio não informado.' }, { status: 400 })

  const svc = createAdminClient()
  if (!(await temAcessoDesafio(sessao.estudanteId, sessao.tenantId, desafioId))) {
    return NextResponse.json({ error: 'Sem acesso a este desafio.' }, { status: 403 })
  }

  const [{ data }, perfis, jogo, testador] = await Promise.all([
    svc.from('simulado_jurisprudencia_progresso').select('dom, best, recorde, atualizado_em').eq('desafio_id', desafioId).eq('estudante_id', sessao.estudanteId).maybeSingle(),
    perfilAlunos(svc, sessao.tenantId, [sessao.estudanteId]),
    lerDesafioJogo(svc, desafioId),
    ehTestadorModulo(svc, sessao.tenantId, sessao.estudanteId, desafioId),
  ])
  const perfil = perfis.get(sessao.estudanteId) ?? null

  // Leitura por dia: mapa { "<dia>": true } dos dias cuja LEITURA o aluno já concluiu — é o gate do
  // quiz no arcade. Só considera dias que têm documento de leitura vinculado (dias[].documento_id).
  const diasObj = jogo?.dias && typeof jogo.dias === 'object' ? (jogo.dias as Record<string, any>) : {}
  const docPorDiaBruto: Record<string, string> = {}
  for (const [k, d] of Object.entries(diasObj)) { const did = (d as any)?.documento_id; if (typeof did === 'string' && did) docPorDiaBruto[k] = did }
  const docPorDia: Record<string, string> = {}
  const leituras: Record<string, boolean> = {}
  const leituraRapidaDocs: Record<string, string> = {} // { "<dia>": documentoId } só p/ dias com leitura RÁPIDA
  const idsBrutos = [...new Set(Object.values(docPorDiaBruto))]
  if (idsBrutos.length) {
    const { data: docs } = await svc.from('simulado_documentos').select('id, publicado, deletado, desafio_ativo, quiz_config').eq('tenant_id', sessao.tenantId).in('id', idsBrutos)
    // Auto-cura: a leitura de um dia do desafio nasce p/ ser consumida pelo aluno. Docs vinculados
    // (desafio_ativo=true) que ficaram em rascunho são publicados aqui — senão o botão de Leitura
    // nunca apareceria e o leitor não abriria. A visibilidade real continua gateada pelo PUB do dia.
    const curar = ((docs ?? []) as any[]).filter((d) => !d.publicado && !d.deletado && d.desafio_ativo).map((d) => d.id)
    if (curar.length) {
      try { await svc.from('simulado_documentos').update({ publicado: true }).eq('tenant_id', sessao.tenantId).in('id', curar) } catch { /* ignora */ }
      for (const d of (docs as any[])) if (curar.includes(d.id)) d.publicado = true
    }
    // Testador exclusivo enxerga a leitura de QUALQUER dia (mesmo agendado/rascunho) — p/ conferir antes
    // de abrir ao aluno. Aluno normal: só docs publicados.
    const pub = new Set(((docs ?? []) as any[]).filter((d) => (testador || d.publicado) && !d.deletado).map((d) => d.id))
    for (const [dia, did] of Object.entries(docPorDiaBruto)) if (pub.has(did)) docPorDia[dia] = did
    // Dias cujo documento tem LEITURA RÁPIDA configurada (quiz_config.leitura_rapida não-vazio).
    const comRapida = new Set(((docs ?? []) as any[]).filter((d) => pub.has(d.id) && typeof d.quiz_config?.leitura_rapida === 'string' && d.quiz_config.leitura_rapida.trim()).map((d) => d.id))
    for (const [dia, did] of Object.entries(docPorDia)) if (comRapida.has(did)) leituraRapidaDocs[dia] = did
    const docIds = [...new Set(Object.values(docPorDia))]
    if (docIds.length) {
      const { data: progs } = await svc.from('simulado_leitura_progresso').select('documento_id, concluido_em').eq('estudante_id', sessao.estudanteId).in('documento_id', docIds)
      const concl = new Set(((progs ?? []) as any[]).filter((p) => p.concluido_em).map((p) => p.documento_id))
      for (const [dia, did] of Object.entries(docPorDia)) leituras[dia] = concl.has(did)
    }
  }

  // Sequência (streak): dias de atividade do aluno NO DESAFIO, lidos do LEDGER (fonte da verdade).
  // Backfill: se não houver evento (atividade anterior à feature), usa o dia do `atualizado_em`.
  const diasSet = new Set<string>()
  try {
    const { data: evs } = await svc
      .from('simulado_xp_eventos')
      .select('meta, criado_em')
      .eq('tenant_id', sessao.tenantId)
      .eq('estudante_id', sessao.estudanteId)
      .eq('origem', 'jurisprudencia')
      .eq('meta->>desafio', desafioId)
      .limit(500)
    for (const e of (evs ?? []) as any[]) {
      const d = e?.meta?.dia
      if (typeof d !== 'string') continue
      // Ignora data fabricada pelo cliente (meta.dia != dia de criação BRT); legítimo é gravado no dia.
      if (e.criado_em && d !== diaBRT(e.criado_em)) continue
      diasSet.add(d)
    }
  } catch { /* ledger indisponível → cai no backfill */ }
  if (!diasSet.size && (data as any)?.atualizado_em) diasSet.add(diaBRT((data as any).atualizado_em))
  const dias = [...diasSet].sort()

  return NextResponse.json({
    dom: (data as any)?.dom ?? {},
    best: (data as any)?.best ?? {},
    recorde: (data as any)?.recorde ?? 0,
    atualizadoEm: (data as any)?.atualizado_em ?? null,
    dias,                       // ['YYYY-MM-DD'] — dias de atividade (ledger + backfill) p/ a sequência
    streak: streakDe(diasSet),  // streak atual já computado no servidor (BRT)
    perfil, // { nome, iniciais, cargo, nivel, avatar, avatarCor } — card do jogador
    leituras,              // { "<dia>": bool } — leitura concluída (gate do quiz)
    leituraDocs: docPorDia, // { "<dia>": documentoId } — p/ o link do leitor
    leituraRapidaDocs,      // { "<dia>": documentoId } — dias que TÊM leitura rápida (botão no arcade)
  })
}

// POST /api/jurisprudencia/progresso { desafio, dom, best, recorde } -> upsert -> { ok:true }.
export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let b: { desafio?: string; dom?: unknown; best?: unknown; recorde?: unknown; dias?: unknown }
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 }) }
  const desafioId = typeof b.desafio === 'string' ? b.desafio : ''
  if (!desafioId) return NextResponse.json({ error: 'Desafio não informado.' }, { status: 400 })

  const svc = createAdminClient()
  if (!(await temAcessoDesafio(sessao.estudanteId, sessao.tenantId, desafioId))) {
    return NextResponse.json({ error: 'Sem acesso a este desafio.' }, { status: 403 })
  }

  // Sanitiza: dom/best objetos; recorde = maior best (recomputado — não confia no recorde do cliente).
  // NB: o SELO FINAL (dia agregado) é MANTIDO — quem ganhar de verdade salva normalmente. O "dia 15
  // fantasma" era o VAZAMENTO do localStorage (storageKey fixo), já corrigido por conta (v3.15.1) + limpeza
  // dos dados; não dá pra bloquear aqui sem quebrar o selo legítimo.
  const domIn = b.dom && typeof b.dom === 'object' && !Array.isArray(b.dom) ? (b.dom as Record<string, unknown>) : {}
  const bestIn = b.best && typeof b.best === 'object' && !Array.isArray(b.best) ? (b.best as Record<string, unknown>) : {}

  // Estado atual no servidor (fonte p/ a guarda anti-vazio + a MESCLA monotônica abaixo).
  const { data: atual } = await svc
    .from('simulado_jurisprudencia_progresso')
    .select('dom, best')
    .eq('desafio_id', desafioId).eq('estudante_id', sessao.estudanteId)
    .maybeSingle()
  const domAtual = (atual?.dom && typeof atual.dom === 'object') ? atual.dom as Record<string, unknown> : {}
  const bestAtual = (atual?.best && typeof atual.best === 'object') ? atual.best as Record<string, unknown> : {}

  // GUARDA ANTI-ZERAMENTO: o cliente NUNCA manda dom/best vazios legítimos — jogar só ACRESCENTA. O flush do
  // bootstrap (pagehide → sendBeacon) POSTa o localStorage; se o seed falhar, grava `{}` por cima → zera.
  // Vazio total + já há dados no servidor → não sobrescreve (reset real é via SQL do admin).
  if (Object.keys(domIn).length === 0 && Object.keys(bestIn).length === 0) {
    const temDados = Object.keys(domAtual).length || Object.keys(bestAtual).length
    if (temDados) return NextResponse.json({ ok: true, protegido: true })
  }

  // MESCLA MONOTÔNICA (best é um RECORDE → só sobe; dom só ganha teses). Antes o POST sobrescrevia cego: um
  // localStorage velho (ex.: pontuação rebaixada pelo clamp, ou anterior a uma recorreção do servidor)
  // REGREDIA o valor do servidor a cada flush. Agora best[dia]=max(servidor,cliente) e dom[dia]=união das
  // teses — assim correções do servidor PERSISTEM e nenhuma aba velha consegue baixar a pontuação.
  const best: Record<string, number> = {}
  for (const k of new Set([...Object.keys(bestAtual), ...Object.keys(bestIn)])) {
    best[k] = Math.max(Math.trunc(Number(bestAtual[k]) || 0), Math.trunc(Number(bestIn[k]) || 0))
  }
  const dom: Record<string, number[]> = {}
  for (const k of new Set([...Object.keys(domAtual), ...Object.keys(domIn)])) {
    const a = Array.isArray(domAtual[k]) ? (domAtual[k] as any[]).map((x) => Number(x)) : []
    const i = Array.isArray(domIn[k]) ? (domIn[k] as any[]).map((x) => Number(x)) : []
    dom[k] = [...new Set([...a, ...i].filter((x) => Number.isFinite(x)))]
  }
  const recorde = Math.max(0, ...Object.values(best).map((v) => Math.trunc(Number(v) || 0)))

  const { error } = await svc.from('simulado_jurisprudencia_progresso').upsert(
    {
      tenant_id: sessao.tenantId,
      desafio_id: desafioId,
      estudante_id: sessao.estudanteId,
      dom,
      best,
      recorde,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'desafio_id,estudante_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // NB: a SEQUÊNCIA do juris NÃO é mais marcada aqui. Antes, cada save/re-sync do arcade gravava um marcador
  // de "dia ativo" — então só interagir com o arcade (ou um re-sync do localStorage) já contava como
  // sequência, mesmo sem fazer a aula. Agora o marcador vem só da conclusão da LEITURA (ou das questões),
  // que é a regra: fazer a leitura conta como sequência. (ver /api/leitura/progresso e quiz-tentativa.)

  return NextResponse.json({ ok: true })
}
