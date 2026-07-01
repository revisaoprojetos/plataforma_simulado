import type { ComponentType, CSSProperties } from 'react'
import { Heading1, Type, AlignLeft, ListChecks, Grid3x3, IdCard, Image as ImageIcon, Minus, MoveVertical, Square, Columns2, Wallpaper, Repeat, Rows3, ClipboardCheck, PenLine } from 'lucide-react'
import { cssDaFonte, type CadernoTheme } from './theme'
import { type Block, type BlockCategory, type CadernoData, type QuestaoData, genId } from './types'

export type BlockMeta = {
  type: string
  title: string
  description?: string
  icon: ComponentType<{ size?: number; className?: string }>
  category: BlockCategory
  dynamic?: boolean
  unico?: boolean
  unicoPorPagina?: boolean // no máximo um por página (ex.: imagem de fundo full-bleed)
  supportsVars?: boolean
  container?: boolean // aceita blocos filhos (card/colunas/coluna)
  fullBleed?: boolean // camada de fundo da página inteira
  defaults: Record<string, unknown>
}

export const CONTAINERS = new Set(['card', 'colunas', 'coluna', 'repeticao'])
export function isContainer(type: string) { return CONTAINERS.has(type) }

export const BLOCKS: BlockMeta[] = [
  // Conteúdo
  { type: 'titulo-secao', title: 'Título de seção', icon: Heading1, category: 'conteudo', supportsVars: true,
    defaults: { texto: 'Título da Seção', nivel: 1, align: 'left', cor: '', mostrarLinha: true, fonte: '', italico: false, sublinhado: false, espacamento: 0 } },
  { type: 'texto-livre', title: 'Texto livre', icon: Type, category: 'conteudo', supportsVars: true,
    defaults: { texto: 'Digite o texto aqui…', align: 'left', size: 12, bold: false, italico: false, sublinhado: false, color: '', fonte: '', lineHeight: 1.5, espacamento: 0 } },
  { type: 'instrucoes', title: 'Instruções', icon: AlignLeft, category: 'conteudo', supportsVars: true,
    defaults: { titulo: 'Instruções', texto: 'Leia atentamente antes de começar.', corFundo: '#f7fafc', corBorda: '' } },
  { type: 'lista-questoes', title: 'Lista de questões', icon: ListChecks, category: 'conteudo', dynamic: true, unico: true,
    defaults: { titulo: '', quantidade: null, mostrarAlternativas: true, mostrarGabarito: false } },
  { type: 'repeticao', title: 'Repetir por questão', icon: Repeat, category: 'conteudo', container: true, dynamic: true, unico: true,
    defaults: { quantidade: null, gap: 16 } },
  { type: 'alternativas', title: 'Alternativas da questão', icon: Rows3, category: 'conteudo', dynamic: true,
    defaults: { mostrarGabarito: false } },
  // Avaliação
  { type: 'gabarito-grid', title: 'Grade de gabarito', icon: Grid3x3, category: 'avaliacao', dynamic: true, unico: true,
    defaults: { titulo: 'Folha de Respostas', numQuestoes: null, numAlternativas: 5, colunas: 2, estilo: 'circulo' } },
  { type: 'gabarito-correcao', title: 'Correção (marcada × correta)', icon: ClipboardCheck, category: 'avaliacao', dynamic: true,
    defaults: { rotulo: 'Sua resposta:', mostrarCorreta: true } },
  // Identificação
  { type: 'identificacao', title: 'Identificação', icon: IdCard, category: 'identificacao', dynamic: true,
    defaults: { titulo: 'Identificação do Candidato', campos: ['Nome completo', 'Nº de inscrição', 'Data'] } },
  // Estrutura
  { type: 'card', title: 'Card', icon: Square, category: 'estrutura', container: true, supportsVars: true,
    defaults: { corFundo: '#f8fafc', bordaCor: '', bordaLargura: 1, bordaRaio: 8, padding: 14, largura: 100, alinhamento: 'center' } },
  { type: 'colunas', title: 'Colunas (lado a lado)', icon: Columns2, category: 'estrutura', container: true,
    defaults: { gap: 16 } },
  { type: 'imagem', title: 'Imagem', icon: ImageIcon, category: 'estrutura',
    defaults: { url: '', largura: 60, align: 'center' } },
  { type: 'plano-fundo', title: 'Imagem de fundo', icon: Wallpaper, category: 'estrutura', unicoPorPagina: true, fullBleed: true,
    defaults: { url: '', opacidade: 100 } },
  { type: 'separador', title: 'Separador', icon: Minus, category: 'estrutura',
    defaults: { espessura: 1, estilo: 'solido', cor: '' } },
  { type: 'espacador', title: 'Espaçador', icon: MoveVertical, category: 'estrutura',
    defaults: { altura: 24 } },
  { type: 'linhas-resposta', title: 'Linhas p/ resposta', icon: PenLine, category: 'conteudo', supportsVars: true,
    defaults: { quantidade: 6, rotulo: 'Resposta:', altura: 28, cor: '' } },
]

export function getBlockMeta(type: string): BlockMeta | undefined {
  return BLOCKS.find((b) => b.type === type)
}
export function criarColuna(): Block { return { id: genId('coluna'), type: 'coluna', attributes: {}, innerBlocks: [] } }

export function createBlock(type: string): Block {
  const meta = getBlockMeta(type)
  const b: Block = { id: genId(type), type, attributes: { ...(meta?.defaults ?? {}) } }
  if (type === 'colunas') b.innerBlocks = [criarColuna(), criarColuna()]
  else if (type === 'card' || type === 'repeticao') b.innerBlocks = []
  return b
}

/** Contexto de uma questão para o repetidor: injeta {q_num},{q_enunciado}… nas vars. */
export function dataComQuestao(data: CadernoData, q: QuestaoData): CadernoData {
  const letras = q.alternativas.map((al) => al.letra).join(', ')
  // Texto das alternativas, uma por linha (renderiza com quebras no texto-livre).
  const altsTexto = q.alternativas.map((al) => `${al.letra}) ${al.texto}`).join('\n')
  const marcadaLetra = data.respostas?.[q.id] ?? '—' // letra marcada (ou '—' se não respondeu)
  // Alternativa marcada completa, no formato "B) 4" (resolvida pela letra desta questão).
  const altMarc = q.alternativas.find((al) => al.letra === marcadaLetra)
  const respostaTexto = altMarc ? `${altMarc.letra}) ${altMarc.texto}` : marcadaLetra
  // Uma variável por alternativa: {q_alt_a} → "A) texto", {q_alt_b} → "B) texto"…
  const porAlt: Record<string, string> = { q_alt_a: '', q_alt_b: '', q_alt_c: '', q_alt_d: '', q_alt_e: '', q_alt_f: '' }
  for (const al of q.alternativas) porAlt[`q_alt_${al.letra.toLowerCase()}`] = `${al.letra}) ${al.texto}`
  return {
    ...data, questaoAtual: q,
    vars: {
      ...data.vars, q_num: String(q.numero), q_numero: String(q.numero), q_enunciado: q.enunciado,
      q_tipo: q.tipo, q_disciplina: q.disciplina ?? '', q_alternativas: altsTexto, q_letras: letras,
      // {q_resposta} = alternativa completa marcada ("B) 4"); {q_resposta_letra} = só a letra.
      q_resposta: respostaTexto, q_resposta_letra: marcadaLetra, q_resposta_texto: respostaTexto,
      ...porAlt,
    },
  }
}

/** Estilo do container Card — compartilhado entre editor e impressão. */
export function cardStyle(a: any, theme: CadernoTheme): CSSProperties {
  return {
    background: a.corFundo || 'transparent',
    border: a.bordaLargura ? `${a.bordaLargura}px solid ${a.bordaCor || theme.cores.secundaria}` : 'none',
    borderRadius: a.bordaRaio ?? 0,
    padding: a.padding ?? 12,
    width: `${a.largura ?? 100}%`,
  }
}
export function blocksByCategory(): Record<BlockCategory, BlockMeta[]> {
  const out = { conteudo: [], avaliacao: [], identificacao: [], estrutura: [] } as Record<BlockCategory, BlockMeta[]>
  for (const b of BLOCKS) out[b.category].push(b)
  return out
}

/** Substitui {token} e {{token}} pelos valores reais/de exemplo. */
export function applyVars(texto: string, vars: Record<string, string>): string {
  if (!texto) return texto
  return texto
    .replace(/\{\{\s*([\w-]+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m))
    .replace(/\{\s*([\w-]+)\s*\}/g, (m, k) => (k in vars ? vars[k] : m))
}

const ALIN = { left: 'left', center: 'center', right: 'right' } as const

/** Renderer único (sem hooks): usado no canvas do editor E na impressão/PDF. */
export function BlockRender({ block, theme, data }: { block: Block; theme: CadernoTheme; data: CadernoData }) {
  const a = block.attributes as any
  const c = theme.cores

  switch (block.type) {
    case 'titulo-secao': {
      const sizes = { 1: 22, 2: 17, 3: 14 } as Record<number, number>
      return (
        <div style={{ textAlign: ALIN[a.align as keyof typeof ALIN] ?? 'left' }}>
          <span style={{ fontSize: sizes[a.nivel] ?? 22, fontWeight: 700, color: a.cor || c.primaria, fontFamily: cssDaFonte(a.fonte) || theme.tipografia.familia, fontStyle: a.italico ? 'italic' : 'normal', textDecoration: a.sublinhado ? 'underline' : 'none', letterSpacing: a.espacamento ? `${a.espacamento}px` : undefined }}>
            {applyVars(a.texto ?? '', data.vars)}
          </span>
          {a.mostrarLinha && <div style={{ height: 2, background: a.cor || c.acento, marginTop: 4, borderRadius: 2 }} />}
        </div>
      )
    }
    case 'texto-livre':
      return (
        <p style={{ textAlign: ALIN[a.align as keyof typeof ALIN] ?? 'left', fontSize: a.size ?? 12, fontWeight: a.bold ? 700 : 400, fontStyle: a.italico ? 'italic' : 'normal', textDecoration: a.sublinhado ? 'underline' : 'none', color: a.color || c.texto, fontFamily: cssDaFonte(a.fonte) || theme.tipografia.familia, whiteSpace: 'pre-wrap', lineHeight: a.lineHeight ?? 1.5, letterSpacing: a.espacamento ? `${a.espacamento}px` : undefined, margin: 0 }}>
          {applyVars(a.texto ?? '', data.vars)}
        </p>
      )
    case 'instrucoes':
      return (
        <div style={{ background: a.corFundo || '#f7fafc', border: `1px solid ${a.corBorda || c.primaria}`, borderRadius: 6, padding: 12, fontFamily: theme.tipografia.familia }}>
          {a.titulo && <p style={{ fontWeight: 700, color: c.primaria, margin: '0 0 4px' }}>{applyVars(a.titulo, data.vars)}</p>}
          <p style={{ fontSize: 12, color: c.texto, whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{applyVars(a.texto ?? '', data.vars)}</p>
        </div>
      )
    case 'lista-questoes': {
      const qs = a.quantidade ? data.questoes.slice(0, a.quantidade) : data.questoes
      return (
        <div style={{ fontFamily: theme.tipografia.familia }}>
          {a.titulo && <p style={{ fontWeight: 700, color: c.primaria, fontSize: 15, margin: '0 0 8px' }}>{a.titulo}</p>}
          {qs.length === 0 && <p style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Vincule um simulado/pasta para listar as questões reais.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {qs.map((q) => (
              <div key={q.id} style={{ breakInside: 'avoid' }}>
                <p style={{ fontSize: 13, color: c.texto, margin: '0 0 4px', lineHeight: 1.5 }}><strong>{q.numero}.</strong> {q.enunciado}</p>
                {a.mostrarAlternativas && q.tipo !== 'discursiva' && (
                  <div style={{ marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {q.alternativas.map((alt) => (
                      <p key={alt.letra} style={{ fontSize: 12.5, color: c.texto, fontWeight: a.mostrarGabarito && alt.correta ? 700 : 400, margin: 0 }}>
                        {a.mostrarGabarito && alt.correta ? '☑' : '○'} {alt.letra}) {alt.texto}
                      </p>
                    ))}
                  </div>
                )}
                {q.tipo === 'discursiva' && (
                  <div style={{ marginTop: 6 }}>{[0, 1, 2, 3, 4].map((n) => <div key={n} style={{ borderBottom: '1px solid #cbd5e1', height: '1.4em' }} />)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'gabarito-grid': {
      const total = a.numQuestoes ?? data.numQuestoes ?? 20
      const nAlt = a.numAlternativas ?? data.numAlternativas ?? 5
      const cols = a.colunas ?? 2
      const letras = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, nAlt)
      const perCol = Math.ceil(total / cols)
      const colArrays = Array.from({ length: cols }, (_, ci) => Array.from({ length: perCol }, (_, ri) => ci * perCol + ri + 1).filter((n) => n <= total))
      const redondo = a.estilo !== 'quadrado'
      return (
        <div style={{ fontFamily: theme.tipografia.familia }}>
          {a.titulo && <p style={{ fontWeight: 700, color: c.primaria, fontSize: 15, margin: '0 0 8px', textAlign: 'center' }}>{a.titulo}</p>}
          <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
            {colArrays.map((col, ci) => (
              <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {col.map((n) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 22, fontSize: 11, fontWeight: 700, color: c.texto, textAlign: 'right' }}>{n}</span>
                    {letras.map((l) => (
                      <span key={l} style={{ width: 17, height: 17, borderRadius: redondo ? '50%' : 3, border: `1.5px solid ${c.secundaria}`, fontSize: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: c.secundaria }}>{l}</span>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'identificacao':
      return (
        <div style={{ border: `1px solid ${c.primaria}`, borderRadius: 6, padding: 14, fontFamily: theme.tipografia.familia }}>
          {a.titulo && <p style={{ fontWeight: 700, color: c.primaria, margin: '0 0 10px', fontSize: 14 }}>{a.titulo}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(a.campos ?? []).map((campo: string, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <span style={{ fontSize: 11, color: c.texto, whiteSpace: 'nowrap' }}>{campo}:</span>
                <span style={{ flex: 1, borderBottom: '1px solid #94a3b8', height: '1.2em' }} />
              </div>
            ))}
          </div>
        </div>
      )
    case 'imagem':
      if (!a.url) return <div style={{ border: '1px dashed #cbd5e1', borderRadius: 6, padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Sem imagem (envie no inspetor)</div>
      return (
        <div style={{ textAlign: ALIN[a.align as keyof typeof ALIN] ?? 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.url} alt="" style={{ width: `${a.largura ?? 60}%`, display: 'inline-block', borderRadius: 4 }} />
        </div>
      )
    case 'separador': {
      const estilos = { solido: 'solid', tracejado: 'dashed', pontilhado: 'dotted' } as Record<string, string>
      return <div style={{ borderTop: `${a.espessura ?? 1}px ${estilos[a.estilo] ?? 'solid'} ${a.cor || c.secundaria}`, margin: '4px 0' }} />
    }
    case 'espacador':
      return <div style={{ height: a.altura ?? 24 }} />
    case 'linhas-resposta': {
      const n = Math.max(1, Math.min(40, Number(a.quantidade ?? 6)))
      const h = Number(a.altura ?? 28)
      const cor = (a.cor as string) || c.secundaria
      return (
        <div style={{ fontFamily: theme.tipografia.familia }}>
          {a.rotulo ? <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: c.texto }}>{applyVars(String(a.rotulo), data.vars)}</p> : null}
          {Array.from({ length: n }).map((_, i) => <div key={i} style={{ borderBottom: `1px solid ${cor}`, height: h }} />)}
        </div>
      )
    }
    case 'card': {
      const al = (a.alinhamento as keyof typeof ALIN) ?? 'center'
      return (
        <div style={{ display: 'flex', justifyContent: al === 'left' ? 'flex-start' : al === 'right' ? 'flex-end' : 'center' }}>
          <div style={cardStyle(a, theme)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(block.innerBlocks ?? []).map((ib) => <BlockRender key={ib.id} block={ib} theme={theme} data={data} />)}
            </div>
          </div>
        </div>
      )
    }
    case 'colunas':
      return (
        <div style={{ display: 'flex', gap: a.gap ?? 16, alignItems: 'flex-start' }}>
          {(block.innerBlocks ?? []).map((col) => (
            <div key={col.id} style={{ flex: 1, minWidth: 0 }}><BlockRender block={col} theme={theme} data={data} /></div>
          ))}
        </div>
      )
    case 'coluna':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(block.innerBlocks ?? []).map((ib) => <BlockRender key={ib.id} block={ib} theme={theme} data={data} />)}
        </div>
      )
    case 'repeticao': {
      const qs = a.quantidade ? data.questoes.slice(0, a.quantidade) : data.questoes
      if (!qs.length) return <div style={{ border: '1px dashed #cbd5e1', borderRadius: 6, padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Vincule um banco — o template repete por questão.</div>
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: a.gap ?? 16 }}>
          {qs.map((q) => {
            const d2 = dataComQuestao(data, q)
            return (
              <div key={q.id} style={{ breakInside: 'avoid', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(block.innerBlocks ?? []).map((ib) => <BlockRender key={ib.id} block={ib} theme={theme} data={d2} />)}
              </div>
            )
          })}
        </div>
      )
    }
    case 'gabarito-correcao': {
      const q = data.questaoAtual
      if (!q) return <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Use dentro do repetidor — mostra a correção da questão.</div>
      // Gating: a correção só aparece quando o gabarito está liberado.
      if (!data.gabaritoLiberado) return <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', fontFamily: theme.tipografia.familia }}>Gabarito ainda não liberado.</div>
      const marcadaLetra = data.respostas?.[q.id]
      const marcada = q.alternativas.find((al) => al.letra === marcadaLetra)
      const correta = q.alternativas.find((al) => al.correta)
      const acertou = !!marcada?.correta
      const VERDE = '#16a34a', VERM = '#dc2626'
      return (
        <div style={{ fontFamily: theme.tipografia.familia, fontSize: 12.5, lineHeight: 1.5 }}>
          {marcada ? (
            <p style={{ margin: 0, fontWeight: 600, color: acertou ? VERDE : VERM }}>
              {a.rotulo ? `${a.rotulo} ` : ''}{marcada.letra}) {marcada.texto} {acertou ? '✓' : '✗'}
            </p>
          ) : <p style={{ margin: 0, color: '#94a3b8' }}>{a.rotulo ? `${a.rotulo} ` : ''}Em branco</p>}
          {a.mostrarCorreta && !acertou && correta && (
            <p style={{ margin: '2px 0 0', fontWeight: 600, color: VERDE }}>Correta: {correta.letra}) {correta.texto}</p>
          )}
        </div>
      )
    }
    case 'alternativas': {
      const alts = data.questaoAtual?.alternativas ?? ['A', 'B', 'C', 'D', 'E'].map((l, i) => ({ letra: l, texto: `Alternativa ${l}`, correta: i === 1 }))
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginLeft: 14, fontFamily: theme.tipografia.familia }}>
          {alts.map((alt) => (
            <p key={alt.letra} style={{ fontSize: 12.5, color: c.texto, fontWeight: a.mostrarGabarito && alt.correta ? 700 : 400, margin: 0 }}>
              {a.mostrarGabarito && alt.correta ? '☑' : '○'} {alt.letra}) {alt.texto}
            </p>
          ))}
        </div>
      )
    }
    case 'plano-fundo':
      return null // full-bleed: renderizado como camada de fundo da página
    default:
      return <div style={{ color: '#ef4444', fontSize: 12 }}>Bloco desconhecido: {block.type}</div>
  }
}
