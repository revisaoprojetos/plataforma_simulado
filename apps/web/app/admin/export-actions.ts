'use server'

import { sanearBusca } from '@/lib/seguranca/email-seguro'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { codigoQuestao } from '@/lib/codigo-questao'
import { sqlQuery } from '@/lib/data/sql'
import { montarWhere } from '@/lib/admin-revisao/biblioteca-questoes'
import { estadoQDeParams } from '@/lib/admin-revisao/biblioteca-questoes-tipos'

const NADA = '00000000-0000-0000-0000-000000000000'
const stripHtml = (s: string | null | undefined) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const DIFICULDADE: Record<string, string> = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }
const STATUS_Q: Record<string, string> = { publicada: 'Publicada', rascunho: 'Rascunho', arquivada: 'Arquivada' }

/** Todas as questões do tenant que casam com os filtros da página (para exportação). */
export async function exportarQuestoes(f: {
  q?: string; status?: string; disciplina?: string; dificuldade?: string; tipo?: string
  /** querystring do estado da lista (filtros multi do card: disc/ass/det/banca/orgao/cargo/ano/dif/status/tipo/etq + q) → exporta via SQL com os MESMOS filtros da tela */
  qs?: string
}) {
  if (!(await checkPermission('questoes:view'))) return []
  const svc = await createServiceClient()
  const tid = (await getCurrentTenantId()) ?? NADA
  if (f.qs !== undefined) {
    const e = estadoQDeParams(new URLSearchParams(f.qs))
    const w = montarWhere(tid, e)
    const r = await sqlQuery<any>(
      `select q.id, q.codigo, q.enunciado, q.status, q.tipo, q.nivel_dificuldade, q.ano, d.nome as disciplina, b.nome as banca
         from simulado_questoes q
         left join simulado_disciplinas d on d.id = q.disciplina_id
         left join simulado_bancas b on b.id = q.banca_id
        where ${w.sql} order by q.created_at desc, q.id limit 20000`, w.params)
    if (r) return r.map((q) => ({
      codigo: codigoQuestao(q.id, q.codigo),
      enunciado: stripHtml(q.enunciado),
      disciplina: q.disciplina ?? '',
      banca: q.banca ?? '',
      dificuldade: q.nivel_dificuldade ? (DIFICULDADE[q.nivel_dificuldade] ?? q.nivel_dificuldade) : '',
      tipo: q.tipo ?? '',
      status: STATUS_Q[q.status] ?? q.status ?? '',
      ano: q.ano != null ? String(q.ano) : '',
    }))
    // sem SQL direto: cai no caminho PostgREST abaixo (só q/status/disciplina/dificuldade/tipo)
  }
  const build = (comCodigo: boolean) => () => {
    let query = svc.from('simulado_questoes')
      .select(comCodigo
        ? 'id, codigo, enunciado, status, tipo, nivel_dificuldade, ano, disciplinas:simulado_disciplinas(nome), bancas:simulado_bancas(nome)'
        : 'id, enunciado, status, tipo, nivel_dificuldade, ano, disciplinas:simulado_disciplinas(nome), bancas:simulado_bancas(nome)')
      .eq('deletado', false).eq('tenant_id', tid)
      .order('created_at', { ascending: false }).order('id', { ascending: true })
    if (f.q) query = comCodigo ? query.or(`enunciado.ilike.%${sanearBusca(f.q)}%,codigo.ilike.%${sanearBusca(f.q)}%`) : query.ilike('enunciado', `%${sanearBusca(f.q)}%`)
    // valores múltiplos do card de filtros chegam como "a|b" (lista ≤ 60, higienizada: só [\w-])
    const lista = (v?: string) => (v ?? '').split('|').map((x) => x.trim()).filter((x) => /^[\w-]{1,64}$/.test(x)).slice(0, 60)
    const multi = (col: string, v?: string) => { const l = lista(v); if (l.length) query = query.in(col, l) }
    multi('status', f.status); multi('disciplina_id', f.disciplina); multi('nivel_dificuldade', f.dificuldade); multi('tipo', f.tipo)
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
  if (!(await checkPermission('matriculas:view'))) return []
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
