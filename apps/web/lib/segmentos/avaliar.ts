import 'server-only'
import { fetchAll } from '@/lib/supabase/fetch-all'
import {
  CAMPO_POR_ID, SEM_VALOR, VALOR_EM_DIAS, normalizarRegra,
  type Condicao, type RegraSegmento,
} from './tipos'

/**
 * Avaliação de SEGMENTOS para UM aluno. Cada fato (cadastro, grupos, assinaturas, sessões, questões,
 * leitura, tempo de estudo…) só é buscado quando alguma condição precisa dele, e uma única vez por
 * contexto (memo). Grupos e condições usam curto-circuito (E para no 1º falso, OU no 1º verdadeiro).
 * Erro de leitura de um fato = fato vazio (a condição avalia como se o aluno não tivesse o dado).
 */

const DIA = 86400000
const TZ = 'America/Sao_Paulo'

/** 'YYYY-MM-DD' no fuso de Brasília (datas puras 'YYYY-MM-DD' passam direto). */
function diaBrt(v: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = new Date(v)
  if (isNaN(+d)) return null
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}
function instante(v: string): number {
  // Data pura = meio-dia de Brasília (evita "virar o dia" nas contas de X dias).
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return Date.parse(`${v}T12:00:00-03:00`)
  return Date.parse(v)
}
function norm(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

type Membro = { criado_em: string | null; expira_em: string | null }
type Assinatura = { produto_id: string; status: string; inicio_em: string | null; criado_em: string | null; expira_em: string | null }
type Sessao = { id: string; simulado_id: string; nota: number | null; finalizado_em: string | null }

export class ContextoAluno {
  private memo = new Map<string, Promise<any>>()
  constructor(readonly svc: any, readonly tenantId: string, readonly estudanteId: string) {}

  private m<T>(k: string, f: () => Promise<T>, vazio: T): Promise<T> {
    let p = this.memo.get(k)
    if (!p) { p = f().catch(() => vazio); this.memo.set(k, p) }
    return p as Promise<T>
  }

  estudante(): Promise<Record<string, any> | null> {
    return this.m('est', async () => {
      const { data } = await this.svc.from('simulado_estudantes')
        .select('nome, email, telefone, classificacao, origem_provider, created_at, data_nascimento')
        .eq('tenant_id', this.tenantId).eq('id', this.estudanteId).maybeSingle()
      return (data as any) ?? null
    }, null)
  }

  /** grupo_id → participação (entrada mais antiga; vencimento: sem prazo vence, senão o mais distante). */
  grupos(): Promise<Map<string, Membro>> {
    return this.m('grp', async () => {
      const { data } = await this.svc.from('simulado_grupo_membros').select('grupo_id, criado_em, expira_em')
        .eq('tenant_id', this.tenantId).eq('estudante_id', this.estudanteId)
      const out = new Map<string, Membro>()
      for (const r of (data ?? []) as any[]) {
        const cur = out.get(r.grupo_id)
        if (!cur) { out.set(r.grupo_id, { criado_em: r.criado_em ?? null, expira_em: r.expira_em ?? null }); continue }
        if (r.criado_em && (!cur.criado_em || r.criado_em < cur.criado_em)) cur.criado_em = r.criado_em
        cur.expira_em = cur.expira_em === null || r.expira_em == null ? null : (r.expira_em > cur.expira_em ? r.expira_em : cur.expira_em)
      }
      return out
    }, new Map())
  }

  assinaturas(): Promise<Assinatura[]> {
    return this.m('ass', async () => {
      const { data } = await this.svc.from('simulado_assinaturas').select('produto_id, status, inicio_em, criado_em, expira_em')
        .eq('tenant_id', this.tenantId).eq('estudante_id', this.estudanteId).not('produto_id', 'is', null)
      return (data ?? []) as Assinatura[]
    }, [])
  }

  /** Assinatura ATIVA (status ativo e não vencida) do produto — a de prazo mais longo. */
  async assinaturaAtiva(produtoId: string): Promise<Assinatura | null> {
    const agora = new Date().toISOString()
    const ativas = (await this.assinaturas()).filter((a) => a.produto_id === produtoId && a.status === 'ativo' && (!a.expira_em || a.expira_em > agora))
    if (!ativas.length) return null
    return ativas.sort((a, b) => (a.expira_em === null ? -1 : b.expira_em === null ? 1 : a.expira_em > b.expira_em ? -1 : 1))[0]
  }

  sessoes(): Promise<Sessao[]> {
    return this.m('ses', async () => fetchAll<Sessao>(() => this.svc.from('simulado_sessoes_prova')
      .select('id, simulado_id, nota, finalizado_em')
      .eq('tenant_id', this.tenantId).eq('estudante_id', this.estudanteId)
      .eq('status', 'finalizada').eq('is_teste', false).eq('deletado', false)
      .order('id', { ascending: true }), 1000, 'segmento:sessoes'), [])
  }

  /** Questões respondidas (avulsas + de simulados) e corretas, opcionalmente nos últimos `dias`. */
  questoes(dias: number | null): Promise<{ total: number; corretas: number }> {
    return this.m(`q:${dias ?? ''}`, async () => {
      const desde = dias ? new Date(Date.now() - dias * DIA).toISOString() : null
      const conta = async (build: () => any): Promise<number> => { const r = await build(); return r.error ? 0 : (r.count ?? 0) }
      const avulsas = (correta: boolean) => conta(() => {
        let q = this.svc.from('simulado_respostas_avulsas').select('id', { count: 'exact', head: true })
          .eq('tenant_id', this.tenantId).eq('estudante_id', this.estudanteId)
        if (correta) q = q.eq('correta', true)
        if (desde) q = q.gte('respondido_em', desde)
        return q
      })
      // Respostas de simulado: pelas sessões do aluno (todas as não-teste, finalizadas ou não).
      const { data: ses } = await this.svc.from('simulado_sessoes_prova').select('id')
        .eq('tenant_id', this.tenantId).eq('estudante_id', this.estudanteId).eq('is_teste', false).eq('deletado', false).limit(2000)
      const ids = ((ses ?? []) as any[]).map((s) => s.id as string)
      let total = await avulsas(false), corretas = await avulsas(true)
      for (let i = 0; i < ids.length; i += 100) {
        const lote = ids.slice(i, i + 100)
        const build = (correta: boolean) => () => {
          let q = this.svc.from('simulado_respostas_objetivas').select('id', { count: 'exact', head: true }).in('sessao_id', lote)
          if (correta) q = q.eq('correta', true)
          if (desde) q = q.gte('respondido_em', desde)
          return q
        }
        total += await conta(build(false)); corretas += await conta(build(true))
      }
      return { total, corretas }
    }, { total: 0, corretas: 0 })
  }

  leituras(): Promise<{ documento_id: string; ultima_leitura_em: string | null }[]> {
    return this.m('lei', async () => {
      const { data } = await this.svc.from('simulado_conteudo_leitura_progresso').select('documento_id, ultima_leitura_em')
        .eq('tenant_id', this.tenantId).eq('aluno_id', this.estudanteId).limit(5000)
      return (data ?? []) as any[]
    }, [])
  }

  tempoEstudo(): Promise<{ dia: string; segundos: number }[]> {
    return this.m('tmp', async () => {
      const { data } = await this.svc.from('simulado_tempo_estudo').select('dia, segundos')
        .eq('tenant_id', this.tenantId).eq('estudante_id', this.estudanteId).limit(5000)
      return (data ?? []) as any[]
    }, [])
  }

  matricula(produtoId: string): Promise<string | null> {
    return this.m(`mat:${produtoId}`, async () => {
      const { matriculaNoProduto } = await import('@/lib/produtos/curriculo-aluno')
      const d = await matriculaNoProduto(this.svc, this.tenantId, this.estudanteId, produtoId)
      return d ? d.toISOString() : null
    }, null)
  }

  /** % das aulas-documento ATIVAS do currículo do produto que o aluno já abriu. */
  progresso(produtoId: string): Promise<number> {
    return this.m(`prog:${produtoId}`, async () => {
      const { data } = await this.svc.from('simulado_produto_modulo_itens').select('ref_id')
        .eq('tenant_id', this.tenantId).eq('produto_id', produtoId).eq('deletado', false).eq('situacao', 'ativo')
        .eq('tipo_ref', 'documento_biblioteca').not('ref_id', 'is', null).limit(5000)
      const docs = new Set(((data ?? []) as any[]).map((r) => r.ref_id as string))
      if (!docs.size) return 0
      const lidos = (await this.leituras()).filter((l) => docs.has(l.documento_id)).length
      return Math.round((lidos / docs.size) * 1000) / 10
    }, 0)
  }
}

// ── Valor do campo para o aluno ──
type Valor = { tipo: 'texto' | 'data'; v: string | null } | { tipo: 'numero'; v: number } | { tipo: 'relacao'; v: boolean }

async function valorDoCampo(c: Condicao, ctx: ContextoAluno): Promise<Valor> {
  const desde = c.dias ? Date.now() - Number(c.dias) * DIA : null
  const est = () => ctx.estudante()
  switch (c.campo) {
    case 'aluno_nome': return { tipo: 'texto', v: (await est())?.nome ?? null }
    case 'aluno_email': return { tipo: 'texto', v: (await est())?.email ?? null }
    case 'aluno_telefone': return { tipo: 'texto', v: (await est())?.telefone ?? null }
    case 'aluno_classificacao': return { tipo: 'texto', v: (await est())?.classificacao ?? null }
    case 'aluno_origem': return { tipo: 'texto', v: (await est())?.origem_provider ?? null }
    case 'aluno_cadastro': return { tipo: 'data', v: (await est())?.created_at ?? null }
    case 'aluno_nascimento': return { tipo: 'data', v: (await est())?.data_nascimento ?? null }
    case 'grupo': {
      const ids = c.refs?.length ? c.refs : c.ref ? [c.ref] : []
      const gr = await ctx.grupos(), agora = new Date().toISOString()
      return { tipo: 'relacao', v: ids.some((id) => { const m = gr.get(id); return !!m && (!m.expira_em || m.expira_em > agora) }) }
    }
    case 'grupo_entrada': return { tipo: 'data', v: c.ref ? (await ctx.grupos()).get(c.ref)?.criado_em ?? null : null }
    case 'grupo_expira': return { tipo: 'data', v: c.ref ? (await ctx.grupos()).get(c.ref)?.expira_em ?? null : null }
    case 'assinatura': {
      const ids = c.refs?.length ? c.refs : c.ref ? [c.ref] : []
      for (const id of ids) if (await ctx.assinaturaAtiva(id)) return { tipo: 'relacao', v: true }
      return { tipo: 'relacao', v: false }
    }
    case 'assinatura_inicio': {
      const a = c.ref ? await ctx.assinaturaAtiva(c.ref) : null
      return { tipo: 'data', v: a ? (a.inicio_em ?? a.criado_em) : null }
    }
    case 'assinatura_expira': return { tipo: 'data', v: c.ref ? (await ctx.assinaturaAtiva(c.ref))?.expira_em ?? null : null }
    case 'matricula_produto': return { tipo: 'data', v: c.ref ? await ctx.matricula(c.ref) : null }
    case 'simulados_feitos': {
      const ses = (await ctx.sessoes()).filter((s) => (!c.ref || s.simulado_id === c.ref) && (!desde || (s.finalizado_em && Date.parse(s.finalizado_em) >= desde)))
      return { tipo: 'numero', v: ses.length }
    }
    case 'simulado_nota': {
      const notas = (await ctx.sessoes()).filter((s) => s.simulado_id === c.ref && s.nota != null).map((s) => Number(s.nota))
      return { tipo: 'numero', v: notas.length ? Math.max(...notas) : 0 }
    }
    case 'questoes_respondidas': return { tipo: 'numero', v: (await ctx.questoes(c.dias ?? null)).total }
    case 'questoes_acerto': {
      const q = await ctx.questoes(c.dias ?? null)
      return { tipo: 'numero', v: q.total ? Math.round((q.corretas / q.total) * 1000) / 10 : 0 }
    }
    case 'documentos_lidos': {
      const l = (await ctx.leituras()).filter((r) => !desde || (r.ultima_leitura_em && Date.parse(r.ultima_leitura_em) >= desde))
      return { tipo: 'numero', v: new Set(l.map((r) => r.documento_id)).size }
    }
    case 'progresso_produto': return { tipo: 'numero', v: c.ref ? await ctx.progresso(c.ref) : 0 }
    case 'tempo_estudo': {
      const dMin = desde ? new Date(desde).toLocaleDateString('en-CA', { timeZone: TZ }) : null
      const seg = (await ctx.tempoEstudo()).filter((r) => !dMin || r.dia >= dMin).reduce((s, r) => s + (Number(r.segundos) || 0), 0)
      return { tipo: 'numero', v: Math.round((seg / 3600) * 10) / 10 }
    }
    case 'data_atual': return { tipo: 'data', v: new Date().toISOString() }
    default: return { tipo: 'texto', v: null }
  }
}

function compara(c: Condicao, val: Valor): boolean {
  const op = c.operador
  if (val.tipo === 'relacao') return op === 'nao_possui' ? !val.v : val.v
  if (op === 'existe') return val.tipo === 'numero' ? val.v > 0 : val.v !== null && String(val.v).trim() !== ''
  if (op === 'nao_existe') return val.tipo === 'numero' ? val.v <= 0 : val.v === null || String(val.v).trim() === ''

  if (val.tipo === 'numero') {
    const a = Number(c.valor), b = Number(c.valor2), v = val.v
    if (isNaN(a)) return false
    switch (op) {
      case 'igual': return v === a
      case 'diferente': return v !== a
      case 'maior': return v > a
      case 'maior_igual': return v >= a
      case 'menor': return v < a
      case 'menor_igual': return v <= a
      case 'entre': return !isNaN(b) && v >= Math.min(a, b) && v <= Math.max(a, b)
      default: return false
    }
  }

  if (val.tipo === 'data') {
    if (val.v === null) return false
    const agora = Date.now()
    if (VALOR_EM_DIAS.includes(op)) {
      const n = Number(c.valor); const t = instante(val.v)
      if (isNaN(n) || isNaN(t)) return false
      if (op === 'ultimos_dias') return t >= agora - n * DIA && t <= agora
      if (op === 'mais_de_dias') return t < agora - n * DIA
      return t >= agora && t <= agora + n * DIA // proximos_dias
    }
    const dia = diaBrt(val.v); const a = String(c.valor ?? '').slice(0, 10); const b = String(c.valor2 ?? '').slice(0, 10)
    if (!dia || !a) return false
    switch (op) {
      case 'antes': return dia < a
      case 'depois': return dia > a
      case 'em': return dia === a
      case 'entre': { if (!b) return false; const [lo, hi] = a <= b ? [a, b] : [b, a]; return dia >= lo && dia <= hi }
      default: return false
    }
  }

  // texto (sem acento / maiúsculas)
  const v = norm(val.v), alvo = norm(c.valor)
  switch (op) {
    case 'igual': return val.v !== null && v === alvo
    case 'diferente': return val.v === null || v !== alvo
    case 'contem': return val.v !== null && !!alvo && v.includes(alvo)
    case 'nao_contem': return val.v === null || !alvo || !v.includes(alvo)
    case 'comeca': return val.v !== null && !!alvo && v.startsWith(alvo)
    case 'termina': return val.v !== null && !!alvo && v.endsWith(alvo)
    default: return false
  }
}

export async function avaliarCondicao(c: Condicao, ctx: ContextoAluno): Promise<boolean> {
  const def = CAMPO_POR_ID[c.campo]
  if (!def) return false
  if (def.ref && def.refObrigatoria && !c.ref && !c.refs?.length) return false
  if (!SEM_VALOR.includes(c.operador) && (c.valor === null || c.valor === undefined || c.valor === '')) return false
  return compara(c, await valorDoCampo(c, ctx))
}

/** A regra inteira para o aluno. Regra sem condições = todos os alunos. */
export async function avaliarRegra(regra: RegraSegmento, ctx: ContextoAluno): Promise<boolean> {
  const grupos = regra.grupos.filter((g) => g.condicoes.length)
  if (!grupos.length) return true
  const avGrupo = async (g: RegraSegmento['grupos'][number]) => {
    for (const c of g.condicoes) {
      const ok = await avaliarCondicao(c, ctx)
      if (g.op === 'ou' && ok) return true
      if (g.op === 'e' && !ok) return false
    }
    return g.op === 'e'
  }
  for (const g of grupos) {
    const ok = await avGrupo(g)
    if (regra.op === 'ou' && ok) return true
    if (regra.op === 'e' && !ok) return false
  }
  return regra.op === 'e'
}

/** Diagnóstico (tela "Testar com um aluno"): resultado de CADA condição, sem curto-circuito. */
export async function explicarRegra(regra: RegraSegmento, ctx: ContextoAluno): Promise<{ corresponde: boolean; condicoes: Record<string, boolean>; grupos: Record<string, boolean> }> {
  const condicoes: Record<string, boolean> = {}
  const grupos: Record<string, boolean> = {}
  const gs = regra.grupos.filter((g) => g.condicoes.length)
  for (const g of gs) {
    const rs = await Promise.all(g.condicoes.map((c) => avaliarCondicao(c, ctx)))
    g.condicoes.forEach((c, i) => { condicoes[c.id] = rs[i] })
    grupos[g.id] = g.op === 'ou' ? rs.some(Boolean) : rs.every(Boolean)
  }
  const vals = gs.map((g) => grupos[g.id])
  const corresponde = !gs.length ? true : regra.op === 'ou' ? vals.some(Boolean) : vals.every(Boolean)
  return { corresponde, condicoes, grupos }
}

/**
 * Avalia vários segmentos (por id) para o aluno do contexto. Segmento inexistente/excluído = false
 * (nunca libera nada por engano). Tolerante: sem a tabela, todos false.
 */
export async function avaliarSegmentos(ctx: ContextoAluno, ids: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>()
  const uniq = [...new Set(ids.filter(Boolean))]
  if (!uniq.length) return out
  let rows: any[] = []
  try {
    const { data, error } = await ctx.svc.from('simulado_segmentos').select('id, regra')
      .eq('tenant_id', ctx.tenantId).eq('deletado', false).in('id', uniq)
    if (!error) rows = data ?? []
  } catch { rows = [] }
  const porId = new Map(rows.map((r) => [r.id as string, normalizarRegra(r.regra)]))
  for (const id of uniq) {
    const regra = porId.get(id)
    out.set(id, regra ? await avaliarRegra(regra, ctx).catch(() => false) : false)
  }
  return out
}
