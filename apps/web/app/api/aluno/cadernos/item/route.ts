import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'

// Itens de caderno que não são questão (hoje: comentário do aluno sobre um trecho do material).
// POST   — adiciona item a um caderno existente { caderno_id, ...item }
//          OU cria o caderno e vincula o item na MESMA chamada { novo_caderno: { nome }, ...item }.
// DELETE — remove item (?caderno_id=&item_id=).
// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

const MSG_MIGRACAO = 'Recurso indisponível: falta aplicar a migração 20261105000000_aluno_caderno_itens_comentario.sql no banco.'

/** Tabela ainda não criada (migração pendente) / schema cache desatualizado. */
function tabelaAusente(err: any): boolean {
  const code = String(err?.code ?? '')
  const msg = String(err?.message ?? '')
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST204' || /schema cache|does not exist|Could not find the table/i.test(msg)
}

const txt = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : null)
const uuid = (v: unknown): string | null =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })

  // Validação do item (tamanhos limitados).
  const comentario = txt(body.comentario, 5000)
  const trecho = txt(body.trecho, 2000)
  if (!comentario) return NextResponse.json({ message: 'Escreva um comentário antes de salvar.' }, { status: 400 })
  const nomeNovo = body.novo_caderno ? txt(body.novo_caderno?.nome, 120) : null
  if (body.novo_caderno && !nomeNovo) return NextResponse.json({ message: 'Informe um nome para o novo caderno.' }, { status: 400 })
  if (!body.novo_caderno && !uuid(body.caderno_id)) return NextResponse.json({ message: 'Escolha um caderno.' }, { status: 400 })

  const item = {
    tipo: 'comentario' as const,
    documento_id: uuid(body.documento_id),
    documento_versao: int(body.documento_versao),
    titulo_documento: txt(body.titulo_documento, 300),
    trecho,
    prefix: txt(body.prefix, 300),
    suffix: txt(body.suffix, 300),
    inicio: int(body.inicio),
    fim: int(body.fim),
    comentario,
    cor: txt(body.cor, 20),
    grifo_ref: txt(body.grifo_ref, 80),
  }

  const svc = createAdminClient()
  let caderno: { id: string; nome: string }
  let criadoAgora = false

  if (nomeNovo) {
    const { data, error } = await svc
      .from('simulado_aluno_cadernos')
      .insert({ tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, nome: nomeNovo })
      .select('id, nome')
      .single()
    if (error || !data) return NextResponse.json({ message: 'Não consegui criar o caderno.' }, { status: 500 })
    caderno = data
    criadoAgora = true
  } else {
    const { data } = await svc
      .from('simulado_aluno_cadernos')
      .select('id, nome')
      .eq('id', body.caderno_id)
      .eq('tenant_id', sessao.tenantId)
      .eq('estudante_id', sessao.estudanteId)
      .maybeSingle()
    if (!data) return NextResponse.json({ message: 'Caderno não encontrado.' }, { status: 403 })
    caderno = data
  }

  // Se o item falhar num caderno recém-criado, desfaz o caderno (sem caderno vazio sobrando).
  const falhar = async (status: number, message: string) => {
    if (criadoAgora) {
      await svc.from('simulado_aluno_cadernos').delete().eq('id', caderno.id).eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId)
    }
    return NextResponse.json({ message }, { status })
  }

  const base = { tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, caderno_id: caderno.id }

  // Dedupe por grifo_ref no mesmo caderno: já existe → atualiza o comentário em vez de duplicar.
  if (item.grifo_ref && !criadoAgora) {
    const { data: ex, error: exErr } = await svc
      .from('simulado_aluno_caderno_itens')
      .select('id')
      .eq('tenant_id', sessao.tenantId)
      .eq('caderno_id', caderno.id)
      .eq('grifo_ref', item.grifo_ref)
      .maybeSingle()
    if (exErr) return falhar(tabelaAusente(exErr) ? 503 : 500, tabelaAusente(exErr) ? MSG_MIGRACAO : 'Não consegui salvar agora.')
    if (ex) {
      const { data: upd, error: upErr } = await svc
        .from('simulado_aluno_caderno_itens')
        .update({ comentario: item.comentario, cor: item.cor, trecho: item.trecho })
        .eq('id', ex.id).eq('tenant_id', sessao.tenantId)
        .select('*').single()
      if (upErr) return NextResponse.json({ message: 'Não consegui salvar agora.' }, { status: 500 })
      return NextResponse.json({ ok: true, atualizado: true, caderno: await comTotal(svc, caderno, sessao.tenantId), item: upd })
    }
  }

  const { data: novo, error } = await svc.from('simulado_aluno_caderno_itens').insert({ ...base, ...item }).select('*').single()
  if (error || !novo) {
    if (error && String((error as any).code) === '23505') {
      // corrida: outro request inseriu o mesmo grifo_ref → trata como sucesso idempotente
      return NextResponse.json({ ok: true, atualizado: true, caderno: await comTotal(svc, caderno, sessao.tenantId), item: null })
    }
    if (error && tabelaAusente(error)) return falhar(503, MSG_MIGRACAO)
    return falhar(500, 'Não consegui salvar agora.')
  }

  return NextResponse.json({ ok: true, caderno: await comTotal(svc, caderno, sessao.tenantId), item: novo })
}

/** total = questões + itens do caderno (2 COUNT head, sem trazer linhas). */
async function comTotal(svc: any, c: { id: string; nome: string }, tenantId: string) {
  const [q, i] = await Promise.all([
    svc.from('simulado_aluno_caderno_questoes').select('questao_id', { count: 'exact', head: true }).eq('caderno_id', c.id),
    svc.from('simulado_aluno_caderno_itens').select('id', { count: 'exact', head: true }).eq('caderno_id', c.id).eq('tenant_id', tenantId),
  ])
  return { id: c.id, nome: c.nome, total: (q.count ?? 0) + (i.count ?? 0) }
}

export async function DELETE(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const cadernoId = uuid(searchParams.get('caderno_id'))
  const itemId = uuid(searchParams.get('item_id'))
  if (!cadernoId || !itemId) return NextResponse.json({ message: 'Dados ausentes.' }, { status: 400 })

  const svc = createAdminClient()
  const { data: dono } = await svc
    .from('simulado_aluno_cadernos').select('id')
    .eq('id', cadernoId).eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).maybeSingle()
  if (!dono) return NextResponse.json({ message: 'Caderno não encontrado.' }, { status: 403 })

  const { error } = await svc
    .from('simulado_aluno_caderno_itens').delete()
    .eq('id', itemId).eq('caderno_id', cadernoId).eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId)
  if (error) return NextResponse.json({ message: tabelaAusente(error) ? MSG_MIGRACAO : 'Não consegui remover.' }, { status: tabelaAusente(error) ? 503 : 500 })
  return NextResponse.json({ ok: true })
}
