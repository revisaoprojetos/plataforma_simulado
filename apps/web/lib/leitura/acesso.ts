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
}

/**
 * Documentos PUBLICADOS que o aluno pode ver. Regra de visibilidade:
 * SEM nenhuma atribuição = liberado a todos; COM atribuição = só grupos/estudantes
 * atribuídos. Já traz artigos (versão vigente) + progresso do aluno.
 */
export async function documentosDoAluno(estudanteId: string, tenantId: string): Promise<DocumentoAluno[]> {
  const svc = createAdminClient()
  const docs = await fetchAll<any>(() =>
    svc.from('simulado_documentos').select('id, titulo, descricao, cor, icone, capa_url, versao')
      .eq('tenant_id', tenantId).eq('deletado', false).eq('publicado', true).order('atualizado_em', { ascending: false }))
  if (!docs.length) return []
  const ids = docs.map((d) => d.id)

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
  const versaoDoc = new Map(visiveis.map((d) => [d.id, d.versao]))
  const artigosPorDoc = new Map<string, number>()
  for (const c of (cont ?? []) as any[]) if (c.versao === versaoDoc.get(c.documento_id)) artigosPorDoc.set(c.documento_id, c.artigos ?? 0)
  const progPorDoc = new Map<string, { pct: number; concluido: boolean }>()
  for (const p of (prog ?? []) as any[]) if (p.documento_versao === versaoDoc.get(p.documento_id)) progPorDoc.set(p.documento_id, { pct: p.pct ?? 0, concluido: !!p.concluido_em })

  return visiveis.map((d) => ({
    id: d.id, titulo: d.titulo, descricao: d.descricao ?? null, cor: d.cor ?? null, icone: d.icone ?? null, capa_url: d.capa_url ?? null,
    artigos: artigosPorDoc.get(d.id) ?? 0,
    pct: progPorDoc.get(d.id)?.pct ?? 0,
    concluido: progPorDoc.get(d.id)?.concluido ?? false,
  }))
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
}

/**
 * Clona as anotações BASE (pré-definidas do admin) para o conjunto do aluno, uma vez.
 * Idempotente por (estudante, versão, base_id) com ignoreDuplicates → base apagada
 * pelo aluno NÃO ressuscita (nunca sobrescreve, só insere se ausente).
 */
async function garantirAnotacoesBase(svc: ReturnType<typeof createAdminClient>, tenantId: string, documentoId: string, versao: number, estudanteId: string) {
  const { data: bases } = await svc.from('simulado_documento_anotacoes_base')
    .select('id, inicio_char, fim_char, exact, prefix, suffix, cor, nota')
    .eq('documento_id', documentoId).eq('documento_versao', versao).eq('deletado', false)
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
  const { data: doc } = await svc.from('simulado_documentos')
    .select('id, titulo, descricao, versao, publicado, deletado, desafio_ativo, desafio_exige_fim, desafio_tempo_min')
    .eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
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

  const versao = (doc as any).versao ?? 1
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
  }
}
