import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { termoSeguro } from './metas'

// Dados da sub-aba Gerador > Grupos de acessos (pacotes de cronogramas). O acesso do aluno continua sendo
// resolvido na leitura (lib/cronograma/acesso.ts): vincular um grupo é UMA linha, não há propagação a materializar.
// Os pacotes de um tenant são poucos (dezenas): a lista filtra/ordena/pagina aqui no servidor sobre contagens agregadas.

export type PacoteLinha = {
  id: string; nome: string; descricao: string | null; ativo: boolean; acesso_gratuito: boolean; ordem: number
  cronogramas: number; grupos: number; estudantes: number; alcance: number
}

export type ListaPacotes = {
  ok: true; linhas: PacoteLinha[]; total: number
  kpis: { pacotes: number; cronogramas: number; alcance: number; gratuitos: number }
} | { ok: false; error: string }

const CHAVES: Record<string, (p: PacoteLinha) => number | string> = {
  nome: (p) => p.nome, cronogramas: (p) => p.cronogramas, grupos: (p) => p.grupos, alcance: (p) => p.alcance, status: (p) => (p.ativo ? 1 : 0),
}

export async function paginarPacotes(tenantId: string, o: { q?: string; status?: string; ord?: string; dir?: 'asc' | 'desc'; pagina: number; por: number }): Promise<ListaPacotes> {
  const svc = createAdminClient()
  const t = termoSeguro(o.q)

  let q = svc.from('simulado_cronograma_pacotes').select('id, nome, descricao, ativo, acesso_gratuito, ordem').eq('tenant_id', tenantId)
  if (t) q = q.or(`nome.ilike.%${t}%,descricao.ilike.%${t}%`)
  if (o.status === 'ativo') q = q.eq('ativo', true)
  else if (o.status === 'inativo') q = q.eq('ativo', false)
  else if (o.status === 'gratuito') q = q.eq('acesso_gratuito', true)
  const [{ data: pacotes, error }, itens, grupos, alcances, { data: todos }] = await Promise.all([
    q.order('ordem').order('nome').order('id'),
    fetchAll<{ pacote_id: string }>(() => svc.from('simulado_cronograma_pacote_itens').select('pacote_id').eq('tenant_id', tenantId).order('id') as any),
    fetchAll<{ pacote_id: string }>(() => svc.from('simulado_cronograma_pacote_grupos').select('pacote_id').eq('tenant_id', tenantId).order('id') as any),
    svc.rpc('simulado_cronograma_pacotes_alcance', { p_tenant: tenantId }),
    // KPIs do tenant inteiro (independem do filtro): só colunas leves.
    svc.from('simulado_cronograma_pacotes').select('id, acesso_gratuito').eq('tenant_id', tenantId),
  ])
  if (error) return { ok: false, error: error.message }

  const conta = (ls: { pacote_id: string }[]) => { const m = new Map<string, number>(); for (const l of ls) m.set(l.pacote_id, (m.get(l.pacote_id) ?? 0) + 1); return m }
  const nItens = conta(itens), nGrupos = conta(grupos)
  const alc = new Map<string, number>()
  for (const a of ((alcances.data ?? []) as { pacote_id: string; alcance: number }[])) alc.set(a.pacote_id, Number(a.alcance))

  const todas: PacoteLinha[] = ((pacotes ?? []) as any[]).map((p) => ({
    ...p, cronogramas: nItens.get(p.id) ?? 0, grupos: nGrupos.get(p.id) ?? 0, estudantes: 0, alcance: alc.get(p.id) ?? 0,
  }))
  const f = CHAVES[o.ord ?? '']
  if (f) {
    const d = o.dir === 'desc' ? -1 : 1
    todas.sort((a, b) => { const x = f(a), y = f(b); return (typeof x === 'string' ? x.localeCompare(y as string, 'pt-BR') : (x as number) - (y as number)) * d || a.nome.localeCompare(b.nome, 'pt-BR') })
  }
  const ini = (o.pagina - 1) * o.por
  const linhas = todas.slice(ini, ini + o.por)

  // Alunos avulsos: contagem agregada (head) só dos pacotes desta página.
  const avulsos = await Promise.all(linhas.map((p) =>
    svc.from('simulado_cronograma_pacote_estudantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('pacote_id', p.id).then((r) => r.count ?? 0)))
  linhas.forEach((p, i) => { p.estudantes = avulsos[i] })

  let cron = 0, alcance = 0
  for (const v of nItens.values()) cron += v
  for (const v of alc.values()) alcance += v
  return {
    ok: true, linhas, total: todas.length,
    kpis: { pacotes: (todos ?? []).length, cronogramas: cron, alcance, gratuitos: ((todos ?? []) as { acesso_gratuito: boolean }[]).filter((x) => x.acesso_gratuito).length },
  }
}
