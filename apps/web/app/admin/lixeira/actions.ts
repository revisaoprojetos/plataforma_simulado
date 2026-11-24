'use server'
import type { LixeiraItem } from './actions-tipos'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softRestore, SOFT_DELETE_TABELAS, type SoftDeleteTabela } from '@/lib/soft-delete'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { bloquearSeTemVinculos } from '@/lib/conteudo/dependencias-documento'

// tabela → { tipo exibido, coluna de rótulo (ou __sessao = composto Aluno — Simulado) }
const CFG: Record<SoftDeleteTabela, { tipo: string; rotulo: string }> = {
  simulado_simulados: { tipo: 'Simulado', rotulo: 'titulo' },
  simulado_questoes: { tipo: 'Questão', rotulo: 'enunciado' },
  simulado_estudantes: { tipo: 'Estudante', rotulo: 'nome' },
  simulado_grupos: { tipo: 'Grupo', rotulo: 'nome' },
  simulado_pastas: { tipo: 'Banco', rotulo: 'nome' },
  simulado_cadernos_designer: { tipo: 'Caderno', rotulo: 'nome' },
  simulado_etiquetas: { tipo: 'Etiqueta', rotulo: 'nome' },
  simulado_sessoes_prova: { tipo: 'Sessão de prova', rotulo: '__sessao' },
  simulado_conteudo_documentos: { tipo: 'Documento', rotulo: 'titulo' },
  simulado_flashcard_baralhos: { tipo: 'Baralho', rotulo: 'nome' },
  simulado_trilhas: { tipo: 'Trilha', rotulo: 'nome' },
}


function pathDaTabela(t: SoftDeleteTabela): string[] {
  switch (t) {
    case 'simulado_simulados': return ['/admin/simulados']
    case 'simulado_questoes': return ['/admin/questoes']
    case 'simulado_estudantes': return ['/admin/estudantes']
    case 'simulado_grupos': return ['/admin/grupos']
    case 'simulado_pastas': return ['/admin/banco-questoes']
    case 'simulado_cadernos_designer': return ['/admin/cadernos']
    case 'simulado_conteudo_documentos': return ['/admin/biblioteca']
    case 'simulado_flashcard_baralhos': return ['/admin/conteudos/flashcards']
    case 'simulado_trilhas': return ['/admin/conteudos/trilhas']
    default: return []
  }
}

export async function listarLixeira(): Promise<LixeiraItem[]> {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId) return []
  const svc = createAdminClient()
  const tenant = access.tenantId

  // Coleta crua (mantém deletado_por p/ resolver o nome depois).
  type Cru = LixeiraItem & { _por: string | null }
  const crus: Cru[] = []

  // Teto por tabela (a lixeira é purgada em 30d, mas pode crescer): 200 mais recentes + sinal de "há mais".
  const LIM = 200
  await Promise.all(SOFT_DELETE_TABELAS.map(async (tabela) => {
    const cfg = CFG[tabela]
    const local: Cru[] = []
    if (cfg.rotulo === '__sessao') {
      const { data } = await svc
        .from(tabela)
        .select('id, deletado_em, deletado_por, estudante_id, simulado_id')
        .eq('tenant_id', tenant).eq('deletado', true).order('deletado_em', { ascending: false }).order('id', { ascending: false }).limit(LIM)
      const rows = (data ?? []) as any[]
      if (!rows.length) return
      const estIds = [...new Set(rows.map((r) => r.estudante_id).filter(Boolean))] as string[]
      const simIds = [...new Set(rows.map((r) => r.simulado_id).filter(Boolean))] as string[]
      const [ests, sims] = await Promise.all([
        fetchAllByIn<any>(estIds, (ch) => svc.from('simulado_estudantes').select('id, nome').in('id', ch).order('id', { ascending: true })),
        fetchAllByIn<any>(simIds, (ch) => svc.from('simulado_simulados').select('id, titulo').in('id', ch).order('id', { ascending: true })),
      ])
      const nomeEst = new Map(ests.map((e: any) => [e.id, e.nome]))
      const tituloSim = new Map(sims.map((s: any) => [s.id, s.titulo]))
      for (const r of rows) {
        local.push({ tabela, tipo: cfg.tipo, id: r.id, deletado_em: r.deletado_em, deletado_por_nome: null, _por: r.deletado_por ?? null,
          rotulo: `${nomeEst.get(r.estudante_id) ?? 'Aluno'} — ${tituloSim.get(r.simulado_id) ?? 'Simulado'}` })
      }
    } else {
      const { data, error } = await svc
        .from(tabela)
        .select(`id, deletado_em, deletado_por, ${cfg.rotulo}`)
        .eq('tenant_id', tenant).eq('deletado', true).order('deletado_em', { ascending: false }).order('id', { ascending: false }).limit(LIM)
      if (error) return
      for (const r of (data ?? []) as any[]) {
        local.push({ tabela, tipo: cfg.tipo, id: r.id, deletado_em: r.deletado_em, deletado_por_nome: null, _por: r.deletado_por ?? null,
          rotulo: String(r[cfg.rotulo] ?? '—').replace(/\s+/g, ' ').slice(0, 140) })
      }
    }
    if (local.length >= LIM) local[local.length - 1].haMais = true
    crus.push(...local)
  }))

  // Resolve "excluído por" → nome/e-mail do admin: lote em simulado_users; só os ausentes vão ao Auth (em paralelo).
  const nome = new Map<string, string>()
  const porIds = [...new Set(crus.map((c) => c._por).filter(Boolean))] as string[]
  try {
    const us = await fetchAllByIn<any>(porIds, (ch) => svc.from('simulado_users').select('id, nome, email').in('id', ch).order('id', { ascending: true }))
    for (const u of us) if (u.nome || u.email) nome.set(u.id, u.nome ?? u.email)
  } catch { /* cai no Auth */ }
  await Promise.all(porIds.filter((uid) => !nome.has(uid)).map(async (uid) => {
    try {
      const { data } = await (svc as any).auth.admin.getUserById(uid)
      if (data?.user) nome.set(uid, data.user.user_metadata?.nome ?? data.user.email ?? uid)
    } catch { /* ignora */ }
  }))

  return crus
    .map(({ _por, ...i }) => ({ ...i, deletado_por_nome: _por ? (nome.get(_por) ?? null) : null }))
    .sort((a, b) => String(b.deletado_em ?? '').localeCompare(String(a.deletado_em ?? '')))
}

export async function restaurarItem(tabela: SoftDeleteTabela, id: string) {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId) return { ok: false, error: 'Sem sessão.' }
  if (!(SOFT_DELETE_TABELAS as readonly string[]).includes(tabela)) return { ok: false, error: 'Tabela não permitida.' }
  // Confirma que o item é do tenant antes de restaurar (evita restore cross-tenant por id).
  const svc = createAdminClient()
  const { data: dono } = await svc.from(tabela).select('id').eq('id', id).eq('tenant_id', access.tenantId).maybeSingle()
  if (!dono) return { ok: false, error: 'Item não encontrado.' }
  const { error } = await softRestore(tabela, id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'LIBERAR', entidade: tabela, entidadeId: id, depois: { restaurado: true } })
  revalidatePath('/admin/lixeira')
  for (const p of pathDaTabela(tabela)) revalidatePath(p)
  return { ok: true }
}

export async function excluirDefinitivo(tabela: SoftDeleteTabela, id: string) {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId) return { ok: false, error: 'Sem sessão.' }
  if (!(SOFT_DELETE_TABELAS as readonly string[]).includes(tabela)) return { ok: false, error: 'Tabela não permitida.' }
  const svc = createAdminClient()
  // TRAVA: questão/banco com vínculos (respostas, simulados, documentos, cronograma, cadernos…) não é apagado
  // definitivamente (o delete físico cascatearia/quebraria histórico). Fica na Lixeira até o vínculo sumir.
  if (tabela === 'simulado_questoes' || tabela === 'simulado_pastas') {
    try {
      const dep = await import('@/lib/questoes/dependencias-questao')
      if (tabela === 'simulado_questoes') {
        const r = await dep.bloquearSeTemVinculos(svc, access.tenantId, [id], { acao: 'excluir definitivamente' })
        if (r.bloqueadas.length) return { ok: false, error: r.mensagem }
      } else {
        const d = await dep.dependenciasBanco(svc, access.tenantId, id)
        if (d.emUso) return { ok: false, error: d.mensagem }
      }
    } catch (e) {
      return { ok: false, error: `Exclusão definitiva recusada: não foi possível verificar os vínculos (${(e as Error).message}).` }
    }
  }
  // TRAVA CENTRAL (documentos): vínculos (grifos/metas/progresso/produtos) ou "em uso" por plano ativo → nunca apaga
  // (as FKs são CASCADE e levariam grifos e metas dos alunos junto).
  if (tabela === 'simulado_conteudo_documentos') {
    const { data: d } = await svc.from(tabela).select('id, titulo').eq('id', id).eq('tenant_id', access.tenantId).maybeSingle()
    const trava = await bloquearSeTemVinculos(svc, access.tenantId, [{ id, titulo: (d as any)?.titulo }])
    if (trava.bloqueados[0]) return { ok: false, error: trava.bloqueados[0].motivo }
  }
  const { error } = await svc.from(tabela).delete().eq('id', id).eq('tenant_id', access.tenantId).eq('deletado', true)
  if (error) return { ok: false, error: `Não foi possível excluir definitivamente (ainda há vínculos): ${error.message}` }
  await registrarAudit({ operacao: 'DELETE', entidade: tabela, entidadeId: id, depois: { definitivo: true } })
  revalidatePath('/admin/lixeira')
  return { ok: true }
}
