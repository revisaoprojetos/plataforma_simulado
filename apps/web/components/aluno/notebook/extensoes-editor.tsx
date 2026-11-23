'use client'
// Conjunto ÚNICO de extensões + CSS do editor TipTap do Caderno. Usado pela página de texto (editor-pagina.tsx) e pelas
// CAIXAS de texto da folha livre (folha-livre/caixa-texto-folha.tsx): mesma lista branca (a do servidor, notebook-server.ts),
// sem variantes paralelas. Fica separado de extensoes-texto.tsx para não puxar StarterKit/Table no chunk da casca OneNote.
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { urlOk } from '@/lib/aluno/notebook-texto'
import { QuestaoRef, GrifoSnapshot, AnotacaoRef } from './extensoes'
import { EXTENSOES_TEXTO } from './extensoes-texto'


/** Extensões do editor do Caderno. Crie UMA vez por editor (useMemo). */
export function criarExtensoesEditor(placeholder = 'Escreva aqui…') {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' }, isAllowedUri: (u: string) => urlOk(u) },
    }),
    Placeholder.configure({ placeholder }),
    TaskList, TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
    QuestaoRef, GrifoSnapshot, AnotacaoRef,
    ...EXTENSOES_TEXTO,
  ]
}

/** CSS do conteúdo (escopo `.nb-editor .ProseMirror`; somente tokens). Acompanha CSS_TEXTO de extensoes-texto.tsx. */
export const CSS_EDITOR = [
  '.nb-editor .ProseMirror{outline:none;min-height:50vh;padding:6px 2px 80px;font-size:16px;line-height:1.7;color:var(--ink);overflow-wrap:anywhere}',
  '.nb-editor .ProseMirror h1{font-size:1.7em;font-weight:800;margin:1em 0 .4em}',
  '.nb-editor .ProseMirror h2{font-size:1.4em;font-weight:800;margin:1em 0 .4em}',
  '.nb-editor .ProseMirror h3{font-size:1.15em;font-weight:800;margin:1em 0 .4em}',
  '.nb-editor .ProseMirror p{margin:.4em 0}',
  '.nb-editor .ProseMirror ul{list-style:disc;padding-left:1.5em}',
  '.nb-editor .ProseMirror ol{list-style:decimal;padding-left:1.5em}',
  '.nb-editor .ProseMirror ul[data-type=taskList]{list-style:none;padding-left:.2em}',
  '.nb-editor .ProseMirror ul[data-type=taskList] li{display:flex;gap:10px;align-items:flex-start}',
  '.nb-editor .ProseMirror ul[data-type=taskList] li>label{margin-top:.35em}',
  '.nb-editor .ProseMirror ul[data-type=taskList] li>label input{width:18px;height:18px;accent-color:var(--brand)}',
  '.nb-editor .ProseMirror ul[data-type=taskList] li>div{flex:1}',
  '.nb-editor .ProseMirror blockquote{border-left:3px solid var(--gold);padding-left:12px;color:var(--muted);margin:.8em 0}',
  '.nb-editor .ProseMirror pre{background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:12px;overflow-x:auto;font-size:13.5px}',
  '.nb-editor .ProseMirror code{background:var(--surface2);border-radius:5px;padding:1px 5px;font-size:.92em}',
  '.nb-editor .ProseMirror a{color:var(--brand);text-decoration:underline}',
  '.nb-editor .ProseMirror table{border-collapse:collapse;width:100%;table-layout:fixed;margin:.8em 0}',
  '.nb-editor .ProseMirror td,.nb-editor .ProseMirror th{border:1px solid var(--line);padding:6px 8px;vertical-align:top;min-width:60px}',
  '.nb-editor .ProseMirror th{background:var(--surface2);font-weight:800;text-align:left}',
  '.nb-editor .ProseMirror .selectedCell{background:var(--chip)}',
  '.nb-editor .ProseMirror p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:var(--muted);float:left;height:0;pointer-events:none}',
  '.nb-editor .ProseMirror .ProseMirror-selectednode{outline:2px solid var(--brand);border-radius:14px}',
].join('')
