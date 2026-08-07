// Estado central do editor unificado de cadernos (reducer + Context).
// O DOCUMENTO por modalidade é a MESMA estrutura que persiste em config.docsV2 (contrato da
// impressão). Toda mutação de documento passa por `mutateDoc(fn)` — a função recebe o CadernoDoc
// atual e devolve o novo (reusa as ops imutáveis de block-tree). O histórico (undo/redo) é POR
// modalidade e guarda a referência do doc anterior — O(1) em memória graças ao structural sharing.

import { novoDoc, type CadernoDoc, type Modalidade, type HudCores, type HudPorPagina } from '@/lib/caderno-designer/types'
import type { MaterialCaderno } from '@/lib/caderno-designer/material'
import { OCULTAR_DISCURSIVA } from '@/lib/flags'
import type { EditorInicial, MetaCaderno } from './normalizar'

export type Regiao = 'pagina' | 'cabecalho' | 'rodape'
export type Pos = 'top' | 'bottom' | 'in' | 'left' | 'right'
export type AbaDireita = 'bloco' | 'aparencia' | 'pagina' | 'faixas' | 'material'
export type Alvo =
  | { kind: 'page'; pageId: string }
  | { kind: 'after'; blockId: string }
  | { kind: 'before'; blockId: string }
  | { kind: 'into'; containerId: string }
  | { kind: 'lado'; blockId: string; lado: 'left' | 'right' }
  | { kind: 'regiao'; regiao: 'cabecalho' | 'rodape' }

export type EditorState = {
  cadernoId: string
  docs: Record<string, CadernoDoc>
  modalidades: Modalidade[]
  modAtiva: string
  cores: Record<string, string>
  hudCores: HudCores
  hudPorPagina: HudPorPagina
  bancoId: string | null
  meta: MetaCaderno
  metaDirty: boolean
  material: MaterialCaderno
  materialEnunciado: MaterialCaderno
  // UI efêmera (fora do histórico)
  selPage: string | null
  selBlock: string | null
  regiao: Regiao
  abaDireita: AbaDireita
  regIndex: number
  previewQ: number
  hudMode: boolean
  arrastando: boolean
  overId: string | null
  overPos: Pos | null
  // Histórico por modalidade
  history: Record<string, { undo: CadernoDoc[]; redo: CadernoDoc[] }>
  lastChange: number
}

export type Action =
  | { t: 'mutateDoc'; fn: (d: CadernoDoc) => CadernoDoc; coalesce?: boolean }
  | { t: 'replaceDoc'; doc: CadernoDoc } // preset/import — sempre registra desfazer
  | { t: 'undo' } | { t: 'redo' }
  | { t: 'setModAtiva'; id: string }
  | { t: 'addModalidade'; m: Modalidade; doc: CadernoDoc }
  | { t: 'renameModalidade'; id: string; nome: string }
  | { t: 'removeModalidade'; id: string }
  | { t: 'setCores'; cores: Record<string, string> }
  | { t: 'setHudCores'; hud: HudCores } | { t: 'setHudPorPagina'; hpp: HudPorPagina } | { t: 'setHudMode'; v: boolean }
  | { t: 'setBanco'; bancoId: string | null }
  | { t: 'setMeta'; patch: Partial<MetaCaderno> }
  | { t: 'metaSalvo' }
  | { t: 'setMaterial'; slot: 'material' | 'enunciado'; material: MaterialCaderno }
  | { t: 'sel'; selBlock?: string | null; selPage?: string | null; regiao?: Regiao; aba?: AbaDireita }
  | { t: 'setAba'; aba: AbaDireita }
  | { t: 'setOver'; id: string | null; pos?: Pos }
  | { t: 'setArrastando'; v: boolean }
  | { t: 'setRegIndex'; i: number } | { t: 'setPreviewQ'; i: number }
  | { t: 'setDocsAfterSave'; docs: Record<string, CadernoDoc> } // pós-save (imagens hospedadas) — sem histórico

const CAP = 60
const ehDiscursiva = (m: Modalidade) => /discursiv|reda[çc][ãa]o/i.test(`${m.id} ${m.nome}`)

export function modalidadesVisiveis(mods: Modalidade[]): Modalidade[] {
  return OCULTAR_DISCURSIVA ? mods.filter((m) => !ehDiscursiva(m)) : mods
}

export function createInitialState(cadernoId: string, inicial: EditorInicial, meta: MetaCaderno): EditorState {
  const vis = modalidadesVisiveis(inicial.modalidades)
  return {
    cadernoId,
    docs: inicial.docs,
    modalidades: inicial.modalidades,
    modAtiva: (vis[0] ?? inicial.modalidades[0]).id,
    cores: inicial.cores,
    hudCores: inicial.hudCores,
    hudPorPagina: inicial.hudPorPagina,
    bancoId: inicial.bancoId,
    meta,
    metaDirty: false,
    material: inicial.material,
    materialEnunciado: inicial.materialEnunciado,
    selPage: null, selBlock: null, regiao: 'pagina', abaDireita: 'bloco',
    regIndex: 0, previewQ: 0, hudMode: false,
    arrastando: false, overId: null, overPos: null,
    history: {}, lastChange: 0,
  }
}

function histDe(state: EditorState) { return state.history[state.modAtiva] ?? { undo: [], redo: [] } }

/** Aplica um novo doc à modalidade ativa registrando desfazer (com coalescing opcional). */
function comHistorico(state: EditorState, novo: CadernoDoc, coalesce: boolean): EditorState {
  const atual = state.docs[state.modAtiva] ?? novoDoc()
  if (novo === atual) return state
  const now = Date.now()
  const junta = coalesce && now - state.lastChange <= 350
  const h = histDe(state)
  const nh = junta ? { ...h, redo: [] } : { undo: [...h.undo.slice(-(CAP - 1)), atual], redo: [] }
  return { ...state, docs: { ...state.docs, [state.modAtiva]: novo }, history: { ...state.history, [state.modAtiva]: nh }, lastChange: now }
}

export function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.t) {
    case 'mutateDoc': {
      const atual = state.docs[state.modAtiva] ?? novoDoc()
      return comHistorico(state, action.fn(atual), !!action.coalesce)
    }
    case 'replaceDoc':
      return { ...comHistorico(state, action.doc, false), selBlock: null, selPage: null, regiao: 'pagina', lastChange: 0 }
    case 'undo': {
      const h = histDe(state); if (!h.undo.length) return state
      const anterior = h.undo[h.undo.length - 1]
      const cur = state.docs[state.modAtiva] ?? novoDoc()
      return { ...state, docs: { ...state.docs, [state.modAtiva]: anterior }, history: { ...state.history, [state.modAtiva]: { undo: h.undo.slice(0, -1), redo: [...h.redo, cur] } }, lastChange: 0 }
    }
    case 'redo': {
      const h = histDe(state); if (!h.redo.length) return state
      const proximo = h.redo[h.redo.length - 1]
      const cur = state.docs[state.modAtiva] ?? novoDoc()
      return { ...state, docs: { ...state.docs, [state.modAtiva]: proximo }, history: { ...state.history, [state.modAtiva]: { undo: [...h.undo, cur], redo: h.redo.slice(0, -1) } }, lastChange: 0 }
    }
    case 'setModAtiva':
      return { ...state, modAtiva: action.id, selBlock: null, selPage: null, regiao: 'pagina' }
    case 'addModalidade':
      return { ...state, modalidades: [...state.modalidades, action.m], docs: { ...state.docs, [action.m.id]: action.doc }, modAtiva: action.m.id, selBlock: null }
    case 'renameModalidade':
      return { ...state, modalidades: state.modalidades.map((m) => m.id === action.id ? { ...m, nome: action.nome } : m) }
    case 'removeModalidade': {
      if (state.modalidades.length <= 1) return state
      const restantes = state.modalidades.filter((m) => m.id !== action.id)
      const docs = { ...state.docs }; delete docs[action.id]
      const hist = { ...state.history }; delete hist[action.id]
      const modAtiva = state.modAtiva === action.id ? (modalidadesVisiveis(restantes)[0] ?? restantes[0]).id : state.modAtiva
      return { ...state, modalidades: restantes, docs, history: hist, modAtiva, selBlock: null }
    }
    case 'setCores': return { ...state, cores: action.cores }
    case 'setHudCores': return { ...state, hudCores: action.hud }
    case 'setHudPorPagina': return { ...state, hudPorPagina: action.hpp }
    case 'setHudMode': return { ...state, hudMode: action.v }
    case 'setBanco': return { ...state, bancoId: action.bancoId }
    case 'setMeta': return { ...state, meta: { ...state.meta, ...action.patch }, metaDirty: true }
    case 'metaSalvo': return { ...state, metaDirty: false }
    case 'setMaterial': return action.slot === 'enunciado' ? { ...state, materialEnunciado: action.material } : { ...state, material: action.material }
    case 'sel':
      return {
        ...state,
        selBlock: action.selBlock !== undefined ? action.selBlock : state.selBlock,
        selPage: action.selPage !== undefined ? action.selPage : state.selPage,
        regiao: action.regiao ?? state.regiao,
        abaDireita: action.aba ?? state.abaDireita,
      }
    case 'setAba': return { ...state, abaDireita: action.aba }
    case 'setOver': return { ...state, overId: action.id, overPos: action.id ? (action.pos ?? 'in') : null }
    case 'setArrastando': return { ...state, arrastando: action.v, ...(action.v ? {} : { overId: null, overPos: null }) }
    case 'setRegIndex': return { ...state, regIndex: action.i }
    case 'setPreviewQ': return { ...state, previewQ: action.i }
    case 'setDocsAfterSave': return { ...state, docs: action.docs }
    default: return state
  }
}
