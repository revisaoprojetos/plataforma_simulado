'use client'
// Nós custom do contrato (docs/caderno-onenote-contrato.md §2): atom + bloco, SEM content.
// Renderizam como cartões SOMENTE LEITURA. Nunca dangerouslySetInnerHTML com conteúdo do aluno:
// `html_legado` passa por htmlParaTexto (só texto) aqui.
import { createContext, useContext } from 'react'
import { R } from '@/lib/nova/rotas'
import { htmlParaTexto } from '@/lib/aluno/notebook-texto-html'
import { linkSeguro } from '@/lib/aluno/notebook-texto'
import { Node, mergeAttributes, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'

export type RefsNotebook = { questoes: Record<string, { id: string; enunciado?: string; titulo?: string; gabarito_oculto?: boolean; [k: string]: unknown }> }
export const RefsCtx = createContext<RefsNotebook>({ questoes: {} })

const cartao: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface2)', padding: '12px 14px', margin: '10px 0', color: 'var(--ink)', userSelect: 'none' }
const rotulo: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--brand)' }
const linkSt: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: 'var(--brand)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', minHeight: 32 }

function QuestaoView({ node }: NodeViewProps) {
  const refs = useContext(RefsCtx)
  const id = String(node.attrs.questao_id ?? '')
  const q = refs.questoes[id]
  const txt = q ? htmlParaTexto(q.enunciado ?? q.titulo ?? '') : ''
  return (
    <NodeViewWrapper as="div" contentEditable={false} data-type="questaoRef" style={cartao}>
      <div style={rotulo}>Questão</div>
      <div style={{ fontSize: 14, lineHeight: 1.55, marginTop: 4, overflowWrap: 'anywhere' }}>
        {q ? (txt.length > 360 ? txt.slice(0, 360) + '…' : txt || 'Questão sem enunciado') : 'Questão indisponível (removida ou sem acesso).'}
      </div>
      <a href={R.banco} style={linkSt}>Abrir o banco de questões</a>
    </NodeViewWrapper>
  )
}

function GrifoView({ node }: NodeViewProps) {
  const a = node.attrs as Record<string, any>
  const href = linkSeguro(a.link)
  return (
    <NodeViewWrapper as="div" contentEditable={false} data-type="grifoSnapshot" style={cartao}>
      <div style={rotulo}>Grifo{a.pagina ? ` · pág. ${a.pagina}` : ''}</div>
      <blockquote style={{ margin: '6px 0', paddingLeft: 10, borderLeft: '3px solid var(--gold)', fontSize: 14, lineHeight: 1.6, overflowWrap: 'anywhere', fontFamily: 'var(--font-read)' }}>{String(a.texto ?? '')}</blockquote>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{String(a.documento_titulo ?? 'Material')}</div>
      {href ? <a href={href} target={href.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer nofollow" style={linkSt}>Abrir no material</a> : null}
    </NodeViewWrapper>
  )
}

function AnotacaoView({ node }: NodeViewProps) {
  const a = node.attrs as Record<string, any>
  const txt = htmlParaTexto(a.html_legado)
  return (
    <NodeViewWrapper as="div" contentEditable={false} data-type="anotacaoRef" style={cartao}>
      <div style={rotulo}>Anotação importada</div>
      <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{txt || 'Anotação sem texto.'}</div>
    </NodeViewWrapper>
  )
}

const attr = (def: unknown = null) => ({ default: def })

export const QuestaoRef = Node.create({
  name: 'questaoRef', group: 'block', atom: true, selectable: true, draggable: false,
  addAttributes() { return { questao_id: attr() } },
  parseHTML() { return [{ tag: 'div[data-type="questaoRef"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes({ 'data-type': 'questaoRef' }, HTMLAttributes)] },
  addNodeView() { return ReactNodeViewRenderer(QuestaoView) },
})

export const GrifoSnapshot = Node.create({
  name: 'grifoSnapshot', group: 'block', atom: true, selectable: true, draggable: false,
  addAttributes() {
    return {
      documento_id: attr(), documento_versao: attr(), documento_titulo: attr(), pagina: attr(), texto: attr(''),
      rects: attr([]), cor: attr(), tool: attr(), prefix: attr(), suffix: attr(), inicio: attr(), fim: attr(), link: attr(),
    }
  },
  parseHTML() { return [{ tag: 'div[data-type="grifoSnapshot"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes({ 'data-type': 'grifoSnapshot' }, HTMLAttributes)] },
  addNodeView() { return ReactNodeViewRenderer(GrifoView) },
})

export const AnotacaoRef = Node.create({
  name: 'anotacaoRef', group: 'block', atom: true, selectable: true, draggable: false,
  addAttributes() { return { origem_tabela: attr(), origem_id: attr(), html_legado: attr() } },
  parseHTML() { return [{ tag: 'div[data-type="anotacaoRef"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes({ 'data-type': 'anotacaoRef' }, HTMLAttributes)] },
  addNodeView() { return ReactNodeViewRenderer(AnotacaoView) },
})
