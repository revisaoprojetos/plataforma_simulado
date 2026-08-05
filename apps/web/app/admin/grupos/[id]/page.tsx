import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { grupoMembrosSql, grupoAtividadeSql, grupoSubgruposSql } from 'data'
import { GrupoDetalheClient } from '@/components/admin/grupo-detalhe-client'

// Sempre fresco: os membros do grupo mudam por import/vínculo e não podem ficar em cache.
export const dynamic = 'force-dynamic'

const SEM = '00000000-0000-0000-0000-000000000000'
const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const ehImportRow = (l: any) => l.entidade === 'simulado_estudantes' && ((l.dados_novos as any)?.curseduca_grupos || (l.dados_novos as any)?.novos != null)

/** Rótulo humano + detalhe + cor de um evento de auditoria do grupo. `bancoNome` já resolvido. */
function labelEvento(log: any, bancoNome: string | null): { texto: string; detalhe: string | null; cor: string } {
  const d = (log.dados_novos ?? {}) as any, a = (log.dados_anteriores ?? {}) as any
  const op = log.operacao, ent = log.entidade
  if (ent === 'simulado_estudantes' && (d.curseduca_grupos || d.novos != null || d.vinculados != null)) {
    const n = d.vinculados ?? d.novos ?? d.total ?? 0
    const partes: string[] = []
    if (d.jaExistiam) partes.push(`${d.jaExistiam} já existia(m)`)
    if (d.atualizados) partes.push(`${d.atualizados} atualizado(s)`)
    if (d.removidos) partes.push(`${d.removidos} removido(s)`)
    if (Array.isArray(d.curseduca_grupos) && d.curseduca_grupos.length) partes.push(`canais: ${d.curseduca_grupos.join(', ')}`)
    return { texto: `${n} aluno(s) importado(s) da Curseduca`, detalhe: partes.join(' · ') || null, cor: 'bg-emerald-500' }
  }
  if (ent === 'simulado_grupos') {
    if (op === 'INSERT') return { texto: d.is_mestre ? 'Pasta criada' : 'Grupo criado', detalhe: d.nome ? `"${d.nome}"` : null, cor: 'bg-emerald-500' }
    if (op === 'DELETE') return { texto: 'Grupo excluído', detalhe: null, cor: 'bg-rose-500' }
    if (d.membros_adicionados != null) {
      const nomes: string[] = Array.isArray(d.nomes) ? d.nomes : []
      const extra = d.membros_adicionados - nomes.length
      return { texto: `${d.membros_adicionados} participante(s) adicionado(s)`, detalhe: nomes.length ? nomes.join(', ') + (extra > 0 ? ` e mais ${extra}` : '') : null, cor: 'bg-primary' }
    }
    if (d.membros_removidos != null) return { texto: 'Participante removido', detalhe: d.nome ? String(d.nome) : `${d.membros_removidos} vínculo(s)`, cor: 'bg-rose-500' }
    if (d.esvaziado != null) return { texto: 'Grupo esvaziado', detalhe: `${d.esvaziado} vínculo(s) removido(s)`, cor: 'bg-rose-500' }
    if ('pai_id' in d && !('nome' in d)) return { texto: d.pai_id ? `Movido para a pasta ${d.pai_nome ? `"${d.pai_nome}"` : ''}`.trim() : 'Removido da pasta (solto)', detalhe: null, cor: 'bg-sky-500' }
    const mud: string[] = []
    if ((a.nome ?? null) !== (d.nome ?? null)) mud.push(`Nome: "${a.nome ?? '—'}" → "${d.nome ?? '—'}"`)
    if ((a.descricao ?? '') !== (d.descricao ?? '')) mud.push('Descrição alterada')
    return { texto: 'Dados do grupo alterados', detalhe: mud.join(' · ') || null, cor: 'bg-primary' }
  }
  if (ent === 'simulado_pasta_grupos') {
    const nome = bancoNome ?? 'um banco de questões'
    const det = d.orfaos_removidos ? `${d.orfaos_removidos} aluno(s) perderam acesso ao banco (estavam só por este grupo e sem prova iniciada)` : null
    return { texto: op === 'DELETE' ? `Desvinculado do banco "${nome}"` : `Vinculado ao banco "${nome}"`, detalhe: det, cor: op === 'DELETE' ? 'bg-rose-500' : 'bg-sky-500' }
  }
  if (ent === 'simulado_pasta_estudantes') return { texto: `Estudantes vinculados ao banco "${bancoNome ?? 'um banco'}"`, detalhe: d.vinculados ? `${d.vinculados} estudante(s)` : null, cor: 'bg-sky-500' }
  return { texto: `${op} · ${ent}`, detalhe: null, cor: 'bg-muted-foreground' }
}
const iso = (v: any): string => (v instanceof Date ? v.toISOString() : String(v ?? ''))

export default async function GrupoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = await getCurrentTenantId()
  const tid = tenantId ?? SEM
  const svc = createAdminClient()

  // Grupo — tolerante a colunas ausentes.
  let grupo: any = null
  {
    const cols = ['id, nome, cor, descricao, is_mestre, pai_id, codigo_externo, criado_em', 'id, nome, cor', 'id, nome']
    for (const c of cols) {
      const r = await svc.from('simulado_grupos').select(c).eq('id', id).eq('tenant_id', tid).eq('deletado', false).maybeSingle()
      if (!r.error) { grupo = r.data; break }
      if (!/column|does not exist|descricao|is_mestre|pai_id|codigo_externo|criado_em|\bcor\b/i.test(r.error.message)) break
    }
  }
  if (!grupo) notFound()

  // ── Tudo que depende só de (id, tid, grupo) num único round-trip paralelo: membros, origem,
  // pastas, subgrupos e atividade. Cada bloco pesado tem SQL-direto → fallback PostgREST. ──
  type Membro = { id: string; nome: string; email: string | null; classificacao: string | null; ultimo: string | null; simulados: number }
  type Atividade = { id: string; quando: string; operacao: string; texto: string; detalhe: string | null; cor: string; ator: string; email: string | null }

  const [membros, provMap, pastasRaw, subSqlRes, atividades] = await Promise.all([
    // Membros: SQL direto (1 query) → fallback PostgREST (ids + chunks).
    (async (): Promise<Membro[]> => {
      const mSql = await grupoMembrosSql(id, tid)
      if (mSql) return mSql.map((e) => ({ id: e.id, nome: e.nome ?? 'Estudante', email: e.email ?? null, classificacao: e.classificacao ?? null, ultimo: null, simulados: 0 }))
      const gm = await fetchAll<{ estudante_id: string }>(() => svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', id).order('estudante_id', { ascending: true }))
      const memberIds = [...new Set(gm.map((r) => r.estudante_id).filter(Boolean))]
      const rows = memberIds.length
        ? await fetchAllByIn<any>(memberIds, (chunk) => svc.from('simulado_estudantes').select('id, nome, email, classificacao').in('id', chunk).eq('deletado', false).order('nome', { ascending: true }), { chunk: 300 })
        : []
      return rows.map((e) => ({ id: e.id, nome: e.nome ?? 'Estudante', email: e.email ?? null, classificacao: e.classificacao ?? null, ultimo: null, simulados: 0 }))
        .sort((x, y) => (x.nome || '').localeCompare(y.nome || '', 'pt-BR'))
    })(),
    // Origem (provider do mapeamento de integração).
    fetchAll<{ grupo_id: string | null; provider: string | null }>(() =>
      svc.from('simulado_integracao_mapeamentos').select('grupo_id, provider').eq('tenant_id', tid).eq('grupo_id', id).order('grupo_id', { ascending: true })).catch(() => []),
    // Pastas (para mover o grupo).
    svc.from('simulado_grupos').select('id, nome').eq('tenant_id', tid).eq('is_mestre', true).eq('deletado', false).order('nome'),
    // Subgrupos (só se for pasta mestre): SQL → fallback tratado abaixo.
    grupo.is_mestre === true ? grupoSubgruposSql(id, tid) : Promise.resolve([] as any[]),
    // Atividade: SQL direto (ator + banco resolvidos) → fallback PostgREST.
    (async (): Promise<Atividade[]> => {
      const atvSql = await grupoAtividadeSql(id, tid)
      if (atvSql) {
        return (atvSql as any[]).map((l) => {
          const { texto, detalhe, cor } = labelEvento(l, l.banco_nome ?? null)
          const ator = l.ator_nome || (ehImportRow(l) ? 'Integração Curseduca' : l.ator_tipo === 'estudante' ? 'Aluno' : 'Sistema')
          return { id: l.id, quando: iso(l.criado_em), operacao: l.operacao, texto, detalhe, cor, ator, email: l.ator_email ?? null }
        })
      }
      const { data: logsRaw } = await svc.from('simulado_audit_logs')
        .select('id, actor_user_id, ator_id, ator_tipo, operacao, entidade, dados_anteriores, dados_novos, criado_em')
        .eq('tenant_id', tid).eq('entidade_id', id).order('criado_em', { ascending: false }).limit(400)
      const logs = logsRaw ?? []
      const atorIds = [...new Set(logs.map((l: any) => l.actor_user_id ?? l.ator_id).filter(isUuid))] as string[]
      const atores = new Map<string, { nome: string; email: string | null }>()
      await Promise.all(atorIds.map(async (uid) => {
        try { const { data } = await svc.auth.admin.getUserById(uid); const u = data?.user; if (u) atores.set(uid, { nome: ((u.user_metadata as any)?.nome as string) || (u.email ?? 'Usuário'), email: u.email ?? null }) } catch { /* ignora */ }
      }))
      const bancoIds = [...new Set(logs.filter((l: any) => isUuid((l.dados_novos as any)?.banco)).map((l: any) => (l.dados_novos as any).banco))] as string[]
      const nomesBanco = new Map<string, string>()
      if (bancoIds.length) { const { data } = await svc.from('simulado_pastas').select('id, nome').in('id', bancoIds); for (const b of (data ?? []) as any[]) nomesBanco.set(b.id, b.nome) }
      return logs.map((l: any) => {
        const { texto, detalhe, cor } = labelEvento(l, l.dados_novos?.banco ? (nomesBanco.get(l.dados_novos.banco) ?? null) : null)
        const at = atores.get(l.actor_user_id ?? l.ator_id)
        const ator = at?.nome ?? (ehImportRow(l) ? 'Integração Curseduca' : l.ator_tipo === 'estudante' ? 'Aluno' : 'Sistema')
        return { id: l.id as string, quando: iso(l.criado_em), operacao: l.operacao as string, texto, detalhe, cor, ator, email: at?.email ?? null }
      })
    })(),
  ])

  const provider = (provMap as any[])[0]?.provider as string | undefined
  const origem: 'guru' | 'curseduca' | null = provider === 'guru' ? 'guru' : (provider === 'curseduca' || grupo.codigo_externo) ? 'curseduca' : null
  const pastas = ((pastasRaw as any).data ?? []).filter((p: any) => p.id !== id).map((p: any) => ({ id: p.id as string, nome: p.nome as string }))

  // Subgrupos: SQL → fallback (contagem por filho).
  let subgrupos: { id: string; nome: string; cor: string | null; membros: number }[]
  if (subSqlRes) {
    subgrupos = (subSqlRes as any[]).map((s) => ({ id: s.id, nome: s.nome, cor: s.cor ?? null, membros: Number(s.membros) || 0 }))
  } else {
    const { data: sub } = grupo.is_mestre === true
      ? await svc.from('simulado_grupos').select('id, nome, cor').eq('pai_id', id).eq('tenant_id', tid).eq('deletado', false).order('nome')
      : { data: [] as any[] }
    subgrupos = []
    await Promise.all((sub ?? []).map(async (s: any) => {
      const { count } = await svc.from('simulado_grupo_membros').select('*', { count: 'exact', head: true }).eq('grupo_id', s.id)
      subgrupos.push({ id: s.id, nome: s.nome, cor: s.cor ?? null, membros: count ?? 0 })
    }))
    subgrupos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  return (
    <GrupoDetalheClient
      grupo={{ id: grupo.id, nome: grupo.nome, cor: grupo.cor ?? null, descricao: grupo.descricao ?? null, is_mestre: grupo.is_mestre === true, pai_id: grupo.pai_id ?? null, codigo: grupo.codigo_externo ?? null, criado_em: grupo.criado_em ?? null, origem }}
      membros={membros}
      subgrupos={subgrupos}
      pastas={pastas}
      atividades={atividades}
    />
  )
}
