// Regras PURAS do sync de progresso do Cronograma Adaptativo (sem I/O, testáveis).
// Objetivo: o iframe reenvia o `S.prog` INTEIRO a cada salvar; o servidor decide o que de fato mudou e NUNCA
// recarimba conclusões antigas, nem aceita conclusões em lote sem ação explícita do aluno.
import { dataConclusao } from './meta-ids'

/** Máximo de conclusões NOVAS por requisição quando o cliente não envia `tocadas` (clientes antigos). */
export const LIMITE_NOVAS_CONCLUSOES = 8

export interface ProgEnviado {
  s?: 'done' | 'missed' | null
  em?: string
  concluidoEm?: string
  t?: number
  parou?: { v: string; em?: string }
  modo?: string
}
/** Linha atual no banco (só o que o progresso toca). */
export interface MetaAtual {
  estado: string | null
  tempo_seg: number | null
  parcial_v: string | null
  parcial_em: string | null
  modo: string | null
  concluido_em: string | null
  atualizado_em?: string | null
}
export interface LinhaProgresso {
  meta_id: string
  estado: 'done' | 'missed' | null
  tempo_seg: number
  parcial_v: string | null
  parcial_em: string | null
  modo: string | null
  concluido_em: string | null
}
export interface PlanoProgresso {
  /** linhas a gravar (SÓ as que mudaram). */
  gravar: LinhaProgresso[]
  /** ids a zerar (desmarcados explicitamente: objeto vazio). */
  limpar: string[]
  /** transições de estado p/ auditoria (evento por meta). */
  eventos: Array<{ metaId: string; de: string | null; para: string | null }>
  /** conclusões novas recusadas por falta de ação explícita / lote. */
  ignoradas: string[]
  /** true quando o pedido inteiro de conclusões novas foi recusado por exceder o limite (cliente sem `tocadas`). */
  loteRecusado: boolean
}

export const temProgresso = (p: ProgEnviado | undefined | null): boolean => !!(p && (p.s || p.t || p.parou || p.modo))

/** Data de conclusão aceitável: ISO válida e nunca no futuro (cai em `hoje`). */
export function dataValidaNaoFutura(v: unknown, hoje: string): string | null {
  const d = dataConclusao(v)
  if (!d) return null
  return d > hoje ? hoje : d
}

/** Planeja o que gravar. `tocadas` = ids que o aluno realmente alterou nesta sessão (undefined = cliente antigo). */
export function planejarProgresso(args: {
  prog: Record<string, ProgEnviado>
  atual: Record<string, MetaAtual | undefined>
  tocadas?: string[] | null
  hoje: string
  limite?: number
}): PlanoProgresso {
  const { prog, atual, hoje } = args
  const limite = args.limite ?? LIMITE_NOVAS_CONCLUSOES
  const tocadas = Array.isArray(args.tocadas) ? new Set(args.tocadas.filter((x) => typeof x === 'string')) : null
  const out: PlanoProgresso = { gravar: [], limpar: [], eventos: [], ignoradas: [], loteRecusado: false }

  const entradas = Object.entries(prog)
  const novas = entradas.filter(([id, p]) => p?.s === 'done' && atual[id]?.estado !== 'done').map(([id]) => id)
  // Sem `tocadas`: lote grande = quase certamente reenvio de estado antigo → recusa TODAS as novas conclusões.
  const loteRecusado = !tocadas && novas.length > limite
  out.loteRecusado = loteRecusado
  const novasAceitas = new Set(novas.filter((id) => (tocadas ? tocadas.has(id) : !loteRecusado)))
  for (const id of novas) if (!novasAceitas.has(id)) out.ignoradas.push(id)

  for (const [meta_id, p] of entradas) {
    const cur = atual[meta_id]
    const estAntes = cur?.estado ?? null

    if (!temProgresso(p)) {
      // desmarcar explícito ({}): zera o progresso. Com `tocadas`, desmarcar uma conclusão exige ação explícita.
      if (!cur) continue
      const temAlgo = !!(cur.estado || cur.tempo_seg || cur.parcial_v || cur.modo || cur.concluido_em)
      if (!temAlgo) continue
      if (tocadas && cur.estado === 'done' && !tocadas.has(meta_id)) continue
      out.limpar.push(meta_id)
      if (estAntes) out.eventos.push({ metaId: meta_id, de: estAntes, para: null })
      continue
    }

    const novoEstado: 'done' | 'missed' | null = p.s === 'done' || p.s === 'missed' ? p.s : null
    let estado = novoEstado
    if (novoEstado === 'done' && estAntes !== 'done' && !novasAceitas.has(meta_id)) continue // conclusão nova sem ação explícita: ignora (mantém o banco)
    // done→não-done: a OMISSÃO do id nunca desfaz (só iteramos ids presentes). Com `tocadas`, desfazer exige ação explícita do aluno sobre o id.
    if (tocadas && estAntes === 'done' && novoEstado !== 'done' && !tocadas.has(meta_id)) estado = 'done'

    let concluido_em: string | null = null
    if (estado === 'done') {
      if (estAntes === 'done') {
        // já concluída: PRESERVA a data gravada; se o banco não tem (legado), só aceita a data enviada (nunca "hoje").
        concluido_em = cur?.concluido_em ? cur.concluido_em.slice(0, 10)
          : (dataValidaNaoFutura(p.em, hoje) ?? dataValidaNaoFutura(p.concluidoEm, hoje))
      } else {
        concluido_em = dataValidaNaoFutura(p.em, hoje) ?? dataValidaNaoFutura(p.concluidoEm, hoje) ?? hoje
      }
    }

    const linha: LinhaProgresso = {
      meta_id, estado,
      tempo_seg: p.t || 0,
      parcial_v: p.parou?.v ?? null,
      parcial_em: p.parou?.em || null,
      modo: p.modo ?? null,
      concluido_em,
    }
    const igual = !!cur
      && (cur.estado ?? null) === linha.estado
      && (cur.tempo_seg || 0) === linha.tempo_seg
      && (cur.parcial_v ?? null) === linha.parcial_v
      && (cur.parcial_em || null) === linha.parcial_em
      && (cur.modo ?? null) === linha.modo
      && (cur.concluido_em ? cur.concluido_em.slice(0, 10) : null) === linha.concluido_em
    if (igual) continue
    out.gravar.push(linha)
    if (estAntes !== estado) out.eventos.push({ metaId: meta_id, de: estAntes, para: estado })
  }
  return out
}

/** Valor de `em` a devolver ao cliente: data de conclusão; done legado sem data usa o atualizado_em da linha. */
export function emParaCliente(m: { estado: string | null; concluido_em?: string | null; atualizado_em?: string | null }): string | null {
  if (m.estado !== 'done') return null
  const d = dataConclusao(m.concluido_em) ?? dataConclusao(m.atualizado_em)
  return d
}
