'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { codigoQuestao } from '@/lib/codigo-questao'

const NADA = '00000000-0000-0000-0000-000000000000'
const stripHtml = (s: string | null | undefined) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const DIFICULDADE: Record<string, string> = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }
const STATUS_Q: Record<string, string> = { publicada: 'Publicada', rascunho: 'Rascunho', arquivada: 'Arquivada' }

/** Todas as questões do tenant que casam com os filtros da página (para exportação). */
export async function exportarQuestoes(f: {
  q?: string; status?: string; disciplina?: string; dificuldade?: string; tipo?: string
}) {
  const svc = await createServiceClient()
  const tid = (await getCurrentTenantId()) ?? NADA
  const build = (comCodigo: boolean) => () => {
    let query = svc.from('simulado_questoes')
      .select(comCodigo
        ? 'id, codigo, enunciado, status, tipo, nivel_dificuldade, ano, disciplinas:simulado_disciplinas(nome), bancas:simulado_bancas(nome)'
        : 'id, enunciado, status, tipo, nivel_dificuldade, ano, disciplinas:simulado_disciplinas(nome), bancas:simulado_bancas(nome)')
      .eq('deletado', false).eq('tenant_id', tid)
      .order('created_at', { ascending: false }).order('id', { ascending: true })
    if (f.q) query = comCodigo ? query.or(`enunciado.ilike.%${f.q}%,codigo.ilike.%${f.q}%`) : query.ilike('enunciado', `%${f.q}%`)
    if (f.status) query = query.eq('status', f.status)
    if (f.disciplina) query = query.eq('disciplina_id', f.disciplina)
    if (f.dificuldade) query = query.eq('nivel_dificuldade', f.dificuldade)
    if (f.tipo) query = query.eq('tipo', f.tipo)
    return query
  }
  let rows: any[]
  try { rows = await fetchAll<any>(build(true)) }
  catch (e: any) { if (/codigo/i.test(e?.message ?? '')) rows = await fetchAll<any>(build(false)); else throw e }
  return rows.map((q) => ({
    codigo: codigoQuestao(q.id, q.codigo),
    enunciado: stripHtml(q.enunciado),
    disciplina: (q.disciplinas as any)?.nome ?? '',
    banca: (q.bancas as any)?.nome ?? '',
    dificuldade: q.nivel_dificuldade ? (DIFICULDADE[q.nivel_dificuldade] ?? q.nivel_dificuldade) : '',
    tipo: q.tipo ?? '',
    status: STATUS_Q[q.status] ?? q.status ?? '',
    ano: q.ano != null ? String(q.ano) : '',
  }))
}

/** Todas as matrículas do tenant que casam com os filtros da página (para exportação). */
export async function exportarMatriculas(f: { liberado?: string; estudante_id?: string }) {
  const svc = await createServiceClient()
  const tid = (await getCurrentTenantId()) ?? NADA
  const rows = await fetchAll<any>(() => {
    let query = svc.from('simulado_matriculas')
      .select('id, liberado, created_at, estudante_id, estudantes:simulado_estudantes(nome, email), simulados:simulado_simulados(titulo)')
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false }).order('id', { ascending: true })
    if (f.liberado === 'true') query = query.eq('liberado', true)
    if (f.liberado === 'false') query = query.eq('liberado', false)
    if (f.estudante_id) query = query.eq('estudante_id', f.estudante_id)
    return query
  })
  return rows.map((m) => ({
    estudante: (m.estudantes as any)?.nome ?? '',
    email: (m.estudantes as any)?.email ?? '',
    simulado: (m.simulados as any)?.titulo ?? '',
    acesso: m.liberado ? 'Liberado' : 'Bloqueado',
    criado_em: m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR') : '',
  }))
}
