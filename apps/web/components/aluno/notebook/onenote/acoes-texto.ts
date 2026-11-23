// Ações de edição sobre uma instância TipTap (usadas pelos comandos do ribbon e pelo atalho Tab).
// Nada aqui toca em rede ou em React: só `Editor` -> comandos.
import type { Editor } from '@tiptap/react'
import { RECUO_MAX, type MarcaParagrafo } from '@/lib/aluno/notebook-tipos'

const BLOCOS = ['paragraph', 'heading'] as const
/** Marks removidas por "Limpar formatação" (links ficam). */
export const MARKS_FORMATACAO = ['bold', 'italic', 'underline', 'strike', 'code', 'highlight', 'subscript', 'superscript', 'textStyle'] as const

/** Atualiza atributos de parágrafo E título sob a seleção. */
export function atributosBloco(editor: Editor, attrs: Record<string, unknown>) {
  const c = editor.chain().focus()
  for (const t of BLOCOS) c.updateAttributes(t, attrs)
  return c.run()
}

export const ALINHAMENTO_PAYLOAD: Record<string, 'left' | 'center' | 'right' | 'justify'> = {
  esquerda: 'left', centro: 'center', direita: 'right', justificar: 'justify',
}
export function alinhar(editor: Editor, payload: unknown) {
  const v = typeof payload === 'string' ? ALINHAMENTO_PAYLOAD[payload] : undefined
  if (v) atributosBloco(editor, { textAlign: v })
}

const emLista = (e: Editor) => e.isActive('listItem') || e.isActive('taskItem')
const tipoItem = (e: Editor) => (e.isActive('taskItem') ? 'taskItem' : 'listItem')

/** Nível de recuo do bloco sob o cursor (0..RECUO_MAX). */
export function recuoAtual(editor: Editor): number {
  const n = editor.getAttributes('paragraph').indent ?? editor.getAttributes('heading').indent ?? 0
  return typeof n === 'number' ? n : 0
}

/** Aumenta o recuo: item de lista vira sub-item; parágrafo ganha recuo (até RECUO_MAX). Sempre devolve true (mantém o foco no editor). */
export function recuoMais(editor: Editor): boolean {
  if (emLista(editor)) { editor.chain().focus().sinkListItem(tipoItem(editor)).run(); return true }
  atributosBloco(editor, { indent: Math.min(RECUO_MAX, recuoAtual(editor) + 1) })
  return true
}
export function recuoMenos(editor: Editor): boolean {
  if (emLista(editor)) { editor.chain().focus().liftListItem(tipoItem(editor)).run(); return true }
  const n = recuoAtual(editor)
  atributosBloco(editor, { indent: n > 1 ? n - 1 : null })
  return true
}

/** Tab no editor: tabela -> próxima célula (cria linha na última); lista/parágrafo -> recuo. */
export function teclaTab(editor: Editor, shift: boolean): boolean {
  if (editor.isActive('table')) {
    if (shift) return editor.chain().focus().goToPreviousCell().run()
    if (editor.chain().focus().goToNextCell().run()) return true
    return editor.chain().focus().addRowAfter().goToNextCell().run()
  }
  if (editor.isActive('codeBlock')) { if (!shift) editor.chain().focus().insertContent('\t').run(); return true }
  return shift ? recuoMenos(editor) : recuoMais(editor)
}

export function limparFormatacao(editor: Editor) {
  const c = editor.chain().focus()
  for (const m of MARKS_FORMATACAO) c.unsetMark(m)
  for (const t of BLOCOS) c.updateAttributes(t, { textAlign: null, indent: null, estilo: null })
  c.run()
}

/** Marca na margem do parágrafo (Importante/Pergunta/Lembrar/Definição): alterna; 'A Fazer' = lista de tarefas. */
export function alternarMarca(editor: Editor, tipo: MarcaParagrafo | 'a_fazer') {
  if (tipo === 'a_fazer') { editor.chain().focus().toggleTaskList().run(); return }
  const atual = editor.getAttributes('paragraph').marca ?? editor.getAttributes('heading').marca
  atributosBloco(editor, { marca: atual === tipo ? null : tipo })
}
export const removerMarca = (editor: Editor) => atributosBloco(editor, { marca: null })

export function aplicarEstilo(editor: Editor, estilo: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'titulo_pagina' | 'citacao' | 'codigo' | 'normal') {
  const c = editor.chain().focus()
  if (/^h[1-6]$/.test(estilo)) { c.toggleHeading({ level: Number(estilo[1]) as 1 | 2 | 3 | 4 | 5 | 6 }).run(); return }
  switch (estilo) {
    case 'citacao': c.toggleBlockquote().run(); return
    case 'codigo': c.toggleCodeBlock().run(); return
    case 'titulo_pagina': {
      if (editor.getAttributes('paragraph').estilo === 'titulo_pagina') { atributosBloco(editor, { estilo: null }); return }
      c.setParagraph().updateAttributes('paragraph', { estilo: 'titulo_pagina' }).run(); return
    }
    case 'normal':
      if (editor.isActive('blockquote')) c.lift('blockquote')
      c.setParagraph().updateAttributes('paragraph', { estilo: null }).run(); return
  }
}

/** Marks do cursor/seleção para o pincel de formatação. */
export type MarkCopiada = { nome: string; attrs: Record<string, unknown> }
export function marksDoCursor(editor: Editor): MarkCopiada[] {
  const { state } = editor
  const marks = state.storedMarks ?? state.selection.$from.marks()
  return marks.filter((m) => m.type.name !== 'link').map((m) => ({ nome: m.type.name, attrs: { ...m.attrs } }))
}
export function aplicarMarks(editor: Editor, marks: MarkCopiada[]) {
  const c = editor.chain().focus()
  for (const m of MARKS_FORMATACAO) c.unsetMark(m)
  for (const m of marks) if (editor.schema.marks[m.nome]) c.setMark(m.nome, m.attrs)
  c.run()
}

export { formatarTamanho, normalizarLink } from '@/lib/aluno/notebook-texto'
