import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { getGamConfig } from '@/lib/gamificacao'
import { cargoParaNivel } from '@/lib/gamificacao/niveis'
import { cargoIconeSvg } from '@/lib/gamificacao/cargo-icone-svg'
import { avatarPadraoDe } from '@/lib/aluno/avatar-padrao'

/**
 * Conteúdo do Desafio de Jurisprudência (JurisClub). O "desafio" é uma PASTA
 * (simulado_pastas, folder_area='jurisprudencia') cuja coluna `desafio_jogo` (jsonb)
 * guarda { config, materias, final, dias, imagens } — exatamente o shape que o motor
 * do jogo (public/jurisprudencia/js) consome, só que mapeado p/ as chaves em CAIXA ALTA.
 */

type Svc = ReturnType<typeof createAdminClient>

/** Shape do jsonb `desafio_jogo` guardado na pasta. */
export interface DesafioJogo {
  config?: any
  materias?: any[]
  final?: any
  dias?: Record<string, any>
  imagens?: Record<string, any>
  /** Visual configurável: { cores: {neon,gold,...overrides de CSS vars}, opcoes: {...} }. */
  aparencia?: Record<string, any>
}

/** Shape MAPEADO que o cliente do jogo espera (dados.js define CONFIG/MATERIAS/FINAL/DIAS). */
export interface DesafioMapeado {
  CONFIG: any
  MATERIAS: any[]
  FINAL: any
  DIAS: Record<string, any>
  /** Overrides de visual (cores/opções) — o bootstrap injeta as CSS vars antes do motor. */
  APARENCIA: any
  /** Imagens anexadas (ticket, capa, selos{materiaId}, personagens{chave}) — o motor usa as de selos/personagens. */
  IMAGENS: any
}

/** Lê o `desafio_jogo` da pasta (jurisprudencia). null se não existe/não é desse tipo. */
export async function lerDesafioJogo(svc: Svc, desafioId: string): Promise<DesafioJogo | null> {
  const { data, error } = await svc
    .from('simulado_pastas')
    .select('desafio_jogo, folder_area, is_folder')
    .eq('id', desafioId)
    .maybeSingle()
  if (error || !data) return null
  if ((data as any).folder_area !== 'jurisprudencia') return null
  const dj = (data as any).desafio_jogo
  return dj && typeof dj === 'object' ? (dj as DesafioJogo) : {}
}

/** Mapeia o jsonb bruto para as chaves em CAIXA ALTA que o motor do jogo consome. */
export function mapearParaDESAFIO(desafioJogo: DesafioJogo | null): DesafioMapeado {
  const dj = desafioJogo ?? {}
  return {
    CONFIG: dj.config ?? {},
    MATERIAS: Array.isArray(dj.materias) ? dj.materias : [],
    FINAL: dj.final ?? null,
    DIAS: dj.dias && typeof dj.dias === 'object' ? dj.dias : {},
    APARENCIA: dj.aparencia && typeof dj.aparencia === 'object' ? dj.aparencia : null,
    IMAGENS: dj.imagens && typeof dj.imagens === 'object' ? dj.imagens : {},
  }
}

/**
 * Preenche `dias[chave].teses` a partir das "Questões do conteúdo" (simulado_documento_quiz_questoes)
 * do documento vinculado ao dia — assim o arcade usa EXATAMENTE as mesmas questões editadas na área
 * de Lei Seca (QuizConteudoAdmin), em vez de teses editadas à parte. Dias sem documento/sem questões
 * mantêm as teses legadas que já estiverem no jsonb. Service role → sem filtro de tenant (documento_id
 * já é único e escopado). Discursivas/sem alternativas ficam de fora do arcade.
 */
export async function preencherTesesPorQuiz(svc: Svc, dias: Record<string, any>): Promise<Record<string, any>> {
  const comDoc = Object.entries(dias ?? {}).filter(([, d]) => d && typeof d === 'object' && d.documento_id)
  if (!comDoc.length) return dias
  const docIds = [...new Set(comDoc.map(([, d]) => d.documento_id as string))]

  // 1) Questões do quiz por documento (ordem única .order('id') p/ paginar; reordena por `ordem` depois).
  const dq = await fetchAllByIn<{ documento_id: string; questao_id: string; ordem: number }>(docIds, (chunk) =>
    svc.from('simulado_documento_quiz_questoes').select('documento_id, questao_id, ordem').eq('deletado', false).in('documento_id', chunk).order('id')).catch(() => [] as any[])
  if (!dq.length) return dias

  const questaoIds = [...new Set(dq.map((r) => r.questao_id))]
  // 2) Metadados das questões + alternativas (texto/ordem/correta). Tolerante a `assunto_detalhe`.
  const SEL = 'id, enunciado, comentario_professor, assunto_detalhe, ano, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome), bancas:simulado_bancas(nome), orgaos:simulado_orgaos(nome)'
  const [qs, alts] = await Promise.all([
    fetchAllByIn<any>(questaoIds, (chunk) => svc.from('simulado_questoes').select(SEL).in('id', chunk).order('id'))
      .catch(() => fetchAllByIn<any>(questaoIds, (chunk) => svc.from('simulado_questoes').select(SEL.replace(', assunto_detalhe', '')).in('id', chunk).order('id')).catch(() => [] as any[])),
    fetchAllByIn<{ questao_id: string; texto: string | null; ordem: number | null; correta: boolean | null }>(questaoIds, (chunk) =>
      svc.from('simulado_alternativas').select('questao_id, texto, ordem, correta').in('questao_id', chunk).order('id')).catch(() => [] as any[]),
  ])
  const qById = new Map((qs as any[]).map((q) => [q.id, q]))
  const altsPorQ = new Map<string, { texto: string; ordem: number; correta: boolean }[]>()
  for (const a of alts as any[]) {
    const arr = altsPorQ.get(a.questao_id) ?? []
    arr.push({ texto: a.texto ?? '', ordem: Number(a.ordem ?? 0), correta: !!a.correta })
    altsPorQ.set(a.questao_id, arr)
  }

  const refDe = (banca?: string | null, orgao?: string | null, ano?: number | null) => [banca, orgao, ano].filter(Boolean).join(' · ')
  const teseDaQuestao = (questaoId: string): any | null => {
    const q = qById.get(questaoId); if (!q) return null
    const opts = (altsPorQ.get(questaoId) ?? []).slice().sort((a, b) => a.ordem - b.ordem)
    if (opts.length < 2) return null // discursiva / sem alternativas → fora do arcade
    return {
      ref: refDe(q.bancas?.nome, q.orgaos?.nome, q.ano),
      tema: q.assuntos?.nome || q.assunto_detalhe || q.disciplinas?.nome || '',
      q: q.enunciado ?? '',
      o: opts.map((o) => o.texto),
      a: Math.max(0, opts.findIndex((o) => o.correta)),
      tese: q.comentario_professor ?? '',
    }
  }

  // 3) Agrupa o quiz por documento (respeitando `ordem`) e sobrescreve as teses do dia.
  const quizPorDoc = new Map<string, { questao_id: string; ordem: number }[]>()
  for (const r of dq) { const arr = quizPorDoc.get(r.documento_id) ?? []; arr.push(r); quizPorDoc.set(r.documento_id, arr) }
  for (const arr of quizPorDoc.values()) arr.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))

  for (const [chave, d] of comDoc) {
    const quiz = quizPorDoc.get(d.documento_id as string)
    if (!quiz || !quiz.length) continue // sem questões → mantém teses legadas
    const teses = quiz.map((r) => teseDaQuestao(r.questao_id)).filter(Boolean)
    if (teses.length) dias[chave] = { ...d, teses }
  }
  return dias
}

/**
 * Regra de acesso por PASTA (mesmo padrão da Leitura por pasta):
 * SEM nenhuma atribuição = liberado a todos; COM atribuição = só estudantes atribuídos
 * (simulado_pasta_estudantes) OU membros de grupos atribuídos (simulado_pasta_grupos +
 * simulado_grupo_membros). Admin/super passa por fora (checa permissão no admin).
 */
export async function temAcessoDesafio(estudanteId: string, tenantId: string, desafioId: string): Promise<boolean> {
  const svc = createAdminClient()
  // A pasta precisa existir, ser do tenant e do tipo jurisprudencia.
  const { data: pasta } = await svc
    .from('simulado_pastas')
    .select('id, folder_area, deletado')
    .eq('id', desafioId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!pasta || (pasta as any).folder_area !== 'jurisprudencia' || (pasta as any).deletado) return false
  return pastaAcessivel(svc, desafioId, estudanteId)
}

/** Visibilidade da pasta p/ o aluno (reaproveitada pelo acesso e pela listagem). */
async function pastaAcessivel(svc: Svc, pastaId: string, estudanteId: string): Promise<boolean> {
  const [{ data: pe }, { data: pg }] = await Promise.all([
    svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', pastaId),
    svc.from('simulado_pasta_grupos').select('grupo_id').eq('pasta_id', pastaId),
  ])
  const estuds = (pe ?? []).map((r: any) => r.estudante_id)
  const grupos = (pg ?? []).map((r: any) => r.grupo_id)
  if (!estuds.length && !grupos.length) return true // sem atribuição = todos
  if (estuds.includes(estudanteId)) return true
  if (grupos.length) {
    const { data: gm } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estudanteId).in('grupo_id', grupos)
    if ((gm ?? []).length) return true
  }
  return false
}

export interface DesafioResumo {
  id: string
  nome: string
  imagemTicket: string | null
}

/**
 * Desafios (pastas jurisprudencia) que o aluno PODE ver no tenant.
 * imagemTicket = desafio_jogo.imagens?.ticket ?? null (p/ o ticket estilo "Lei Seca").
 */
export async function desafiosDoAluno(estudanteId: string, tenantId: string): Promise<DesafioResumo[]> {
  const svc = createAdminClient()
  const { data: pastas } = await svc
    .from('simulado_pastas')
    .select('id, nome, desafio_jogo')
    .eq('tenant_id', tenantId)
    .eq('folder_area', 'jurisprudencia')
    .eq('is_folder', true)
    .eq('deletado', false)
    .order('id', { ascending: true })
  const lista = (pastas ?? []) as any[]
  if (!lista.length) return []

  const ids = lista.map((p) => p.id)

  // Atribuições — CHUNK no `.in('pasta_id', …)` (lista grande trava o proxy); .order('id') único.
  const [pe, pg, { data: gm }] = await Promise.all([
    fetchAllByIn<{ pasta_id: string; estudante_id: string }>(ids, (chunk) => svc.from('simulado_pasta_estudantes').select('pasta_id, estudante_id').in('pasta_id', chunk).order('id', { ascending: true })),
    fetchAllByIn<{ pasta_id: string; grupo_id: string }>(ids, (chunk) => svc.from('simulado_pasta_grupos').select('pasta_id, grupo_id').in('pasta_id', chunk).order('id', { ascending: true })),
    svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estudanteId),
  ])
  const estudPorPasta = new Map<string, Set<string>>()
  for (const r of pe as any[]) (estudPorPasta.get(r.pasta_id) ?? estudPorPasta.set(r.pasta_id, new Set()).get(r.pasta_id)!).add(r.estudante_id)
  const gruposPorPasta = new Map<string, Set<string>>()
  for (const r of pg as any[]) (gruposPorPasta.get(r.pasta_id) ?? gruposPorPasta.set(r.pasta_id, new Set()).get(r.pasta_id)!).add(r.grupo_id)
  const meusGrupos = new Set((gm ?? []).map((r: any) => r.grupo_id))

  const podeVer = (id: string) => {
    const e = estudPorPasta.get(id), g = gruposPorPasta.get(id)
    if (!e && !g) return true // sem atribuição = todos
    if (e?.has(estudanteId)) return true
    if (g && [...g].some((gid) => meusGrupos.has(gid))) return true
    return false
  }

  return lista
    .filter((p) => podeVer(p.id))
    .map((p) => {
      const imgs = p.desafio_jogo && typeof p.desafio_jogo === 'object' ? (p.desafio_jogo.imagens ?? null) : null
      return { id: p.id, nome: p.nome, imagemTicket: (imgs?.ticket ?? null) as string | null }
    })
}

/** Perfil exibível do aluno no jogo (card do jogador + ranking): iniciais (privacidade), cargo e nível
 *  da gamificação, e foto de perfil. */
export interface PerfilAluno {
  id: string
  nome: string
  iniciais: string
  cargo: string
  cargoIcone: string // SVG inline do ícone do cargo (lucide serializado) — p/ o jogo vanilla
  nivel: number
  avatar: string | null
  avatarCor: string | null
}

function iniciaisDe(nome: string): string {
  const p = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  return ((p[0][0] ?? '') + (p.length > 1 ? (p[p.length - 1][0] ?? '') : '')).toUpperCase()
}

/** Monta o perfil (iniciais/cargo/nível/avatar) de vários alunos — 1 config de gamificação + lotes. */
export async function perfilAlunos(svc: Svc, tenantId: string, ids: string[]): Promise<Map<string, PerfilAluno>> {
  const out = new Map<string, PerfilAluno>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (!unicos.length) return out
  const [ests, gams, cfg] = await Promise.all([
    fetchAllByIn<{ id: string; nome: string; avatar: string | null; perfil_avatar_cor: string | null }>(unicos, (chunk) =>
      svc.from('simulado_estudantes').select('id, nome, avatar, perfil_avatar_cor').in('id', chunk)),
    fetchAllByIn<{ estudante_id: string; nivel: number | null }>(unicos, (chunk) =>
      svc.from('simulado_gamificacao_estudante').select('estudante_id, nivel').eq('tenant_id', tenantId).in('estudante_id', chunk)).catch(() => [] as any[]),
    getGamConfig(svc, tenantId).catch(() => null as any),
  ])
  const titulos = (cfg?.nivel_curva?.titulos ?? []) as any[]
  const nivelDe = new Map<string, number>((gams as any[]).map((g) => [g.estudante_id, Math.max(1, Number(g.nivel ?? 1))]))
  for (const e of ests as any[]) {
    const nivel = nivelDe.get(e.id) ?? 1
    const cargoObj = cargoParaNivel(nivel, titulos) // título + ícone do cargo
    out.set(e.id, {
      id: e.id, nome: e.nome ?? 'Aluno', iniciais: iniciaisDe(e.nome ?? ''),
      cargo: cargoObj?.titulo ?? '', cargoIcone: cargoIconeSvg(cargoObj?.icone), nivel,
      // Foto = CAPIVARA: a escolhida pelo aluno, OU uma capi padrão determinística (igual AvatarEstudante).
      avatar: e.avatar ?? avatarPadraoDe(e.id), avatarCor: e.perfil_avatar_cor ?? null,
    })
  }
  return out
}
