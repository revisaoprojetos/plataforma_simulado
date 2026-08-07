'use client'

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import { createElement } from 'react'
import { editorReducer, createInitialState, type EditorState, type Action } from './editor-store'
import type { EditorInicial, MetaCaderno } from './normalizar'

type Ctx = { state: EditorState; dispatch: Dispatch<Action> }
const EditorCtx = createContext<Ctx | null>(null)

export function EditorProvider({ cadernoId, inicial, meta, children }: { cadernoId: string; inicial: EditorInicial; meta: MetaCaderno; children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => createInitialState(cadernoId, inicial, meta))
  return createElement(EditorCtx.Provider, { value: { state, dispatch } }, children)
}

export function useEditor(): Ctx {
  const c = useContext(EditorCtx)
  if (!c) throw new Error('useEditor deve ser usado dentro de <EditorProvider>')
  return c
}
