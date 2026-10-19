import 'server-only'
import type { createAdminClient } from '@/lib/supabase/server'
import { MARATONA, MARATONA_LANCADA, type MaratonaConfig } from './config'
import { normalizarRegulamento } from '@/lib/leitura/regulamento'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember, chaveRelatorio } from '@/lib/cache/relatorio-cache'
import { resolverEnunciadoUrls } from '@/lib/aluno/enunciado'

type Svc = ReturnType<typeof createAdminClient>

export interface DesafioMaratonaResolvido {
  /** Pasta real do desafio (folder_area='maratona'), ou null se ainda não existe. */
  pastaId: string | null
  /** Config EFETIVA do card (defaults + edição do admin + contagens reais vinculadas). */
  config: MaratonaConfig
  /** Lançado? (flag do admin em desafio_jogo.config.lancada; fallback = constante). */
  lancada: boolean
}

/**
 * Resolve o desafio Maratona para o ALUNO: lê a pasta real + a config editada no admin
 * (desafio_jogo.config) e VINCULA as contagens reais (simulados na pasta / alunos com acesso) quando
 * os campos estão em modo automático. Assim o card do aluno reflete exatamente o que existe de verdade.
 */
export async function carregarDesafioMaratona(svc: Svc, tenantId: string): Promise<DesafioMaratonaResolvido> {
  const base: MaratonaConfig = { ...MARATONA }
  let pastaId: string | null = null
  let cfg: Record<string, any> = {}
  let lancada = MARATONA_LANCADA
  try {
    const { data } = await svc.from('simulado_pastas').select('id, desafio_jogo')
      .eq('tenant_id', tenantId).eq('folder_area', 'maratona').order('created_at', { ascending: true }).limit(1)
    const row = (data ?? [])[0] as { id: string; desafio_jogo?: any } | undefined
    if (row) {
      pastaId = row.id
      const c = row.desafio_jogo?.config
      if (c && typeof c === 'object') { cfg = c; if (typeof c.lancada === 'boolean') lancada = c.lancada }
    }
  } catch { /* folder_area/desafio_jogo ausente → usa defaults */ }

  let simulados = 0, inscritos = 0
  if (pastaId) {
    try { const { count } = await svc.from('simulado_simulados').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('pasta_id', pastaId); simulados = count ?? 0 } catch { /* 0 */ }
    try { const { count } = await svc.from('simulado_pasta_estudantes').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('pasta_id', pastaId); inscritos = count ?? 0 } catch { /* 0 */ }
  }

  const config: MaratonaConfig = { ...base, ...cfg }
  config.qtdSimulados = cfg.qtdSimuladosAuto !== false ? simulados : (cfg.qtdSimulados ?? base.qtdSimulados)
  config.inscritos = cfg.inscritosAuto !== false ? inscritos : (cfg.inscritos ?? base.inscritos)
  config.regulamento = normalizarRegulamento(cfg.regulamento)
  return { pastaId, config, lancada }
}

/**
 * PROGRESSO REAL do aluno no percurso: quantos dos simulados da maratona ele CONCLUIU de fato
 * (sessão `finalizada`, não-teste). Os simulados vinculados à pasta são ordenados pela data de início
 * (17/10 → 24/10 → 31/10) e mapeados aos checkpoints (1º=AGU, 2º=PGF, 3º=PGFN+Chegada). Como a maratona
 * é sequencial por data, contamos o PREFIXO concluído → nenhum checkpoint fica "concluído" sem o aluno
 * ter terminado o simulado correspondente. Retorna 0..3 (3 = cruzou a chegada). Sem pasta/erro → 0.
 */
// ─── RANKING REAL da maratona ─────────────────────────────────────────────────
/** PRIVACIDADE (obrigatória nos rankings): o nome de TERCEIROS vira só INICIAIS — "João Silva" → "J. S."
 *  (primeiro + último nome); nome único → "J.". A própria linha do aluno aparece como "Você" (no componente). */
function iniciaisDe(nome: string | null | undefined): string {
  const ps = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (!ps.length) return '—'
  const a = ps[0][0]?.toUpperCase() ?? ''
  const b = ps.length > 1 ? (ps[ps.length - 1][0]?.toUpperCase() ?? '') : ''
  return b ? `${a}. ${b}.` : `${a}.`
}
export interface MaratonaRankLinha { estudanteId: string; nome: string; pontos: number; tempo: string; tentativas: number; posicao: number
  numero: number | null   // número do corredor (0001…); null = ainda não encerrou o 1º simulado
  checkin: boolean         // check-in ok (permaneceu ≥ mínimo): na semana = daquela etapa; no geral = todas as etapas
}
/** Ranking por semana (um por simulado vinculado, na ordem de data) + geral (soma das semanas). */
export interface RankingMaratona { semanas: MaratonaRankLinha[][]; geral: MaratonaRankLinha[] }

function fmtTempoRank(ini?: string | null, fim?: string | null): { s: string; ms: number } {
  if (!ini || !fim) return { s: '—', ms: Number.POSITIVE_INFINITY }
  const ms = new Date(fim).getTime() - new Date(ini).getTime()
  if (!(ms > 0)) return { s: '—', ms: Number.POSITIVE_INFINITY }
  const tot = Math.floor(ms / 1000), h = Math.floor(tot / 3600), m = Math.floor((tot % 3600) / 60), ss = tot % 60
  return { s: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, ms }
}

/**
 * Agrega o ranking REAL: para cada simulado vinculado à pasta (na ordem de data = semana) dedup as
 * sessões finalizadas por aluno conforme a política de nota do simulado; o "geral" soma os pontos do
 * aluno nas semanas. Ordena por pontos desc, depois menor tempo. Exclui sessões de teste. Sem dados → listas vazias.
 */
/** Etapa da maratona (admin → config.etapas): simulado + ÁREA (slot 1..3) + nome exibido (rotulo, aplicado só
 *  quando rotuloOn) + tempo mínimo de permanência no simulado (segMin, seg) p/ o check-in/selo. */
type EtapaCfg = { simuladoId: string; slot?: number; rotulo?: string; rotuloOn?: boolean; segMin?: number }
/** Nome personalizado APLICADO da etapa: só quando ligado (rotuloOn). Dados antigos (sem a flag) = aplica se houver texto. */
function rotuloAplicado(e: EtapaCfg): string {
  const txt = (e.rotulo ?? '').toString().trim()
  return (e.rotuloOn === false || !txt) ? '' : txt
}
const AREAS_MARATONA = 3
/** Lê as etapas organizadas no admin (config.etapas). [] = sem organização definida. */
async function lerEtapasMaratona(svc: Svc, tenantId: string, pastaId: string): Promise<EtapaCfg[]> {
  try {
    const { data } = await svc.from('simulado_pastas').select('desafio_jogo').eq('id', pastaId).eq('tenant_id', tenantId).maybeSingle()
    const et = (data as any)?.desafio_jogo?.config?.etapas
    return Array.isArray(et) ? et.filter((e: any) => e && typeof e.simuladoId === 'string') as EtapaCfg[] : []
  } catch { return [] }
}
/** Ordem MANUAL das etapas como lista de simuladoId. [] = sem ordem definida. */
async function ordemEtapasMaratona(svc: Svc, tenantId: string, pastaId: string): Promise<string[]> {
  return (await lerEtapasMaratona(svc, tenantId, pastaId)).map((e) => e.simuladoId)
}
/** Reordena os simulados pela ordem manual das etapas; não-listados vão ao fim, preservando a ordem recebida
 *  (data_início/created_at). Sem ordem definida → devolve como está (fallback por data). */
function aplicarOrdemEtapas<T extends { id: string }>(sims: T[], ordem: string[]): T[] {
  if (!ordem.length) return sims
  const idx = new Map(ordem.map((id, i) => [id, i]))
  return sims.map((s, i) => ({ s, i }))
    .sort((a, b) => ((idx.get(a.s.id) ?? Infinity) - (idx.get(b.s.id) ?? Infinity)) || (a.i - b.i))
    .map((x) => x.s)
}

export async function carregarRankingMaratona(svc: Svc, tenantId: string, pastaId: string | null): Promise<RankingMaratona> {
  const vazio: RankingMaratona = { semanas: [[], [], []], geral: [] }
  if (!pastaId) return vazio
  try {
    // Mesmo p/ todos os alunos do tenant → cacheia por tenant+pasta (TTL 5min). Agregação pesada (1000+).
    return await remember(chaveRelatorio(tenantId, 'maratona-ranking', pastaId), 300, async () => {
    const { data: sims } = await svc.from('simulado_simulados').select('id, regras, data_inicio, created_at')
      .eq('tenant_id', tenantId).eq('pasta_id', pastaId).eq('deletado', false).is('owner_estudante_id', null)
      .order('data_inicio', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
    // Etapas (ordem + tempo mínimo por etapa) + mapa de números do corredor — tudo da config da pasta.
    const etapas = await lerEtapasMaratona(svc, tenantId, pastaId)
    const ordem = etapas.map((e) => e.simuladoId)
    const segMinPor = new Map(etapas.map((e) => [e.simuladoId, Math.max(0, Math.round(Number(e.segMin) || 0))]))
    const corredores = new Map<string, number>()
    try {
      const { data: pr } = await svc.from('simulado_pastas').select('desafio_jogo').eq('id', pastaId).eq('tenant_id', tenantId).maybeSingle()
      const cor = (pr as any)?.desafio_jogo?.config?.corredores
      if (cor && typeof cor === 'object') for (const [k, v] of Object.entries(cor)) { const n = Number(v); if (Number.isFinite(n) && n > 0) corredores.set(k, n) }
    } catch { /* sem números ainda */ }
    const simRows = aplicarOrdemEtapas((sims ?? []) as any[], ordem).slice(0, 3) as { id: string; regras: any }[]
    if (!simRows.length) return vazio

    type Linha = MaratonaRankLinha & { ms: number }
    const idsSet = new Set<string>()
    const geral = new Map<string, { pontos: number; tent: number; ms: number; checks: number }>()
    const porSim: Linha[][] = []
    for (const sim of simRows) {
      const politica = (sim.regras?.politica_nota as string) ?? 'ultima'
      const segMinSim = segMinPor.get(sim.id) ?? 0
      // Paginado (PostgREST corta em ~1000) + order estável por id — maratona pode ter 1000+ sessões.
      const ses = await fetchAll<any>(() => svc.from('simulado_sessoes_prova').select('id, estudante_id, nota, iniciado_em, finalizado_em')
        .eq('simulado_id', sim.id).eq('is_teste', false).eq('status', 'finalizada').eq('deletado', false)
        .order('id', { ascending: true }), 1000, 'maratona-ranking-sessoes')
      const porAluno = new Map<string, { nota: number; ini: string | null; fim: string | null }[]>()
      for (const s of ses) {
        const arr = porAluno.get(s.estudante_id) ?? []
        arr.push({ nota: Number(s.nota ?? 0), ini: s.iniciado_em ?? null, fim: s.finalizado_em ?? null })
        porAluno.set(s.estudante_id, arr)
      }
      const linhas: Linha[] = [...porAluno.entries()].map(([eid, sess]) => {
        // Permanência (duração) de cada sessão; maxDur = base do CHECK-IN (≥ segMin em ALGUMA sessão).
        const durDe = (s: { ini: string | null; fim: string | null }) => (s.ini && s.fim) ? Math.max(0, (new Date(s.fim).getTime() - new Date(s.ini).getTime()) / 1000) : 0
        const maxDur = sess.reduce((m, s) => Math.max(m, durDe(s)), 0)
        const checkinSim = segMinSim <= 0 ? true : maxDur >= segMinSim
        // RANKING: nota e TEMPO saem só das tentativas VÁLIDAS (permanência ≥ segMin). Assim um aluno com
        // check NUNCA aparece com tempo < mínimo (ex.: fez em 23min e refez em 7min → conta os 23min, não os 7).
        // Sem tentativa válida → usa todas (mas aí checkinSim=false e ele cai pro fim do ranking).
        const validas = segMinSim <= 0 ? sess : sess.filter((s) => durDe(s) >= segMinSim)
        const bs = validas.length ? validas : sess
        let conta = bs[bs.length - 1] // 'ultima' (default)
        if (politica === 'melhor') conta = bs.reduce((b, s) => (s.nota > b.nota ? s : b), bs[0])
        const pontos = politica === 'media' ? bs.reduce((a, s) => a + s.nota, 0) / bs.length : conta.nota
        const t = politica === 'media' ? { s: '—', ms: Number.POSITIVE_INFINITY } : fmtTempoRank(conta.ini, conta.fim)
        idsSet.add(eid)
        const g = geral.get(eid) ?? { pontos: 0, tent: 0, ms: 0, checks: 0 }
        g.pontos += pontos; g.tent += sess.length; g.ms += Number.isFinite(t.ms) ? t.ms : 0; g.checks += checkinSim ? 1 : 0
        geral.set(eid, g)
        return { estudanteId: eid, nome: 'Aluno', pontos: Math.round(pontos * 100) / 100, tempo: t.s, tentativas: sess.length, posicao: 0, ms: t.ms, numero: corredores.get(eid) ?? null, checkin: checkinSim }
      })
      porSim.push(linhas)
    }

    const nomes = new Map<string, string>()
    const ids = [...idsSet]
    if (ids.length) {
      // .in() chunkado (lista grande pendura o proxy) + paginado.
      const ests = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_estudantes').select('id, nome').in('id', chunk).order('id', { ascending: true }), { rotulo: 'maratona-ranking-nomes' })
      for (const e of ests) nomes.set(e.id, iniciaisDe(e.nome)) // privacidade: só iniciais no ranking
    }
    // Corrida: quem tem check-in na frente, depois menor tempo, depois nome. (Sem pontos no ranking.)
    const ordenar = (arr: Linha[]) => [...arr]
      .sort((a, b) => (Number(b.checkin) - Number(a.checkin)) || a.ms - b.ms || a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((l, i) => ({ estudanteId: l.estudanteId, nome: nomes.get(l.estudanteId) ?? 'Aluno', pontos: l.pontos, tempo: l.tempo, tentativas: l.tentativas, posicao: i + 1, numero: corredores.get(l.estudanteId) ?? null, checkin: l.checkin } as MaratonaRankLinha))
    const semanas = porSim.map(ordenar)
    while (semanas.length < 3) semanas.push([])
    const geralLinhas: Linha[] = [...geral.entries()].map(([eid, v]) => ({ estudanteId: eid, nome: nomes.get(eid) ?? 'Aluno', pontos: Math.round(v.pontos * 100) / 100, tempo: '—', tentativas: v.tent, posicao: 0, ms: v.ms, numero: corredores.get(eid) ?? null, checkin: v.checks >= simRows.length }))
    return { semanas, geral: ordenar(geralLinhas) }
    })
  } catch { return vazio }
}

// ─── LINKS dos simulados (fazer / ver resultado) por semana ───────────────────
export interface MaratonaSimuladoLink {
  simuladoId: string; titulo: string; fazerUrl: string; resultadoUrl: string; concluido: boolean
  rotulo: string          // rótulo da etapa (maratona → config.etapas); vazio = usa o título
  // DATA e LIBERAÇÃO vêm do PRÓPRIO simulado (data_inicio / modo_aplicacao) — fonte única.
  data: string | null     // YYYY-MM-DD (data_inicio do simulado); null = sem data
  liberacao: string       // modo_aplicacao do simulado ('aberto' | 'janela_fixa' | 'prazo_relativo')
  liberada: boolean       // simulado disponível agora (modo + janela + status publicado)
  encerrado: boolean      // janela já passou (data_fim < hoje) ou status 'encerrado' — não dá mais pra fazer/refazer
  // CHECK-IN (selo): o aluno PERMANECEU ao menos `segMin` no simulado (maior duração entre as sessões
  // finalizadas ≥ segMin). segMin=0 → qualquer encerramento já dá o check. false enquanto não cumpriu.
  segMin: number          // tempo mínimo de permanência da etapa, em segundos (0 = sem mínimo)
  checkin: boolean        // selo conquistado (dourado); false = ainda cinza/bloqueado
  dur: number             // MAIOR duração (seg) que o aluno permaneceu numa sessão finalizada (0 = não concluiu)
  // CADERNO (download): "Caderno de questões (sem respostas)" do simulado, igual à plataforma.
  // null = sem caderno a baixar / enunciado não liberado. PDF direto ou endpoint de gerar.
  cadernoUrl: string | null
}
/**
 * Para cada simulado vinculado (na ordem de data = semana/checkpoint), devolve o link de FAZER
 * (/simulado/<embed_token>) e de VER RESULTADO (/aluno/simulados/<id>), além de `concluido` (o aluno já
 * tem sessão finalizada). Usado nos cards (percurso, parciais, calendário) para direcionar ao simulado.
 */
export async function carregarSimuladosLinksMaratona(svc: Svc, tenantId: string, pastaId: string | null, estudanteId: string): Promise<(MaratonaSimuladoLink | null)[]> {
  if (!pastaId) return []
  try {
    const { data: sims } = await svc.from('simulado_simulados').select('id, titulo, embed_token, regras, data_inicio, data_fim, modo_aplicacao, status, created_at')
      .eq('tenant_id', tenantId).eq('pasta_id', pastaId).eq('deletado', false).is('owner_estudante_id', null)
      .order('data_inicio', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
    const etapas = await lerEtapasMaratona(svc, tenantId, pastaId)
    const rotuloPor = new Map(etapas.map((e) => [e.simuladoId, rotuloAplicado(e)]))
    const segMinPor = new Map(etapas.map((e) => [e.simuladoId, Math.max(0, Math.round(Number(e.segMin) || 0))]))
    type Row = { id: string; titulo: string | null; embed_token: string | null; regras: any; data_inicio: string | null; data_fim: string | null; modo_aplicacao: string | null; status: string | null }
    const simById = new Map((sims ?? []).map((s: any) => [s.id as string, s as Row]))
    // COLOCAÇÃO POR ÁREA: cada área (1..N) recebe o simulado com aquele `slot`. Sem slots definidos →
    // fallback para a ordem (comportamento antigo). Áreas vazias ficam `null` (checkpoint sem simulado).
    const temSlot = etapas.some((e) => Number(e.slot) >= 1)
    let rows: (Row | null)[]
    if (temSlot) {
      rows = Array.from({ length: AREAS_MARATONA }, () => null as Row | null)
      for (const e of etapas) { const n = Number(e.slot) || 0; if (n >= 1 && n <= AREAS_MARATONA && !rows[n - 1]) rows[n - 1] = simById.get(e.simuladoId) ?? null }
    } else {
      rows = (aplicarOrdemEtapas((sims ?? []) as Row[], etapas.map((e) => e.simuladoId)).slice(0, AREAS_MARATONA)) as (Row | null)[]
    }
    if (!rows.some(Boolean)) return []
    const done = new Set<string>()
    const durPor = new Map<string, number>() // simuladoId → maior duração (seg) entre as sessões finalizadas
    const ids = rows.filter(Boolean).map((r) => (r as Row).id)
    if (estudanteId && ids.length) {
      const { data: ses } = await svc.from('simulado_sessoes_prova').select('simulado_id, iniciado_em, finalizado_em')
        .eq('estudante_id', estudanteId).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada')
        .in('simulado_id', ids)
      for (const s of (ses ?? []) as any[]) {
        done.add(s.simulado_id as string)
        if (s.iniciado_em && s.finalizado_em) {
          const d = (new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime()) / 1000
          if (d > 0) durPor.set(s.simulado_id, Math.max(durPor.get(s.simulado_id) ?? 0, d))
        }
      }
    }
    // CADERNO (download): mesma resolução da plataforma (PDF importado ou caderno gerado), gateado por
    // regras.enunciado_liberado. Endpoint idêntico ao da trilha (/api/aluno/caderno-teste-questoes).
    const enunUrls = await resolverEnunciadoUrls(svc, rows.filter(Boolean).map((r) => ({ id: (r as Row).id, regras: (r as Row).regras })))
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    return rows.map((r) => {
      if (!r) return null
      const liberacao = r.modo_aplicacao || 'aberto'
      const data = (r.data_inicio || '').slice(0, 10) || null
      const fim = (r.data_fim || '').slice(0, 10) || null
      // LIBERADA = disponível AGORA, pela aplicação do PRÓPRIO simulado: precisa estar publicado; janela
      // fixa respeita [início, fim]; aberto/prazo relativo = disponível (prazo é gateado no runtime).
      const publicado = (r.status || '') === 'publicado'
      let liberada = publicado
      if (publicado && liberacao === 'janela_fixa') liberada = (!data || hoje >= data) && (!fim || hoje <= fim)
      // ENCERRADO = janela fixa cuja data_fim já passou, ou simulado marcado como encerrado. Não dá mais
      // pra fazer nem refazer → a UI troca "Refazer/Disponível em …" por "Simulado encerrado".
      const encerrado = (r.status || '') === 'encerrado' || (liberacao === 'janela_fixa' && !!fim && hoje > fim)
      const concluido = done.has(r.id)
      const segMin = segMinPor.get(r.id) ?? 0
      const dur = durPor.get(r.id) ?? 0
      // CHECK-IN = encerrou E permaneceu ao menos o mínimo (ou etapa sem mínimo). Selo dourado.
      const checkin = concluido && (segMin <= 0 || dur >= segMin)
      const info = enunUrls.get(r.id)
      const liberadoEnun = (r.regras as any)?.enunciado_liberado !== false
      const cadernoUrl = !liberadoEnun ? null
        : info?.pdf ? info.pdf
        : (info?.temCaderno && r.embed_token) ? `/api/aluno/caderno-teste-questoes?token=${encodeURIComponent(r.embed_token)}` : null
      return {
        simuladoId: r.id, titulo: r.titulo ?? 'Simulado', rotulo: rotuloPor.get(r.id) || '',
        data, liberacao, liberada, encerrado, segMin, checkin, dur: Math.round(dur),
        fazerUrl: r.embed_token ? `/simulado/${r.embed_token}` : '',
        resultadoUrl: `/aluno/simulados/${r.id}`,
        concluido, cadernoUrl,
      }
    })
  } catch { return [] }
}

export async function carregarProgressoMaratona(svc: Svc, tenantId: string, estudanteId: string, pastaId: string | null): Promise<number> {
  if (!pastaId || !estudanteId) return 0
  try {
    const { data: sims } = await svc.from('simulado_simulados').select('id, data_inicio, created_at')
      .eq('tenant_id', tenantId).eq('pasta_id', pastaId).eq('deletado', false).is('owner_estudante_id', null)
      .order('data_inicio', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
    const etapas = await lerEtapasMaratona(svc, tenantId, pastaId)
    // Posição por ÁREA (slot): área 1..3 → simulado colocado. Sem slots → fallback por ordem.
    const temSlot = etapas.some((e) => Number(e.slot) >= 1)
    let ids: (string | null)[]
    if (temSlot) {
      ids = Array.from({ length: AREAS_MARATONA }, () => null as string | null)
      for (const e of etapas) { const n = Number(e.slot) || 0; if (n >= 1 && n <= AREAS_MARATONA && !ids[n - 1]) ids[n - 1] = e.simuladoId }
    } else {
      ids = aplicarOrdemEtapas((sims ?? []) as any[], etapas.map((e) => e.simuladoId)).map((s: any) => s.id as string).slice(0, AREAS_MARATONA)
    }
    const reais = ids.filter(Boolean) as string[]
    if (!reais.length) return 0
    // CHECK-IN por etapa = conclusão (sessão finalizada) + PERMANÊNCIA ≥ segMin (requisito de tempo). O
    // progresso/medalhas avança só nas etapas com check-in — igual ao SELO (não basta concluir correndo).
    const segMinPor = new Map(etapas.map((e) => [e.simuladoId, Math.max(0, Math.round(Number(e.segMin) || 0))]))
    const { data: ses } = await svc.from('simulado_sessoes_prova').select('simulado_id, iniciado_em, finalizado_em')
      .eq('estudante_id', estudanteId).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada')
      .in('simulado_id', reais)
    const done = new Set<string>()
    const durPor = new Map<string, number>() // maior duração (seg) entre as sessões finalizadas
    for (const s of (ses ?? []) as any[]) {
      done.add(s.simulado_id as string)
      if (s.iniciado_em && s.finalizado_em) {
        const d = (new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime()) / 1000
        if (d > 0) durPor.set(s.simulado_id, Math.max(durPor.get(s.simulado_id) ?? 0, d))
      }
    }
    const temCheckin = (id: string) => { const seg = segMinPor.get(id) ?? 0; return done.has(id) && (seg <= 0 || (durPor.get(id) ?? 0) >= seg) }
    let cur = 0
    for (const id of ids) { if (id && temCheckin(id)) cur++; else break } // prefixo sequencial por área
    return Math.min(cur, AREAS_MARATONA)
  } catch { return 0 }
}

/** TEMPO DECORRIDO DO DESAFIO (banner) = SOMA do tempo REAL que o aluno levou em cada simulado da maratona
 *  (início → finalização), em segundos. Sessões finalizadas, não-teste. 0 = nenhum simulado concluído. */
export async function carregarTempoDecorridoMaratona(svc: Svc, tenantId: string, estudanteId: string, pastaId: string | null): Promise<number> {
  if (!pastaId || !estudanteId) return 0
  try {
    const { data: sims } = await svc.from('simulado_simulados').select('id')
      .eq('tenant_id', tenantId).eq('pasta_id', pastaId).eq('deletado', false).is('owner_estudante_id', null)
    const ids = (sims ?? []).map((s: any) => s.id as string)
    if (!ids.length) return 0
    const { data: ses } = await svc.from('simulado_sessoes_prova').select('iniciado_em, finalizado_em')
      .eq('estudante_id', estudanteId).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada')
      .in('simulado_id', ids)
    let seg = 0
    for (const s of (ses ?? []) as any[]) {
      if (s.iniciado_em && s.finalizado_em) {
        const d = (new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime()) / 1000
        if (d > 0) seg += d
      }
    }
    return Math.round(seg)
  } catch { return 0 }
}

// ─── RANKING ADMIN (nomes/e-mails REAIS + detalhe por etapa p/ suporte investigar) ────────────
export interface MaratonaAdminEtapa { simuladoId: string; nome: string; segMin: number }
export interface MaratonaAdminCelula { tentativas: number; maxDur: number; tempoConta: number; checkin: boolean; refez: boolean; teveRapida: boolean; nota: number | null }
export interface MaratonaAdminLinha { estudanteId: string; nome: string; email: string | null; numero: number | null; checkins: number; etapas: (MaratonaAdminCelula | null)[] }
export interface MaratonaRankingAdminData { etapas: MaratonaAdminEtapa[]; linhas: MaratonaAdminLinha[] }

/**
 * RANKING ADMIN da maratona: nomes/e-mails REAIS (NÃO anonimiza) + detalhe por etapa — tentativas,
 * permanência (maxDur), tempo que CONTA (tentativa válida ≥ segMin pela política 'ultima'), check-in e
 * flags "refez" (>1 tentativa) / "teveRapida" (alguma tentativa < segMin). Para o suporte ver quem são,
 * quem validou o check-in, quem fez < mínimo e quem refez. NÃO cacheado (sempre fresco p/ investigação).
 */
export async function carregarRankingMaratonaAdmin(svc: Svc, tenantId: string, pastaId: string | null): Promise<MaratonaRankingAdminData> {
  if (!pastaId) return { etapas: [], linhas: [] }
  try {
    const { data: sims } = await svc.from('simulado_simulados').select('id, titulo, data_inicio, created_at')
      .eq('tenant_id', tenantId).eq('pasta_id', pastaId).eq('deletado', false).is('owner_estudante_id', null)
      .order('data_inicio', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
    const simById = new Map((sims ?? []).map((s: any) => [s.id as string, s]))
    const et = await lerEtapasMaratona(svc, tenantId, pastaId)
    // Colunas = etapas por slot (1..3); fallback = ordem por data.
    let etapaIds: string[]
    if (et.some((e) => Number(e.slot) >= 1)) {
      const arr: (string | null)[] = Array.from({ length: AREAS_MARATONA }, () => null)
      for (const e of et) { const n = Number(e.slot) || 0; if (n >= 1 && n <= AREAS_MARATONA && !arr[n - 1]) arr[n - 1] = e.simuladoId }
      etapaIds = arr.filter((x): x is string => !!x)
    } else {
      etapaIds = et.map((e) => e.simuladoId).filter((id) => simById.has(id)).slice(0, AREAS_MARATONA)
      if (!etapaIds.length) etapaIds = (sims ?? []).slice(0, AREAS_MARATONA).map((s: any) => s.id)
    }
    const segMinPor = new Map(et.map((e) => [e.simuladoId, Math.max(0, Math.round(Number(e.segMin) || 0))]))
    const rotuloPor = new Map(et.map((e) => [e.simuladoId, rotuloAplicado(e)]))
    const etapas: MaratonaAdminEtapa[] = etapaIds.map((id) => ({ simuladoId: id, nome: rotuloPor.get(id) || (simById.get(id)?.titulo ?? 'Simulado'), segMin: segMinPor.get(id) ?? 0 }))
    // nº de peito (corredores) da config da pasta
    const corredores = new Map<string, number>()
    try {
      const { data: pr } = await svc.from('simulado_pastas').select('desafio_jogo').eq('id', pastaId).eq('tenant_id', tenantId).maybeSingle()
      const cor = (pr as any)?.desafio_jogo?.config?.corredores
      if (cor && typeof cor === 'object') for (const [k, v] of Object.entries(cor)) { const n = Number(v); if (Number.isFinite(n) && n > 0) corredores.set(k, n) }
    } catch { /* sem números ainda */ }
    // Sessões finalizadas (não-teste) por etapa → por aluno
    const porEtapaAluno = new Map<string, Map<string, { nota: number; dur: number }[]>>()
    const idsSet = new Set<string>()
    for (const sid of etapaIds) {
      const ses = await fetchAll<any>(() => svc.from('simulado_sessoes_prova').select('estudante_id, nota, iniciado_em, finalizado_em')
        .eq('simulado_id', sid).eq('is_teste', false).eq('status', 'finalizada').eq('deletado', false)
        .order('id', { ascending: true }), 1000, 'maratona-admin-sessoes')
      const m = new Map<string, { nota: number; dur: number }[]>()
      for (const s of ses) {
        const dur = (s.iniciado_em && s.finalizado_em) ? Math.max(0, (new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime()) / 1000) : 0
        const arr = m.get(s.estudante_id) ?? []; arr.push({ nota: Number(s.nota ?? 0), dur }); m.set(s.estudante_id, arr); idsSet.add(s.estudante_id)
      }
      porEtapaAluno.set(sid, m)
    }
    // Nomes/e-mails REAIS (admin)
    const nomes = new Map<string, { nome: string; email: string | null }>()
    const ids = [...idsSet]
    if (ids.length) {
      const ests = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_estudantes').select('id, nome, email').in('id', chunk).order('id', { ascending: true }), { rotulo: 'maratona-admin-nomes' })
      for (const e of ests) nomes.set(e.id, { nome: e.nome ?? 'Aluno', email: e.email ?? null })
    }
    const linhas: MaratonaAdminLinha[] = ids.map((eid) => {
      const cels = etapaIds.map((sid): MaratonaAdminCelula | null => {
        const sess = porEtapaAluno.get(sid)?.get(eid)
        if (!sess || !sess.length) return null
        const segMin = segMinPor.get(sid) ?? 0
        const durs = sess.map((s) => s.dur)
        const maxDur = Math.max(...durs)
        const checkin = segMin <= 0 || maxDur >= segMin
        const validas = segMin <= 0 ? sess : sess.filter((s) => s.dur >= segMin)
        const conta = (validas.length ? validas : sess).slice(-1)[0] // política 'ultima' entre as válidas
        return { tentativas: sess.length, maxDur: Math.round(maxDur), tempoConta: Math.round(conta.dur), checkin, refez: sess.length > 1, teveRapida: segMin > 0 && durs.some((d) => d < segMin), nota: conta.nota }
      })
      const info = nomes.get(eid) ?? { nome: 'Aluno', email: null }
      return { estudanteId: eid, nome: info.nome, email: info.email, numero: corredores.get(eid) ?? null, checkins: cels.filter((c) => c?.checkin).length, etapas: cels }
    })
    const tTotal = (l: MaratonaAdminLinha) => l.etapas.reduce((a, c) => a + (c?.checkin ? c.tempoConta : 0), 0)
    linhas.sort((a, b) => (b.checkins - a.checkins) || (tTotal(a) - tTotal(b)) || a.nome.localeCompare(b.nome, 'pt-BR'))
    return { etapas, linhas }
  } catch { return { etapas: [], linhas: [] } }
}
