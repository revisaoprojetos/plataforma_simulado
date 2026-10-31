/**
 * Regras de liberação de acesso — MOTOR PURO e DETERMINÍSTICO.
 *
 * Ver PROMPT_REGRAS_LIBERACAO_ACESSO.md (§5 classificação de status, §6 casamento,
 * §6.2/6.3 datas). SEM dependências de DB/rede/relógio externo — tudo recebido por
 * parâmetro (inclusive `agora`), para ser 100% testável e auditável.
 *
 * Regra de ouro do casamento (§6.1): TODO filtro CONFIGURADO é obrigatório (AND estrito).
 * Dimensão vazia = curinga. Critério `id` compara SÓ com id; `nome` SÓ com nome; SEM fallback.
 * Valor vazio no pedido NUNCA casa com filtro configurado. Comparação de id é EXATA (string).
 */

import type {
  AvaliacaoDimensao,
  ClassificacaoStatus,
  CriterioValor,
  FimConfig,
  InicioConfig,
  PedidoNormalizado,
  Regra,
  RegraFiltros,
  ResultadoMatch,
  ResultadoStatus,
  ResultadoValidacao,
} from './tipos'

// ─────────────────────────────────────────────────────────────────────────────
// Normalização
// ─────────────────────────────────────────────────────────────────────────────

/** minúsculas + trim + remove acentos — para comparação de NOME (produto/oferta). */
export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

/** minúsculas + trim + remove acentos + espaços/hífens → `_` — para comparação de STATUS. */
export function normalizarStatus(s: string | null | undefined): string {
  return normalizarTexto(s).replace(/[\s-]+/g, '_')
}

/** id comparado como string exata, só após trim (NUNCA converte para número). */
const normalizarId = (s: string | null | undefined): string => (s ?? '').trim()

// ─────────────────────────────────────────────────────────────────────────────
// §5 — Classificação de status
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_POSITIVOS = new Set([
  'paid', 'approved', 'aprovado', 'completo', 'complete', 'completed', 'pago',
  'confirmed', 'confirmado', 'active', 'ativo', 'authorized', 'autorizado',
])
const STATUS_NEGATIVOS = new Set([
  'refunded', 'reembolsado', 'chargeback', 'disputed', 'disputa', 'canceled', 'cancelled',
  'cancelado', 'unpaid', 'nao_pago', 'expired', 'expirado', 'overdue', 'atrasado',
  'refused', 'recusado', 'rejected', 'rejeitado',
])

/**
 * Classifica um status bruto do provedor. `overrides` vem do `status_mappings` editável
 * (chave já NORMALIZADA → classificação) e tem PRECEDÊNCIA sobre as listas padrão.
 * Status nunca visto → `neutral` + `mapeado:false` (não concede nem revoga; sinalizar p/ revisão).
 */
export function classificarStatus(
  statusBruto: string | null | undefined,
  overrides?: Record<string, ClassificacaoStatus>,
): ResultadoStatus {
  const normalizado = normalizarStatus(statusBruto)
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, normalizado)) {
    return { classificacao: overrides[normalizado], mapeado: true, normalizado }
  }
  if (STATUS_POSITIVOS.has(normalizado)) return { classificacao: 'positive', mapeado: true, normalizado }
  if (STATUS_NEGATIVOS.has(normalizado)) return { classificacao: 'negative', mapeado: true, normalizado }
  return { classificacao: 'neutral', mapeado: false, normalizado }
}

// ─────────────────────────────────────────────────────────────────────────────
// §6.1 — Casamento (match) — função pura
// ─────────────────────────────────────────────────────────────────────────────

/** Converte 'YYYY-MM-DD' (dia inteiro BRT) ou ISO em epoch ms. null se inválido. */
function instante(valor: string | null, fimDoDia: boolean): number | null {
  if (!valor) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    // Brasil sem horário de verão desde 2019 → offset fixo UTC-3 (igual lib/brt.ts).
    const d = new Date(`${valor}${fimDoDia ? 'T23:59:59.999-03:00' : 'T00:00:00.000-03:00'}`)
    return isNaN(+d) ? null : +d
  }
  const d = new Date(valor)
  return isNaN(+d) ? null : +d
}

/** Um critério casa? `id`→id exato; `nome`→modo igual/contém/começa (sem acento/caixa). Valor vazio no pedido nunca casa. */
function criterioCasa(c: CriterioValor, pedidoId: string | null, pedidoNome: string | null): boolean {
  if (c.tipo === 'id') {
    const alvo = normalizarId(pedidoId)
    if (!alvo) return false // sem id no pedido → não casa (SEM fallback para nome)
    return alvo === normalizarId(c.valor)
  }
  const alvo = normalizarTexto(pedidoNome)
  if (!alvo) return false
  const v = normalizarTexto(c.valor)
  if (!v) return false
  switch (c.modo ?? 'igual') {
    case 'contem': return alvo.includes(v)
    case 'comeca': return alvo.startsWith(v)
    case 'igual':
    default: return alvo === v
  }
}

/** Avalia a dimensão produto/oferta (OR entre critérios; [] = curinga). */
function avaliarCriterios(
  dimensao: 'produto' | 'oferta',
  criterios: CriterioValor[],
  pedidoId: string | null,
  pedidoNome: string | null,
): AvaliacaoDimensao {
  if (!criterios.length) {
    return { dimensao, configurada: false, casou: true, detalhe: 'curinga (não configurado)' }
  }
  const casou = criterios.some((c) => criterioCasa(c, pedidoId, pedidoNome))
  const regraDesc = criterios.map((c) => `${c.tipo}${c.tipo === 'nome' ? `/${c.modo ?? 'igual'}` : ''}:${c.valor}`).join(' | ')
  const detalhe = casou
    ? `ok (pedido id=${pedidoId ?? '—'}, nome=${pedidoNome ?? '—'})`
    : `FALHOU (pedido id=${pedidoId ?? '—'}, nome=${pedidoNome ?? '—'}; regra=[${regraDesc}])`
  return { dimensao, configurada: true, casou, detalhe }
}

/**
 * Casa um pedido contra os FILTROS de uma regra. Determinístico; não lê relógio nem DB.
 * `casou` só é true se TODAS as dimensões CONFIGURADAS casarem (AND estrito).
 * A grava a avaliação por dimensão (`dimensoes`) para a auditoria.
 */
export function match(pedido: PedidoNormalizado, filtros: RegraFiltros): ResultadoMatch {
  const dimensoes: AvaliacaoDimensao[] = []

  // plataforma
  if (!filtros.plataformas.length) {
    dimensoes.push({ dimensao: 'plataforma', configurada: false, casou: true, detalhe: 'curinga (qualquer plataforma)' })
  } else {
    const alvo = normalizarTexto(pedido.plataforma)
    const permitidas = filtros.plataformas.map(normalizarTexto)
    const casou = !!alvo && permitidas.includes(alvo)
    dimensoes.push({
      dimensao: 'plataforma', configurada: true, casou,
      detalhe: casou ? `ok (${pedido.plataforma})` : `FALHOU (pedido=${pedido.plataforma || '—'}, regra=[${filtros.plataformas.join(', ')}])`,
    })
  }

  // produto / oferta
  dimensoes.push(avaliarCriterios('produto', filtros.produtos, pedido.produtoId, pedido.produtoNome))
  dimensoes.push(avaliarCriterios('oferta', filtros.ofertas, pedido.ofertaId, pedido.ofertaNome))

  // período (data da compra, inclusivo, BRT)
  const periodoConfigurado = !!(filtros.periodoDe || filtros.periodoAte)
  if (!periodoConfigurado) {
    dimensoes.push({ dimensao: 'periodo', configurada: false, casou: true, detalhe: 'curinga (sem janela)' })
  } else if (!pedido.dataCompra) {
    dimensoes.push({ dimensao: 'periodo', configurada: true, casou: false, detalhe: 'FALHOU (pedido sem data de compra)' })
  } else {
    const t = new Date(pedido.dataCompra)
    const tMs = isNaN(+t) ? null : +t
    const de = instante(filtros.periodoDe, false)
    const ate = instante(filtros.periodoAte, true)
    const casou = tMs != null && (de == null || tMs >= de) && (ate == null || tMs <= ate)
    dimensoes.push({
      dimensao: 'periodo', configurada: true, casou,
      detalhe: casou
        ? `ok (${pedido.dataCompra})`
        : `FALHOU (compra=${pedido.dataCompra}, janela=[${filtros.periodoDe ?? '—'} .. ${filtros.periodoAte ?? '—'}])`,
    })
  }

  const falha = dimensoes.find((d) => d.configurada && !d.casou)
  return { casou: !falha, dimensoes, motivo: falha ? `${falha.dimensao}: ${falha.detalhe}` : '' }
}

// ─────────────────────────────────────────────────────────────────────────────
// §12 — Validação de cadastro
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida uma regra no CADASTRO (§6.1/§6.2/§6.3). Impede:
 *  - critério `id` (produto/oferta) sem plataforma configurada (IDs só valem dentro da plataforma);
 *  - regra totalmente aberta (sem produto/oferta) sem a flag `aplicarATudo`;
 *  - janela de período invertida; datas fixas incoerentes; dias negativos.
 */
export function validarRegra(regra: Pick<Regra, 'filtros' | 'inicio' | 'fim'>): ResultadoValidacao {
  const erros: string[] = []
  const f = regra.filtros

  const temCriterioId = [...f.produtos, ...f.ofertas].some((c) => c.tipo === 'id')
  if (temCriterioId && !f.plataformas.length) {
    erros.push('Critério por ID de produto/oferta exige ao menos uma plataforma (IDs só valem dentro da plataforma).')
  }

  const temProdutoOuOferta = f.produtos.length > 0 || f.ofertas.length > 0
  if (!temProdutoOuOferta && !f.aplicarATudo) {
    erros.push('A regra precisa de ao menos um filtro de produto ou oferta (ou marque "aplicar a tudo").')
  }

  // critérios com valor vazio
  for (const c of [...f.produtos, ...f.ofertas]) {
    if (!c.valor || !c.valor.trim()) erros.push('Há um critério de produto/oferta com valor vazio.')
  }

  // período
  if (f.periodoDe && f.periodoAte) {
    const de = instante(f.periodoDe, false)
    const ate = instante(f.periodoAte, true)
    if (de != null && ate != null && de > ate) erros.push('A data inicial do período é posterior à final.')
  }

  // datas de início/fim
  if (regra.inicio.tipo === 'after_days' && regra.inicio.dias < 0) erros.push('Dias de início não podem ser negativos.')
  if (regra.fim.tipo === 'after_days' && regra.fim.dias < 0) erros.push('Dias de término não podem ser negativos.')
  if (regra.inicio.tipo === 'fixed_date' && !instanteValido(regra.inicio.data)) erros.push('Data de início inválida.')
  if (regra.fim.tipo === 'fixed_date' && !instanteValido(regra.fim.data)) erros.push('Data de término inválida.')
  if (regra.inicio.tipo === 'fixed_date' && regra.fim.tipo === 'fixed_date') {
    const i = instante(regra.inicio.data, false)
    const fFim = instante(regra.fim.data, true)
    if (i != null && fFim != null && i >= fFim) erros.push('A data de término deve ser posterior à de início.')
  }

  return { ok: erros.length === 0, erros }
}

function instanteValido(valor: string): boolean {
  return instante(valor, false) != null
}

// ─────────────────────────────────────────────────────────────────────────────
// §6.2 / §6.3 — Cálculo das datas da concessão (starts_at / ends_at)
// ─────────────────────────────────────────────────────────────────────────────

const DIA_MS = 24 * 60 * 60 * 1000

/** Base relativa = data da compra; se ausente, cai para `agora`. */
function baseRelativa(dataCompra: string | null, agora: Date): number {
  if (dataCompra) { const t = new Date(dataCompra); if (!isNaN(+t)) return +t }
  return +agora
}

/** Calcula o `starts_at` (ISO) da concessão conforme §6.2. */
export function calcularInicio(cfg: InicioConfig, dataCompra: string | null, agora: Date): string {
  switch (cfg.tipo) {
    case 'after_days': return new Date(baseRelativa(dataCompra, agora) + cfg.dias * DIA_MS).toISOString()
    case 'fixed_date': return new Date(instante(cfg.data, false) ?? +agora).toISOString()
    case 'immediate':
    default: return agora.toISOString()
  }
}

/** Calcula o `ends_at` (ISO) da concessão conforme §6.3. `lifetime` → null (vitalício). */
export function calcularFim(cfg: FimConfig, dataCompra: string | null, agora: Date): string | null {
  switch (cfg.tipo) {
    case 'after_days': return new Date(baseRelativa(dataCompra, agora) + cfg.dias * DIA_MS).toISOString()
    case 'fixed_date': return new Date(instante(cfg.data, true) ?? +agora).toISOString()
    case 'lifetime':
    default: return null
  }
}

/** Estado inicial da concessão a partir das datas (§6.3): futura → scheduled; vencida → expired; senão active. */
export function estadoInicialGrant(startsAt: string, endsAt: string | null, agora: Date): 'scheduled' | 'active' | 'expired' {
  const ini = +new Date(startsAt)
  const now = +agora
  if (endsAt && +new Date(endsAt) <= now) return 'expired'
  if (ini > now) return 'scheduled'
  return 'active'
}

/** Acesso efetivo (§7 "Acesso efetivo"): há concessão ATIVA cobrindo `agora`? Determinístico. */
export function temAcessoEfetivo(
  grants: { status: string; startsAt: string; endsAt: string | null }[],
  agora: Date,
): boolean {
  const now = +agora
  return grants.some((g) => g.status === 'active' && +new Date(g.startsAt) <= now && (g.endsAt == null || +new Date(g.endsAt) > now))
}
