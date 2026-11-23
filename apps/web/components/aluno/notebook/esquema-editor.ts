'use client'
// Schema ProseMirror do editor do Caderno (mesmas extensões da página de texto e das caixas), criado UMA vez por sessão da aba.
import { getSchema } from '@tiptap/react'
import type { Schema } from '@tiptap/pm/model'
import { criarExtensoesEditor } from './extensoes-editor'

let esquema: Schema | null = null
export const esquemaEditor = (): Schema => (esquema ??= getSchema(criarExtensoesEditor()))
