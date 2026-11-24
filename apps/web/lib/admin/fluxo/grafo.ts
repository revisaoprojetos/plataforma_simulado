/**
 * VALIDAÇÃO DO GRAFO MESCLADO (base + usuário). Puro, client-safe. Só aponta problemas que envolvem o que o USUÁRIO criou
 * (o grafo base é do domínio e não é questionado). `erro` bloqueia o salvamento; `aviso` apenas informa.
 */
import type { DiagramaFluxo } from './adaptador'

export interface ProblemaGrafo { nivel: 'erro' | 'aviso'; diagrama: string; noId?: string; mensagem: string }

/** Ciclos (componentes fortemente conexos com >1 nó ou laço) via Tarjan iterativo; devolve os grupos de ids. */
export function acharCiclos(ids: readonly string[], arestas: ReadonlyArray<{ de: string; para: string }>): string[][] {
  const adj = new Map<string, string[]>(ids.map((i) => [i, []]))
  for (const a of arestas) if (adj.has(a.de) && adj.has(a.para)) adj.get(a.de)!.push(a.para)
  let idx = 0
  const ordem = new Map<string, number>(), baixo = new Map<string, number>(), naPilha = new Set<string>(), pilha: string[] = [], out: string[][] = []
  const visitar = (raiz: string) => {
    const trabalho: Array<{ v: string; i: number }> = [{ v: raiz, i: 0 }]
    ordem.set(raiz, idx); baixo.set(raiz, idx); idx++; pilha.push(raiz); naPilha.add(raiz)
    while (trabalho.length) {
      const f = trabalho[trabalho.length - 1]
      const vizinhos = adj.get(f.v) ?? []
      if (f.i < vizinhos.length) {
        const w = vizinhos[f.i++]
        if (!ordem.has(w)) { ordem.set(w, idx); baixo.set(w, idx); idx++; pilha.push(w); naPilha.add(w); trabalho.push({ v: w, i: 0 }) }
        else if (naPilha.has(w)) baixo.set(f.v, Math.min(baixo.get(f.v)!, ordem.get(w)!))
      } else {
        if (baixo.get(f.v) === ordem.get(f.v)) {
          const comp: string[] = []
          let w: string
          do { w = pilha.pop()!; naPilha.delete(w); comp.push(w) } while (w !== f.v)
          if (comp.length > 1 || (adj.get(comp[0]) ?? []).includes(comp[0])) out.push(comp)
        }
        trabalho.pop()
        const pai = trabalho[trabalho.length - 1]
        if (pai) baixo.set(pai.v, Math.min(baixo.get(pai.v)!, baixo.get(f.v)!))
      }
    }
  }
  for (const i of ids) if (!ordem.has(i)) visitar(i)
  return out
}

export function validarGrafo(diagramas: readonly DiagramaFluxo[]): ProblemaGrafo[] {
  const out: ProblemaGrafo[] = []
  for (const d of diagramas) {
    const porId = new Map(d.nos.map((n) => [n.id, n]))
    const entra = new Map<string, number>(), sai = new Map<string, number>()
    for (const a of d.arestas) { sai.set(a.de, (sai.get(a.de) ?? 0) + 1); entra.set(a.para, (entra.get(a.para) ?? 0) + 1) }
    for (const n of d.nos) {
      if (n.origem !== 'usuario') continue
      const e = entra.get(n.id) ?? 0, s = sai.get(n.id) ?? 0
      const ref = `“${n.titulo}”`
      if (n.tipo !== 'nota' && e + s === 0) out.push({ nivel: 'aviso', diagrama: d.id, noId: n.id, mensagem: `${ref} está solto (sem nenhuma conexão).` })
      if (n.tipo === 'decisao' && s < 2) out.push({ nivel: 'erro', diagrama: d.id, noId: n.id, mensagem: `A decisão ${ref} precisa de 2 saídas (sim/não); tem ${s}.` })
      if (n.tipo === 'decisao' && s >= 2) {
        const rot = d.arestas.filter((a) => a.de === n.id && !a.rotulo?.trim()).length
        if (rot > 0) out.push({ nivel: 'aviso', diagrama: d.id, noId: n.id, mensagem: `A decisão ${ref} tem saída sem rótulo (use sim/não).` })
      }
      if (n.tipo === 'condicao' && s === 0) out.push({ nivel: 'aviso', diagrama: d.id, noId: n.id, mensagem: `A condição ${ref} não leva a nenhuma ação.` })
      if (n.tipo === 'acao' && s > 0) out.push({ nivel: 'aviso', diagrama: d.id, noId: n.id, mensagem: `A ação ${ref} é um ponto final; as saídas dela não são executadas.` })
      if (n.tipo === 'inicio' && e > 0) out.push({ nivel: 'aviso', diagrama: d.id, noId: n.id, mensagem: `O início ${ref} recebe conexão de entrada.` })
      if (n.tipo === 'resultado' && s > 0) out.push({ nivel: 'aviso', diagrama: d.id, noId: n.id, mensagem: `O resultado ${ref} tem saída; normalmente é o fim do fluxo.` })
    }
    const ciclos = acharCiclos(d.nos.map((n) => n.id), d.arestas)
    for (const c of ciclos) {
      const conj = new Set(c)
      const usuario = d.arestas.some((a) => a.origem === 'usuario' && conj.has(a.de) && conj.has(a.para))
      if (!usuario) continue
      const exec = c.some((id) => { const t = porId.get(id)?.tipo; return t === 'condicao' || t === 'acao' })
      out.push({ nivel: exec ? 'erro' : 'aviso', diagrama: d.id, noId: c[0], mensagem: `Ciclo no diagrama: ${c.map((id) => `“${porId.get(id)?.titulo ?? id}”`).join(' → ')}${exec ? ' (regras executáveis não podem formar ciclo).' : '.'}` })
    }
  }
  return out
}
