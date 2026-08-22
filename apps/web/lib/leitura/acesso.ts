import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'

export interface DocumentoAluno {
  id: string
  titulo: string
  descricao: string | null
  cor: string | null
  icone: string | null
  capa_url: string | null
  artigos: number
  pct: number
  concluido: boolean
  // metadados de lei (A1) — null em documentos genéricos
  materiaId: string | null
  materiaNome: string | null
  materiaCor: string | null
  tipoNorma: string | null
  numero: string | null
  ano: number | null
  ementa: string | null
}

/**
 * Documentos PUBLICADOS que o aluno pode ver. Regra de visibilidade:
 * SEM nenhuma atribuição = liberado a todos; COM atribuição = só grupos/estudantes
 * atribuídos. Já traz artigos (versão vigente), progresso e metadados de lei/matéria.
 */
export async function documentosDoAluno(estudanteId: string, tenantId: string): Promise<DocumentoAluno[]> {
  const svc = createAdminClient()
  // Detecta colunas de lei (A1) e de versionamento (A2) → select tolerante.
  const [pLei, pVers] = await Promise.all([
    svc.from('simulado_documentos').select('materia_id').limit(1),
    svc.from('simulado_documentos').select('versao_publicada').limit(1),
  ])
  const temLei = !pLei.error, temVers = !pVers.error
  const cols = ['id, titulo, descricao, cor, icone, capa_url, versao', temVers && 'versao_publicada', temLei && 'materia_id, tipo_norma, numero, ano, ementa'].filter(Boolean).join(', ')
  const docs = await fetchAll<any>(() =>
    svc.from('simulado_documentos').select(cols)
      .eq('tenant_id', tenantId).eq('deletado', false).eq('publicado', true).order('atualizado_em', { ascending: false }))
  if (!docs.length) return []
  const ids = docs.map((d) => d.id)

  // Matérias (id → nome/cor)
  const materiaMap = new Map<string, { nome: string; cor: string | null }>()
  if (temLei) {
    const { data: mats } = await svc.from('simulado_materias').select('id, nome, cor').eq('tenant_id', tenantId).eq('deletado', false)
    for (const m of (mats ?? []) as any[]) materiaMap.set(m.id, { nome: m.nome, cor: m.cor ?? null })
  }

  // Atribuições
  const [{ data: dg }, { data: de }, { data: gm }] = await Promise.all([
    svc.from('simulado_documento_grupos').select('documento_id, grupo_id').in('documento_id', ids),
    svc.from('simulado_documento_estudantes').select('documento_id, estudante_id').in('documento_id', ids),
    svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estudanteId),
  ])
  const gruposPorDoc = new Map<string, Set<string>>()
  for (const r of (dg ?? []) as any[]) (gruposPorDoc.get(r.documento_id) ?? gruposPorDoc.set(r.documento_id, new Set()).get(r.documento_id)!).add(r.grupo_id)
  const estudPorDoc = new Map<string, Set<string>>()
  for (const r of (de ?? []) as any[]) (estudPorDoc.get(r.documento_id) ?? estudPorDoc.set(r.documento_id, new Set()).get(r.documento_id)!).add(r.estudante_id)
  const meusGrupos = new Set((gm ?? []).map((r: any) => r.grupo_id))

  const podeVer = (id: string) => {
    const g = gruposPorDoc.get(id), e = estudPorDoc.get(id)
    if (!g && !e) return true // liberado a todos
    if (e?.has(estudanteId)) return true
    if (g && [...g].some((gid) => meusGrupos.has(gid))) return true
    return false
  }
  const visiveis = docs.filter((d) => podeVer(d.id))
  if (!visiveis.length) return []
  const visIds = visiveis.map((d) => d.id)

  // Artigos (versão vigente) + progresso
  const [{ data: cont }, { data: prog }] = await Promise.all([
    svc.from('simulado_documento_conteudos').select('documento_id, versao, artigos').in('documento_id', visIds),
    svc.from('simulado_leitura_progresso').select('documento_id, documento_versao, pct, concluido_em').eq('estudante_id', estudanteId).in('documento_id', visIds),
  ])
  const versaoDoc = new Map(visiveis.map((d) => [d.id, d.versao_publicada ?? d.versao]))
  const artigosPorDoc = new Map<string, number>()
  for (const c of (cont ?? []) as any[]) if (c.versao === versaoDoc.get(c.documento_id)) artigosPorDoc.set(c.documento_id, c.artigos ?? 0)
  const progPorDoc = new Map<string, { pct: number; concluido: boolean }>()
  for (const p of (prog ?? []) as any[]) if (p.documento_versao === versaoDoc.get(p.documento_id)) progPorDoc.set(p.documento_id, { pct: p.pct ?? 0, concluido: !!p.concluido_em })

  return visiveis.map((d) => {
    const mat = d.materia_id ? materiaMap.get(d.materia_id) : null
    return {
      id: d.id, titulo: d.titulo, descricao: d.descricao ?? null, cor: d.cor ?? null, icone: d.icone ?? null, capa_url: d.capa_url ?? null,
      artigos: artigosPorDoc.get(d.id) ?? 0,
      pct: progPorDoc.get(d.id)?.pct ?? 0,
      concluido: progPorDoc.get(d.id)?.concluido ?? false,
      materiaId: d.materia_id ?? null, materiaNome: mat?.nome ?? null, materiaCor: mat?.cor ?? null,
      tipoNorma: d.tipo_norma ?? null, numero: d.numero ?? null, ano: d.ano ?? null, ementa: d.ementa ?? null,
    }
  })
}

export interface AnotacaoAluno {
  id: string
  inicio: number
  fim: number
  exact: string
  prefix: string
  suffix: string
  cor: string
  nota: string | null
  origem: 'propria' | 'base'
}

export interface AltLeitura { id: string; texto: string }
export interface QuestaoLeituraDados {
  docQuestaoId: string
  questaoId: string
  aposArtigo: number
  obrigatoria: boolean
  enunciado: string
  comentario: string | null
  alternativas: AltLeitura[]
  resposta?: { alternativaId: string; correta: boolean; corretaId: string | null }
}

export interface DocumentoCarregado {
  id: string
  titulo: string
  descricao: string | null
  versao: number
  html: string
  artigos: number
  desafio: { ativo: boolean; exigeFim: boolean; tempoMin: number }
  progresso: { pct: number; artigoMax: number; tempoSeg: number; concluido: boolean }
  anotacoes: AnotacaoAluno[]
  questoes: QuestaoLeituraDados[]
  grifos: GrifoLei[]
}

export interface GrifoLei { id: string; inicio: number; fim: number; exact: string; prefix: string; suffix: string; tipo: string; nota: string | null }

/**
 * Clona as anotações BASE (pré-definidas do admin) para o conjunto do aluno, uma vez.
 * Idempotente por (estudante, versão, base_id) com ignoreDuplicates → base apagada
 * pelo aluno NÃO ressuscita (nunca sobrescreve, só insere se ausente).
 */
async function garantirAnotacoesBase(svc: ReturnType<typeof createAdminClient>, tenantId: string, documentoId: string, versao: number, estudanteId: string) {
  // Grifos editoriais (editorial=true) NÃO são clonados — são pintados como conteúdo (A4).
  let sel = await svc.from('simulado_documento_anotacoes_base')
    .select('id, inicio_char, fim_char, exact, prefix, suffix, cor, nota, editorial')
    .eq('documento_id', documentoId).eq('documento_versao', versao).eq('deletado', false)
  if (sel.error && /editorial|column/i.test(String(sel.error.message))) {
    sel = await svc.from('simulado_documento_anotacoes_base').select('id, inicio_char, fim_char, exact, prefix, suffix, cor, nota').eq('documento_id', documentoId).eq('documento_versao', versao).eq('deletado', false) as any
  }
  const bases = (sel.data ?? []).filter((b: any) => b.editorial !== true)
  if (!bases?.length) return
  const rows = (bases as any[]).map((b) => ({
    tenant_id: tenantId, estudante_id: estudanteId, documento_id: documentoId, documento_versao: versao,
    inicio_char: b.inicio_char, fim_char: b.fim_char, exact: b.exact, prefix: b.prefix, suffix: b.suffix,
    cor: b.cor, nota: b.nota, origem: 'base', base_id: b.id,
  }))
  await svc.from('simulado_leitura_anotacoes').upsert(rows, { onConflict: 'estudante_id,documento_versao,base_id', ignoreDuplicates: true })
}

/** Carrega o documento para o leitor do aluno (após checar acesso). null = sem acesso/não existe. */
export async function carregarDocumentoAluno(documentoId: string, estudanteId: string, tenantId: string): Promise<DocumentoCarregado | null> {
  const svc = createAdminClient()
  // Tolerante: `versao_publicada` só existe após a migração A2.
  let dsel = await svc.from('simulado_documentos')
    .select('id, titulo, descricao, versao, versao_publicada, publicado, deletado, desafio_ativo, desafio_exige_fim, desafio_tempo_min')
    .eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
  if (dsel.error && /versao_publicada|column/i.test(String(dsel.error.message))) {
    dsel = await svc.from('simulado_documentos').select('id, titulo, descricao, versao, publicado, deletado, desafio_ativo, desafio_exige_fim, desafio_tempo_min').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle() as any
  }
  const doc = dsel.data
  if (!doc || (doc as any).deletado || !(doc as any).publicado) return null

  // Visibilidade (mesma regra do catálogo)
  const [{ data: dg }, { data: de }] = await Promise.all([
    svc.from('simulado_documento_grupos').select('grupo_id').eq('documento_id', documentoId),
    svc.from('simulado_documento_estudantes').select('estudante_id').eq('documento_id', documentoId),
  ])
  const grupos = (dg ?? []).map((r: any) => r.grupo_id)
  const estuds = (de ?? []).map((r: any) => r.estudante_id)
  if (grupos.length || estuds.length) {
    let ok = estuds.includes(estudanteId)
    if (!ok && grupos.length) {
      const { data: gm } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estudanteId).in('grupo_id', grupos)
      ok = !!(gm ?? []).length
    }
    if (!ok) return null
  }

  // Aluno lê a versão PUBLICADA vigente (A2); genéricos usam a versão única.
  const versao = (doc as any).versao_publicada ?? (doc as any).versao ?? 1
  const { data: cont } = await svc.from('simulado_documento_conteudos').select('html, artigos').eq('documento_id', documentoId).eq('versao', versao).maybeSingle()
  const { data: prog } = await svc.from('simulado_leitura_progresso')
    .select('pct, artigo_max, tempo_seg, concluido_em').eq('estudante_id', estudanteId).eq('documento_id', documentoId).eq('documento_versao', versao).maybeSingle()

  // Clona as anotações base do admin (idempotente) e carrega as do aluno. Tolerante:
  // se a migração de anotações (Fase 1b) ainda não rodou, degrada sem quebrar o leitor.
  let anotacoes: AnotacaoAluno[] = []
  try {
    await garantirAnotacoesBase(svc, tenantId, documentoId, versao, estudanteId)
    const { data: anot } = await svc.from('simulado_leitura_anotacoes')
      .select('id, inicio_char, fim_char, exact, prefix, suffix, cor, nota, origem')
      .eq('estudante_id', estudanteId).eq('documento_id', documentoId).eq('documento_versao', versao).eq('deletado', false)
    anotacoes = ((anot ?? []) as any[]).map((a) => ({
      id: a.id, inicio: a.inicio_char, fim: a.fim_char, exact: a.exact, prefix: a.prefix ?? '', suffix: a.suffix ?? '',
      cor: a.cor, nota: a.nota ?? null, origem: (a.origem === 'base' ? 'base' : 'propria') as 'base' | 'propria',
    }))
  } catch { /* migração de anotações ausente */ }

  // Questões inline (Fase 2) + respostas do aluno. Tolerante se a migração ainda não rodou.
  let questoes: QuestaoLeituraDados[] = []
  try {
    const { data: dq } = await svc.from('simulado_documento_questoes')
      .select('id, questao_id, apos_artigo, obrigatoria, ordem')
      .eq('tenant_id', tenantId).eq('documento_id', documentoId).eq('documento_versao', versao).eq('deletado', false)
      .order('apos_artigo').order('ordem')
    if (dq?.length) {
      const qids = [...new Set((dq as any[]).map((x) => x.questao_id))]
      const [{ data: qs }, { data: alts }, { data: resp }] = await Promise.all([
        svc.from('simulado_questoes').select('id, enunciado, comentario_professor').in('id', qids),
        svc.from('simulado_alternativas').select('id, questao_id, texto, ordem').in('questao_id', qids).order('ordem'),
        svc.from('simulado_leitura_respostas').select('questao_id, alternativa_id, correta, snapshot_gabarito').eq('estudante_id', estudanteId).eq('documento_id', documentoId).in('questao_id', qids),
      ])
      const qMap = new Map((qs ?? []).map((q: any) => [q.id, q]))
      const altsPorQ = new Map<string, AltLeitura[]>()
      for (const a of (alts ?? []) as any[]) (altsPorQ.get(a.questao_id) ?? altsPorQ.set(a.questao_id, []).get(a.questao_id)!).push({ id: a.id, texto: a.texto })
      const respPorQ = new Map((resp ?? []).map((r: any) => [r.questao_id, r]))
      questoes = (dq as any[]).map((x) => {
        const q: any = qMap.get(x.questao_id)
        const r: any = respPorQ.get(x.questao_id)
        return {
          docQuestaoId: x.id, questaoId: x.questao_id, aposArtigo: x.apos_artigo, obrigatoria: !!x.obrigatoria,
          enunciado: q?.enunciado ?? '', comentario: q?.comentario_professor ?? null,
          alternativas: altsPorQ.get(x.questao_id) ?? [],
          resposta: r ? { alternativaId: r.alternativa_id, correta: !!r.correta, corretaId: (r.snapshot_gabarito?.correta_id ?? null) } : undefined,
        }
      }).filter((x) => x.alternativas.length > 0)
    }
  } catch { /* migração fase 2 ausente */ }

  // Grifos editoriais (A4) — conteúdo compartilhado, pintado por tipo. Tolerante.
  let grifos: GrifoLei[] = []
  try {
    const { data: gs } = await svc.from('simulado_documento_anotacoes_base')
      .select('id, inicio_char, fim_char, exact, prefix, suffix, nota, tipo_grifo')
      .eq('documento_id', documentoId).eq('documento_versao', versao).eq('editorial', true).eq('deletado', false)
    grifos = ((gs ?? []) as any[]).map((g) => ({ id: g.id, inicio: g.inicio_char, fim: g.fim_char, exact: g.exact, prefix: g.prefix ?? '', suffix: g.suffix ?? '', tipo: g.tipo_grifo ?? 'nucleo', nota: g.nota ?? null }))
  } catch { /* migração A4 ausente */ }

  return {
    id: documentoId,
    titulo: (doc as any).titulo,
    descricao: (doc as any).descricao ?? null,
    versao,
    html: (cont as any)?.html ?? '',
    artigos: (cont as any)?.artigos ?? 0,
    desafio: { ativo: !!(doc as any).desafio_ativo, exigeFim: !!(doc as any).desafio_exige_fim, tempoMin: (doc as any).desafio_tempo_min ?? 0 },
    progresso: {
      pct: (prog as any)?.pct ?? 0,
      artigoMax: (prog as any)?.artigo_max ?? 0,
      tempoSeg: (prog as any)?.tempo_seg ?? 0,
      concluido: !!(prog as any)?.concluido_em,
    },
    anotacoes,
    questoes,
    grifos,
  }
}
