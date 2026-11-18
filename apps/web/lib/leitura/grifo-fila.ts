// Fila de operações de grifo SERIALIZADA POR cid (client id), TS puro (sem DOM/React) — usada pelo host
// leitor-jus.tsx para retransmitir criar/editar/apagar grifo do iframe para /api/leitura/anotacao.
//
// Problemas que resolve:
//  - del/upd emitidos ANTES de o servidor devolver o id (add ainda em voo/retry): esperam o add terminar
//    e só então apagam/atualizam (antes: nenhum del era enviado e o grifo reaparecia ao recarregar).
//  - add não idempotente: o POST leva `cid`; o servidor devolve o MESMO id se já gravou (resposta perdida).
//  - falha definitiva: a operação fica em `falhas` (nunca descarta) e é retomada depois (retomarFalhas).
//  - exact > 4000 chars: dividido em partes (cor/nota na primeira); apagar/editar atinge todas.

export const EXACT_MAX = 4000

export type CorpoAdd = {
  documento_id: string
  versao: number
  inicio_char: number
  fim_char: number
  exact: string
  prefix: string
  suffix: string
  cor?: string
  nota?: string
  tipo: 'grifo' | 'nota'
}

export type OpGrifo =
  | { op: 'add'; cid: string; corpo: CorpoAdd }
  | { op: 'upd'; cid?: string; id?: string | null; cor?: string; nota?: string | null }
  | { op: 'del'; cid?: string; id?: string | null }

export type RespostaHttp = { ok: boolean; status: number; json: any } | null // null = erro de rede

export type DepsFila = {
  enviar: (req: { method: 'POST' | 'DELETE'; qs: string; body?: unknown }) => Promise<RespostaHttp>
  esperar: (ms: number) => Promise<void>
  onSaved?: (cid: string, id: string, ids: string[]) => void
  onStatus?: (s: { estado: 'sync' | 'ok' | 'erro'; pendentes: number; naoSync: number }) => void
  onAviso?: (msg: string) => void
  esperas?: number[]
}

type Tarefa = () => Promise<void>

/** Divide um corpo de add em partes com exact ≤ max, quebrando preferencialmente em espaço. */
export function dividirCorpo(c: CorpoAdd, max = EXACT_MAX, ctx = 32): CorpoAdd[] {
  if (c.exact.length <= max) return [c]
  const partes: CorpoAdd[] = []
  let off = 0
  while (off < c.exact.length) {
    let fim = Math.min(c.exact.length, off + max)
    if (fim < c.exact.length) {
      const sp = c.exact.lastIndexOf(' ', fim)
      if (sp > off + max * 0.5) fim = sp + 1
    }
    const exact = c.exact.slice(off, fim)
    const primeira = off === 0
    partes.push({
      ...c,
      inicio_char: c.inicio_char + off,
      fim_char: c.inicio_char + fim,
      exact,
      prefix: primeira ? c.prefix : c.exact.slice(Math.max(0, off - ctx), off),
      suffix: fim >= c.exact.length ? c.suffix : c.exact.slice(fim, fim + ctx),
      cor: c.cor,
      nota: primeira ? c.nota : undefined,
    })
    off = fim
  }
  return partes
}

export function criarFilaGrifos(deps: DepsFila) {
  const esperas = deps.esperas ?? [1500, 5000, 15000, 30000]
  const ids = new Map<string, string[]>() // cid → ids no servidor (1 por parte)
  const tentados = new Set<string>() // cids cujo add chegou a ser tentado
  const cadeias = new Map<string, Promise<void>>()
  const falhas = new Map<string, Tarefa>() // `${cid}:${op}` → tarefa a retomar
  const adds = new Map<string, CorpoAdd[]>() // corpos dos adds com falha (mutáveis p/ upd posterior)
  const aguardando: Array<() => void> = []
  let pendentes = 0

  const status = (estado: 'sync' | 'ok' | 'erro') => deps.onStatus?.({ estado, pendentes, naoSync: falhas.size })
  const fimDeTudo = () => {
    if (pendentes > 0) return
    status(falhas.size ? 'erro' : 'ok')
    while (aguardando.length) aguardando.shift()!()
  }

  /** Executa com retry/backoff. Devolve a resposta ok ou null (falha definitiva). */
  async function comRetry(req: Parameters<DepsFila['enviar']>[0]): Promise<RespostaHttp> {
    for (let i = 0; i <= esperas.length; i++) {
      const r = await deps.enviar(req).catch(() => null)
      if (r?.ok) return r
      // 4xx (exceto 408/429) não adianta repetir.
      if (r && r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) return null
      if (i < esperas.length) await deps.esperar(esperas[i])
    }
    return null
  }

  function enfileirar(chave: string, t: Tarefa) {
    pendentes += 1
    status('sync')
    const prev = cadeias.get(chave) ?? Promise.resolve()
    const prox = prev.then(t).catch(() => undefined).then(() => {
      pendentes = Math.max(0, pendentes - 1)
      if (cadeias.get(chave) === prox) cadeias.delete(chave)
      fimDeTudo()
    })
    cadeias.set(chave, prox)
    return prox
  }

  const chaveDe = (o: OpGrifo): string => {
    if (o.cid) return o.cid
    return 'id:' + (('id' in o && o.id) || '_')
  }
  const idsDe = (o: { cid?: string; id?: string | null }): string[] => {
    const known = o.cid ? ids.get(o.cid) : undefined
    if (known?.length) return known
    return o.id ? [o.id] : []
  }

  function tarefaAdd(cid: string, corpos: CorpoAdd[]): Tarefa {
    return async () => {
      tentados.add(cid)
      const novos: string[] = []
      for (let k = 0; k < corpos.length; k++) {
        // parte k>0 usa cid derivado: idempotente também por parte.
        const r = await comRetry({ method: 'POST', qs: '', body: { ...corpos[k], cid: k === 0 ? cid : `${cid}#${k}` } })
        const id = r?.json?.id
        if (!r || !id) {
          // Falha definitiva: partes já gravadas continuam no servidor (idempotentes no retry).
          falhas.set(`${cid}:add`, tarefaAdd(cid, adds.get(cid) ?? corpos))
          adds.set(cid, corpos)
          return
        }
        novos.push(String(id))
      }
      falhas.delete(`${cid}:add`)
      adds.delete(cid)
      ids.set(cid, novos)
      deps.onSaved?.(cid, novos[0], novos)
    }
  }

  function tarefaUpd(o: { cid?: string; id?: string | null; cor?: string; nota?: string | null }): Tarefa {
    return async () => {
      const alvo = idsDe(o)
      if (!alvo.length) {
        // add ainda não conseguiu gravar: o reenvio do add leva o estado ATUAL (cor/nota).
        const c = o.cid ? adds.get(o.cid) : undefined
        if (c?.length) {
          if (o.cor) c.forEach((x) => { x.cor = o.cor })
          if ('nota' in o) c[0].nota = o.nota || undefined
        }
        return
      }
      const chave = `${o.cid ?? alvo[0]}:upd`
      for (let k = 0; k < alvo.length; k++) {
        const r = await comRetry({ method: 'POST', qs: '', body: { id: alvo[k], cor: o.cor, nota: k === 0 ? (o.nota ?? null) : null } })
        if (!r) { falhas.set(chave, tarefaUpd(o)); return }
      }
      falhas.delete(chave)
    }
  }

  function tarefaDel(o: { cid?: string; id?: string | null }): Tarefa {
    return async () => {
      const alvo = idsDe(o)
      const chave = `${o.cid ?? alvo[0] ?? '_'}:del`
      let ok = true
      if (alvo.length) {
        for (const id of alvo) {
          const r = await comRetry({ method: 'DELETE', qs: '?id=' + encodeURIComponent(id) })
          if (!r) ok = false
        }
      } else if (o.cid && tentados.has(o.cid)) {
        // add falhou sem resposta (a gravação pode ter ocorrido): apaga pelo client id (idempotente).
        const r = await comRetry({ method: 'DELETE', qs: '?cid=' + encodeURIComponent(o.cid) })
        if (!r) ok = false
      }
      if (ok) {
        falhas.delete(chave)
        if (o.cid) {
          for (const k of ['add', 'upd']) falhas.delete(`${o.cid}:${k}`)
          ids.delete(o.cid); adds.delete(o.cid); tentados.delete(o.cid)
        }
      } else falhas.set(chave, tarefaDel(o))
    }
  }

  return {
    enviar(o: OpGrifo) {
      if (o.op === 'add') {
        const corpos = dividirCorpo(o.corpo)
        if (corpos.length > 1) deps.onAviso?.(`Trecho muito longo: salvo em ${corpos.length} partes (a cor e a nota ficam na primeira).`)
        falhas.delete(`${o.cid}:add`)
        return enfileirar(o.cid, tarefaAdd(o.cid, corpos))
      }
      if (o.op === 'upd') {
        return enfileirar(chaveDe(o), tarefaUpd(o))
      }
      return enfileirar(chaveDe(o), tarefaDel(o))
    },
    /** Reenfileira o que falhou definitivamente (timer/online). */
    retomarFalhas() {
      const lista = [...falhas.entries()]
      falhas.clear()
      for (const [k, t] of lista) enfileirar(k.split(':')[0], t)
    },
    /** Resolve quando a fila esvazia ou após `timeoutMs` (usado antes de navegar). */
    esvaziar(timeoutMs = 3000): Promise<void> {
      if (pendentes === 0) return Promise.resolve()
      return new Promise((res) => {
        const t = setTimeout(res, timeoutMs)
        aguardando.push(() => { clearTimeout(t); res() })
      })
    },
    get pendentes() { return pendentes },
    get naoSincronizados() { return falhas.size },
    idsDe: (cid: string) => ids.get(cid) ?? [],
  }
}
