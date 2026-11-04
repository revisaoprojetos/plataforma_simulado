import 'server-only'
import { ContextoAluno, avaliarSegmentos } from './avaliar'
import type { AlvoTipo, Efeito, RegraVisibilidade, SemAcesso } from './tipos'

/**
 * Aplicação dos SEGMENTOS dentro dos produtos (tabela simulado_produto_visibilidade):
 *  - acesso ao produto: 'bloquear' vence tudo (até assinatura/grupo); 'liberar' concede sem prazo;
 *  - conteúdo (módulo/aula): visível se (não há regra "mostrar somente para" OU o aluno está em algum
 *    dos segmentos dela) E o aluno não está em nenhum segmento de "ocultar para". Quando não é visível,
 *    some se alguma regra que barrou pede 'oculto'; senão aparece com cadeado.
 * Sem a tabela (migração não aplicada) tudo devolve "sem regras" → comportamento anterior.
 */

type Linha = RegraVisibilidade & { produto_id: string }

function mapear(r: any): Linha {
  return {
    id: r.id, produto_id: r.produto_id, segmento_id: r.segmento_id, alvo_tipo: r.alvo_tipo as AlvoTipo,
    alvo_id: r.alvo_id ?? null, efeito: r.efeito as Efeito, sem_acesso: (r.sem_acesso === 'bloqueado_cadeado' ? 'bloqueado_cadeado' : 'oculto') as SemAcesso,
    ativo: r.ativo !== false,
  }
}
const COLS = 'id, produto_id, segmento_id, alvo_tipo, alvo_id, efeito, sem_acesso, ativo'

/** Regras ATIVAS de um produto (todas as de alvo). */
export async function regrasDoProduto(svc: any, tenantId: string, produtoId: string): Promise<Linha[]> {
  try {
    const { data, error } = await svc.from('simulado_produto_visibilidade').select(COLS)
      .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).limit(2000)
    return error ? [] : ((data ?? []) as any[]).map(mapear)
  } catch { return [] }
}

/** Regras ATIVAS de ACESSO (alvo produto) de todos os produtos do tenant. */
export async function regrasDeAcessoDoTenant(svc: any, tenantId: string): Promise<Linha[]> {
  try {
    const { data, error } = await svc.from('simulado_produto_visibilidade').select(COLS)
      .eq('tenant_id', tenantId).eq('ativo', true).eq('alvo_tipo', 'produto').limit(2000)
    return error ? [] : ((data ?? []) as any[]).map(mapear)
  } catch { return [] }
}

export type EstadoConteudo = 'visivel' | 'oculto' | 'cadeado'

/** Estado de UM alvo (módulo/aula) dadas as regras dele e o resultado dos segmentos do aluno. */
export function estadoDoConteudo(regras: Linha[], noSegmento: Map<string, boolean>): EstadoConteudo {
  if (!regras.length) return 'visivel'
  const barrou: Linha[] = []
  const mostrar = regras.filter((r) => r.efeito === 'mostrar')
  if (mostrar.length && !mostrar.some((r) => noSegmento.get(r.segmento_id))) barrou.push(...mostrar)
  for (const r of regras) if (r.efeito === 'ocultar' && noSegmento.get(r.segmento_id)) barrou.push(r)
  if (!barrou.length) return 'visivel'
  return barrou.some((r) => r.sem_acesso === 'oculto') ? 'oculto' : 'cadeado'
}

/** Resultado das regras de acesso de um produto: 'bloquear' > 'liberar' > null (sem efeito). */
export function efeitoDeAcesso(regras: Linha[], noSegmento: Map<string, boolean>): 'liberar' | 'bloquear' | null {
  let lib = false
  for (const r of regras) {
    if (!noSegmento.get(r.segmento_id)) continue
    if (r.efeito === 'bloquear') return 'bloquear'
    if (r.efeito === 'liberar') lib = true
  }
  return lib ? 'liberar' : null
}

/** Efeito das regras de ACESSO de UM produto para o aluno (1 query; sem regras = null, sem custo extra). */
export async function acessoPorSegmento(svc: any, tenantId: string, estudanteId: string, produtoId: string, ctx?: ContextoAluno): Promise<'liberar' | 'bloquear' | null> {
  const regras = (await regrasDoProduto(svc, tenantId, produtoId)).filter((r) => r.alvo_tipo === 'produto')
  if (!regras.length) return null
  const c = ctx ?? new ContextoAluno(svc, tenantId, estudanteId)
  return efeitoDeAcesso(regras, await avaliarSegmentos(c, regras.map((r) => r.segmento_id)))
}

/** Para "Meus Extensivos": produto_id → efeito, só dos produtos com regra de acesso que casou. */
export async function acessosPorSegmentoDoAluno(svc: any, tenantId: string, estudanteId: string): Promise<Map<string, 'liberar' | 'bloquear'>> {
  const out = new Map<string, 'liberar' | 'bloquear'>()
  const regras = await regrasDeAcessoDoTenant(svc, tenantId)
  if (!regras.length) return out
  const ctx = new ContextoAluno(svc, tenantId, estudanteId)
  const noSeg = await avaliarSegmentos(ctx, regras.map((r) => r.segmento_id))
  const porProduto = new Map<string, Linha[]>()
  for (const r of regras) { const l = porProduto.get(r.produto_id) ?? []; l.push(r); porProduto.set(r.produto_id, l) }
  for (const [pid, rs] of porProduto) { const e = efeitoDeAcesso(rs, noSeg); if (e) out.set(pid, e) }
  return out
}

/**
 * Visibilidade dos CONTEÚDOS de um produto para o aluno: devolve uma função alvoId → estado.
 * Sem regras de conteúdo = função que sempre diz 'visivel' (sem avaliar nada).
 */
export async function visibilidadeDeConteudos(svc: any, tenantId: string, estudanteId: string, produtoId: string): Promise<(alvoId: string) => EstadoConteudo> {
  const regras = (await regrasDoProduto(svc, tenantId, produtoId)).filter((r) => r.alvo_tipo !== 'produto' && r.alvo_id)
  if (!regras.length) return () => 'visivel'
  const ctx = new ContextoAluno(svc, tenantId, estudanteId)
  const noSeg = await avaliarSegmentos(ctx, regras.map((r) => r.segmento_id))
  const porAlvo = new Map<string, Linha[]>()
  for (const r of regras) { const l = porAlvo.get(r.alvo_id!) ?? []; l.push(r); porAlvo.set(r.alvo_id!, l) }
  return (alvoId: string) => estadoDoConteudo(porAlvo.get(alvoId) ?? [], noSeg)
}
