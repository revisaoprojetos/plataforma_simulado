import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
import { getGamConfig } from '@/lib/gamificacao'
import { normalizarPontuacaoLeitura, pontuarLegProc } from '@/lib/leitura/pontuacao'
import { engajamentoAssinaturaKpisSql, engajamentoAssinaturaListaSql, engajamentoAlunoDetalheSql } from 'data'

export interface LinhaDocumento {
  id: string
  titulo: string
  publicado: boolean
  iniciaram: number
  concluiram: number
  pctMedio: number
  tempoMedioMin: number
}

/**
 * Resumo por documento (quem iniciou/concluiu, % médio, tempo médio).
 * A agregação varre TODAS as linhas de progresso do tenant — pesado à medida que a base cresce
 * (mesma classe do egress já incidente). Fica MEMOIZADO no Redis (TTL) — no cache-hit não toca no
 * banco; degrada sozinho sem Redis. Reflete até ~30min de atraso, aceitável p/ tela analítica.
 */
export async function relatorioLeitura(tenantId: string): Promise<LinhaDocumento[]> {
  return remember<LinhaDocumento[]>(chaveRelatorio(tenantId, 'leitura', 'resumo'), TTL_RELATORIO, async () => {
    const svc = createAdminClient()
    const docs = await fetchAll<any>(() =>
      svc.from('simulado_documentos').select('id, titulo, publicado').eq('tenant_id', tenantId).eq('deletado', false).order('atualizado_em', { ascending: false }))
    if (!docs.length) return []
    const ids = docs.map((d) => d.id)
    const prog = await fetchAllByIn<any>(ids, (chunk) =>
      svc.from('simulado_leitura_progresso').select('documento_id, pct, tempo_seg, concluido_em').in('documento_id', chunk))

    const agg = new Map<string, { n: number; concl: number; somaPct: number; somaTempo: number }>()
    for (const p of prog) {
      const a = agg.get(p.documento_id) ?? { n: 0, concl: 0, somaPct: 0, somaTempo: 0 }
      a.n += 1
      if (p.concluido_em) a.concl += 1
      a.somaPct += Number(p.pct ?? 0)
      a.somaTempo += Number(p.tempo_seg ?? 0)
      agg.set(p.documento_id, a)
    }
    return docs.map((d) => {
      const a = agg.get(d.id)
      return {
        id: d.id, titulo: d.titulo, publicado: !!d.publicado,
        iniciaram: a?.n ?? 0,
        concluiram: a?.concl ?? 0,
        pctMedio: a && a.n ? Math.round(a.somaPct / a.n) : 0,
        tempoMedioMin: a && a.n ? Math.round(a.somaTempo / a.n / 60) : 0,
      }
    })
  })
}

export interface LinhaAluno {
  estudanteId: string
  nome: string
  pct: number
  tempoMin: number
  concluido: boolean
  atualizadoEm: string | null
}

export const DETALHE_POR_PAGINA = 50

/** Detalhe de um documento: alunos que iniciaram, com % / tempo / conclusão — paginado server-side. */
export async function detalheDocumento(tenantId: string, documentoId: string, pagina = 1): Promise<{ titulo: string; alunos: LinhaAluno[]; total: number; pagina: number; porPagina: number } | null> {
  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_documentos').select('titulo').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
  if (!doc) return null
  const p = Math.max(1, pagina)
  const desde = (p - 1) * DETALHE_POR_PAGINA
  const { data: prog, count } = await svc.from('simulado_leitura_progresso')
    .select('estudante_id, pct, tempo_seg, concluido_em, atualizado_em', { count: 'exact' })
    .eq('documento_id', documentoId).eq('tenant_id', tenantId)
    .order('atualizado_em', { ascending: false })
    .range(desde, desde + DETALHE_POR_PAGINA - 1)
  const rows = (prog ?? []) as any[]
  const ids = [...new Set(rows.map((r) => r.estudante_id))]
  const nomePorId = new Map<string, string>()
  if (ids.length) {
    const ests = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_estudantes').select('id, nome, email').in('id', chunk))
    for (const e of ests) nomePorId.set(e.id, e.nome || e.email || 'Aluno')
  }
  return {
    titulo: (doc as any).titulo,
    alunos: rows.map((r) => ({
      estudanteId: r.estudante_id,
      nome: nomePorId.get(r.estudante_id) ?? 'Aluno',
      pct: Number(r.pct ?? 0),
      tempoMin: Math.round(Number(r.tempo_seg ?? 0) / 60),
      concluido: !!r.concluido_em,
      atualizadoEm: r.atualizado_em ?? null,
    })),
    total: count ?? rows.length,
    pagina: p,
    porPagina: DETALHE_POR_PAGINA,
  }
}

/** Módulos (pastas) da Leitura do tenant — para o seletor do relatório de sequências. */
export async function modulosLeitura(tenantId: string): Promise<{ id: string; nome: string }[]> {
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_pastas').select('id, nome')
    .eq('tenant_id', tenantId).eq('is_folder', true).eq('folder_area', 'leitura')
    .order('ordem', { ascending: true }).order('nome', { ascending: true })
  return ((data ?? []) as any[]).map((p) => ({ id: p.id, nome: p.nome ?? 'Módulo' }))
}

// ─────────── Assinaturas (pagamento recorrente) × Engajamento no Desafio ───────────

export interface EngajKpis {
  recorrenteTotal: number
  desafioAtivos: number
  recorrenteAtivo: number       // paga recorrente E está no Desafio ("fazendo certinho")
  recorrenteSemAtividade: number // paga recorrente mas NÃO fez ("cadastrou e não fez")
  ativoSemRecorrente: number    // faz o Desafio mas NÃO é recorrente
  baseTotal: number
}

/** KPIs do cruzamento assinatura × Desafio (memoizado no Redis; null = SQL agregado indisponível). */
export async function engajamentoKpis(tenantId: string): Promise<EngajKpis | null> {
  return remember<EngajKpis | null>(chaveRelatorio(tenantId, 'leitura', 'engaj-kpis'), TTL_RELATORIO, async () => {
    const k = await engajamentoAssinaturaKpisSql(tenantId)
    if (!k) return null
    const n = (v: string | number) => Number(v) || 0
    return {
      recorrenteTotal: n(k.recorrente_total), desafioAtivos: n(k.desafio_ativos),
      recorrenteAtivo: n(k.recorrente_ativo), recorrenteSemAtividade: n(k.recorrente_sem_atividade),
      ativoSemRecorrente: n(k.ativo_sem_recorrente), baseTotal: n(k.base_total),
    }
  })
}

export interface EngajLinha {
  id: string; nome: string; email: string | null; classificacao: string | null
  recorrente: boolean; fez: boolean; aulas: number; ultimaAtividade: string | null
}
export const ENGAJ_POR_PAGINA = 15
// Colunas ordenáveis expostas na UI (mapeadas para o whitelist do SQL).
export const ENGAJ_SORT_COLS = ['nome', 'recorrente', 'fez', 'aulas', 'ultima'] as const
export type EngajSortCol = (typeof ENGAJ_SORT_COLS)[number]

/** Lista paginada (server-side, SQL) com filtros pagamento/engajamento + busca + ordenação. sqlOff=true se SQL indisponível. */
export async function engajamentoLista(
  tenantId: string,
  opts: { pagina?: number; pag?: string; eng?: string; busca?: string; sort?: string; dir?: string },
): Promise<{ linhas: EngajLinha[]; total: number; pagina: number; porPagina: number; sort: EngajSortCol; dir: 'asc' | 'desc'; sqlOff: boolean }> {
  const pagina = Math.max(1, opts.pagina ?? 1)
  const pag = ['recorrente', 'nao'].includes(opts.pag ?? '') ? (opts.pag as string) : ''
  const eng = ['fez', 'naofez'].includes(opts.eng ?? '') ? (opts.eng as string) : ''
  const busca = (opts.busca ?? '').trim().slice(0, 80)
  const sort: EngajSortCol = (ENGAJ_SORT_COLS as readonly string[]).includes(opts.sort ?? '') ? (opts.sort as EngajSortCol) : 'ultima'
  const dir: 'asc' | 'desc' = opts.dir === 'asc' ? 'asc' : 'desc'
  const off = (pagina - 1) * ENGAJ_POR_PAGINA
  const rows = await engajamentoAssinaturaListaSql(tenantId, pag, eng, busca, ENGAJ_POR_PAGINA, off, sort, dir)
  if (rows == null) return { linhas: [], total: 0, pagina, porPagina: ENGAJ_POR_PAGINA, sort, dir, sqlOff: true }
  const total = rows.length ? Number(rows[0].total_rows) || 0 : 0
  return {
    linhas: rows.map((r) => ({
      id: r.id, nome: r.nome || r.email || 'Aluno', email: r.email, classificacao: r.classificacao,
      recorrente: !!r.recorrente, fez: !!r.fez, aulas: Number(r.aulas) || 0,
      ultimaAtividade: r.ultima_atividade ? new Date(r.ultima_atividade as any).toISOString() : null,
    })),
    total, pagina, porPagina: ENGAJ_POR_PAGINA, sort, dir, sqlOff: false,
  }
}

// ─────────── Detalhe de um aluno: aulas do Desafio que fez (por módulo, com datas) ───────────

export interface EngajAlunoInfo {
  id: string; nome: string; email: string | null; classificacao: string | null; recorrente: boolean
  avatar: string | null; avatarCor: string | null
}
export interface EngajAulaFeita {
  docId: string; titulo: string; ordem: number | null
  leituraEm: string | null; pct: number
  qtot: number; qans: number; qcorr: number; quizCompleto: boolean; gabaritada: boolean; quizUlt: string | null
  concluida: boolean; pontos: number
  /** Nº da sequência (dias consecutivos com aula-completa no módulo) atingido no dia em que fechou esta aula; null se não fechou o quiz. */
  sequencia: number | null
}
export interface EngajModuloBloco {
  moduloId: string; moduloNome: string
  aulasConcluidas: number; aulasTotal: number; quizzesCompletos: number; pontosTotal: number
  ultima: string | null
  aulas: EngajAulaFeita[]
}

/**
 * Info do aluno + suas aulas do Desafio agrupadas por módulo (área "expandir informações").
 * Calcula, por aula e por módulo, os ACERTOS e a PONTUAÇÃO (reusa `pontuarLegProc` — = acertos
 * enquanto a gamificação estiver desligada; com ela ligada usa a config `pontuacao` do módulo).
 */
export async function engajamentoAlunoDetalhe(
  tenantId: string, estudanteId: string,
): Promise<{ info: EngajAlunoInfo; modulos: EngajModuloBloco[]; gamAtivo: boolean; sqlOff: boolean } | null> {
  const res = await engajamentoAlunoDetalheSql(tenantId, estudanteId)
  if (res == null) return { info: { id: estudanteId, nome: 'Aluno', email: null, classificacao: null, recorrente: false, avatar: null, avatarCor: null }, modulos: [], gamAtivo: false, sqlOff: true }
  if (!res.info) return null
  const info: EngajAlunoInfo = {
    id: res.info.id, nome: res.info.nome || res.info.email || 'Aluno',
    email: res.info.email, classificacao: res.info.classificacao, recorrente: !!res.info.recorrente,
    avatar: res.info.avatar ?? null, avatarCor: res.info.avatar_cor ?? null,
  }

  // Config de pontuação por módulo + gamificação ativa + fuso (tolerante — sem coluna/config cai no padrão/acertos).
  const svc = createAdminClient()
  let gamAtivo = false; let tz = 'America/Sao_Paulo'
  try { const cfg = await getGamConfig(svc, tenantId); gamAtivo = !!cfg?.ativo; tz = cfg?.timezone || tz } catch { /* gamificação ausente */ }
  const modIds = [...new Set(res.aulas.map((a) => a.modulo_id))]
  const pontPorMod = new Map<string, ReturnType<typeof normalizarPontuacaoLeitura>>()
  if (modIds.length) {
    try {
      const pastas = await fetchAllByIn<{ id: string; pontuacao: unknown }>(modIds, (chunk) =>
        svc.from('simulado_pastas').select('id, pontuacao').eq('tenant_id', tenantId).in('id', chunk))
      for (const p of pastas) pontPorMod.set(p.id, normalizarPontuacaoLeitura(p.pontuacao))
    } catch { /* coluna pontuacao ausente */ }
  }

  const porMod = new Map<string, EngajModuloBloco>()
  for (const a of res.aulas) {
    const mid = a.modulo_id
    let bloco = porMod.get(mid)
    if (!bloco) { bloco = { moduloId: mid, moduloNome: a.modulo_nome || 'Módulo', aulasConcluidas: 0, aulasTotal: 0, quizzesCompletos: 0, pontosTotal: 0, ultima: null, aulas: [] }; porMod.set(mid, bloco) }
    const cfg = pontPorMod.get(mid) ?? normalizarPontuacaoLeitura(null)
    const qtot = Number(a.qtot ?? 0), qans = Number(a.qans ?? 0), qcorr = Number(a.qcorr ?? 0)
    const quizCompleto = !!a.quiz_completo, gabaritada = !!a.gabaritada
    const leituraEm = a.leitura_em ? new Date(a.leitura_em as any).toISOString() : null
    // "Concluída" = leu a aula E (não tem quiz OU respondeu o quiz) — mesma noção de "Concluíram" da aba Documentos.
    const concluida = !!leituraEm && (qtot === 0 || quizCompleto)
    const pontos = pontuarLegProc(cfg, { acertos: qcorr, aulasConcluidas: quizCompleto ? 1 : 0, aulasGabaritadas: gabaritada ? 1 : 0 }, gamAtivo)
    const quizUlt = a.quiz_ult ? new Date(a.quiz_ult as any).toISOString() : null
    bloco.aulas.push({
      docId: a.doc_id, titulo: a.titulo || 'Aula', ordem: a.ordem == null ? null : Number(a.ordem),
      leituraEm, pct: Number(a.pct ?? 0),
      qtot, qans, qcorr, quizCompleto, gabaritada, quizUlt, concluida, pontos, sequencia: null,
    })
    bloco.aulasTotal++
    if (concluida) bloco.aulasConcluidas++
    if (quizCompleto) bloco.quizzesCompletos++
    bloco.pontosTotal += pontos
    const dt = quizUlt && leituraEm ? (quizUlt > leituraEm ? quizUlt : leituraEm) : (quizUlt ?? leituraEm)
    if (dt && (!bloco.ultima || dt > bloco.ultima)) bloco.ultima = dt
  }

  // Sequência POR MÓDULO (mesma métrica do ranking/webhooks leitura.*): dias consecutivos em que uma
  // AULA-COMPLETA (quiz respondido) fechou, pelo dia do último acerto/resposta do quiz (quizUlt, fuso tz).
  // Cada aula recebe o Nº da sequência atingido no dia em que a fechou (várias aulas no mesmo dia = mesmo Nº).
  const diaBRT = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })
  for (const bloco of porMod.values()) {
    const dias = new Set<string>()
    for (const a of bloco.aulas) if (a.quizCompleto && a.quizUlt) dias.add(diaBRT(a.quizUlt))
    const runByDay = new Map<string, number>()
    let run = 0, prev = ''
    for (const d of [...dias].sort()) { run = prev && Date.parse(d + 'T00:00:00Z') - Date.parse(prev + 'T00:00:00Z') === 86_400_000 ? run + 1 : 1; prev = d; runByDay.set(d, run) }
    for (const a of bloco.aulas) a.sequencia = a.quizCompleto && a.quizUlt ? (runByDay.get(diaBRT(a.quizUlt)) ?? null) : null
  }

  return { info, modulos: [...porMod.values()], gamAtivo, sqlOff: false }
}
