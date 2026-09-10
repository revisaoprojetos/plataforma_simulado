import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { documentosDoAluno, type DocumentoAluno } from '@/lib/leitura/acesso'
import type { Trilha, TrilhaNode } from '@/components/aluno/trilha-simulados'

type EstadoAula = 'concluido' | 'atual' | 'bloqueado'
interface AulaStatus {
  doc: DocumentoAluno
  leituraConcluida: boolean
  questoesFeitas: boolean
  aulaConcluida: boolean
  questoesTotal: number
}
interface AulaSeq extends AulaStatus { estado: EstadoAula; moduloId: string }

/** `.order('ordem')` tolerante (coluna pode não existir ainda). */
async function pastasLeitura(svc: any, tenantId: string): Promise<any[]> {
  const base = (cols: string) => svc.from('simulado_pastas').select(cols).eq('tenant_id', tenantId).eq('is_folder', true).eq('folder_area', 'leitura')
  let r = await base('id, nome, cor, capa_url, capa_card_url, pai_id, ordem, publicacao').order('ordem', { ascending: true }).order('nome', { ascending: true })
  if (r.error) r = await base('id, nome, cor, capa_url, capa_card_url, pai_id, ordem').order('ordem', { ascending: true }).order('nome', { ascending: true })
  if (r.error) r = await base('id, nome, cor, capa_url, pai_id').order('nome', { ascending: true })
  return (r.data as any[]) ?? []
}

/** Módulo visível ao aluno AGORA: publicado + dentro da janela (publicarEm..encerrarEm). */
function moduloPublicadoAgora(pub: any): boolean {
  if (!pub || pub.status !== 'publicado') return false
  const agora = Date.now()
  if (pub.publicarEm && new Date(pub.publicarEm).getTime() > agora) return false // agendado p/ futuro
  if (pub.encerrarEm && new Date(pub.encerrarEm).getTime() < agora) return false // encerrado
  return true
}

/**
 * Status de conclusão de cada aula (documento):
 *  - leituraConcluida = progresso.concluido_em (vem de documentosDoAluno.concluido)
 *  - questoesFeitas = todas as OBRIGATÓRIAS respondidas (derivado; sem coluna nova)
 *  - aulaConcluida = leitura + questões
 */
async function statusAulas(svc: any, tenantId: string, estId: string, docs: DocumentoAluno[]): Promise<Map<string, AulaStatus>> {
  const map = new Map<string, AulaStatus>()
  const ids = docs.map((d) => d.id)
  const obrigPorDoc = new Map<string, Set<string>>()
  const totalPorDoc = new Map<string, number>()
  const respPorDoc = new Map<string, Set<string>>()
  if (ids.length) {
    const qs = await fetchAllByIn<{ documento_id: string; questao_id: string; obrigatoria: boolean }>(ids, (chunk) =>
      svc.from('simulado_documento_questoes').select('documento_id, questao_id, obrigatoria').eq('tenant_id', tenantId).eq('deletado', false).in('documento_id', chunk).order('documento_id', { ascending: true }))
    for (const q of qs) {
      totalPorDoc.set(q.documento_id, (totalPorDoc.get(q.documento_id) ?? 0) + 1)
      if (q.obrigatoria) { const s = obrigPorDoc.get(q.documento_id) ?? new Set<string>(); s.add(q.questao_id); obrigPorDoc.set(q.documento_id, s) }
    }
    const rs = await fetchAllByIn<{ documento_id: string; questao_id: string }>(ids, (chunk) =>
      svc.from('simulado_leitura_respostas').select('documento_id, questao_id').eq('tenant_id', tenantId).eq('estudante_id', estId).in('documento_id', chunk).order('documento_id', { ascending: true }))
    for (const r of rs) { const s = respPorDoc.get(r.documento_id) ?? new Set<string>(); s.add(r.questao_id); respPorDoc.set(r.documento_id, s) }
  }
  for (const d of docs) {
    const obrig = obrigPorDoc.get(d.id) ?? new Set<string>()
    const resp = respPorDoc.get(d.id) ?? new Set<string>()
    const questoesFeitas = [...obrig].every((qid) => resp.has(qid))
    map.set(d.id, { doc: d, leituraConcluida: d.concluido, questoesFeitas, aulaConcluida: d.concluido && questoesFeitas, questoesTotal: totalPorDoc.get(d.id) ?? 0 })
  }
  return map
}

/**
 * Acesso a nível de MÓDULO (pasta): SEM atribuição = liberado a todos; COM = união grupos/alunos.
 * Tolerante: se as tabelas simulado_pasta_grupos/estudantes ainda não migraram, tudo fica acessível.
 */
async function modulosAcessiveis(svc: any, tenantId: string, estId: string, pastaIds: string[]): Promise<Set<string>> {
  const set = new Set<string>()
  if (!pastaIds.length) return set
  try {
    const [dg, de, gm] = await Promise.all([
      fetchAllByIn<{ pasta_id: string; grupo_id: string }>(pastaIds, (chunk) => svc.from('simulado_pasta_grupos').select('pasta_id, grupo_id').eq('tenant_id', tenantId).in('pasta_id', chunk).order('pasta_id', { ascending: true })),
      fetchAllByIn<{ pasta_id: string; estudante_id: string }>(pastaIds, (chunk) => svc.from('simulado_pasta_estudantes').select('pasta_id, estudante_id').eq('tenant_id', tenantId).in('pasta_id', chunk).order('pasta_id', { ascending: true })),
      svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estId),
    ])
    const gruposPorPasta = new Map<string, Set<string>>()
    for (const r of dg as any[]) (gruposPorPasta.get(r.pasta_id) ?? gruposPorPasta.set(r.pasta_id, new Set()).get(r.pasta_id)!).add(r.grupo_id)
    const estudPorPasta = new Map<string, Set<string>>()
    for (const r of de as any[]) (estudPorPasta.get(r.pasta_id) ?? estudPorPasta.set(r.pasta_id, new Set()).get(r.pasta_id)!).add(r.estudante_id)
    const meusGrupos = new Set(((gm as any)?.data ?? []).map((r: any) => r.grupo_id))
    for (const id of pastaIds) {
      const g = gruposPorPasta.get(id), e = estudPorPasta.get(id)
      if ((!g || g.size === 0) && (!e || e.size === 0)) { set.add(id); continue } // sem regra = todos
      if (g && [...g].some((x) => meusGrupos.has(x))) { set.add(id); continue }
      if (e && e.has(estId)) set.add(id)
    }
  } catch {
    for (const id of pastaIds) set.add(id) // tabelas ausentes → tudo liberado
  }
  return set
}

/**
 * Sequência ordenada da trilha: módulos (pastas 'leitura' por ordem) → aulas (por ordem). Aplica o
 * desbloqueio RÍGIDO global: a 1ª aula não-concluída de toda a sequência = 'atual'; antes = 'concluido';
 * depois = 'bloqueado' (exatamente um nó aberto por vez).
 */
async function sequenciaLeitura(estId: string, tenantId: string) {
  const svc = createAdminClient()
  const docs = await documentosDoAluno(estId, tenantId)
  const st = await statusAulas(svc, tenantId, estId, docs)
  const pastas = await pastasLeitura(svc, tenantId)

  const byModulo = new Map<string, DocumentoAluno[]>()
  for (const d of docs) { const k = d.pastaId ?? '__geral__'; (byModulo.get(k) ?? byModulo.set(k, []).get(k)!).push(d) }
  for (const arr of byModulo.values()) arr.sort((a, b) => (a.ordem - b.ordem) || a.titulo.localeCompare(b.titulo))

  // Gate de PUBLICAÇÃO do módulo: rascunho / agendado p/ futuro / encerrado não aparecem (dados ficam salvos).
  const todosModulos = pastas.filter((p) => byModulo.has(p.id) && moduloPublicadoAgora(p.publicacao)).map((p) => ({ id: p.id as string, nome: p.nome as string, cor: (p.cor ?? null) as string | null, capa: (p.capa_url ?? null) as string | null, capaCard: (p.capa_card_url ?? null) as string | null }))
  // Gate de acesso do módulo (pula os que o aluno não pode ver).
  const acessiveis = await modulosAcessiveis(svc, tenantId, estId, todosModulos.map((m) => m.id))
  const modulos = todosModulos.filter((m) => acessiveis.has(m.id))
  if (byModulo.has('__geral__')) modulos.push({ id: '__geral__', nome: 'Geral', cor: null, capa: null, capaCard: null })

  const seqByModulo = new Map<string, AulaSeq[]>()
  let jaAbriu = false // já achou o "atual"
  for (const m of modulos) {
    const arr: AulaSeq[] = []
    for (const d of byModulo.get(m.id) ?? []) {
      const s = st.get(d.id)!
      let estado: EstadoAula
      if (s.aulaConcluida) estado = 'concluido'
      else if (!jaAbriu) { estado = 'atual'; jaAbriu = true }
      else estado = 'bloqueado'
      arr.push({ ...s, estado, moduloId: m.id })
    }
    seqByModulo.set(m.id, arr)
  }
  return { modulos, seqByModulo }
}

function nodeDe(a: AulaSeq): TrilhaNode {
  const id = a.doc.id
  const bloqueado = a.estado === 'bloqueado'
  // 2 passos: LEITURA (sempre, se desbloqueada) + QUESTÕES DO CONTEÚDO (só após concluir a leitura).
  const hrefLeitura = bloqueado ? null : `/aluno/leitura/${id}`
  const hrefQuestoes = bloqueado ? null : `/aluno/leitura/${id}/questoes`
  const acaoLeitura = a.aulaConcluida || a.leituraConcluida ? 'Reler' : a.doc.pct > 0 ? 'Continuar leitura' : 'Começar leitura'
  const statusLabel = bloqueado ? 'Bloqueado' : a.aulaConcluida ? 'Concluída' : a.leituraConcluida ? 'Questões liberadas' : a.doc.pct > 0 ? 'Lendo' : 'Leitura'
  // A TrilhaGigante trata 'disponivel' como BLOQUEADO (círculo apagado).
  const estadoNode: TrilhaNode['estado'] = a.estado === 'bloqueado' ? 'disponivel' : a.estado
  const quando = bloqueado ? '🔒 Conclua a aula anterior'
    : a.leituraConcluida ? 'Questões liberadas' : 'Leitura'
  return {
    id, titulo: a.doc.titulo, quando,
    estado: estadoNode, acerto: null, nota: null, tentativas: 0, statusLabel, questoes: a.questoesTotal, xp: 0,
    href: hrefLeitura, acao: acaoLeitura, capa: a.doc.capa_url, capaBanner: a.doc.capa_url, cadernoUrl: null,
    hrefLeitura, acaoLeitura, hrefQuestoes, questoesLiberada: a.leituraConcluida && !bloqueado,
  }
}

/** Trilha(s) do aluno p/ o caminho serpenteado (TrilhaGigante) — uma por módulo. */
export async function carregarTrilhaLeituraAluno(estId: string, tenantId: string): Promise<Trilha[]> {
  const { modulos, seqByModulo } = await sequenciaLeitura(estId, tenantId)
  return modulos.map((m) => {
    const nodes = (seqByModulo.get(m.id) ?? []).map(nodeDe)
    return { id: m.id, nome: m.nome, cor: m.cor, capa: m.capa, capaCard: m.capaCard, total: nodes.length, done: nodes.filter((n) => n.estado === 'concluido').length, trilhaXp: 0, nodes }
  }).filter((t) => t.nodes.length > 0)
}

/** Gate rígido p/ o servidor: onde a aula está na sequência (bloqueada? leitura ok?). */
export async function statusAulaAluno(estId: string, tenantId: string, documentoId: string): Promise<{ visivel: boolean; estado: EstadoAula | 'ausente'; leituraConcluida: boolean; questoesFeitas: boolean }> {
  const { seqByModulo } = await sequenciaLeitura(estId, tenantId)
  for (const arr of seqByModulo.values()) for (const a of arr) if (a.doc.id === documentoId) return { visivel: true, estado: a.estado, leituraConcluida: a.leituraConcluida, questoesFeitas: a.questoesFeitas }
  return { visivel: false, estado: 'ausente', leituraConcluida: false, questoesFeitas: false }
}
