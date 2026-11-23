// Criação OTIMISTA de página do Caderno — lógica PURA (sem DOM/rede). A casca insere a página na árvore local na hora (id gerado no
// cliente), envia o POST em segundo plano e deixa o autosave ESPERAR a criação antes do 1º PATCH (senão 404).

export type PgPos = { id: string; nivel?: number | null; ordem?: number | null }
export type PosicaoNova = { indice: number; antesDeId: string | null; nivel: number; ordem: number }

const nv = (p: PgPos) => Math.max(0, Math.min(2, p.nivel ?? 0))
const PASSO = 1024

/**
 * Onde entra a página nova na lista (já na ordem de exibição) de UMA seção.
 * Sem `subDeId`: no fim, nível 0. Com `subDeId`: logo depois da página e dos seus descendentes contíguos, com nível = pai+1 (máx. 2),
 * respeitando o invariante `nivel[i] <= nivel[i-1] + 1` (a página anterior no ponto de inserção é o último descendente do pai).
 */
export function posicaoNova(lista: PgPos[], subDeId?: string | null): PosicaoNova {
  let indice = lista.length, nivel = 0
  if (subDeId) {
    const i = lista.findIndex((p) => p.id === subDeId)
    if (i >= 0) {
      const base = nv(lista[i])
      let fim = i
      while (fim + 1 < lista.length && nv(lista[fim + 1]) > base) fim++
      indice = fim + 1
      nivel = Math.min(2, base + 1, nv(lista[fim]) + 1)
    }
  }
  const ant = indice > 0 ? lista[indice - 1].ordem ?? null : null
  const dep = indice < lista.length ? lista[indice].ordem ?? null : null
  const ordem = ant != null && dep != null ? (ant + dep) / 2 : ant != null ? ant + PASSO : dep != null ? dep - PASSO : PASSO
  return { indice, antesDeId: indice < lista.length ? lista[indice].id : null, nivel, ordem }
}

/** Insere `item` antes da página `antesDeId` (null/ausente = no fim). Não muta. */
export function inserirAntesDe<T extends { id: string }>(lista: T[], item: T, antesDeId: string | null): T[] {
  const i = antesDeId ? lista.findIndex((p) => p.id === antesDeId) : -1
  if (i < 0) return [...lista, item]
  return [...lista.slice(0, i), item, ...lista.slice(i)]
}

/** O servidor aplicou o nível pedido? Se não, a casca faz mover+nível em segundo plano. */
export const servidorAplicouNivel = (pedido: number, devolvido: unknown): boolean => pedido === 0 || (typeof devolvido === 'number' && devolvido === pedido)

export type ResultadoCriacao = number | null // versão devolvida; null = falhou
type Meta = { tipo: 'texto' | 'folha_livre'; secaoId: string }

/**
 * Fila de criações em andamento. `registrar` SERIALIZA os POSTs (o servidor calcula "fim da seção" lendo a última página: criações
 * simultâneas colidiriam na ordem). `aguardar(id)`: undefined = nada pendente; null = a criação falhou; número = versão criada.
 */
export function criarFilaCriacao() {
  const pend = new Map<string, Promise<ResultadoCriacao>>()
  const meta = new Map<string, Meta>()
  let cadeia: Promise<unknown> = Promise.resolve()
  return {
    /** `fn` roda depois das criações anteriores; rejeição vira null. */
    registrar(id: string, fn: () => Promise<ResultadoCriacao>, m: Meta): Promise<ResultadoCriacao> {
      const p = cadeia.then(fn, fn).catch(() => null) as Promise<ResultadoCriacao>
      cadeia = p
      pend.set(id, p); meta.set(id, m)
      const limpar = () => { if (pend.get(id) === p) { pend.delete(id); meta.delete(id) } }
      void p.then(limpar, limpar)
      return p
    },
    pendente: (id: string) => pend.has(id),
    meta: (id: string) => meta.get(id),
    aguardar: async (id: string): Promise<ResultadoCriacao | undefined> => (pend.has(id) ? await pend.get(id)! : undefined),
  }
}
