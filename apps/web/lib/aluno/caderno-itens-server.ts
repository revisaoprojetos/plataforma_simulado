// Núcleo SERVER de itens de caderno (grifo | anotacao | comentario), compartilhado por
// /api/aluno/cadernos/item e /api/aluno/cadernos/folha. Só roda no servidor (service role).
import { createHash } from 'crypto'

export const MSG_MIGRACAO =
  'Recurso indisponível: falta aplicar as migrações 20261105000000_aluno_caderno_itens_comentario.sql e 20261119040000_caderno_destinos_itens.sql no banco.'

/** Tabela/coluna ainda não criada (migração pendente) / schema cache desatualizado. */
export function tabelaAusente(err: any): boolean {
  const code = String(err?.code ?? '')
  const msg = String(err?.message ?? '')
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST204' || code === '42703' || /schema cache|does not exist|Could not find the/i.test(msg)
}

export const TIPOS = ['grifo', 'anotacao', 'comentario'] as const
export type TipoItem = (typeof TIPOS)[number]
export const REF_TABELAS = ['simulado_conteudo_grifos_pdf', 'simulado_conteudo_anotacoes', 'simulado_leitura_anotacoes', 'folha_local'] as const

export const txt = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}
export const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : null)
export const uuid = (v: unknown): string | null =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null

/** Retângulos do grifo no PDF (coordenadas do leitor). Valida forma/tamanho; null se inválido. */
function rectsValidos(v: unknown): { x0: number; y0: number; x1: number; y1: number }[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 60) return null
  const out: { x0: number; y0: number; x1: number; y1: number }[] = []
  for (const r of v) {
    if (!r || typeof r !== 'object') return null
    const { x0, y0, x1, y1 } = r as Record<string, unknown>
    if (![x0, y0, x1, y1].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
    out.push({ x0: x0 as number, y0: y0 as number, x1: x1 as number, y1: y1 as number })
  }
  return out
}

/** HTML da folha → texto simples (para exibir com segurança sem renderizar HTML do aluno). */
export function htmlParaTexto(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/blockquote)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type ItemNormalizado = {
  tipo: TipoItem
  documento_id: string | null
  documento_versao: number | null
  titulo_documento: string | null
  trecho: string | null
  prefix: string | null
  suffix: string | null
  inicio: number | null
  fim: number | null
  comentario: string | null
  cor: string | null
  grifo_ref: string | null
  ref_tabela: string | null
  pagina: number | null
  rects: { x0: number; y0: number; x1: number; y1: number }[] | null
  html: string | null
}

/** Valida e normaliza UM item. Devolve { erro } com mensagem amigável quando inválido. */
export function normalizarItem(raw: any): { item: ItemNormalizado } | { erro: string } {
  if (!raw || typeof raw !== 'object') return { erro: 'Item inválido.' }
  const comentario = txt(raw.comentario, 5000)
  const tipo: TipoItem = (TIPOS as readonly string[]).includes(raw.tipo) ? raw.tipo : 'comentario'
  const trecho = txt(raw.trecho, 2000)
  const html = typeof raw.html === 'string' && raw.html.trim() ? raw.html.slice(0, 100000) : null
  const rects = rectsValidos(raw.rects)
  const refTabela = (REF_TABELAS as readonly string[]).includes(raw.ref_tabela) ? (raw.ref_tabela as string) : null

  if (tipo === 'comentario' && !comentario) return { erro: 'Escreva um comentário antes de salvar.' }
  if (tipo === 'grifo' && !trecho && !rects) return { erro: 'Grifo sem trecho.' }
  if (tipo === 'anotacao' && !comentario && !html) return { erro: 'A anotação está vazia.' }

  const item: ItemNormalizado = {
    tipo,
    documento_id: uuid(raw.documento_id),
    documento_versao: int(raw.documento_versao),
    titulo_documento: txt(raw.titulo_documento, 300),
    trecho,
    prefix: txt(raw.prefix, 300),
    suffix: txt(raw.suffix, 300),
    inicio: int(raw.inicio),
    fim: int(raw.fim),
    comentario,
    cor: txt(raw.cor, 20),
    grifo_ref: txt(raw.grifo_ref, 80),
    ref_tabela: refTabela,
    pagina: int(raw.pagina),
    rects,
    html,
  }
  // Sem referência do servidor (grifo ainda não sincronizado): chave DETERMINÍSTICA pelo conteúdo/posição →
  // salvar duas vezes o mesmo trecho no mesmo caderno atualiza em vez de duplicar (idempotente).
  if (!item.grifo_ref && item.tipo !== 'comentario') {
    const base = [item.documento_id, item.pagina, item.inicio, item.fim, item.trecho, item.rects ? JSON.stringify(item.rects) : '', item.tipo].join('|')
    item.grifo_ref = 'g:' + createHash('sha1').update(base).digest('hex').slice(0, 40)
  }
  return { item }
}

/** Só inclui colunas novas quando há valor (não quebra a escrita antiga se a migração nova estiver pendente). */
function paraGravar(item: ItemNormalizado): Record<string, unknown> {
  const o: Record<string, unknown> = {
    tipo: item.tipo, documento_id: item.documento_id, documento_versao: item.documento_versao,
    titulo_documento: item.titulo_documento, trecho: item.trecho, prefix: item.prefix, suffix: item.suffix,
    inicio: item.inicio, fim: item.fim, comentario: item.comentario, cor: item.cor, grifo_ref: item.grifo_ref,
  }
  if (item.ref_tabela) o.ref_tabela = item.ref_tabela
  if (item.pagina != null) o.pagina = item.pagina
  if (item.rects) o.rects = item.rects
  if (item.html) o.html = item.html
  return o
}

const RANK: Record<string, number> = { grifo: 1, anotacao: 2, comentario: 3 }

export type CadernoRef = { id: string; nome: string }
export type Sessao = { tenantId: string; estudanteId: string }

/** Caderno existente do aluno OU cria um novo. */
export async function resolverCaderno(
  svc: any, sessao: Sessao, body: { caderno_id?: unknown; novo_caderno?: { nome?: unknown } | null },
): Promise<{ caderno: CadernoRef; criadoAgora: boolean } | { status: number; message: string }> {
  const nomeNovo = body.novo_caderno ? txt(body.novo_caderno?.nome, 120) : null
  if (body.novo_caderno && !nomeNovo) return { status: 400, message: 'Informe um nome para o novo caderno.' }
  if (!body.novo_caderno && !uuid(body.caderno_id)) return { status: 400, message: 'Escolha um caderno.' }
  if (nomeNovo) {
    const { data, error } = await svc.from('simulado_aluno_cadernos')
      .insert({ tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, nome: nomeNovo }).select('id, nome').single()
    if (error || !data) return { status: 500, message: 'Não consegui criar o caderno.' }
    return { caderno: data, criadoAgora: true }
  }
  const { data } = await svc.from('simulado_aluno_cadernos').select('id, nome')
    .eq('id', body.caderno_id as string).eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).maybeSingle()
  if (!data) return { status: 403, message: 'Caderno não encontrado.' }
  return { caderno: data, criadoAgora: false }
}

export async function desfazerCadernoNovo(svc: any, sessao: Sessao, caderno: CadernoRef) {
  await svc.from('simulado_aluno_cadernos').delete().eq('id', caderno.id).eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId)
}

/**
 * Grava itens no caderno de forma IDEMPOTENTE (dedupe por grifo_ref no caderno).
 * Retorna quantos foram criados/atualizados; erro de tabela ausente vira { migracao: true }.
 */
export async function gravarItens(
  svc: any, sessao: Sessao, caderno: CadernoRef, itens: ItemNormalizado[],
): Promise<{ ok: true; criados: number; atualizados: number; itens: any[] } | { ok: false; status: number; message: string }> {
  const base = { tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, caderno_id: caderno.id }
  const refs = [...new Set(itens.map((i) => i.grifo_ref).filter(Boolean) as string[])]
  const existentes = new Map<string, { id: string; tipo: string }>()
  if (refs.length) {
    const { data, error } = await svc.from('simulado_aluno_caderno_itens').select('id, tipo, grifo_ref')
      .eq('tenant_id', sessao.tenantId).eq('caderno_id', caderno.id).in('grifo_ref', refs)
    if (error) return tabelaAusente(error) ? { ok: false, status: 503, message: MSG_MIGRACAO } : { ok: false, status: 500, message: 'Não consegui salvar agora.' }
    for (const e of (data ?? []) as any[]) existentes.set(e.grifo_ref, { id: e.id, tipo: e.tipo })
  }

  let criados = 0, atualizados = 0
  const out: any[] = []
  for (const item of itens) {
    const ex = item.grifo_ref ? existentes.get(item.grifo_ref) : undefined
    if (ex) {
      // Já existe neste caderno: só "sobe de nível" (grifo → comentário) ou atualiza texto/cor; nunca rebaixa nem duplica.
      const patch: Record<string, unknown> = {}
      if ((RANK[item.tipo] ?? 0) > (RANK[ex.tipo] ?? 0)) patch.tipo = item.tipo
      if (item.comentario) patch.comentario = item.comentario
      if (item.html) patch.html = item.html
      if (item.cor) patch.cor = item.cor
      if (item.trecho) patch.trecho = item.trecho
      if (Object.keys(patch).length) {
        const { data, error } = await svc.from('simulado_aluno_caderno_itens').update(patch)
          .eq('id', ex.id).eq('tenant_id', sessao.tenantId).select('*').single()
        if (error) return tabelaAusente(error) ? { ok: false, status: 503, message: MSG_MIGRACAO } : { ok: false, status: 500, message: 'Não consegui salvar agora.' }
        out.push(data)
      }
      atualizados++
      continue
    }
    const { data, error } = await svc.from('simulado_aluno_caderno_itens').insert({ ...base, ...paraGravar(item) }).select('*').single()
    if (error || !data) {
      if (error && String((error as any).code) === '23505') { atualizados++; continue } // corrida: idempotente
      if (error && tabelaAusente(error)) return { ok: false, status: 503, message: MSG_MIGRACAO }
      return { ok: false, status: 500, message: 'Não consegui salvar agora.' }
    }
    if (item.grifo_ref) existentes.set(item.grifo_ref, { id: data.id, tipo: data.tipo })
    out.push(data)
    criados++
  }
  return { ok: true, criados, atualizados, itens: out }
}

/** total = questões + itens do caderno (2 COUNT head, sem trazer linhas). */
export async function cadernoComTotal(svc: any, c: CadernoRef, tenantId: string) {
  const [q, i] = await Promise.all([
    svc.from('simulado_aluno_caderno_questoes').select('questao_id', { count: 'exact', head: true }).eq('caderno_id', c.id),
    svc.from('simulado_aluno_caderno_itens').select('id', { count: 'exact', head: true }).eq('caderno_id', c.id).eq('tenant_id', tenantId),
  ])
  return { id: c.id, nome: c.nome, total: (q.count ?? 0) + (i.count ?? 0) }
}
