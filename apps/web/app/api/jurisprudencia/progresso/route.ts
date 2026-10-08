import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { checkPermission } from '@/lib/auth/permissions'
import { temAcessoDesafio, perfilAlunos, lerDesafioJogo } from '@/lib/jurisprudencia/conteudo'

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
    if (desafioId) {
      const svc = createAdminClient()
      const jogo = await lerDesafioJogo(svc, desafioId)
      const diasObj = jogo?.dias && typeof jogo.dias === 'object' ? (jogo.dias as Record<string, any>) : {}
      const docPorDia: Record<string, string> = {}
      for (const [k, d] of Object.entries(diasObj)) { const did = (d as any)?.documento_id; if (typeof did === 'string' && did) docPorDia[k] = did }
      const docIds = [...new Set(Object.values(docPorDia))]
      if (docIds.length) {
        // No designer, mostra o botão de leitura mesmo p/ rascunho (só exclui deletado) — é visualização.
        const { data: docs } = await svc.from('simulado_documentos').select('id, deletado').in('id', docIds)
        const vivos = new Set(((docs ?? []) as any[]).filter((d) => !d.deletado).map((d) => d.id))
        for (const [dia, did] of Object.entries(docPorDia)) if (vivos.has(did)) leituraDocs[dia] = did
      }
    }
    return NextResponse.json({ dom: {}, best: {}, recorde: 0, perfil: null, leituras: {}, leituraDocs })
  }

  const desafioId = request.nextUrl.searchParams.get('desafio')
  if (!desafioId) return NextResponse.json({ error: 'Desafio não informado.' }, { status: 400 })

  const svc = createAdminClient()
  if (!(await temAcessoDesafio(sessao.estudanteId, sessao.tenantId, desafioId))) {
    return NextResponse.json({ error: 'Sem acesso a este desafio.' }, { status: 403 })
  }

  const [{ data }, perfis, jogo] = await Promise.all([
    svc.from('simulado_jurisprudencia_progresso').select('dom, best, recorde').eq('desafio_id', desafioId).eq('estudante_id', sessao.estudanteId).maybeSingle(),
    perfilAlunos(svc, sessao.tenantId, [sessao.estudanteId]),
    lerDesafioJogo(svc, desafioId),
  ])
  const perfil = perfis.get(sessao.estudanteId) ?? null

  // Leitura por dia: mapa { "<dia>": true } dos dias cuja LEITURA o aluno já concluiu — é o gate do
  // quiz no arcade. Só considera dias que têm documento de leitura vinculado (dias[].documento_id).
  const diasObj = jogo?.dias && typeof jogo.dias === 'object' ? (jogo.dias as Record<string, any>) : {}
  const docPorDiaBruto: Record<string, string> = {}
  for (const [k, d] of Object.entries(diasObj)) { const did = (d as any)?.documento_id; if (typeof did === 'string' && did) docPorDiaBruto[k] = did }
  const docPorDia: Record<string, string> = {}
  const leituras: Record<string, boolean> = {}
  const idsBrutos = [...new Set(Object.values(docPorDiaBruto))]
  if (idsBrutos.length) {
    const { data: docs } = await svc.from('simulado_documentos').select('id, publicado, deletado, desafio_ativo').eq('tenant_id', sessao.tenantId).in('id', idsBrutos)
    // Auto-cura: a leitura de um dia do desafio nasce p/ ser consumida pelo aluno. Docs vinculados
    // (desafio_ativo=true) que ficaram em rascunho são publicados aqui — senão o botão de Leitura
    // nunca apareceria e o leitor não abriria. A visibilidade real continua gateada pelo PUB do dia.
    const curar = ((docs ?? []) as any[]).filter((d) => !d.publicado && !d.deletado && d.desafio_ativo).map((d) => d.id)
    if (curar.length) {
      try { await svc.from('simulado_documentos').update({ publicado: true }).eq('tenant_id', sessao.tenantId).in('id', curar) } catch { /* ignora */ }
      for (const d of (docs as any[])) if (curar.includes(d.id)) d.publicado = true
    }
    const pub = new Set(((docs ?? []) as any[]).filter((d) => d.publicado && !d.deletado).map((d) => d.id))
    for (const [dia, did] of Object.entries(docPorDiaBruto)) if (pub.has(did)) docPorDia[dia] = did
    const docIds = [...new Set(Object.values(docPorDia))]
    if (docIds.length) {
      const { data: progs } = await svc.from('simulado_leitura_progresso').select('documento_id, concluido_em').eq('estudante_id', sessao.estudanteId).in('documento_id', docIds)
      const concl = new Set(((progs ?? []) as any[]).filter((p) => p.concluido_em).map((p) => p.documento_id))
      for (const [dia, did] of Object.entries(docPorDia)) leituras[dia] = concl.has(did)
    }
  }

  return NextResponse.json({
    dom: (data as any)?.dom ?? {},
    best: (data as any)?.best ?? {},
    recorde: (data as any)?.recorde ?? 0,
    perfil, // { nome, iniciais, cargo, nivel, avatar, avatarCor } — card do jogador
    leituras,              // { "<dia>": bool } — leitura concluída (gate do quiz)
    leituraDocs: docPorDia, // { "<dia>": documentoId } — p/ o link do leitor
  })
}

// POST /api/jurisprudencia/progresso { desafio, dom, best, recorde } -> upsert -> { ok:true }.
export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let b: { desafio?: string; dom?: unknown; best?: unknown; recorde?: unknown }
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 }) }
  const desafioId = typeof b.desafio === 'string' ? b.desafio : ''
  if (!desafioId) return NextResponse.json({ error: 'Desafio não informado.' }, { status: 400 })

  const svc = createAdminClient()
  if (!(await temAcessoDesafio(sessao.estudanteId, sessao.tenantId, desafioId))) {
    return NextResponse.json({ error: 'Sem acesso a este desafio.' }, { status: 403 })
  }

  // Sanitiza: dom/best objetos, recorde inteiro >= 0.
  const dom = b.dom && typeof b.dom === 'object' && !Array.isArray(b.dom) ? b.dom : {}
  const best = b.best && typeof b.best === 'object' && !Array.isArray(b.best) ? b.best : {}
  const recorde = Math.max(0, Math.trunc(Number(b.recorde) || 0))

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

  return NextResponse.json({ ok: true })
}
