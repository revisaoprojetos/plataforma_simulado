import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { MSG_MIGRACAO, tabelaAusente, uuid } from '@/lib/aluno/caderno-itens-server'

// Destino PADRÃO de salvamento por contexto ('leitura' = grifos/anotações do leitor, 'questoes' = questões).
//   caderno_id null  → "perguntar sempre";  salvar_sem_perguntar → grava direto no caderno escolhido.
// O Caderno de Erros é CALCULADO (automático) e não é destino configurável.
// GET → { destinos: { leitura, questoes } }  (tabela ausente → defaults + indisponivel:true, nunca quebra o leitor)
// PUT → { contexto, caderno_id|null, salvar_sem_perguntar }
export const dynamic = 'force-dynamic'

type Destino = { caderno_id: string | null; salvar_sem_perguntar: boolean }
const CONTEXTOS = ['leitura', 'questoes'] as const
const vazio = (): Record<string, Destino> => ({
  leitura: { caderno_id: null, salvar_sem_perguntar: false },
  questoes: { caderno_id: null, salvar_sem_perguntar: false },
})

export async function GET() {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_aluno_caderno_destinos')
    .select('contexto, caderno_id, salvar_sem_perguntar')
    .eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId)
  if (error) return NextResponse.json({ destinos: vazio(), indisponivel: tabelaAusente(error) })
  const destinos = vazio()
  for (const d of (data ?? []) as any[]) {
    if (d.contexto in destinos) destinos[d.contexto] = { caderno_id: d.caderno_id ?? null, salvar_sem_perguntar: !!d.salvar_sem_perguntar && !!d.caderno_id }
  }
  return NextResponse.json({ destinos })
}

export async function PUT(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const contexto = body?.contexto
  if (!(CONTEXTOS as readonly string[]).includes(contexto)) return NextResponse.json({ message: 'Contexto inválido.' }, { status: 400 })
  const cadernoId = body?.caderno_id == null || body?.caderno_id === '' ? null : uuid(body.caderno_id)
  if (body?.caderno_id && !cadernoId) return NextResponse.json({ message: 'Caderno inválido.' }, { status: 400 })

  const svc = createAdminClient()
  if (cadernoId) {
    const { data: dono } = await svc.from('simulado_aluno_cadernos').select('id')
      .eq('id', cadernoId).eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).maybeSingle()
    if (!dono) return NextResponse.json({ message: 'Caderno não encontrado.' }, { status: 403 })
  }
  const semPerguntar = !!cadernoId && body?.salvar_sem_perguntar === true // sem caderno escolhido não há o que salvar direto
  const { error } = await svc.from('simulado_aluno_caderno_destinos').upsert({
    tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, contexto,
    caderno_id: cadernoId, salvar_sem_perguntar: semPerguntar, atualizado_em: new Date().toISOString(),
  }, { onConflict: 'estudante_id,contexto' })
  if (error) return NextResponse.json({ message: tabelaAusente(error) ? MSG_MIGRACAO : 'Não consegui salvar a preferência.' }, { status: tabelaAusente(error) ? 503 : 500 })
  return NextResponse.json({ ok: true, destino: { contexto, caderno_id: cadernoId, salvar_sem_perguntar: semPerguntar } })
}
