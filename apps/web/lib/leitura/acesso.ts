import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember } from '@/lib/cache/relatorio-cache'
import { diffDocumentos } from './diff'
import { limparCabecalhoHtml } from './limpar-cabecalho'
import { normalizarTiposIndice } from './indice'
import type { DiffDoc } from './diff-tipos'

/**
 * Detecção de colunas opcionais (lei A1: materia_id; versionamento A2: versao_publicada) memoizada
 * POR PROCESSO — o schema não muda em runtime, então roda 1x em vez de 2 round-trips a CADA
 * carregamento do catálogo do aluno.
 */
let _colsLeitura: { temLei: boolean; temVers: boolean; temPub: boolean } | null = null
async function detectarColunasLeitura(svc: ReturnType<typeof createAdminClient>): Promise<{ temLei: boolean; temVers: boolean; temPub: boolean }> {
  if (_colsLeitura) return _colsLeitura
  const [pLei, pVers, pPub] = await Promise.all([
    svc.from('simulado_documentos').select('materia_id').limit(1),
    svc.from('simulado_documentos').select('versao_publicada').limit(1),
    svc.from('simulado_documentos').select('publicacao').limit(1),
  ])
  _colsLeitura = { temLei: !pLei.error, temVers: !pVers.error, temPub: !pPub.error }
  return _colsLeitura
}

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
  pastaId: string | null
  ordem: number
  // metadados de lei (A1) — null em documentos genéricos
  materiaId: string | null
  materiaNome: string | null
  materiaCor: string | null
  tipoNorma: string | null
  numero: string | null
  ano: number | null
  ementa: string | null
  /** Aula "visualizável": aparece na trilha mas BLOQUEADA ("ainda não liberada"). */
  visualizavel?: boolean
}

/**
 * Documentos PUBLICADOS que o aluno pode ver. Regra de visibilidade:
 * SEM nenhuma atribuição = liberado a todos; COM atribuição = só grupos/estudantes
 * atribuídos. Já traz artigos (versão vigente), progresso e metadados de lei/matéria.
 */
export async function documentosDoAluno(estudanteId: string, tenantId: string, opts?: { leve?: boolean }): Promise<DocumentoAluno[]> {
  const svc = createAdminClient()
  // `leve`: pula matérias e a contagem de artigos (a TRILHA não usa nenhum dos dois) → menos round-trips.
  const leve = opts?.leve ?? false
  // Detecta colunas de lei (A1) e de versionamento (A2) → select tolerante (memoizado por processo).
  const { temLei, temVers, temPub } = await detectarColunasLeitura(svc)
  const cols = ['id, titulo, descricao, cor, icone, capa_url, versao, pasta_id, ordem, publicado', temPub && 'publicacao', temVers && 'versao_publicada', temLei && 'materia_id, tipo_norma, numero, ano, ementa'].filter(Boolean).join(', ')
  // Inclui PUBLICADAS + VISUALIZÁVEIS (aparecem bloqueadas). Sem a coluna publicacao → só publicadas.
  const filtro = (q: any) => temPub ? q.or('publicado.eq.true,publicacao->>estado.eq.visualizavel') : q.eq('publicado', true)
  // docs + matérias são independentes → paralelo (menos round-trips ao DB remoto).
  const [docs, matsRes] = await Promise.all([
    fetchAll<any>(() => filtro(svc.from('simulado_documentos').select(cols).eq('tenant_id', tenantId).eq('deletado', false)).order('atualizado_em', { ascending: false })),
    (temLei && !leve) ? svc.from('simulado_materias').select('id, nome, cor').eq('tenant_id', tenantId).eq('deletado', false) : Promise.resolve({ data: [] as any[] } as any),
  ])
  if (!docs.length) return []
  const ids = docs.map((d) => d.id)

  // Matérias (id → nome/cor)
  const materiaMap = new Map<string, { nome: string; cor: string | null }>()
  for (const m of (((matsRes as any).data ?? []) as any[])) materiaMap.set(m.id, { nome: m.nome, cor: m.cor ?? null })

  // Atribuições — CHUNK nos `.in('documento_id', …)`: com muitos documentos no tenant, o `.in()` sem
  // fatiar gera URL gigante que trava o proxy (~180s). fetchAllByIn fatia em lotes de 80.
  const [dg, de, { data: gm }] = await Promise.all([
    fetchAllByIn<{ documento_id: string; grupo_id: string }>(ids, (chunk) => svc.from('simulado_documento_grupos').select('documento_id, grupo_id').in('documento_id', chunk).order('documento_id', { ascending: true })),
    fetchAllByIn<{ documento_id: string; estudante_id: string }>(ids, (chunk) => svc.from('simulado_documento_estudantes').select('documento_id, estudante_id').in('documento_id', chunk).order('documento_id', { ascending: true })),
    svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estudanteId),
  ])
  const gruposPorDoc = new Map<string, Set<string>>()
  for (const r of dg as any[]) (gruposPorDoc.get(r.documento_id) ?? gruposPorDoc.set(r.documento_id, new Set()).get(r.documento_id)!).add(r.grupo_id)
  const estudPorDoc = new Map<string, Set<string>>()
  for (const r of de as any[]) (estudPorDoc.get(r.documento_id) ?? estudPorDoc.set(r.documento_id, new Set()).get(r.documento_id)!).add(r.estudante_id)
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

  // Artigos (versão vigente) + progresso — mesmo CHUNK nos `.in('documento_id', visIds)`.
  const [cont, prog] = await Promise.all([
    leve ? Promise.resolve([] as { documento_id: string; versao: number; artigos: number }[]) : fetchAllByIn<{ documento_id: string; versao: number; artigos: number }>(visIds, (chunk) => svc.from('simulado_documento_conteudos').select('documento_id, versao, artigos').in('documento_id', chunk).order('documento_id', { ascending: true })),
    fetchAllByIn<{ documento_id: string; documento_versao: number; pct: number; concluido_em: string | null }>(visIds, (chunk) => svc.from('simulado_leitura_progresso').select('documento_id, documento_versao, pct, concluido_em').eq('estudante_id', estudanteId).in('documento_id', chunk).order('documento_id', { ascending: true })),
  ])
  const versaoDoc = new Map(visiveis.map((d) => [d.id, d.versao_publicada ?? d.versao]))
  const artigosPorDoc = new Map<string, number>()
  for (const c of cont as any[]) if (c.versao === versaoDoc.get(c.documento_id)) artigosPorDoc.set(c.documento_id, c.artigos ?? 0)
  const progPorDoc = new Map<string, { pct: number; concluido: boolean }>()
  for (const p of prog as any[]) if (p.documento_versao === versaoDoc.get(p.documento_id)) progPorDoc.set(p.documento_id, { pct: p.pct ?? 0, concluido: !!p.concluido_em })

  return visiveis.map((d) => {
    const mat = d.materia_id ? materiaMap.get(d.materia_id) : null
    return {
      id: d.id, titulo: d.titulo, descricao: d.descricao ?? null, cor: d.cor ?? null, icone: d.icone ?? null, capa_url: d.capa_url ?? null,
      artigos: artigosPorDoc.get(d.id) ?? 0,
      pct: progPorDoc.get(d.id)?.pct ?? 0,
      concluido: progPorDoc.get(d.id)?.concluido ?? false,
      pastaId: d.pasta_id ?? null, ordem: d.ordem ?? 0,
      materiaId: d.materia_id ?? null, materiaNome: mat?.nome ?? null, materiaCor: mat?.cor ?? null,
      tipoNorma: d.tipo_norma ?? null, numero: d.numero ?? null, ano: d.ano ?? null, ementa: d.ementa ?? null,
      visualizavel: !d.publicado && (d.publicacao && typeof d.publicacao === 'object' ? d.publicacao.estado === 'visualizavel' : false),
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
  tipo: 'grifo' | 'nota'   // grifo = realce cheio; nota = sublinhado + ponto na margem + balão
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
  prefs: { tema: string | null; fonte: number | null; modo: string | null; semGrifos: boolean | null; grifoRotulos: Record<string, string> | null } | null
  ultimoDisp: string | null
  favorito: boolean
  atualizacao: AtualizacaoInfo | null
  indiceTipos: string[]
}

export interface GrifoLei { id: string; inicio: number; fim: number; exact: string; prefix: string; suffix: string; tipo: string; nota: string | null }

/** Sinaliza que a lei foi atualizada (há versão publicada anterior) — alimenta o "o que mudou". */
export interface AtualizacaoInfo { versaoAnterior: number; atualizadoEm: string | null; tipo: string | null; descricao: string | null }

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
    .select('id, titulo, descricao, versao, versao_publicada, publicado, deletado, desafio_ativo, desafio_exige_fim, desafio_tempo_min, quiz_config')
    .eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
  if (dsel.error && /versao_publicada|quiz_config|column/i.test(String(dsel.error.message))) {
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

  // Tudo abaixo depende só de (documento, versão, aluno) e é INDEPENDENTE entre si → carrega em PARALELO
  // (antes eram ~7 grupos de queries em série, cada um um round-trip ao Supabase remoto).
  const [atualizacao, cont, prog, anotacoes, questoes, grifos, estudo] = await Promise.all([
    // "O que mudou": há uma versão publicada ANTERIOR que o aluno leu?
    (async (): Promise<AtualizacaoInfo | null> => {
      if (versao <= 1) return null
      const ant = await svc.from('simulado_documento_conteudos').select('versao').eq('documento_id', documentoId).lt('versao', versao).order('versao', { ascending: false }).limit(1).maybeSingle()
      const va = (ant.data as any)?.versao
      if (!va) return null
      const { data: progAnt } = await svc.from('simulado_leitura_progresso').select('estudante_id').eq('estudante_id', estudanteId).eq('documento_id', documentoId).eq('documento_versao', va).maybeSingle()
      if (!progAnt) return null
      let atz: any = null
      try { const r = await svc.from('simulado_lei_atualizacoes').select('tipo, descricao, criado_em').eq('documento_id', documentoId).eq('versao', versao).maybeSingle(); atz = r.data } catch { /* migração A2 ausente */ }
      return { versaoAnterior: va, atualizadoEm: atz?.criado_em ?? null, tipo: atz?.tipo ?? null, descricao: atz?.descricao ?? null }
    })(),
    // HTML/artigos — IMUTÁVEL por (doc, versão) → cacheado (não relê a lei inteira a cada abertura; egress).
    remember<{ html: string; artigos: number }>(
      `leitura:conteudo:${tenantId}:${documentoId}:${versao}`,
      3600,
      async () => {
        const { data } = await svc.from('simulado_documento_conteudos').select('html, artigos').eq('documento_id', documentoId).eq('versao', versao).maybeSingle()
        return { html: (data as any)?.html ?? '', artigos: (data as any)?.artigos ?? 0 }
      },
    ),
    // Progresso do aluno nesta versão.
    svc.from('simulado_leitura_progresso').select('pct, artigo_max, tempo_seg, concluido_em').eq('estudante_id', estudanteId).eq('documento_id', documentoId).eq('documento_versao', versao).maybeSingle().then((r: any) => r.data),
    // Anotações (clona as base do admin, idempotente) — tolerante.
    (async (): Promise<AnotacaoAluno[]> => {
      try {
        await garantirAnotacoesBase(svc, tenantId, documentoId, versao, estudanteId)
        // Select tolerante: `tipo` é coluna nova (migração pode não ter rodado) → tenta com ela e cai
        // para sem ela em erro, sem perder as anotações.
        let anot: any[] | null = null
        {
          const r = await svc.from('simulado_leitura_anotacoes')
            .select('id, inicio_char, fim_char, exact, prefix, suffix, cor, nota, origem, tipo')
            .eq('estudante_id', estudanteId).eq('documento_id', documentoId).eq('documento_versao', versao).eq('deletado', false)
          if (r.error) {
            const r2 = await svc.from('simulado_leitura_anotacoes')
              .select('id, inicio_char, fim_char, exact, prefix, suffix, cor, nota, origem')
              .eq('estudante_id', estudanteId).eq('documento_id', documentoId).eq('documento_versao', versao).eq('deletado', false)
            anot = r2.data as any[] | null
          } else anot = r.data as any[] | null
        }
        return ((anot ?? []) as any[]).map((a) => ({
          id: a.id, inicio: a.inicio_char, fim: a.fim_char, exact: a.exact, prefix: a.prefix ?? '', suffix: a.suffix ?? '',
          cor: a.cor, nota: a.nota ?? null, origem: (a.origem === 'base' ? 'base' : 'propria') as 'base' | 'propria',
          tipo: (a.tipo === 'nota' ? 'nota' : 'grifo') as 'grifo' | 'nota',
        }))
      } catch { return [] }
    })(),
    // Questões inline (Fase 2) + respostas — tolerante.
    (async (): Promise<QuestaoLeituraDados[]> => {
      try {
        const { data: dq } = await svc.from('simulado_documento_questoes')
          .select('id, questao_id, apos_artigo, obrigatoria, ordem')
          .eq('tenant_id', tenantId).eq('documento_id', documentoId).eq('documento_versao', versao).eq('deletado', false)
          .order('apos_artigo').order('ordem')
        if (!dq?.length) return []
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
        return (dq as any[]).map((x) => {
          const q: any = qMap.get(x.questao_id)
          const r: any = respPorQ.get(x.questao_id)
          return {
            docQuestaoId: x.id, questaoId: x.questao_id, aposArtigo: x.apos_artigo, obrigatoria: !!x.obrigatoria,
            enunciado: q?.enunciado ?? '', comentario: q?.comentario_professor ?? null,
            alternativas: altsPorQ.get(x.questao_id) ?? [],
            resposta: r ? { alternativaId: r.alternativa_id, correta: !!r.correta, corretaId: (r.snapshot_gabarito?.correta_id ?? null) } : undefined,
          }
        }).filter((x) => x.alternativas.length > 0)
      } catch { return [] }
    })(),
    // Grifos editoriais (A4) — tolerante.
    (async (): Promise<GrifoLei[]> => {
      try {
        const { data: gs } = await svc.from('simulado_documento_anotacoes_base')
          .select('id, inicio_char, fim_char, exact, prefix, suffix, nota, tipo_grifo')
          .eq('documento_id', documentoId).eq('documento_versao', versao).eq('editorial', true).eq('deletado', false)
        return ((gs ?? []) as any[]).map((g) => ({ id: g.id, inicio: g.inicio_char, fim: g.fim_char, exact: g.exact, prefix: g.prefix ?? '', suffix: g.suffix ?? '', tipo: g.tipo_grifo ?? 'nucleo', nota: g.nota ?? null }))
      } catch { return [] }
    })(),
    // Estudo pessoal (A6): preferências + último ponto + favorito — tolerante.
    (async (): Promise<{ prefs: DocumentoCarregado['prefs']; ultimoDisp: string | null; favorito: boolean }> => {
      try {
        let [pf, up, fv] = await Promise.all([
          svc.from('simulado_leitura_preferencias').select('tema, fonte, modo, sem_grifos, grifo_rotulos').eq('estudante_id', estudanteId).maybeSingle(),
          svc.from('simulado_leitura_ultimo_ponto').select('disp_id').eq('estudante_id', estudanteId).eq('documento_id', documentoId).maybeSingle(),
          svc.from('simulado_lei_favoritos').select('id').eq('estudante_id', estudanteId).eq('documento_id', documentoId).eq('disp_id', '').maybeSingle(),
        ])
        if (pf.error && /grifo_rotulos|column/i.test(String(pf.error.message))) {
          pf = await svc.from('simulado_leitura_preferencias').select('tema, fonte, modo, sem_grifos').eq('estudante_id', estudanteId).maybeSingle() as any
        }
        const prefs = pf.data ? { tema: (pf.data as any).tema ?? null, fonte: (pf.data as any).fonte ?? null, modo: (pf.data as any).modo ?? null, semGrifos: (pf.data as any).sem_grifos ?? null, grifoRotulos: (pf.data as any).grifo_rotulos ?? null } : null
        return { prefs, ultimoDisp: (up.data as any)?.disp_id ?? null, favorito: !!fv.data }
      } catch { return { prefs: null, ultimoDisp: null, favorito: false } }
    })(),
  ])
  const { prefs, ultimoDisp, favorito } = estudo

  return {
    id: documentoId,
    titulo: (doc as any).titulo,
    descricao: (doc as any).descricao ?? null,
    versao,
    html: limparCabecalhoHtml(cont.html),
    artigos: cont.artigos,
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
    prefs,
    ultimoDisp,
    favorito,
    atualizacao,
    indiceTipos: normalizarTiposIndice((doc as any).quiz_config?.indice_tipos),
  }
}

/** Questões do MINI-SIMULADO da aula ("Questões do conteúdo" = simulado_documento_quiz_questoes),
 * no formato que o QuestaoLeitura espera. Separado das questões inline (durante a leitura). */
export async function carregarQuizAluno(documentoId: string, estudanteId: string, tenantId: string): Promise<QuestaoLeituraDados[]> {
  const svc = createAdminClient()
  let dq: any[] | null = null
  try {
    const r = await svc.from('simulado_documento_quiz_questoes').select('questao_id, ordem').eq('tenant_id', tenantId).eq('documento_id', documentoId).eq('deletado', false).order('ordem', { ascending: true })
    dq = r.data as any[]
  } catch { return [] }
  if (!dq?.length) return []
  const qids = [...new Set(dq.map((x) => x.questao_id))]
  const [{ data: qs }, { data: alts }, { data: resp }] = await Promise.all([
    svc.from('simulado_questoes').select('id, enunciado, comentario_professor').in('id', qids),
    svc.from('simulado_alternativas').select('id, questao_id, texto, ordem').in('questao_id', qids).order('ordem'),
    svc.from('simulado_leitura_respostas').select('questao_id, alternativa_id, correta, snapshot_gabarito').eq('estudante_id', estudanteId).eq('documento_id', documentoId).in('questao_id', qids),
  ])
  const qMap = new Map((qs ?? []).map((q: any) => [q.id, q]))
  const altsPorQ = new Map<string, AltLeitura[]>()
  for (const a of (alts ?? []) as any[]) (altsPorQ.get(a.questao_id) ?? altsPorQ.set(a.questao_id, []).get(a.questao_id)!).push({ id: a.id, texto: a.texto })
  const respPorQ = new Map((resp ?? []).map((r: any) => [r.questao_id, r]))
  return dq.map((x) => {
    const q: any = qMap.get(x.questao_id)
    const r: any = respPorQ.get(x.questao_id)
    return {
      docQuestaoId: x.questao_id, questaoId: x.questao_id, aposArtigo: 0, obrigatoria: true,
      enunciado: q?.enunciado ?? '', comentario: q?.comentario_professor ?? null,
      alternativas: altsPorQ.get(x.questao_id) ?? [],
      resposta: r ? { alternativaId: r.alternativa_id, correta: !!r.correta, corretaId: (r.snapshot_gabarito?.correta_id ?? null) } : undefined,
    }
  }).filter((x) => x.alternativas.length > 0)
}

/**
 * Gate de ESCRITA do aluno: o documento existe, está publicado, não-deletado e visível para ele.
 * Espelha exatamente a checagem do caminho de leitura (`carregarDocumentoAluno`). Retorna o doc
 * com os campos pedidos (default `id`) ou `null` quando o aluno NÃO pode gravar naquele documento.
 * Usado pelas rotas /api/leitura/* de escrita para fechar o IDOR (aluno gravando em doc alheio).
 */
export async function docAcessivelAluno(
  svc: ReturnType<typeof createAdminClient>,
  tenantId: string,
  documentoId: string,
  estudanteId: string,
  campos = 'id',
): Promise<Record<string, any> | null> {
  const sel = `${campos}, deletado, publicado`
  const { data: doc } = await svc.from('simulado_documentos').select(sel).eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
  if (!doc || (doc as any).deletado || !(doc as any).publicado) return null
  if (!(await alunoPodeVer(svc, documentoId, estudanteId))) return null
  return doc as Record<string, any>
}

/**
 * Gate LEVE do quiz do aluno: doc publicado + visível + LEITURA concluída — SEM carregar HTML/anotações
 * nem varrer a trilha inteira (`sequenciaLeitura`). É seguro dispensar a sequência porque
 * `leituraConcluida ⟹ aula não bloqueada` (aula bloqueada não tem como ter a leitura concluída).
 * Retorna título + pastaId (módulo, p/ o "voltar à trilha"). null = sem acesso.
 */
export async function gateQuizAluno(documentoId: string, estudanteId: string, tenantId: string): Promise<{ titulo: string; pastaId: string | null; leituraConcluida: boolean } | null> {
  const svc = createAdminClient()
  let dsel = await svc.from('simulado_documentos').select('id, titulo, pasta_id, versao, versao_publicada, publicado, deletado').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
  if (dsel.error && /versao_publicada|column/i.test(String(dsel.error.message))) {
    dsel = await svc.from('simulado_documentos').select('id, titulo, pasta_id, versao, publicado, deletado').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle() as any
  }
  const doc: any = dsel.data
  if (!doc || doc.deletado || !doc.publicado) return null
  if (!(await alunoPodeVer(svc, documentoId, estudanteId))) return null
  const versao = doc.versao_publicada ?? doc.versao ?? 1
  const { data: prog } = await svc.from('simulado_leitura_progresso').select('concluido_em').eq('estudante_id', estudanteId).eq('documento_id', documentoId).eq('documento_versao', versao).maybeSingle()
  return { titulo: doc.titulo, pastaId: doc.pasta_id ?? null, leituraConcluida: !!(prog as any)?.concluido_em }
}

/** Regra de visibilidade do aluno (mesma do catálogo/leitor): sem atribuição = todos. */
async function alunoPodeVer(svc: ReturnType<typeof createAdminClient>, documentoId: string, estudanteId: string): Promise<boolean> {
  const [{ data: dg }, { data: de }] = await Promise.all([
    svc.from('simulado_documento_grupos').select('grupo_id').eq('documento_id', documentoId),
    svc.from('simulado_documento_estudantes').select('estudante_id').eq('documento_id', documentoId),
  ])
  const grupos = (dg ?? []).map((r: any) => r.grupo_id)
  const estuds = (de ?? []).map((r: any) => r.estudante_id)
  if (!grupos.length && !estuds.length) return true
  if (estuds.includes(estudanteId)) return true
  if (grupos.length) {
    const { data: gm } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estudanteId).in('grupo_id', grupos)
    if ((gm ?? []).length) return true
  }
  return false
}

/** Diff (antes/depois) entre a versão publicada anterior e a vigente, para o aluno. */
export async function carregarDiffAluno(
  documentoId: string,
  estudanteId: string,
  tenantId: string,
  de?: number,
): Promise<{ ok: boolean; diff?: DiffDoc; de?: number; para?: number; error?: string }> {
  const svc = createAdminClient()
  let dsel = await svc.from('simulado_documentos').select('versao, versao_publicada, publicado, deletado').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
  if (dsel.error && /versao_publicada|column/i.test(String(dsel.error.message))) {
    dsel = await svc.from('simulado_documentos').select('versao, publicado, deletado').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle() as any
  }
  const doc: any = dsel.data
  if (!doc || doc.deletado || !doc.publicado) return { ok: false, error: 'Sem acesso.' }
  if (!(await alunoPodeVer(svc, documentoId, estudanteId))) return { ok: false, error: 'Sem acesso.' }
  const para = doc.versao_publicada ?? doc.versao ?? 1
  let deV = de
  if (!deV) {
    const ant = await svc.from('simulado_documento_conteudos').select('versao').eq('documento_id', documentoId).lt('versao', para).order('versao', { ascending: false }).limit(1).maybeSingle()
    deV = (ant.data as any)?.versao
  }
  const vazio: DiffDoc = { blocos: [], resumo: { mod: 0, add: 0, rem: 0, igual: 0 } }
  if (!deV || deV >= para) return { ok: true, diff: vazio, de: deV, para }
  const { data } = await svc.from('simulado_documento_conteudos').select('versao, html').eq('documento_id', documentoId).in('versao', [deV, para])
  const porV = new Map<number, string>((data ?? []).map((c: any) => [c.versao, (c.html ?? '') as string]))
  return { ok: true, diff: diffDocumentos(porV.get(deV) ?? '', porV.get(para) ?? ''), de: deV, para }
}
