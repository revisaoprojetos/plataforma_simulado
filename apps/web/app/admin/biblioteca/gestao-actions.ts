'use server'

// Loaders + ações de escrita da PÁGINA DE GERENCIAMENTO DO CONTEÚDO (handoff 03b). Reusa os selects já
// existentes (lib/conteudo/*, actions.ts) — NÃO reescreve o pipeline. Onde já há dado real (documento,
// versões, acesso por grupo/aluno, vínculos, leitura, grifos, auditoria) devolve o dado; onde NÃO há
// pipeline (KPIs, funil, retenção, métricas de pacote) a UI mostra "em construção" — nunca inventa número.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { registrarAudit } from '@/lib/audit'
import { selecionarGrupos, contarMembrosGrupos } from '@/lib/simulado/grupos'
import { obterDocumento, listarVersoes } from '@/lib/conteudo/documentos'
import { listarVinculosDoDocumento } from '@/lib/conteudo/vinculos'
import type { KindConteudo } from '@/lib/biblioteca/tipos-conteudo'

async function guard(acao: 'view' | 'update') {
  const perm = acao === 'view' ? 'configuracoes:view' : 'configuracoes:update'
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

// ── Mapeamentos / máscaras ─────────────────────────────────────────────────────
/** tipo_origem armazenado (docx|pdf|html|pptx|xlsx|video|audio) → KindConteudo. html = documento. */
export async function kindDeTipoOrigem(tipo: string | null | undefined): Promise<KindConteudo> {
  switch (tipo) {
    case 'pdf': return 'pdf'
    case 'pptx': return 'pptx'
    case 'xlsx': return 'xlsx'
    case 'video': return 'video'
    case 'audio': return 'audio'
    default: return 'docx' // docx + html
  }
}
function kindSync(tipo: string | null | undefined): KindConteudo {
  switch (tipo) { case 'pdf': return 'pdf'; case 'pptx': return 'pptx'; case 'xlsx': return 'xlsx'; case 'video': return 'video'; case 'audio': return 'audio'; default: return 'docx' }
}
function mascararCpf(cpf?: string | null): string {
  const d = (cpf || '').replace(/\D/g, '')
  if (d.length !== 11) return cpf ? '•••' : '—'
  return `***.${d.slice(3, 6)}.***-${d.slice(9, 11)}`
}
function mascararIp(ip?: string | null): string {
  if (!ip) return '—'
  const p = ip.split(',')[0].trim().split('.')
  if (p.length === 4) return `${p[0]}.${p[1]}.•••.${p[3]}`
  return ip.slice(0, 7) + '•••'
}

// ── DTOs ────────────────────────────────────────────────────────────────────────
export interface ProtecaoConteudo {
  pode_ler_plataforma: boolean; pode_baixar: boolean; pode_grifar: boolean; marca_dagua: boolean; pode_imprimir: boolean
}
export interface GestaoBase {
  id: string; titulo: string; kind: KindConteudo; tipoOrigem: string
  /** Modelo de caderno = SEM aluno (admin-only): esconde acesso/alunos/pacotes/publicado na página. */
  ehModelo: boolean
  status: string; oculto: boolean; versaoNum: number | null; versoesCount: number
  publicadoEm: string | null; criadoEm: string | null; atualizadoEm: string | null
  liberadoDe: string | null; liberadoAte: string | null
  protecao: ProtecaoConteudo
  contagens: { origens: number; alunos: number; vinculos: number; pacotes: number }
  /** Fonte da mídia (vídeo/áudio). Sem pipeline de link → padrão 'importado'. */
  fonteMidia: { tipo: 'importado' | 'link'; servico: string | null } | null
  liberado: boolean
}
export interface OrigemAcesso {
  chave: string; tipo: 'grupo' | 'aluno'; refId: string; nome: string
  origem: 'avulsa' | 'individual' | 'via_pacote'
  perms: { ler: boolean; baixar: boolean; grifar: boolean }
  liberadoDe: string | null; liberadoAte: string | null; alunos: number
}
export interface AlunoAcesso {
  id: string; nome: string; email: string | null; cpfMasc: string; avatar: string | null; cor: string | null
  recebidoPor: { origem: 'avulsa' | 'individual' | 'via_pacote'; detalhe: string }
  situacao: 'nao_abriu' | 'lendo' | 'concluiu'
  ultimoAcesso: string | null; grifos: number
}
export interface EventoRegistro {
  tipo: 'primeiro' | 'abriu' | 'baixou' | 'grifou' | 'bloqueio' | 'audit'
  acao: string; detalhe: string | null; em: string; dispositivo: string | null; ipMasc: string | null
}
export interface VinculoConteudo {
  id: string; selo: string; categoria: string; nome: string; comoLigado: string; status: string
}
export interface VersaoHistorico { id: string; numero: number; origem: string; status: string; em: string; atual: boolean }
export interface EventoEntrega { operacao: string; titulo: string; em: string }

export interface GestaoDados {
  ok: boolean; error?: string
  base?: GestaoBase
  acesso?: { origens: OrigemAcesso[]; alcanceTotal: number }
  alunos?: { itens: AlunoAcesso[]; total: number }
  vinculos?: VinculoConteudo[]
  historico?: { versoes: VersaoHistorico[]; entregas: EventoEntrega[] }
}

const SEL_DOC = 'id, titulo, tipo_origem, categoria, status, versao_atual_id, oculto, pode_ler_plataforma, pode_baixar, pode_grifar, marca_dagua, pode_imprimir, liberado_de, liberado_ate, fonte, criado_em, atualizado_em'

// ── Loader principal (server component) ──────────────────────────────────────────
export async function carregarGerenciamento(documentoId: string): Promise<GestaoDados> {
  const g = await guard('view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  let doc: any = null
  try {
    const r = await svc.from('simulado_conteudo_documentos').select(SEL_DOC).eq('tenant_id', g.tenantId).eq('id', documentoId).maybeSingle()
    doc = r.data
  } catch { /* colunas não migradas → fallback */ }
  if (!doc) { const base = await obterDocumento(documentoId); if (!base) return { ok: false, error: 'Conteúdo não encontrado.' }; doc = base }

  // UMA onda paralela (antes eram 2 → menos round-trips PostgREST, que no remoto custam ~200ms cada).
  // A tabela de ALUNOS (até 300 + detalhes) NÃO entra aqui — é pesada e carrega LAZY ao abrir a aba Alunos.
  const kind = kindSync(doc.tipo_origem)
  const [versoes, acesso, entregas, vincLeitor, vinculos] = await Promise.all([
    listarVersoes(documentoId).catch(() => []),
    carregarAcesso(svc, g.tenantId, documentoId),
    carregarEntregas(svc, g.tenantId, documentoId),
    carregarVinculosLeitor(svc, g.tenantId, documentoId),
    listarVinculosDoDocumento(documentoId).catch(() => []).then((v) => resolverVinculos(svc, g.tenantId, v)),
  ])
  const versaoNum = doc.versao_atual_id ? (versoes.find((v) => v.id === doc.versao_atual_id)?.numero ?? null) : (versoes[0]?.numero ?? null)
  const todosVinculos = [...vinculos, ...vincLeitor]

  const protecao: ProtecaoConteudo = {
    pode_ler_plataforma: doc.pode_ler_plataforma ?? true, pode_baixar: doc.pode_baixar ?? true,
    pode_grifar: doc.pode_grifar ?? true, marca_dagua: doc.marca_dagua ?? true, pode_imprimir: doc.pode_imprimir ?? false,
  }
  const liberado = acesso.origens.length > 0 || acesso.alcanceTotal > 0
  const base: GestaoBase = {
    id: documentoId, titulo: doc.titulo ?? 'Conteúdo', kind, tipoOrigem: doc.tipo_origem ?? '—',
    ehModelo: doc.categoria === 'modelo_caderno',
    status: doc.status ?? 'rascunho', oculto: doc.oculto ?? false, versaoNum, versoesCount: versoes.length,
    publicadoEm: doc.status === 'publicado' ? (doc.atualizado_em ?? null) : null,
    criadoEm: doc.criado_em ?? null, atualizadoEm: doc.atualizado_em ?? null,
    liberadoDe: doc.liberado_de ?? null, liberadoAte: doc.liberado_ate ?? null,
    protecao,
    contagens: { origens: acesso.origens.length, alunos: acesso.alcanceTotal, vinculos: todosVinculos.length, pacotes: 0 },
    fonteMidia: (kind === 'video' || kind === 'audio') ? { tipo: 'importado', servico: null } : null,
    liberado,
  }

  const versoesHist: VersaoHistorico[] = versoes.map((v) => ({
    id: v.id, numero: v.numero, origem: v.origem === 'edicao_editor' ? 'Edição no editor' : v.origem === 'restauracao' ? 'Restauração' : 'Envio de arquivo',
    status: v.status_conversao, em: v.criada_em, atual: v.id === doc.versao_atual_id,
  }))

  return { ok: true, base, acesso, vinculos: todosVinculos, historico: { versoes: versoesHist, entregas } }
}

/** Carrega a tabela de ALUNOS do conteúdo SOB DEMANDA (ao abrir a aba Alunos) — pesada, fora do load. */
export async function carregarAlunosGerenciamento(documentoId: string): Promise<{ ok: boolean; error?: string; itens?: AlunoAcesso[]; total?: number }> {
  const g = await guard('view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const r = await carregarAlunos(svc, g.tenantId, documentoId)
  return { ok: true, itens: r.itens, total: r.total }
}

// ── Quem tem acesso (origens reais: grupos + alunos individuais) ──────────────────
async function carregarAcesso(svc: any, tenantId: string, documentoId: string): Promise<{ origens: OrigemAcesso[]; alcanceTotal: number }> {
  const origens: OrigemAcesso[] = []
  let alcance = 0
  try {
    const dg = ((await svc.from('simulado_conteudo_documento_grupos')
      .select('grupo_id, origem, pode_ler, pode_baixar, pode_grifar, liberado_de, liberado_ate')
      .eq('tenant_id', tenantId).eq('documento_id', documentoId)).data as any[]) ?? []
    const de = ((await svc.from('simulado_conteudo_documento_estudantes')
      .select('estudante_id, origem, pode_ler, pode_baixar, pode_grifar, liberado_de, liberado_ate')
      .eq('tenant_id', tenantId).eq('documento_id', documentoId)).data as any[]) ?? []

    if (dg.length) {
      const todos = (await selecionarGrupos(svc, tenantId)) as any[]
      const nomeDe = new Map(todos.map((x) => [x.id, x.nome]))
      const counts = await contarMembrosGrupos(svc, tenantId).catch(() => ({} as Record<string, number>))
      for (const r of dg) {
        const n = counts[r.grupo_id] ?? 0
        alcance += n
        origens.push({
          chave: 'g:' + r.grupo_id, tipo: 'grupo', refId: r.grupo_id, nome: nomeDe.get(r.grupo_id) ?? 'Grupo',
          origem: (r.origem === 'individual' ? 'individual' : 'avulsa'),
          perms: { ler: r.pode_ler ?? true, baixar: r.pode_baixar ?? true, grifar: r.pode_grifar ?? true },
          liberadoDe: r.liberado_de ?? null, liberadoAte: r.liberado_ate ?? null, alunos: n,
        })
      }
    }
    if (de.length) {
      const ids = [...new Set(de.map((r) => r.estudante_id))]
      const est = (await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_estudantes').select('id, nome').in('id', chunk))) ?? []
      const nomeE = new Map(est.map((x: any) => [x.id, x.nome]))
      for (const r of de) {
        alcance += 1
        origens.push({
          chave: 'e:' + r.estudante_id, tipo: 'aluno', refId: r.estudante_id, nome: nomeE.get(r.estudante_id) ?? 'Aluno',
          origem: (r.origem === 'avulsa' ? 'avulsa' : 'individual'),
          perms: { ler: r.pode_ler ?? true, baixar: r.pode_baixar ?? true, grifar: r.pode_grifar ?? true },
          liberadoDe: r.liberado_de ?? null, liberadoAte: r.liberado_ate ?? null, alunos: 1,
        })
      }
    }
  } catch { /* tabelas de acesso não migradas → sem origens */ }
  return { origens, alcanceTotal: alcance }
}

// ── Alunos com acesso (individual + membros dos grupos + quem já leu) ─────────────
const MAX_ALUNOS = 300
async function carregarAlunos(svc: any, tenantId: string, documentoId: string): Promise<{ itens: AlunoAcesso[]; total: number }> {
  try {
    const [dgRes, deRes, progRes, anotRes] = await Promise.all([
      svc.from('simulado_conteudo_documento_grupos').select('grupo_id, origem').eq('tenant_id', tenantId).eq('documento_id', documentoId),
      svc.from('simulado_conteudo_documento_estudantes').select('estudante_id, origem').eq('tenant_id', tenantId).eq('documento_id', documentoId),
      svc.from('simulado_conteudo_leitura_progresso').select('aluno_id, ultima_leitura_em').eq('tenant_id', tenantId).eq('documento_id', documentoId),
      svc.from('simulado_conteudo_anotacoes').select('aluno_id').eq('tenant_id', tenantId).eq('documento_id', documentoId),
    ])
    const grupoIds = ((dgRes.data as any[]) ?? []).map((r) => r.grupo_id)
    const individuais = new Map<string, 'avulsa' | 'individual'>()
    for (const r of ((deRes.data as any[]) ?? [])) individuais.set(r.estudante_id, r.origem === 'avulsa' ? 'avulsa' : 'individual')

    // membros dos grupos atribuídos (bounded pelos grupos do conteúdo)
    const membros = grupoIds.length
      ? (await fetchAllByIn<any>(grupoIds, (chunk) => svc.from('simulado_grupo_membros').select('estudante_id, grupo_id').eq('tenant_id', tenantId).in('grupo_id', chunk).order('estudante_id', { ascending: true }))) ?? []
      : []
    const viaGrupo = new Set<string>(membros.map((m: any) => m.estudante_id))

    const prog = new Map<string, string>()
    for (const r of ((progRes.data as any[]) ?? [])) prog.set(r.aluno_id, r.ultima_leitura_em)
    const grifos = new Map<string, number>()
    for (const r of ((anotRes.data as any[]) ?? [])) grifos.set(r.aluno_id, (grifos.get(r.aluno_id) ?? 0) + 1)

    // conjunto completo de alunos COM acesso
    const todos = new Set<string>([...individuais.keys(), ...viaGrupo, ...prog.keys()])
    const total = todos.size
    if (total === 0) return { itens: [], total: 0 }

    // prioriza quem já interagiu (leitura) e depois ordena por nome; corta em MAX_ALUNOS
    const ordenados = [...todos].sort((a, b) => {
      const pa = prog.get(a), pb = prog.get(b)
      if (pa && pb) return pb.localeCompare(pa)
      if (pa) return -1
      if (pb) return 1
      return 0
    }).slice(0, MAX_ALUNOS)

    const det = (await fetchAllByIn<any>(ordenados, (chunk) => svc.from('simulado_estudantes').select('id, nome, email, cpf, avatar, perfil_avatar_cor').in('id', chunk))) ?? []
    const detMap = new Map(det.map((d: any) => [d.id, d]))

    const itens: AlunoAcesso[] = ordenados.map((id) => {
      const d: any = detMap.get(id) ?? {}
      const abriu = prog.get(id)
      const origem: 'avulsa' | 'individual' | 'via_pacote' = individuais.get(id) ?? (viaGrupo.has(id) ? 'avulsa' : 'avulsa')
      const detalhe = individuais.has(id) ? (origem === 'individual' ? 'liberado só para ele' : 'entrega avulsa') : (viaGrupo.has(id) ? 'via grupo atribuído' : 'leitura registrada')
      return {
        id, nome: d.nome ?? 'Aluno', email: d.email ?? null, cpfMasc: mascararCpf(d.cpf), avatar: d.avatar ?? null, cor: d.perfil_avatar_cor ?? null,
        recebidoPor: { origem, detalhe },
        situacao: abriu ? 'lendo' : 'nao_abriu',
        ultimoAcesso: abriu ?? null, grifos: grifos.get(id) ?? 0,
      }
    })
    return { itens, total }
  } catch { return { itens: [], total: 0 } }
}

// ── Registro de acessos de UM aluno neste conteúdo (expandir linha) ───────────────
export async function carregarRegistroAluno(documentoId: string, estudanteId: string): Promise<{ ok: boolean; error?: string; liberadoEm?: string | null; eventos?: EventoRegistro[] }> {
  const g = await guard('view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const eventos: EventoRegistro[] = []
  try {
    const prog = (await svc.from('simulado_conteudo_leitura_progresso').select('ultima_leitura_em').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('aluno_id', estudanteId).maybeSingle()).data as any
    if (prog?.ultima_leitura_em) eventos.push({ tipo: 'abriu', acao: 'Abriu o conteúdo', detalhe: null, em: prog.ultima_leitura_em, dispositivo: null, ipMasc: null })
    const anot = ((await svc.from('simulado_conteudo_anotacoes').select('tipo, texto_ancora, criada_em').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('aluno_id', estudanteId).order('criada_em', { ascending: false }).limit(50)).data as any[]) ?? []
    for (const a of anot) eventos.push({ tipo: 'grifou', acao: 'Marcou um trecho', detalhe: a.texto_ancora ? String(a.texto_ancora).slice(0, 80) : null, em: a.criada_em, dispositivo: null, ipMasc: null })
  } catch { /* sem tabelas → vazio */ }
  eventos.sort((a, b) => String(b.em).localeCompare(String(a.em)))
  const liberadoEm = eventos.length ? eventos[eventos.length - 1].em : null
  return { ok: true, liberadoEm, eventos }
}

// ── Utilizado em (vínculos doc→produto) ──────────────────────────────────────────
const SELO_PRODUTO: Record<string, { selo: string; categoria: string }> = {
  simulado: { selo: 'SIM', categoria: 'Simulado' },
  cronograma: { selo: 'CRN', categoria: 'Cronograma' },
  trilha: { selo: 'CRN', categoria: 'Trilha' },
  desafio: { selo: 'LEI', categoria: 'Desafio' },
  questao: { selo: 'QST', categoria: 'Questão' },
  banco: { selo: 'QST', categoria: 'Banco de questões' },
  conteudo: { selo: 'DOC', categoria: 'Outro conteúdo' },
}
async function resolverVinculos(svc: any, tenantId: string, vincs: { id: string; produto_tipo: string; produto_ref_id: string; modo: string }[]): Promise<VinculoConteudo[]> {
  return (vincs ?? []).map((v) => {
    const s = SELO_PRODUTO[v.produto_tipo] ?? { selo: 'DOC', categoria: v.produto_tipo }
    return {
      id: v.id, selo: s.selo, categoria: s.categoria, nome: `${s.categoria} · ${String(v.produto_ref_id).slice(0, 8)}`,
      comoLigado: v.modo === 'fixada' ? 'Fixado numa versão aprovada' : 'Sempre na versão atual',
      status: 'Ativo',
    }
  })
}
async function carregarVinculosLeitor(svc: any, tenantId: string, documentoId: string): Promise<VinculoConteudo[]> {
  try {
    const rows = ((await svc.from('simulado_conteudo_vinculos_leitor').select('id, alvo_tipo, rotulo, detalhe, modo').eq('tenant_id', tenantId).eq('documento_id', documentoId).order('ordem', { ascending: true })).data as any[]) ?? []
    return rows.map((r) => ({
      id: 'vl:' + r.id, selo: 'DOC', categoria: 'Ligado no leitor', nome: r.rotulo ?? 'Vínculo',
      comoLigado: r.detalhe ?? (r.modo === 'ao_concluir' ? 'Libera ao concluir' : 'Exibido no leitor'),
      status: 'Ativo',
    }))
  } catch { return [] }
}

// ── Entregas e permissões (auditoria do documento) ───────────────────────────────
const AUDIT_LABEL: Record<string, string> = {
  INSERT: 'Registro criado', UPDATE: 'Configuração alterada', DELETE: 'Registro removido',
  LIBERAR: 'Liberação / entrega', BLOQUEAR: 'Bloqueio', ANULAR: 'Anulação', RECORRIGIR: 'Re-correção',
}
async function carregarEntregas(svc: any, tenantId: string, documentoId: string): Promise<EventoEntrega[]> {
  try {
    const au = ((await svc.from('simulado_audit_logs').select('operacao, entidade, criado_em').eq('tenant_id', tenantId).eq('entidade_id', documentoId).order('criado_em', { ascending: false }).limit(60)).data as any[]) ?? []
    return au.map((a) => ({ operacao: a.operacao, titulo: AUDIT_LABEL[a.operacao] ?? a.operacao, em: a.criado_em }))
  } catch { return [] }
}

// ── AÇÕES DE ESCRITA (guard + audit) ──────────────────────────────────────────────
export async function salvarProtecaoConteudo(documentoId: string, patch: Partial<ProtecaoConteudo>): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const clean: Record<string, boolean> = {}
  for (const k of ['pode_ler_plataforma', 'pode_baixar', 'pode_grifar', 'marca_dagua', 'pode_imprimir'] as const) if (k in patch) clean[k] = !!patch[k]
  if (!Object.keys(clean).length) return { ok: true }
  const { error } = await svc.from('simulado_conteudo_documentos').update(clean).eq('tenant_id', g.tenantId).eq('id', documentoId)
  if (error) return { ok: false, error: /column .* does not exist|schema cache/i.test(error.message) ? 'Rode a migração da sidebar (20261024000000).' : error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_conteudo_documentos', entidadeId: documentoId, depois: clean, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca'); return { ok: true }
}

export async function definirVisibilidadeConteudo(documentoId: string, visivel: boolean): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_conteudo_documentos').update({ oculto: !visivel }).eq('tenant_id', g.tenantId).eq('id', documentoId)
  if (error) return { ok: false, error: /column .* does not exist|schema cache/i.test(error.message) ? 'Rode a migração de acesso v2 (20261026000000).' : error.message }
  await registrarAudit({ operacao: visivel ? 'LIBERAR' : 'BLOQUEAR', entidade: 'simulado_conteudo_documentos', entidadeId: documentoId, depois: { oculto: !visivel }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca'); return { ok: true }
}

export async function definirAgendamentoConteudo(documentoId: string, de: string | null, ate: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_conteudo_documentos').update({ liberado_de: de || null, liberado_ate: ate || null }).eq('tenant_id', g.tenantId).eq('id', documentoId)
  if (error) return { ok: false, error: /column .* does not exist|schema cache/i.test(error.message) ? 'Rode a migração da sidebar (20261024000000).' : error.message }
  await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_conteudo_documentos', entidadeId: documentoId, depois: { liberado_de: de, liberado_ate: ate }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca'); return { ok: true }
}

export async function arquivarConteudo(documentoId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_conteudo_documentos').update({ status: 'arquivado' }).eq('tenant_id', g.tenantId).eq('id', documentoId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_conteudo_documentos', entidadeId: documentoId, depois: { status: 'arquivado' }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca'); return { ok: true }
}

/** Remove uma origem de acesso (avulsa/individual). Via-pacote NÃO é editável aqui. */
export async function removerOrigemAcesso(documentoId: string, tipo: 'grupo' | 'aluno', refId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const tabela = tipo === 'grupo' ? 'simulado_conteudo_documento_grupos' : 'simulado_conteudo_documento_estudantes'
  const col = tipo === 'grupo' ? 'grupo_id' : 'estudante_id'
  const { error } = await svc.from(tabela).delete().eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq(col, refId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: tabela, entidadeId: documentoId, antes: { [col]: refId }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca'); return { ok: true }
}
