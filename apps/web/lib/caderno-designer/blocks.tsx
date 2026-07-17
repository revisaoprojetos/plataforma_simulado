import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { Heading1, Type, AlignLeft, ListChecks, Grid3x3, IdCard, Image as ImageIcon, Minus, MoveVertical, Square, Columns2, Wallpaper, Repeat, Rows3, ClipboardCheck, PenLine, Scissors, Signature, LayoutGrid, GitBranch } from 'lucide-react'
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
  oculto?: boolean // não aparece na paleta (mas continua renderizando se já usado)
  defaults: Record<string, unknown>
}

export const CONTAINERS = new Set(['card', 'colunas', 'coluna', 'repeticao', 'condicao'])
export function isContainer(type: string) { return CONTAINERS.has(type) }

export const BLOCKS: BlockMeta[] = [
  // Conteúdo
  { type: 'titulo-secao', title: 'Título de seção', icon: Heading1, category: 'conteudo', supportsVars: true,
    defaults: { texto: 'Título da Seção', nivel: 1, align: 'left', cor: '', mostrarLinha: true, fonte: '', italico: false, sublinhado: false, espacamento: 0, alturaMin: 0, valignV: 'top', largura: 100, alinhamentoBloco: 'left', corFundo: '', fundoPad: 10, fundoRaio: 6, subtitulo: '' } },
  { type: 'texto-livre', title: 'Texto livre', icon: Type, category: 'conteudo', supportsVars: true,
    defaults: { texto: 'Digite o texto aqui…', align: 'left', size: 12, bold: false, italico: false, sublinhado: false, color: '', fonte: '', lineHeight: 1.5, espacamento: 0, alturaMin: 0, valignV: 'top', largura: 100, alinhamentoBloco: 'left' } },
  { type: 'instrucoes', title: 'Instruções', icon: AlignLeft, category: 'conteudo', supportsVars: true,
    defaults: { titulo: 'Instruções', texto: 'Leia atentamente antes de começar.', corFundo: '#f7fafc', corBorda: '', fonte: '', alturaMin: 0, valignV: 'top', largura: 100, alinhamentoBloco: 'left' } },
  { type: 'lista-questoes', title: 'Lista de questões', icon: ListChecks, category: 'conteudo', dynamic: true, unico: true,
    defaults: { titulo: '', quantidade: null, mostrarAlternativas: true, mostrarGabarito: false } },
  { type: 'repeticao', title: 'Repetir por questão', icon: Repeat, category: 'conteudo', container: true, dynamic: true, unico: true,
    defaults: { quantidade: null, gap: 16 } },
  { type: 'alternativas', title: 'Alternativas da questão', icon: Rows3, category: 'conteudo', dynamic: true,
    defaults: { mostrarGabarito: false } },
  // Avaliação
  { type: 'gabarito-grid', title: 'Grade de gabarito', icon: Grid3x3, category: 'avaliacao', dynamic: true, unico: true,
    defaults: { titulo: '', origem: 'marcado', numQuestoes: null, numAlternativas: 5, porLinha: 10, fonte: '', corHeader: '', corHeaderTexto: '', corMarcadas: '', fundoImpar: '', textoImpar: '', fundoPar: '', textoPar: '', bordaRaio: 8 } },
  { type: 'gabarito-correcao', title: 'Correção (marcada × correta)', icon: ClipboardCheck, category: 'avaliacao', dynamic: true,
    defaults: { rotulo: 'Sua resposta:', mostrarCorreta: true } },
  // Identificação
  { type: 'identificacao', title: 'Identificação', icon: IdCard, category: 'identificacao', dynamic: true, supportsVars: true,
    defaults: { titulo: 'Dados do Candidato', bordaRaio: 8, fonte: '', corBorda: '', corHeader: '', corHeaderTexto: '', corRotulo: '', corValor: '', corDestaque: '', corAcento: '',
      destaque: [{ rotulo: 'Nome', valor: '{{nome}}' }, { rotulo: 'E-mail', valor: '{{email}}' }],
      campos: [{ rotulo: 'Data', valor: '{{data}}' }, { rotulo: 'Início', valor: '{{inicio}}' }, { rotulo: 'Término', valor: '{{termino}}' }, { rotulo: 'Tempo total', valor: '{{tempo_total}}' }, { rotulo: 'Respondidas', valor: '{{respondidas}}' }, { rotulo: 'Em branco', valor: '{{em_branco}}' }] } },
  { type: 'cabecalho-prova', title: 'Cabeçalho de prova', icon: LayoutGrid, category: 'identificacao', supportsVars: true,
    defaults: { campos: [{ rotulo: 'Banca', valor: '' }, { rotulo: 'Órgão', valor: '' }, { rotulo: 'Cargo', valor: '' }, { rotulo: 'Ano', valor: '' }], colunas: 2 } },
  { type: 'assinatura', title: 'Assinatura', icon: Signature, category: 'identificacao', supportsVars: true,
    defaults: { assinaturas: ['Assinatura do candidato'], align: 'left', larguraLinha: 220 } },
  // Estrutura
  { type: 'card', title: 'Card', icon: Square, category: 'estrutura', container: true, supportsVars: true,
    defaults: { corFundo: '#f8fafc', bordaCor: '', bordaLargura: 1, bordaRaio: 8, padding: 8, largura: 100, alinhamento: 'center', fitaCor: '', fitaAltura: 0 } },
  { type: 'colunas', title: 'Colunas (lado a lado)', icon: Columns2, category: 'estrutura', container: true,
    defaults: { gap: 16, divisoria: false, divisoriaEspessura: 1, divisoriaEstilo: 'solido', divisoriaCor: '' } },
  { type: 'imagem', title: 'Imagem', icon: ImageIcon, category: 'estrutura',
    defaults: { url: '', largura: 60, align: 'center' } },
  { type: 'plano-fundo', title: 'Imagem de fundo', icon: Wallpaper, category: 'estrutura', unicoPorPagina: true, fullBleed: true,
    defaults: { url: '', opacidade: 100 } },
  { type: 'separador', title: 'Separador', icon: Minus, category: 'estrutura',
    defaults: { espessura: 1, estilo: 'solido', cor: '', orientacao: 'horizontal', altura: 0 } },
  { type: 'espacador', title: 'Espaçador', icon: MoveVertical, category: 'estrutura',
    defaults: { altura: 24 } },
  { type: 'quebra-pagina', title: 'Quebra de página', icon: Scissors, category: 'estrutura',
    defaults: {} },
  { type: 'linhas-resposta', title: 'Linhas p/ resposta', icon: PenLine, category: 'conteudo', supportsVars: true,
    defaults: { quantidade: 6, rotulo: 'Resposta:', altura: 28, cor: '' } },
  { type: 'condicao', title: 'Condição (texto modulado)', icon: GitBranch, category: 'conteudo', container: true,
    defaults: { variavel: 'percentual', operador: 'entre', valor: '0', valor2: '50' } },
  { type: 'diag-disciplina', title: 'Diagnóstico — Disciplina', icon: ListChecks, category: 'avaliacao', dynamic: true, supportsVars: true,
    defaults: { chave: '', nome: '', assunto: 'Assunto Principal', soSeErrou: true, corLinha: '#c9a227', linhaAltura: 2, corRow: '#e9eef7', corTitulo: '#1a3a6b', corAcerto: '#8a8a8a', corPct: '#e8850c', fonte: '' } },
  { type: 'diag-grupo', title: 'Diagnóstico — Grupo/Disciplinas', icon: Rows3, category: 'avaliacao', dynamic: true, supportsVars: true, oculto: true,
    defaults: {
      grupo: 'Grupo I', disciplinas: [{ chave: 'direito_administrativo', nome: 'Direito Administrativo', assunto: '' }],
      corHeader: '#f6c445', corHeaderTexto: '#3b3260', corFita: '#c9a227', corRow: '#e9eef7', corTitulo: '#1a3a6b', corPct: '#e8850c', corAcerto: '#8a8a8a',
      fitaPosicao: 'base', fitaAltura: 2, alturaLinha: 0, gapLinha: 6,
    } },
  { type: 'diag-pilares', title: 'Diagnóstico — Pilares', icon: LayoutGrid, category: 'avaliacao', dynamic: true, supportsVars: true,
    defaults: {
      pilares: [
        { chave: 'lei_seca', nome: 'LEI SECA', f1: '', f2: '', f3: '' },
        { chave: 'jurisprudencia', nome: 'JURISPRUDÊNCIA', f1: '', f2: '', f3: '' },
        { chave: 'doutrina', nome: 'DOUTRINA', f1: '', f2: '', f3: '' },
      ],
      corFundo: '#fef3d6', fitaCor: '#3b5bdb', fitaAltura: 4, bordaRaio: 4, padding: 10, gap: 16, divisoria: true, divisoriaCor: '#cbb26b', corTitulo: '#243b7a', corQuestoes: '#c0392b',
    } },
]

export function getBlockMeta(type: string): BlockMeta | undefined {
  return BLOCKS.find((b) => b.type === type)
}
export function criarColuna(): Block { return { id: genId('coluna'), type: 'coluna', attributes: {}, innerBlocks: [] } }

export function createBlock(type: string): Block {
  const meta = getBlockMeta(type)
  const b: Block = { id: genId(type), type, attributes: { ...(meta?.defaults ?? {}) } }
  if (type === 'colunas') b.innerBlocks = [criarColuna(), criarColuna()]
  else if (type === 'card' || type === 'repeticao' || type === 'condicao') b.innerBlocks = []
  return b
}

/** Avalia a condição de um bloco `condicao` contra as variáveis atuais. */
export function avaliarCondicao(a: any, vars: Record<string, string>): boolean {
  const bruto = applyVars(`{${a.variavel ?? ''}}`, vars)
  const num = parseFloat(String(bruto).replace(/[^0-9.,-]/g, '').replace(',', '.'))
  const v1 = parseFloat(String(a.valor ?? '').replace(',', '.'))
  const v2 = parseFloat(String(a.valor2 ?? '').replace(',', '.'))
  const txt = String(bruto).trim().toLowerCase()
  const alvo = String(a.valor ?? '').trim().toLowerCase()
  switch (a.operador) {
    case 'entre': return !isNaN(num) && !isNaN(v1) && !isNaN(v2) && num >= Math.min(v1, v2) && num <= Math.max(v1, v2)
    case '>=': return !isNaN(num) && num >= v1
    case '<=': return !isNaN(num) && num <= v1
    case '>': return !isNaN(num) && num > v1
    case '<': return !isNaN(num) && num < v1
    case 'igual': return txt === alvo || (!isNaN(num) && num === v1)
    case 'diferente': return txt !== alvo
    case 'contem': return !!alvo && txt.includes(alvo)
    default: return true
  }
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
  // Fita: barra colorida no TOPO do card (ex.: cabeçalho de grupo do diagnóstico).
  const fita = a.fitaAltura ? { borderTop: `${a.fitaAltura}px solid ${a.fitaCor || theme.cores.primaria}` } : {}
  return {
    background: a.corFundo || 'transparent',
    border: a.bordaLargura ? `${a.bordaLargura}px solid ${a.bordaCor || theme.cores.secundaria}` : 'none',
    borderRadius: a.bordaRaio ?? 0,
    padding: a.padding ?? 12,
    width: `${a.largura ?? 100}%`,
    ...fita,
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

const ALIN = { left: 'left', center: 'center', right: 'right', justify: 'justify' } as const

/** Envolve o bloco numa caixa de largura % com posição horizontal (só quando < 100%). */
function comLargura(largura: number | undefined, pos: string | undefined, node: ReactNode): ReactNode {
  const w = largura ?? 100
  if (!w || w >= 100) return node
  const jc = pos === 'center' ? 'center' : pos === 'right' ? 'flex-end' : 'flex-start'
  return <div style={{ display: 'flex', justifyContent: jc }}><div style={{ width: `${w}%`, minWidth: 0 }}>{node}</div></div>
}

/** Largura efetiva de uma coluna: a própria (se definida) ou, se tem um único filho, a largura dele.
 *  Assim, encolher o bloco encolhe a coluna e o vizinho (flex automático) ocupa o espaço liberado. */
export function larguraDaColuna(col: Block): number | undefined {
  const own = (col.attributes as any)?.largura
  if (own && own < 100) return own
  const filhos = col.innerBlocks ?? []
  if (filhos.length === 1) { const l = (filhos[0].attributes as any)?.largura; if (l && l < 100) return l }
  return undefined
}

/** Renderer único (sem hooks): usado no canvas do editor E na impressão/PDF. */
export function BlockRender({ block, theme, data, full, editor }: { block: Block; theme: CadernoTheme; data: CadernoData; full?: boolean; editor?: boolean }) {
  const a = block.attributes as any
  const c = theme.cores

  switch (block.type) {
    case 'titulo-secao': {
      const sizes = { 1: 22, 2: 17, 3: 14 } as Record<number, number>
      const temFundo = !!a.corFundo
      // Com fundo, vira uma BARRA de seção (texto claro sobre a cor); o subtítulo aparece abaixo.
      const corTexto = temFundo ? (a.cor || '#ffffff') : (a.cor || c.primaria)
      return comLargura(full ? undefined : a.largura, a.alinhamentoBloco, (
        <div style={{ minHeight: a.alturaMin || undefined, display: a.alturaMin ? 'flex' : undefined, flexDirection: 'column', justifyContent: a.valignV === 'center' ? 'center' : a.valignV === 'bottom' ? 'flex-end' : 'flex-start' }}>
          <div style={{ textAlign: ALIN[a.align as keyof typeof ALIN] ?? 'left', ...(temFundo ? { background: a.corFundo, padding: `${a.fundoPad ?? 10}px ${(a.fundoPad ?? 10) + 4}px`, borderRadius: a.fundoRaio ?? 6 } : {}) }}>
            <span style={{ fontSize: sizes[a.nivel] ?? 22, fontWeight: 700, color: corTexto, fontFamily: cssDaFonte(a.fonte) || theme.tipografia.familia, fontStyle: a.italico ? 'italic' : 'normal', textDecoration: a.sublinhado ? 'underline' : 'none', letterSpacing: a.espacamento ? `${a.espacamento}px` : undefined }}>
              {applyVars(a.texto ?? '', data.vars)}
            </span>
            {a.subtitulo && <div style={{ fontSize: 11, fontWeight: 600, color: corTexto, opacity: temFundo ? 0.85 : 0.7, marginTop: 2 }}>{applyVars(a.subtitulo, data.vars)}</div>}
            {!temFundo && a.mostrarLinha && <div style={{ height: 2, background: a.cor || c.acento, marginTop: 4, borderRadius: 2 }} />}
          </div>
        </div>
      ))
    }
    case 'texto-livre':
      return comLargura(full ? undefined : a.largura, a.alinhamentoBloco, (
        <div style={{ minHeight: a.alturaMin || undefined, display: a.alturaMin ? 'flex' : undefined, flexDirection: 'column', justifyContent: a.valignV === 'center' ? 'center' : a.valignV === 'bottom' ? 'flex-end' : 'flex-start' }}>
          <p style={{ textAlign: ALIN[a.align as keyof typeof ALIN] ?? 'left', fontSize: a.size ?? 12, fontWeight: a.bold ? 700 : 400, fontStyle: a.italico ? 'italic' : 'normal', textDecoration: a.sublinhado ? 'underline' : 'none', color: a.color || c.texto, fontFamily: cssDaFonte(a.fonte) || theme.tipografia.familia, whiteSpace: 'pre-wrap', lineHeight: a.lineHeight ?? 1.5, letterSpacing: a.espacamento ? `${a.espacamento}px` : undefined, margin: 0 }}>
            {applyVars(a.texto ?? '', data.vars)}
          </p>
        </div>
      ))
    case 'instrucoes':
      return comLargura(full ? undefined : a.largura, a.alinhamentoBloco, (
        <div style={{ background: a.corFundo || '#f7fafc', border: `1px solid ${a.corBorda || c.primaria}`, borderRadius: 6, padding: 8, fontFamily: cssDaFonte(a.fonte) || theme.tipografia.familia, minHeight: a.alturaMin || undefined, display: a.alturaMin ? 'flex' : undefined, flexDirection: 'column', justifyContent: a.valignV === 'center' ? 'center' : a.valignV === 'bottom' ? 'flex-end' : 'flex-start' }}>
          {a.titulo && <p style={{ fontWeight: 700, color: c.primaria, margin: '0 0 4px' }}>{applyVars(a.titulo, data.vars)}</p>}
          <p style={{ fontSize: 12, color: c.texto, whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{applyVars(a.texto ?? '', data.vars)}</p>
        </div>
      ))
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
      const nAlt = a.numAlternativas ?? data.numAlternativas ?? 5
      const letras = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, nAlt)
      const origem = a.origem ?? 'marcado' // 'marcado' = respostas do aluno | 'oficial' = gabarito correto
      const usarDados = data.questoes.length > 0
      const total = a.numQuestoes ?? (usarDados ? data.questoes.length : (data.numQuestoes ?? 100))
      const porLinha = Math.max(4, Math.min(20, a.porLinha ?? 10))
      const temResp = !!data.respostas && Object.keys(data.respostas).length > 0
      const qDe = (n: number) => (usarDados ? (data.questoes.find((x) => x.numero === n) ?? data.questoes[n - 1]) : undefined)
      const letraDe = (n: number): string => {
        const q = qDe(n)
        if (origem === 'oficial') {
          const of = q?.alternativas.find((al) => al.correta)?.letra
          if (of) return of
          if (q) return '—'
          return letras[(n - 1) % letras.length] // amostra p/ preview no editor
        }
        if (temResp) return (q && data.respostas?.[q.id]) || '—'
        return letras[(n - 1) % letras.length] // amostra p/ preview no editor
      }
      const nums = Array.from({ length: total }, (_, i) => i + 1)
      const linhas: number[][] = []
      for (let i = 0; i < nums.length; i += porLinha) linhas.push(nums.slice(i, i + porLinha))
      const borda = `${c.secundaria}2b`
      const titulo = a.titulo || (origem === 'oficial' ? 'Gabarito Oficial' : 'Gabarito de Alternativas')
      const corHeader = a.corHeader || c.primaria
      const corHeaderTexto = a.corHeaderTexto || '#ffffff'
      const corMarcadas = a.corMarcadas || a.corLetra || c.primaria // cor da letra respondida
      // Linhas alternadas (fundo + cor do número): ímpar = 1ª, 3ª… (ri par) | par = 2ª, 4ª… (ri ímpar)
      const fundoImpar = a.fundoImpar || a.corLinhaImpar || `${c.acento}26`
      const textoImpar = a.textoImpar || c.texto
      const fundoPar = a.fundoPar || a.corLinhaPar || a.corListra || `${c.acento}4d`
      const textoPar = a.textoPar || c.texto
      const fontFamily = cssDaFonte(a.fonte) || theme.tipografia.familia
      const raio = a.bordaRaio ?? 8
      return (
        <div style={{ fontFamily, border: `1px solid ${borda}`, borderRadius: raio, overflow: 'hidden', breakInside: 'avoid' }}>
          <div style={{ background: corHeader, color: corHeaderTexto, fontWeight: 800, textAlign: 'center', padding: '7px 10px', fontSize: 12.5, letterSpacing: 1, textTransform: 'uppercase' }}>{titulo}</div>
          {linhas.map((linha, ri) => {
            const impar = ri % 2 === 0
            const fundoLinha = impar ? fundoImpar : fundoPar
            const corNum = impar ? textoImpar : textoPar
            return (
            <div key={ri} style={{ display: 'flex', borderTop: ri ? `1px solid ${borda}` : 'none' }}>
              {linha.map((n, idx) => {
                const letra = letraDe(n)
                const vazia = letra === '—'
                return (
                  <div key={n} style={{ display: 'flex', flex: 1, minWidth: 0, borderLeft: idx ? `1px solid ${borda}` : 'none' }}>
                    <span style={{ background: fundoLinha, color: corNum, fontWeight: 700, fontSize: 10, width: 24, minWidth: 24, textAlign: 'center', padding: '4px 0', borderRight: `1px solid ${borda}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{String(n).padStart(2, '0')}</span>
                    <span style={{ flex: 1, minWidth: 0, color: vazia ? '#9aa5b1' : corMarcadas, fontWeight: 700, fontSize: 11, textAlign: 'center', padding: '4px 2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{letra}</span>
                  </div>
                )
              })}
              {linha.length < porLinha && Array.from({ length: porLinha - linha.length }).map((_, k) => (
                <div key={`e${k}`} style={{ flex: 1, borderLeft: `1px solid ${borda}` }} />
              ))}
            </div>
            )
          })}
        </div>
      )
    }
    case 'identificacao': {
      // Campos = { rotulo, valor } (valor é template: {{nome}}, {{email}}…). Aceita formato antigo (string[]).
      const norm = (arr: any[]): { rotulo: string; valor: string }[] =>
        (arr ?? []).map((x) => (typeof x === 'string' ? { rotulo: x, valor: '' } : { rotulo: x?.rotulo ?? '', valor: x?.valor ?? '' }))
      const destaque = norm(a.destaque)
      const campos = norm(a.campos)
      const titulo = a.titulo || 'Dados do Candidato'
      const raio = a.bordaRaio ?? 8
      const fontFamily = cssDaFonte(a.fonte) || theme.tipografia.familia
      const borda = a.corBorda || `${c.secundaria}33`
      const corHeader = a.corHeader || c.primaria
      const corHeaderTexto = a.corHeaderTexto || '#ffffff'
      const corRotulo = a.corRotulo || '#94a3b8'
      const corValor = a.corValor || c.texto
      const corDestaque = a.corDestaque || `${corHeader}0a`
      const corAcento = a.corAcento || c.acento
      const val = (v: string) => applyVars(String(v ?? ''), data.vars)
      const celula = (f: { rotulo: string; valor: string }, i: number, cols: number, big: boolean) => (
        <div key={i} style={{ padding: big ? '8px 12px' : '7px 10px', minWidth: 0, borderLeft: i % cols !== 0 ? `1px solid ${borda}` : 'none' }}>
          <div style={{ fontSize: 8.5, color: corRotulo, marginBottom: 2, letterSpacing: 0.4, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.rotulo}</div>
          <div style={{ fontSize: big ? 13 : 11.5, fontWeight: 700, color: corValor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val(f.valor) || '—'}</div>
        </div>
      )
      return (
        <div style={{ border: `1px solid ${borda}`, borderRadius: raio, overflow: 'hidden', fontFamily }}>
          <div style={{ background: corHeader, color: corHeaderTexto, fontWeight: 800, textAlign: 'center', padding: '6px 10px', fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase' }}>{titulo}</div>
          {destaque.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${destaque.length}, 1fr)`, background: corDestaque }}>
              {destaque.map((f, i) => celula(f, i, destaque.length, true))}
            </div>
          )}
          {campos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${campos.length}, 1fr)`, borderTop: destaque.length ? `1px solid ${borda}` : 'none' }}>
              {campos.map((f, i) => celula(f, i, campos.length, false))}
            </div>
          )}
          <div style={{ height: 3, background: corAcento }} />
        </div>
      )
    }
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
      const linha = `${a.espessura ?? 1}px ${estilos[a.estilo] ?? 'solid'} ${a.cor || c.secundaria}`
      // Vertical: divide colunas (ocupa a altura). Horizontal (padrão): linha entre blocos.
      if (a.orientacao === 'vertical') {
        return <div style={{ alignSelf: 'stretch', borderLeft: linha, minHeight: a.altura ? a.altura : 24, margin: '0 8px' }} />
      }
      return <div style={{ borderTop: linha, margin: '4px 0' }} />
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
      // Card em coluna preenche a coluna (a coluna já tem a largura); senão respeita a própria largura %.
      const cardA = full ? { ...a, largura: 100 } : a
      const al = (a.alinhamento as keyof typeof ALIN) ?? 'center'
      return (
        <div style={{ display: 'flex', justifyContent: al === 'left' ? 'flex-start' : al === 'right' ? 'flex-end' : 'center' }}>
          <div style={cardStyle(cardA, theme)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(block.innerBlocks ?? []).map((ib) => <BlockRender key={ib.id} block={ib} theme={theme} data={data} />)}
            </div>
          </div>
        </div>
      )
    }
    case 'colunas': {
      const estilosDiv = { solido: 'solid', tracejado: 'dashed', pontilhado: 'dotted' } as Record<string, string>
      const temDiv = !!a.divisoria
      const bordaDiv = temDiv ? `${a.divisoriaEspessura ?? 1}px ${estilosDiv[a.divisoriaEstilo] ?? 'solid'} ${a.divisoriaCor || c.secundaria}` : ''
      return (
        <div style={{ display: 'flex', gap: a.gap ?? 16, alignItems: temDiv ? 'stretch' : 'flex-start' }}>
          {(block.innerBlocks ?? []).map((col, i) => {
            const cl = larguraDaColuna(col)
            const div = (temDiv && i > 0) ? { borderLeft: bordaDiv, paddingLeft: (a.gap ?? 16) / 2 } : {}
            return <div key={col.id} style={{ flex: cl ? `0 0 ${cl}%` : '1 1 0%', minWidth: 0, ...div }}><BlockRender block={col} theme={theme} data={data} /></div>
          })}
        </div>
      )
    }
    case 'coluna':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(block.innerBlocks ?? []).map((ib) => <BlockRender key={ib.id} block={ib} theme={theme} data={data} full />)}
        </div>
      )
    case 'condicao': {
      // Texto modulado: só renderiza os blocos internos se a condição bater.
      if (!avaliarCondicao(a, data.vars)) return null
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(block.innerBlocks ?? []).map((ib) => <BlockRender key={ib.id} block={ib} theme={theme} data={data} full />)}
        </div>
      )
    }
    case 'diag-disciplina': {
      const val = (tok: string, def: string) => { const r = applyVars(tok, data.vars); return /\{/.test(r) ? def : r }
      const numDe = (tok: string) => parseInt(val(tok, '0').replace(/[^0-9-]/g, ''), 10) || 0
      const ac = numDe(`{acerto_${a.chave}}`), tt = numDe(`{total_${a.chave}}`)
      // "Só se errou": acertou tudo (ou sem questões) → não aparece (no editor sempre mostra p/ editar).
      const escondido = a.soSeErrou !== false && (tt === 0 || ac >= tt)
      if (escondido && !editor) return null
      return (
        <div style={{ borderTop: `${a.linhaAltura ?? 2}px solid ${a.corLinha || '#c9a227'}`, background: a.corRow || '#e9eef7', padding: '7px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, fontFamily: cssDaFonte(a.fonte) || theme.tipografia.familia }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: a.corTitulo || '#1a3a6b' }}>{applyVars(a.nome || '', data.vars)}</div>
            {a.assunto && <div style={{ fontSize: 10, color: '#555', fontStyle: 'italic' }}>- Categoria: {applyVars(a.assunto, data.vars)}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 11, color: a.corAcerto || '#8a8a8a' }}>{val(`{acerto_${a.chave}}`, 'X')}/{val(`{total_${a.chave}}`, '0')}</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: a.corPct || '#e8850c' }}>{val(`{pct_${a.chave}}`, '0%')}</span>
          </div>
        </div>
      )
    }
    case 'diag-grupo': {
      const disc: any[] = Array.isArray(a.disciplinas) ? a.disciplinas : []
      const val = (tok: string, def: string) => { const r = applyVars(tok, data.vars); return /\{/.test(r) ? def : r }
      const numDe = (tok: string) => parseInt(val(tok, '0').replace(/[^0-9-]/g, ''), 10) || 0
      const somaAc = disc.reduce((s, d) => s + numDe(`{acerto_${d.chave}}`), 0)
      const somaTot = disc.reduce((s, d) => s + numDe(`{total_${d.chave}}`), 0)
      return (
        <div style={{ fontFamily: theme.tipografia.familia }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: a.corHeader || '#f6c445', color: a.corHeaderTexto || '#3b3260', fontWeight: 700, padding: '6px 12px', fontSize: 13 }}>
            <span>{applyVars(a.grupo || 'Grupo', data.vars)}</span>
            <span>Acertos&nbsp;&nbsp;{somaAc}/{somaTot}</span>
          </div>
          {disc.map((d, i) => {
            // Fita só se explicitamente pedida (a.mostrarFita). Por padrão, sem linha divisória.
            const fita = a.mostrarFita ? (a.fitaAltura ?? 2) : 0
            const posBase = (a.fitaPosicao ?? 'base') !== 'topo'
            return (
              <div key={i} style={{ ...(fita ? { [posBase ? 'borderBottom' : 'borderTop']: `${fita}px solid ${a.corFita || '#c9a227'}` } : {}), background: a.corRow || '#e9eef7', padding: '7px 12px', marginTop: i === 0 ? 0 : (a.gapLinha ?? 6), minHeight: a.alturaLinha || undefined, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 } as any}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: a.corTitulo || '#243b7a' }}>{applyVars(d.nome || '', data.vars)}</div>
                  {d.assunto && <div style={{ fontSize: 10, color: '#555', fontStyle: 'italic' }}>- Categoria: {applyVars(d.assunto, data.vars)}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 11, color: a.corAcerto || '#8a8a8a' }}>{val(`{acerto_${d.chave}}`, 'X')}/{val(`{total_${d.chave}}`, '0')}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: a.corPct || '#e8850c' }}>{val(`{pct_${d.chave}}`, '0%')}</span>
                </div>
              </div>
            )
          })}
        </div>
      )
    }
    case 'diag-pilares': {
      const pilares: any[] = Array.isArray(a.pilares) ? a.pilares : []
      const bordaDiv = `${a.divisoriaEspessura ?? 1}px solid ${a.divisoriaCor || '#cbb26b'}`
      // Resolve uma variável; se não existir (pilar com 0 questões), usa o padrão.
      const val = (tok: string, def: string) => { const r = applyVars(tok, data.vars); return /\{/.test(r) ? def : r }
      const numPct = (chave: string) => { const n = parseFloat(val(`{pct_pilar_${chave}}`, '0').replace(/[^0-9.,-]/g, '').replace(',', '.')); return isNaN(n) ? 0 : n }
      const faixaDe = (p: any) => { const n = numPct(p.chave); return n <= 50 ? (p.f1 || '') : n <= 80 ? (p.f2 || '') : (p.f3 || '') }
      return (
        <div style={{ background: a.corFundo || '#fef3d6', borderRadius: a.bordaRaio ?? 4, borderTop: a.fitaAltura ? `${a.fitaAltura}px solid ${a.fitaCor || c.primaria}` : undefined, padding: a.padding ?? 10, fontFamily: theme.tipografia.familia }}>
          <div style={{ display: 'flex', gap: a.gap ?? 16, alignItems: 'stretch' }}>
            {pilares.map((p, i) => (
              <div key={i} style={{ flex: '1 1 0%', minWidth: 0, ...(i > 0 && a.divisoria !== false ? { borderLeft: bordaDiv, paddingLeft: (a.gap ?? 16) / 2 } : {}) }}>
                <div style={{ fontWeight: 700, color: a.corTitulo || '#243b7a', fontSize: 13 }}>{p.nome}</div>
                <div style={{ fontWeight: 700, color: a.corTitulo || '#243b7a', fontSize: 22, lineHeight: 1.1 }}>{val(`{pct_pilar_${p.chave}}`, '0%')}</div>
                <div style={{ color: a.corQuestoes || '#c0392b', fontSize: 11 }}>{val(`{acerto_pilar_${p.chave}}`, '0')} de {val(`{total_pilar_${p.chave}}`, '0')} questões</div>
                <div style={{ fontWeight: 700, fontSize: 10, color: '#555', margin: '6px 0 2px' }}>TEXTO MODULADO</div>
                <div style={{ fontSize: 11, lineHeight: 1.5, textAlign: 'justify', whiteSpace: 'pre-wrap', color: c.texto }}>{applyVars(faixaDe(p), data.vars)}</div>
              </div>
            ))}
          </div>
        </div>
      )
    }
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
    case 'cabecalho-prova': {
      const campos: { rotulo: string; valor: string }[] = a.campos ?? []
      const cols = Math.max(1, Math.min(4, Number(a.colunas ?? 2)))
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, border: `1px solid ${c.secundaria}`, borderRadius: 6, overflow: 'hidden', fontFamily: theme.tipografia.familia }}>
          {campos.map((f, i) => (
            <div key={i} style={{ padding: '6px 10px', fontSize: 12, color: c.texto, borderTop: i >= cols ? `1px solid ${c.secundaria}` : 'none', borderLeft: i % cols !== 0 ? `1px solid ${c.secundaria}` : 'none' }}>
              <span style={{ fontWeight: 700, color: c.primaria }}>{f.rotulo}: </span>
              <span>{applyVars(String(f.valor ?? ''), data.vars)}</span>
            </div>
          ))}
        </div>
      )
    }
    case 'assinatura': {
      const items: string[] = a.assinaturas?.length ? a.assinaturas : ['Assinatura']
      const al = ALIN[a.align as keyof typeof ALIN] ?? 'left'
      const w = Number(a.larguraLinha ?? 220)
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, marginTop: 12, justifyContent: al === 'center' ? 'center' : al === 'right' ? 'flex-end' : 'flex-start', fontFamily: theme.tipografia.familia }}>
          {items.map((label, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ width: w, maxWidth: '100%', borderTop: `1px solid ${c.texto}`, marginBottom: 4 }} />
              <span style={{ fontSize: 11, color: c.texto }}>{applyVars(String(label ?? ''), data.vars)}</span>
            </div>
          ))}
        </div>
      )
    }
    case 'quebra-pagina':
      return (
        <div style={{ breakAfter: 'page' }}>
          <div className="print:hidden" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, margin: '4px 0' }}>
            <div style={{ flex: 1, borderTop: '1px dashed #cbd5e1' }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>✂ quebra de página</span>
            <div style={{ flex: 1, borderTop: '1px dashed #cbd5e1' }} />
          </div>
        </div>
      )
    case 'plano-fundo':
      return null // full-bleed: renderizado como camada de fundo da página
    default:
      return <div style={{ color: '#ef4444', fontSize: 12 }}>Bloco desconhecido: {block.type}</div>
  }
}
