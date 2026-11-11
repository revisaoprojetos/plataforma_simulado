'use client'

// STORE do editor visual da página do extensivo (contrato (a)). Pilha past/present/future (limite 100).
// Estado é só da UI; persistência é do P4 (BarraVersoes). Sem hex, sem I/O.

import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react'
import type { BlocoAny, BlocoV1, Dispositivo, EstiloBloco, PaginaV1 } from '@/lib/produtos/pagina/tipos'
import type { DadosPagina } from '@/lib/produtos/pagina/dados'
import { getElemento } from '@/lib/produtos/pagina/catalogo'
import { criarBloco, novoId } from '@/lib/produtos/pagina/normalizar'

const LIMITE = 100

interface Estado {
  past: PaginaV1[]
  present: PaginaV1
  future: PaginaV1[]
  selecaoId: string | null
  dispositivo: Dispositivo
  /** Página da última gravação (referência p/ `sujo`). */
  salva: PaginaV1
  /** Chave de coalescência: edições seguidas do mesmo campo viram 1 passo de undo. */
  ultimaChave: string | null
}

type Acao =
  | { t: 'set'; fn: (p: PaginaV1) => PaginaV1; chave?: string | null; selecao?: string | null }
  | { t: 'selecionar'; id: string | null }
  | { t: 'dispositivo'; d: Dispositivo }
  | { t: 'undo' } | { t: 'redo' }
  | { t: 'salvo' }
  | { t: 'definir'; p: PaginaV1 }

function reduzir(s: Estado, a: Acao): Estado {
  switch (a.t) {
    case 'set': {
      const prox = a.fn(s.present)
      if (prox === s.present) return s
      const coalesce = !!a.chave && a.chave === s.ultimaChave
      const past = coalesce ? s.past : [...s.past, s.present].slice(-LIMITE)
      return { ...s, past, present: prox, future: [], ultimaChave: a.chave ?? null, selecaoId: a.selecao !== undefined ? a.selecao : s.selecaoId }
    }
    case 'selecionar': return s.selecaoId === a.id ? s : { ...s, selecaoId: a.id }
    case 'dispositivo': return { ...s, dispositivo: a.d }
    case 'undo': {
      if (!s.past.length) return s
      const present = s.past[s.past.length - 1]
      const sel = s.selecaoId && present.blocos.some((b) => b.id === s.selecaoId) ? s.selecaoId : null
      return { ...s, past: s.past.slice(0, -1), present, future: [s.present, ...s.future].slice(0, LIMITE), ultimaChave: null, selecaoId: sel }
    }
    case 'redo': {
      if (!s.future.length) return s
      const present = s.future[0]
      const sel = s.selecaoId && present.blocos.some((b) => b.id === s.selecaoId) ? s.selecaoId : null
      return { ...s, past: [...s.past, s.present].slice(-LIMITE), present, future: s.future.slice(1), ultimaChave: null, selecaoId: sel }
    }
    case 'salvo': return { ...s, salva: s.present }
    case 'definir': return { ...s, past: [], future: [], present: a.p, salva: a.p, selecaoId: null, ultimaChave: null }
  }
}

export interface EditorApi {
  pagina: PaginaV1
  blocos: BlocoAny[]
  selecaoId: string | null
  selecionar(id: string | null): void
  dispositivo: Dispositivo
  setDispositivo(d: Dispositivo): void
  atualizarBloco(id: string, patch: Partial<BlocoV1> | ((b: BlocoV1) => BlocoV1)): void
  atualizarConteudo(id: string, campo: string, valor: unknown): void
  atualizarEstilo(id: string, patch: Partial<EstiloBloco>): void
  mover(id: string, paraIndice: number): void
  adicionar(tipo: BlocoV1['tipo'], apos?: string | null, variacao?: string): string
  duplicar(id: string): void
  remover(id: string): void
  alternarAtivo(id: string): void
  desfazer(): void
  refazer(): void
  podeDesfazer: boolean
  podeRefazer: boolean
  sujo: boolean
  marcarSalvo(): void
  definirPagina(p: PaginaV1): void
  atualizarTema(t: NonNullable<PaginaV1['tema']>): void
  dadosAmostra: DadosPagina
  produtoId: string
}

const Ctx = createContext<EditorApi | null>(null)

const mapBloco = (p: PaginaV1, id: string, fn: (b: BlocoAny) => BlocoAny): PaginaV1 => {
  let mudou = false
  const blocos = p.blocos.map((b) => { if (b.id !== id) return b; const n = fn(b); if (n !== b) mudou = true; return n })
  return mudou ? { ...p, blocos } : p
}

export function EditorProvider({ inicial, dadosAmostra, produtoId, children }: { inicial: PaginaV1; dadosAmostra: DadosPagina; produtoId: string; children: ReactNode }) {
  const [s, dispatch] = useReducer(reduzir, undefined, (): Estado => ({ past: [], present: inicial, future: [], selecaoId: null, dispositivo: 'desktop', salva: inicial, ultimaChave: null }))
  // Espelho síncrono do estado (adicionar/duplicar precisam validar e devolver id sem esperar o render).
  const ref = useRef(s); ref.current = s

  const set = useCallback((fn: (p: PaginaV1) => PaginaV1, chave?: string | null, selecao?: string | null) => dispatch({ t: 'set', fn, chave, selecao }), [])

  const api = useMemo<EditorApi>(() => ({
    pagina: s.present,
    blocos: s.present.blocos,
    selecaoId: s.selecaoId,
    selecionar: (id) => dispatch({ t: 'selecionar', id }),
    dispositivo: s.dispositivo,
    setDispositivo: (d) => dispatch({ t: 'dispositivo', d }),
    atualizarBloco: (id, patch) => set((p) => mapBloco(p, id, (b) => (typeof patch === 'function' ? (patch as (b: BlocoV1) => BlocoV1)(b as BlocoV1) as BlocoAny : ({ ...b, ...patch } as BlocoAny)))),
    atualizarConteudo: (id, campo, valor) => set((p) => mapBloco(p, id, (b) => {
      if (campo === 'nome') return { ...b, nome: String(valor ?? '') } as BlocoAny
      if ((b.conteudo as Record<string, unknown>)[campo] === valor) return b
      return { ...b, conteudo: { ...b.conteudo, [campo]: valor } } as BlocoAny
    }), `c:${id}:${campo}`),
    atualizarEstilo: (id, patch) => set((p) => mapBloco(p, id, (b) => ({ ...b, estilo: { ...b.estilo, ...patch } } as BlocoAny)), `e:${id}:${Object.keys(patch).join(',')}`),
    mover: (id, para) => set((p) => {
      const de = p.blocos.findIndex((b) => b.id === id)
      if (de < 0) return p
      const alvo = Math.max(0, Math.min(p.blocos.length - 1, para))
      if (alvo === de) return p
      const blocos = p.blocos.slice(); const [b] = blocos.splice(de, 1); blocos.splice(alvo, 0, b)
      return { ...p, blocos }
    }),
    adicionar: (tipo, apos, variacao) => {
      const cur = ref.current.present
      const def = getElemento(tipo)
      if (!def.podeAdicionar({ blocos: cur.blocos, temInstrutores: ref.current.present.blocos.some((b) => b.tipo === 'instrutores') || dadosAmostra.instrutores.length > 0 })) {
        const ex = cur.blocos.find((b) => b.tipo === tipo)
        if (ex) dispatch({ t: 'selecionar', id: ex.id })
        return ex?.id ?? ''
      }
      const id = novoId()
      const novo = criarBloco(tipo, { id, ...(variacao ? { variacao } : {}) }) as BlocoAny
      set((p) => {
        const i = apos === undefined ? p.blocos.length : apos === null ? 0 : p.blocos.findIndex((b) => b.id === apos) + 1
        const blocos = p.blocos.slice(); blocos.splice(i < 0 ? blocos.length : i, 0, novo)
        return { ...p, blocos }
      }, null, id)
      return id
    },
    duplicar: (id) => {
      const orig = ref.current.present.blocos.find((b) => b.id === id)
      if (!orig || getElemento(orig.tipo).unico) return
      const novoIdBloco = novoId()
      set((p) => {
        const i = p.blocos.findIndex((b) => b.id === id); if (i < 0) return p
        const cp = JSON.parse(JSON.stringify(orig)) as BlocoAny; cp.id = novoIdBloco; if (cp.ancora) delete cp.ancora
        const blocos = p.blocos.slice(); blocos.splice(i + 1, 0, cp)
        return { ...p, blocos }
      }, null, novoIdBloco)
    },
    remover: (id) => set((p) => (p.blocos.some((b) => b.id === id) ? { ...p, blocos: p.blocos.filter((b) => b.id !== id) } : p), null, ref.current.selecaoId === id ? null : undefined),
    alternarAtivo: (id) => set((p) => mapBloco(p, id, (b) => ({ ...b, ativo: !b.ativo } as BlocoAny))),
    desfazer: () => dispatch({ t: 'undo' }),
    refazer: () => dispatch({ t: 'redo' }),
    podeDesfazer: s.past.length > 0,
    podeRefazer: s.future.length > 0,
    sujo: s.present !== s.salva,
    marcarSalvo: () => dispatch({ t: 'salvo' }),
    definirPagina: (p) => dispatch({ t: 'definir', p }),
    atualizarTema: (t) => set((p) => ({ ...p, tema: t }), 'tema'),
    dadosAmostra,
    produtoId,
  }), [s, set, dadosAmostra, produtoId])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useEditor(): EditorApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useEditor fora de <EditorProvider>')
  return c
}
