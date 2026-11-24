/**
 * VERIFICAÇÃO DO SISTEMA (fluxo): checagens DETERMINÍSTICAS sobre o grafo mesclado (base + usuário). Puro, client-safe, sem I/O.
 * Reusa `validarGrafo` (problemas dos nós do usuário) e acrescenta o que só se vê comparando com o grafo base
 * (nó base que ficou órfão/sem saídas por causa de edição, nós base ocultos) e a estrutura das regras do usuário.
 * Checagens do DOMÍNIO (faixas, restrições, padrão) ficam no adaptador (`ConstrutorAdaptador.verificar`).
 */
import type { DiagramaFluxo } from './adaptador'
import { validarGrafo } from './grafo'
import { mesclar, nosOcultos, type OverlayFluxo } from './overlay'

export type Severidade = 'erro' | 'aviso' | 'info'
export type CategoriaVerificacao = 'grafo' | 'regra' | 'sistema'
export interface ItemVerificacao {
  id: string
  severidade: Severidade
  categoria: CategoriaVerificacao
  titulo: string
  descricao: string
  /** diagrama/nó para "focar no canvas". */
  diagrama?: string
  noId?: string
}
export interface ResumoVerificacao { erros: number; avisos: number; infos: number; ok: boolean }

export function resumirVerificacao(itens: readonly ItemVerificacao[]): ResumoVerificacao {
  const erros = itens.filter((i) => i.severidade === 'erro').length
  const avisos = itens.filter((i) => i.severidade === 'aviso').length
  return { erros, avisos, infos: itens.length - erros - avisos, ok: erros === 0 && avisos === 0 }
}
const PESO: Record<Severidade, number> = { erro: 0, aviso: 1, info: 2 }
export const ordenarVerificacao = (itens: readonly ItemVerificacao[]): ItemVerificacao[] => [...itens].sort((a, b) => PESO[a.severidade] - PESO[b.severidade])

const grau = (d: Pick<DiagramaFluxo, 'arestas'>) => {
  const entra = new Map<string, number>(), sai = new Map<string, number>()
  for (const a of d.arestas) { sai.set(a.de, (sai.get(a.de) ?? 0) + 1); entra.set(a.para, (entra.get(a.para) ?? 0) + 1) }
  return { entra, sai }
}

/** Grafo + estrutura das regras do usuário. `base` = diagramas do adaptador; `overlay` = rascunho/versão salva. */
export function verificarGrafoCompleto(base: readonly DiagramaFluxo[], overlay: OverlayFluxo): ItemVerificacao[] {
  const out: ItemVerificacao[] = []
  const merged = mesclar(base, overlay)
  // 1) problemas dos nós criados pelo usuário (órfão, decisão sem 2 saídas, ciclo, condição sem ação…)
  validarGrafo(merged).forEach((p, k) => out.push({
    id: `g${k}:${p.diagrama}:${p.noId ?? ''}`, severidade: p.nivel, categoria: 'grafo', titulo: p.nivel === 'erro' ? 'Erro no fluxo' : 'Atenção no fluxo', descricao: p.mensagem, diagrama: p.diagrama, noId: p.noId,
  }))
  // 2) nós BASE que perderam conexões por ocultação/edição (comparando com o grafo base)
  for (const b of base) {
    const m = merged.find((x) => x.id === b.id)
    if (!m) continue
    const gb = grau(b), gm = grau(m), vivos = new Set(m.nos.map((n) => n.id))
    for (const n of b.nos) {
      if (!vivos.has(n.id) || n.tipo === 'nota') continue
      const antes = (gb.entra.get(n.id) ?? 0) + (gb.sai.get(n.id) ?? 0)
      const depois = (gm.entra.get(n.id) ?? 0) + (gm.sai.get(n.id) ?? 0)
      const ref = `“${m.nos.find((x) => x.id === n.id)?.titulo ?? n.titulo}”`
      if (antes > 0 && depois === 0) out.push({ id: `bo:${b.id}:${n.id}`, severidade: 'aviso', categoria: 'grafo', titulo: 'Etapa do fluxo base ficou órfã', descricao: `${ref} perdeu todas as conexões (nós vizinhos ocultos?).`, diagrama: b.id, noId: n.id })
      else if (n.tipo === 'decisao' && (gb.sai.get(n.id) ?? 0) >= 2 && (gm.sai.get(n.id) ?? 0) < 2) out.push({ id: `bd:${b.id}:${n.id}`, severidade: 'aviso', categoria: 'grafo', titulo: 'Decisão do fluxo base sem 2 saídas', descricao: `A decisão ${ref} tinha 2 saídas e agora tem ${gm.sai.get(n.id) ?? 0}.`, diagrama: b.id, noId: n.id })
    }
  }
  // 3) nós base ocultos (informativo; restaurar na barra)
  for (const o of nosOcultos(base, overlay)) out.push({ id: `oc:${o.id}`, severidade: 'info', categoria: 'grafo', titulo: 'Nó do fluxo base oculto', descricao: `“${o.titulo}” está oculto neste rascunho (dá para restaurar na barra do construtor).`, diagrama: o.diagrama })
  // 4) estrutura das regras do usuário
  for (const n of overlay.nos) {
    if (n.tipo === 'condicao' && (!n.condicao || n.condicao.ou.length === 0)) out.push({ id: `rc:${n.id}`, severidade: 'aviso', categoria: 'regra', titulo: 'Condição sem comparação', descricao: `A condição “${n.titulo}” não tem nenhuma comparação: não filtra nada.`, diagrama: n.diagrama, noId: n.id })
    if (n.tipo === 'acao' && !n.acao?.tipo) out.push({ id: `ra:${n.id}`, severidade: 'erro', categoria: 'regra', titulo: 'Ação sem tipo', descricao: `A ação “${n.titulo}” não tem o tipo definido (escolha uma ação do catálogo).`, diagrama: n.diagrama, noId: n.id })
  }
  return ordenarVerificacao(out)
}
