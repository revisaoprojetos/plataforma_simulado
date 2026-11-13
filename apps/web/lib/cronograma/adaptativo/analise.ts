import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember, chaveRelatorio } from '@/lib/cache/relatorio-cache'
import { hojeBrt, somaDias } from '@/lib/admin/revisao/datas'

// ANÁLISE DE USO do Cronograma Adaptativo (admin). Backend-first: toda agregação roda em RPC (migração 20261119030000);
// aqui só se monta a chamada, se tolera a migração ausente e se cacheia (remember, TTL curto). A página só LÊ o resultado.

export type FonteDado = 'log' | 'evento' | 'agg' | 'vivo'
export type FmtCol = 'int' | 'pct' | 'dec' | 'seg' | 'dia' | 'dh' | 'txt' | 'min'
export interface ColAn { k: string; l: string; f?: FmtCol; ord?: boolean; /** coluna de aluno: vira link p/ a ficha (usa estudante_id) */ aluno?: boolean }
export interface VisaoAn {
  id: string; rotulo: string; rpc: string; param?: string; fonte: FonteDado; cols: ColAn[]
  /** busca textual no servidor (p_busca) */ busca?: boolean
  dica?: string
  /** ordenação padrão exibida (a RPC já tem ordem default própria) */ ordPadrao?: { ord: string; dir: 'asc' | 'desc' }
}
export interface SecaoAn { id: string; rotulo: string; visoes: VisaoAn[] }

const P = 'simulado_cronograma_adaptativo_an_'
const CFG_COLS: ColAn[] = [{ k: 'valor', l: 'Valor', f: 'txt', ord: true }, { k: 'n', l: 'Planos', f: 'int', ord: true }, { k: 'pct', l: '% dos planos', f: 'pct', ord: true }]
const PROG_COLS: ColAn[] = [
  { k: 'rotulo', l: '', f: 'txt', ord: true }, { k: 'planejadas', l: 'Planejadas', f: 'int', ord: true }, { k: 'feitas', l: 'Feitas', f: 'int', ord: true },
  { k: 'pct_feitas', l: '% feitas', f: 'pct', ord: true }, { k: 'nao_realizadas', l: 'Não realizadas', f: 'int', ord: true }, { k: 'atrasadas', l: 'Atrasadas', f: 'int', ord: true },
]
const com = (cols: ColAn[], rotulo: string): ColAn[] => cols.map((c, i) => (i === 0 ? { ...c, l: rotulo } : c))

export const SECOES: SecaoAn[] = [
  { id: 'geracao', rotulo: 'Geração', visoes: [
    { id: 'dia', rotulo: 'Por dia', rpc: P + 'ger_dia', fonte: 'log', ordPadrao: { ord: 'dia', dir: 'desc' }, dica: 'Gerados = cronogramas novos; recalculados = "gerar de novo" ou retomar pausa; migrados = correção automática de catálogo; sync = auto-save do app embutido (só quando a grade mudou).', cols: [
      { k: 'dia', l: 'Dia', f: 'dia', ord: true }, { k: 'gerados', l: 'Gerados', f: 'int', ord: true }, { k: 'recalculados', l: 'Recalculados', f: 'int', ord: true }, { k: 'migrados', l: 'Migrados', f: 'int' },
      { k: 'sincs', l: 'Sync', f: 'int' }, { k: 'outras', l: 'Fixar/arquivar/pausar/apagar', f: 'int' }, { k: 'falhas', l: 'Falhas', f: 'int', ord: true },
      { k: 'ms_medio', l: 'Tempo médio (ms)', f: 'int', ord: true }, { k: 'metas_medio', l: 'Metas por plano', f: 'int', ord: true }] },
    { id: 'falhas', rotulo: 'Falhas e causas', rpc: P + 'ger_falhas', fonte: 'log', busca: true, ordPadrao: { ord: 'n', dir: 'desc' }, cols: [
      { k: 'causa', l: 'Causa', f: 'txt', ord: true }, { k: 'acao', l: 'Ação', f: 'txt' }, { k: 'n', l: 'Ocorrências', f: 'int', ord: true }, { k: 'alunos', l: 'Alunos', f: 'int', ord: true }, { k: 'ultima', l: 'Última', f: 'dh', ord: true }] },
    { id: 'alunos', rotulo: 'Quem mais regenera', rpc: P + 'ger_alunos', fonte: 'log', busca: true, ordPadrao: { ord: 'regeracoes', dir: 'desc' }, cols: [
      { k: 'nome', l: 'Aluno', f: 'txt', ord: true, aluno: true }, { k: 'email', l: 'E-mail', f: 'txt' }, { k: 'regeracoes', l: 'Recálculos', f: 'int', ord: true }, { k: 'geracoes', l: 'Gerações', f: 'int', ord: true },
      { k: 'falhas', l: 'Falhas', f: 'int', ord: true }, { k: 'ultima', l: 'Última', f: 'dh', ord: true }] },
    { id: 'versoes', rotulo: 'Motor e catálogo', rpc: P + 'ger_versoes', fonte: 'log', busca: true, ordPadrao: { ord: 'planos_atuais', dir: 'desc' }, dica: 'Planos atuais vêm do cadastro dos planos (existem desde sempre); gerações e tempo vêm do registro novo.', cols: [
      { k: 'motor', l: 'Motor', f: 'txt', ord: true }, { k: 'catalogo', l: 'Catálogo', f: 'txt' }, { k: 'planos_atuais', l: 'Planos atuais', f: 'int', ord: true }, { k: 'geracoes', l: 'Gerações no período', f: 'int', ord: true },
      { k: 'falhas', l: 'Falhas', f: 'int', ord: true }, { k: 'ms_medio', l: 'Tempo médio (ms)', f: 'int', ord: true }, { k: 'metas_medio', l: 'Metas por plano', f: 'int' }] },
  ] },
  { id: 'config', rotulo: 'Configuração dos alunos', visoes: [
    { id: 'horas_dia', rotulo: 'Horas por dia', rpc: P + 'config', param: 'horas_dia', fonte: 'vivo', cols: com(CFG_COLS, 'Média semanal') },
    { id: 'vel', rotulo: 'Velocidade (vel)', rpc: P + 'config', param: 'vel', fonte: 'vivo', cols: com(CFG_COLS, 'Velocidade') },
    { id: 'revisao', rotulo: 'Revisão', rpc: P + 'config', param: 'revisao', fonte: 'vivo', cols: com(CFG_COLS, 'Revisão') },
    { id: 'recesso', rotulo: 'Recesso', rpc: P + 'config', param: 'recesso', fonte: 'vivo', cols: com(CFG_COLS, 'Recesso') },
    { id: 'pausa', rotulo: 'Pausa', rpc: P + 'config', param: 'pausa', fonte: 'vivo', cols: com(CFG_COLS, 'Situação') },
    { id: 'arranjo', rotulo: 'Arranjo', rpc: P + 'config', param: 'arranjo', fonte: 'vivo', cols: com(CFG_COLS, 'Arranjo') },
    { id: 'metas', rotulo: 'Tipos de meta ligados', rpc: P + 'config', param: 'metas', fonte: 'vivo', cols: com(CFG_COLS, 'Tipo de meta') },
    { id: 'materias', rotulo: 'Matérias escolhidas', rpc: P + 'config', param: 'materias', fonte: 'vivo', busca: true, ordPadrao: { ord: 'n', dir: 'desc' }, cols: com(CFG_COLS, 'Matéria') },
  ] },
  { id: 'progresso', rotulo: 'Progresso', visoes: [
    { id: 'turma', rotulo: 'Por turma', rpc: P + 'prog', param: 'turma', fonte: 'agg', busca: true, cols: com(PROG_COLS, 'Turma') },
    { id: 'materia', rotulo: 'Por matéria', rpc: P + 'prog', param: 'materia', fonte: 'agg', busca: true, cols: com(PROG_COLS, 'Matéria') },
    { id: 'tipo', rotulo: 'Por tipo de meta', rpc: P + 'prog', param: 'tipo', fonte: 'agg', cols: com(PROG_COLS, 'Tipo') },
    { id: 'semana', rotulo: 'Por semana', rpc: P + 'prog', param: 'semana', fonte: 'agg', cols: com(PROG_COLS, 'Semana') },
    { id: 'funil', rotulo: 'Funil', rpc: P + 'funil', fonte: 'vivo', dica: 'Considera só as metas que já venceram (data prevista até hoje), somando os cronogramas ativos de cada aluno.', cols: [
      { k: 'etapa', l: 'Etapa', f: 'txt' }, { k: 'alunos', l: 'Alunos', f: 'int' }, { k: 'pct', l: '% dos alunos com cronograma', f: 'pct' }] },
    { id: 'parados', rotulo: 'Alunos parados', rpc: P + 'parados', param: 'dias', fonte: 'vivo', busca: true, ordPadrao: { ord: 'dias_parado', dir: 'desc' }, dica: 'Cronogramas ativos (não pausados) com metas vencidas pendentes e sem nenhuma marcação ou tempo de estudo nos últimos N dias.', cols: [
      { k: 'nome', l: 'Aluno', f: 'txt', ord: true, aluno: true }, { k: 'dias_parado', l: 'Dias parado', f: 'int', ord: true }, { k: 'ultima', l: 'Última atividade', f: 'dh' },
      { k: 'atrasadas', l: 'Atrasadas', f: 'int', ord: true }, { k: 'feitas', l: 'Feitas', f: 'int', ord: true }, { k: 'vencidas', l: 'Vencidas', f: 'int', ord: true },
      { k: 'fixado', l: 'Fixado', f: 'txt' }, { k: 'planos_n', l: 'Planos do aluno', f: 'int', ord: true }] },
    { id: 'fixacao', rotulo: 'Fixados × não, multi-plano', rpc: P + 'fixacao', fonte: 'vivo', cols: [
      { k: 'rotulo', l: '', f: 'txt' }, { k: 'planos', l: 'Planos', f: 'int' }, { k: 'alunos', l: 'Alunos', f: 'int' }, { k: 'vencidas', l: 'Metas vencidas', f: 'int' }, { k: 'feitas', l: 'Feitas', f: 'int' }, { k: 'pct_feitas', l: '% feitas', f: 'pct' }] },
    { id: 'marcacoes', rotulo: 'Marcações por dia', rpc: P + 'ev_dia', fonte: 'evento', ordPadrao: { ord: 'dia', dir: 'desc' }, dica: 'Registro de marcar/desmarcar feito pelo botão da meta e pelo painel. Marcações enviadas pelo app embutido ainda não entram aqui.', cols: [
      { k: 'dia', l: 'Dia', f: 'dia', ord: true }, { k: 'concluidas', l: 'Concluídas', f: 'int', ord: true }, { k: 'nao_realizadas', l: 'Não realizadas', f: 'int', ord: true }, { k: 'desmarcadas', l: 'Desmarcadas', f: 'int', ord: true }, { k: 'alunos', l: 'Alunos', f: 'int', ord: true }] },
  ] },
  { id: 'atraso', rotulo: 'Atraso real', visoes: [
    { id: 'tipo', rotulo: 'Por tipo de meta', rpc: P + 'atraso', param: 'tipo', fonte: 'vivo', ordPadrao: { ord: 'concluidas', dir: 'desc' }, dica: 'Atraso = dia em que o aluno concluiu − dia previsto (0 quando em dia ou adiantado). Só metas concluídas no período.', cols: [
      { k: 'rotulo', l: 'Tipo', f: 'txt', ord: true }, { k: 'concluidas', l: 'Concluídas', f: 'int', ord: true }, { k: 'no_prazo_pct', l: 'No prazo', f: 'pct', ord: true },
      { k: 'mediana_dias', l: 'Mediana (dias)', f: 'dec', ord: true }, { k: 'p90_dias', l: 'P90 (dias)', f: 'dec', ord: true }, { k: 'max_dias', l: 'Máximo (dias)', f: 'int', ord: true }] },
    { id: 'disciplina', rotulo: 'Por matéria', rpc: P + 'atraso', param: 'disciplina', fonte: 'vivo', busca: true, ordPadrao: { ord: 'concluidas', dir: 'desc' }, cols: [
      { k: 'rotulo', l: 'Matéria', f: 'txt', ord: true }, { k: 'concluidas', l: 'Concluídas', f: 'int', ord: true }, { k: 'no_prazo_pct', l: 'No prazo', f: 'pct', ord: true },
      { k: 'mediana_dias', l: 'Mediana (dias)', f: 'dec', ord: true }, { k: 'p90_dias', l: 'P90 (dias)', f: 'dec', ord: true }, { k: 'max_dias', l: 'Máximo (dias)', f: 'int', ord: true }] },
  ] },
  { id: 'desempenho', rotulo: 'Desempenho', visoes: [
    ...(['materia', 'aula', 'turma'] as const).map((v): VisaoAn => ({
      id: v, rotulo: v === 'materia' ? 'Por matéria' : v === 'aula' ? 'Por aula' : 'Por turma', rpc: P + 'desempenho', param: v, fonte: 'vivo', busca: true, ordPadrao: { ord: 'metas', dir: 'desc' },
      dica: 'Acerto = (resolvidas − erradas) / resolvidas, das metas com questões anotadas pelo aluno. Estrelas = dificuldade percebida (0–5).',
      cols: [{ k: 'rotulo', l: v === 'materia' ? 'Matéria' : v === 'aula' ? 'Aula' : 'Turma', f: 'txt', ord: true }, ...(v === 'aula' ? [{ k: 'detalhe', l: 'Matéria', f: 'txt' } as ColAn] : []),
        { k: 'metas', l: 'Metas', f: 'int', ord: true }, { k: 'alunos', l: 'Alunos', f: 'int', ord: true }, { k: 'res', l: 'Resolvidas', f: 'int', ord: true }, { k: 'err', l: 'Erradas', f: 'int', ord: true },
        { k: 'acerto_pct', l: 'Acerto', f: 'pct', ord: true }, { k: 'estrelas_media', l: 'Estrelas', f: 'dec', ord: true }, { k: 'grau_medio', l: 'Grau (0–10)', f: 'dec', ord: true }],
    })),
  ] },
  { id: 'tempo', rotulo: 'Tempo e material', visoes: [
    { id: 'tempo_materia', rotulo: 'Planejado × real (matéria)', rpc: P + 'prog', param: 'materia', fonte: 'agg', busca: true, ordPadrao: { ord: 'tempo_real_seg', dir: 'desc' }, cols: [
      { k: 'rotulo', l: 'Matéria', f: 'txt', ord: true }, { k: 'planejadas', l: 'Metas', f: 'int', ord: true }, { k: 'tempo_plan_seg', l: 'Tempo planejado', f: 'seg', ord: true }, { k: 'tempo_real_seg', l: 'Tempo real (modo foco)', f: 'seg', ord: true }] },
    { id: 'tempo_tipo', rotulo: 'Planejado × real (tipo)', rpc: P + 'prog', param: 'tipo', fonte: 'agg', ordPadrao: { ord: 'tempo_real_seg', dir: 'desc' }, cols: [
      { k: 'rotulo', l: 'Tipo', f: 'txt', ord: true }, { k: 'planejadas', l: 'Metas', f: 'int', ord: true }, { k: 'tempo_plan_seg', l: 'Tempo planejado', f: 'seg', ord: true }, { k: 'tempo_real_seg', l: 'Tempo real (modo foco)', f: 'seg', ord: true }] },
    { id: 'ritmo', rotulo: 'Ritmo real × vel', rpc: P + 'ritmo', fonte: 'vivo', ordPadrao: { ord: 'metas', dir: 'desc' }, dica: 'Só metas concluídas com tempo medido. Razão = tempo real / tempo planejado (1,0 = ritmo previsto; acima = mais lento).', cols: [
      { k: 'vel', l: 'Velocidade (vel)', f: 'txt' }, { k: 'planos', l: 'Planos', f: 'int', ord: true }, { k: 'metas', l: 'Metas medidas', f: 'int', ord: true }, { k: 'planejado_seg', l: 'Planejado', f: 'seg', ord: true }, { k: 'real_seg', l: 'Real', f: 'seg', ord: true }, { k: 'razao', l: 'Razão real/plan.', f: 'dec', ord: true }] },
    { id: 'sem_doc', rotulo: 'Metas sem documento', rpc: P + 'sem_doc', fonte: 'vivo', busca: true, ordPadrao: { ord: 'metas', dir: 'desc' }, dica: 'Metas de leitura (PDFull, PDFlash, revisão, LegProc) que não apontam para um documento da Biblioteca.', cols: [
      { k: 'tipo', l: 'Tipo', f: 'txt' }, { k: 'disciplina', l: 'Matéria', f: 'txt', ord: true }, { k: 'titulo', l: 'Aula / lei', f: 'txt', ord: true }, { k: 'metas', l: 'Metas', f: 'int', ord: true }, { k: 'alunos', l: 'Alunos', f: 'int', ord: true }] },
    { id: 'orfas', rotulo: 'Progresso órfão', rpc: P + 'orfas', fonte: 'vivo', busca: true, ordPadrao: { ord: 'orfas', dir: 'desc' }, dica: 'Registros de progresso cuja meta saiu da grade do plano (ficam guardados, mas não contam).', cols: [
      { k: 'nome', l: 'Aluno', f: 'txt', ord: true, aluno: true }, { k: 'email', l: 'E-mail', f: 'txt' }, { k: 'orfas', l: 'Órfãs', f: 'int', ord: true }, { k: 'orfas_feitas', l: 'Já concluídas', f: 'int', ord: true }] },
  ] },
]

export const secaoDe = (id: string | undefined): SecaoAn => SECOES.find((s) => s.id === id) ?? SECOES[0]
export const visaoDe = (s: SecaoAn, id: string | undefined): VisaoAn => s.visoes.find((v) => v.id === id) ?? s.visoes[0]

export interface FiltroAn { de: string | null; ate: string | null; grupo: string | null; disc: string | null; tipo: string | null; motor: string | null; dias: number }
export interface ListaAn { migrado: boolean; erro?: string; rows: Array<Record<string, unknown>>; total: number }
export interface ResumoAn {
  migrado: boolean; erro?: string
  alunos_com_plano: number; planos_ativos: number; planos_fixados: number; alunos_multiplano: number; planos_pausados: number
  geracoes: number; recalculos: number; falhas: number
  planejadas: number; feitas: number; pct_feitas: number | null; acerto_pct: number | null; nao_realizadas: number; atrasadas: number; tempo_plan_seg: number; tempo_real_seg: number; res: number; err: number
  parados: number; marcacoes: number; desmarcacoes: number
  log_desde: string | null; eventos_desde: string | null; agg_atualizado: string | null; agg_linhas: number
}

const ausente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || e.code === '42P01' || /could not find the function|does not exist|schema cache/i.test(e.message || ''))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Sanitiza o filtro vindo da URL (valores desconhecidos viram null). */
export function normalizarFiltro(raw: { de?: string; ate?: string; grupo?: string; disc?: string; tipo?: string; motor?: string; dias?: string }): FiltroAn {
  const dias = Math.trunc(Number(raw.dias))
  return {
    de: raw.de && ISO.test(raw.de) ? raw.de : null, ate: raw.ate && ISO.test(raw.ate) ? raw.ate : null,
    grupo: raw.grupo && UUID.test(raw.grupo) ? raw.grupo : null,
    disc: raw.disc ? raw.disc.slice(0, 120) : null,
    tipo: raw.tipo && /^[a-z]{2}$/.test(raw.tipo) ? raw.tipo : null,
    motor: raw.motor && /^[\w.\-]{1,20}$/.test(raw.motor) ? raw.motor : null,
    dias: Number.isFinite(dias) && dias >= 1 && dias <= 365 ? dias : 7,
  }
}

export const PERIODOS_AN: Array<{ v: string; l: string }> = [{ v: '7', l: 'Últimos 7 dias' }, { v: '30', l: 'Últimos 30 dias' }, { v: '90', l: 'Últimos 90 dias' }, { v: '180', l: 'Últimos 180 dias' }, { v: 'tudo', l: 'Desde o início' }]
/** Período da URL → intervalo de datas (BRT). Padrão 30 dias; termina hoje (metas futuras não entram nos percentuais). */
export function periodoParaDatas(p: string | undefined): { de: string | null; ate: string } {
  const hoje = hojeBrt()
  if (p === 'tudo') return { de: null, ate: hoje }
  const n = PERIODOS_AN.some((x) => x.v === p) ? Number(p) : 30
  return { de: somaDias(hoje, -(n - 1)), ate: hoje }
}

const hash = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 16)

/** Consulta paginada de uma visão. `semCache` = exportação CSV. TTL curto (5 min); degrada se a migração faltar. */
export async function consultarVisao(svc: SupabaseClient, tenantId: string, v: VisaoAn, f: FiltroAn, o: { q?: string; ord?: string; dir?: string; pag?: number; pp?: number; semCache?: boolean }): Promise<ListaAn> {
  const pp = Math.min(Math.max(o.pp ?? 14, 1), 5000)
  const pag = Math.max(o.pag ?? 1, 1)
  const ordValida = o.ord && v.cols.some((c) => c.k === o.ord && c.ord) ? o.ord : v.ordPadrao?.ord ?? null
  const dir = ordValida === o.ord ? (o.dir === 'asc' ? 'asc' : 'desc') : v.ordPadrao?.dir ?? 'desc'
  const args = {
    p_tenant: tenantId, p_de: f.de, p_ate: f.ate, p_grupo: f.grupo, p_disciplina: f.disc, p_tipo: f.tipo, p_motor: f.motor,
    p_busca: v.busca && o.q ? o.q.slice(0, 80) : null, p_ordem: ordValida, p_dir: dir, p_limite: pp, p_offset: (pag - 1) * pp,
    p_param: v.param === 'dias' ? String(f.dias) : v.param ?? null,
  }
  const calc = async (): Promise<ListaAn> => {
    const { data, error } = await svc.rpc(v.rpc, args)
    if (error) return ausente(error) ? { migrado: false, rows: [], total: 0 } : { migrado: true, erro: error.message, rows: [], total: 0 }
    const rows = (data ?? []) as Array<Record<string, unknown>>
    return { migrado: true, rows, total: Number(rows[0]?.total_linhas ?? 0) }
  }
  if (o.semCache) return calc()
  return remember(chaveRelatorio(tenantId, 'adaptativo-an', v.rpc.replace(P, ''), hash(args)), 300, calc)
}

export async function carregarResumo(svc: SupabaseClient, tenantId: string, f: FiltroAn): Promise<ResumoAn> {
  const vazio: ResumoAn = { migrado: false, alunos_com_plano: 0, planos_ativos: 0, planos_fixados: 0, alunos_multiplano: 0, planos_pausados: 0, geracoes: 0, recalculos: 0, falhas: 0,
    planejadas: 0, feitas: 0, pct_feitas: null, acerto_pct: null, nao_realizadas: 0, atrasadas: 0, tempo_plan_seg: 0, tempo_real_seg: 0, res: 0, err: 0, parados: 0, marcacoes: 0, desmarcacoes: 0,
    log_desde: null, eventos_desde: null, agg_atualizado: null, agg_linhas: 0 }
  const args = { p_tenant: tenantId, p_de: f.de, p_ate: f.ate, p_grupo: f.grupo, p_disciplina: f.disc, p_tipo: f.tipo, p_motor: f.motor, p_param: String(f.dias) }
  return remember(chaveRelatorio(tenantId, 'adaptativo-an', 'resumo', hash(args)), 300, async () => {
    const { data, error } = await svc.rpc(P + 'resumo', args)
    if (error) return ausente(error) ? vazio : { ...vazio, migrado: true, erro: error.message }
    return { ...vazio, ...((data ?? {}) as Partial<ResumoAn>), migrado: true }
  })
}

export interface OpcoesAn { disciplinas: string[]; motores: string[] }
export async function carregarOpcoes(svc: SupabaseClient, tenantId: string): Promise<OpcoesAn> {
  return remember(chaveRelatorio(tenantId, 'adaptativo-an', 'opcoes'), 600, async () => {
    const { data, error } = await svc.rpc(P + 'opcoes', { p_tenant: tenantId })
    if (error || !data) return { disciplinas: [], motores: [] }
    const d = data as Partial<OpcoesAn>
    return { disciplinas: Array.isArray(d.disciplinas) ? d.disciplinas : [], motores: Array.isArray(d.motores) ? d.motores : [] }
  })
}

// ── formatação (pura; usada pela página e pelo CSV) ─────────────────────────────────────────────
const MS_H = 3600e3
const dataBrIso = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
export function formatarValor(f: FmtCol | undefined, v: unknown): string {
  if (v == null || v === '') return '—'
  switch (f) {
    case 'int': return Number(v).toLocaleString('pt-BR')
    case 'pct': return `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
    case 'dec': return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
    case 'seg': { const s = Math.round(Number(v)); const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min` }
    case 'min': return `${Math.round(Number(v) / 60)} min`
    case 'dia': return dataBrIso(String(v))
    case 'dh': { const iso = new Date(new Date(String(v)).getTime() - 3 * MS_H).toISOString(); return `${dataBrIso(iso)} ${iso.slice(11, 16)}` }
    default: return typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : String(v)
  }
}

/** CSV (separador ';', BOM p/ Excel pt-BR) com os valores crus das colunas da visão. */
export function paraCsv(v: VisaoAn, rows: Array<Record<string, unknown>>): string {
  const esc = (x: unknown) => { const s = x == null ? '' : typeof x === 'boolean' ? (x ? 'Sim' : 'Não') : String(x); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const cab = v.cols.map((c) => esc(c.l)).join(';')
  const linhas = rows.map((r) => v.cols.map((c) => esc(c.f === 'dia' || c.f === 'dh' ? formatarValor(c.f, r[c.k]) : r[c.k])).join(';'))
  return '﻿' + [cab, ...linhas].join('\r\n')
}
