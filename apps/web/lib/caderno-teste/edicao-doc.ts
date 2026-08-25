// Edição por bloco dos MODELOS PRONTOS (doc-backed) — casa com a seleção por clique na prévia
// (PreviaBlocos + BlockRender selectable). Acha/atualiza um bloco por id na árvore do CadernoDoc
// e lista os campos editáveis (texto/cor/fonte/…) de cada tipo.

import { genId, type Block, type CadernoDoc } from '@/lib/caderno-designer/types'

export type CampoBlocoDoc = { id: string; label: string; tipo: 'texto' | 'cor' | 'fonte' | 'num' | 'bool' | 'align' | 'select'; valor: any; placeholder?: string; opcoes?: { value: string; label: string }[] }

/** Acha um bloco por id em qualquer nível (páginas + cabeçalho/rodapé). */
export function acharBloco(doc: CadernoDoc, id: string): Block | null {
  const walk = (bs?: Block[]): Block | null => {
    for (const b of bs ?? []) { if (b.id === id) return b; const r = walk(b.innerBlocks); if (r) return r }
    return null
  }
  for (const p of doc.pages) { const r = walk(p.blocks); if (r) return r }
  return walk(doc.cabecalho) || walk(doc.rodape) || null
}

/** Atualiza (imutável) os atributos de um bloco por id em toda a árvore. */
export function atualizarBlocoAttrs(doc: CadernoDoc, id: string, patch: Record<string, unknown>): CadernoDoc {
  const upd = (b: Block): Block => b.id === id
    ? { ...b, attributes: { ...b.attributes, ...patch } }
    : (b.innerBlocks ? { ...b, innerBlocks: b.innerBlocks.map(upd) } : b)
  return {
    ...doc,
    pages: doc.pages.map((p) => ({ ...p, blocks: p.blocks.map(upd) })),
    cabecalho: doc.cabecalho?.map(upd),
    rodape: doc.rodape?.map(upd),
  }
}

/** Remove (imutável) um bloco por id em qualquer nível da árvore. */
export function removerBloco(doc: CadernoDoc, id: string): CadernoDoc {
  const filt = (bs?: Block[]): Block[] => (bs ?? []).filter((b) => b.id !== id).map((b) => b.innerBlocks ? { ...b, innerBlocks: filt(b.innerBlocks) } : b)
  return {
    ...doc,
    pages: doc.pages.map((p) => ({ ...p, blocks: filt(p.blocks) })),
    cabecalho: doc.cabecalho ? filt(doc.cabecalho) : doc.cabecalho,
    rodape: doc.rodape ? filt(doc.rodape) : doc.rodape,
  }
}

/** Rótulo amigável do tipo de bloco (cabeçalho do editor lateral). */
export const NOME_BLOCO: Record<string, string> = {
  'texto-livre': 'Texto', 'titulo-secao': 'Título de seção', instrucoes: 'Instruções', card: 'Card',
  cabecalho: 'Cabeçalho', 'nome-aluno': 'Nome do aluno',
  identificacao: 'Dados do estudante', 'gabarito-grid': 'Grade de gabarito', 'gabarito-correcao': 'Correção',
  'q-comentario': 'Comentário', separador: 'Separador', repeticao: 'Questões', colunas: 'Colunas',
  coluna: 'Coluna', espacador: 'Espaçador', 'plano-fundo': 'Fundo', imagem: 'Imagem', assinatura: 'Assinatura',
}

/** Campos editáveis (texto/cor/fonte) de um bloco por tipo. [] quando não há o que editar. */
export function camposDoBlocoDoc(block: Block): CampoBlocoDoc[] {
  const a = block.attributes as any
  const C = (id: string, label: string, tipo: CampoBlocoDoc['tipo']): CampoBlocoDoc => ({ id, label, tipo, valor: a[id] ?? (tipo === 'bool' ? false : tipo === 'num' ? 0 : '') })
  switch (block.type) {
    case 'texto-livre': return [C('texto', 'Texto', 'texto'), C('align', 'Alinhamento', 'align'), C('color', 'Cor', 'cor'), C('fonte', 'Fonte', 'fonte'), C('size', 'Tamanho', 'num'), C('bold', 'Negrito', 'bool'), C('italico', 'Itálico', 'bool'), C('sublinhado', 'Sublinhado', 'bool')]
    case 'titulo-secao': return [C('texto', 'Texto', 'texto'), C('subtitulo', 'Subtítulo', 'texto'), C('cor', 'Cor do texto', 'cor'), C('corFundo', 'Cor de fundo', 'cor'), C('fonte', 'Fonte', 'fonte')]
    case 'cabecalho': return [C('titulo', 'Título', 'texto'), C('subtitulo', 'Subtítulo', 'texto'), C('corFundo', 'Cor de fundo', 'cor'), C('corTexto', 'Cor do texto', 'cor'), C('tamTitulo', 'Tamanho do título', 'num'), C('fonte', 'Fonte', 'fonte')]
    case 'nome-aluno': return [C('rotulo', 'Rótulo', 'texto'), C('corRotulo', 'Cor do rótulo', 'cor'), C('corTextoRotulo', 'Texto do rótulo', 'cor'), C('corValor', 'Cor da faixa', 'cor'), C('corTextoValor', 'Cor do nome', 'cor'), C('fonte', 'Fonte', 'fonte')]
    case 'instrucoes': return [C('titulo', 'Título', 'texto'), C('texto', 'Texto', 'texto'), C('corFundo', 'Cor de fundo', 'cor'), C('corBorda', 'Cor da borda', 'cor')]
    case 'card': return [C('corFundo', 'Cor de fundo', 'cor'), C('bordaCor', 'Cor da borda', 'cor')]
    case 'identificacao': return [{ id: 'titulo', label: 'Título', tipo: 'texto', valor: a.titulo ?? '', placeholder: 'Dados do Candidato' }, C('corHeader', 'Cor do cabeçalho', 'cor'), C('corHeaderTexto', 'Texto do cabeçalho', 'cor'), C('corAcento', 'Cor de acento', 'cor'), C('fonte', 'Fonte', 'fonte')]
    case 'gabarito-grid': {
      const origem = a.origem ?? 'marcado'
      const tituloPadrao = origem === 'ambos' ? 'Gabarito (marcada × oficial)' : origem === 'oficial' ? 'Gabarito Oficial' : 'Gabarito de Alternativas'
      const campos: CampoBlocoDoc[] = [
        { id: 'titulo', label: 'Título', tipo: 'texto', valor: a.titulo ?? '', placeholder: tituloPadrao },
        { id: 'origem', label: 'Modelo', tipo: 'select', valor: origem, opcoes: [{ value: 'marcado', label: 'Marcada' }, { value: 'oficial', label: 'Oficial' }, { value: 'ambos', label: 'Marcada × Oficial' }] },
      ]
      if (origem === 'ambos') campos.push({ id: 'orientacao', label: 'Orientação', tipo: 'select', valor: a.orientacao === 'horizontal' ? 'horizontal' : 'vertical', opcoes: [{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }] })
      campos.push(
        { id: 'porLinha', label: 'Questões por linha', tipo: 'num', valor: a.porLinha ?? 10 },
        { id: 'numAlternativas', label: 'Nº de alternativas', tipo: 'num', valor: a.numAlternativas ?? 5 },
        C('corHeader', 'Cor do cabeçalho', 'cor'), C('fundoPar', 'Fundo (par)', 'cor'), C('textoPar', 'Texto (par)', 'cor'), C('fundoImpar', 'Fundo (ímpar)', 'cor'), C('textoImpar', 'Texto (ímpar)', 'cor'), C('fonte', 'Fonte', 'fonte'),
      )
      return campos
    }
    case 'gabarito-correcao': return [C('rotulo', 'Rótulo', 'texto')]
    case 'q-comentario': return [C('titulo', 'Título', 'texto'), C('corFundo', 'Cor de fundo', 'cor'), C('corBorda', 'Cor da borda', 'cor'), C('corTitulo', 'Cor do título', 'cor'), C('corTexto', 'Cor do texto', 'cor')]
    case 'separador': return [C('cor', 'Cor', 'cor')]
    case 'imagem': return [C('url', 'URL da imagem', 'texto'), C('largura', 'Largura (%)', 'num')]
    default: return []
  }
}

/** Um item da ESTRUTURA (outline) do caderno doc: bloco top-level de uma página de conteúdo. */
export type ItemEstruturaDoc = { id: string; type: string; nome: string; pagina: number; indice: number; total: number }

/** Lista os blocos TOP-LEVEL das páginas de CONTEÚDO (na ordem) — alimenta o painel de estrutura. */
export function listarBlocosDoc(doc: CadernoDoc): ItemEstruturaDoc[] {
  const out: ItemEstruturaDoc[] = []
  doc.pages.forEach((p, pi) => {
    if (p.kind === 'capa' || p.kind === 'contracapa') return
    p.blocks.forEach((b, i) => out.push({ id: b.id, type: b.type, nome: NOME_BLOCO[b.type] ?? b.type, pagina: pi, indice: i, total: p.blocks.length }))
  })
  return out
}

/** Adiciona um bloco no fim da última página de CONTEÚDO (cria uma se não houver). */
export function adicionarBlocoDoc(doc: CadernoDoc, block: Block): CadernoDoc {
  const pages = doc.pages.map((p) => ({ ...p }))
  let idx = -1
  for (let i = pages.length - 1; i >= 0; i--) { if (pages[i].kind !== 'capa' && pages[i].kind !== 'contracapa') { idx = i; break } }
  if (idx < 0) { pages.push({ id: genId('page'), kind: 'conteudo', titulo: 'Página 1', blocks: [] }); idx = pages.length - 1 }
  pages[idx] = { ...pages[idx], blocks: [...pages[idx].blocks, block] }
  return { ...doc, pages }
}

/** Adiciona um bloco DENTRO dos innerBlocks de um container (card/colunas/…) por id, em qualquer nível. */
export function adicionarBlocoEmContainer(doc: CadernoDoc, containerId: string, block: Block): CadernoDoc {
  const upd = (b: Block): Block => {
    if (b.id === containerId) return { ...b, innerBlocks: [...(b.innerBlocks ?? []), block] }
    return b.innerBlocks ? { ...b, innerBlocks: b.innerBlocks.map(upd) } : b
  }
  return {
    ...doc,
    pages: doc.pages.map((p) => ({ ...p, blocks: p.blocks.map(upd) })),
    cabecalho: doc.cabecalho?.map(upd),
    rodape: doc.rodape?.map(upd),
  }
}

/** Move um bloco top-level para cima/baixo dentro da sua página de conteúdo. */
export function moverBlocoDoc(doc: CadernoDoc, id: string, dir: -1 | 1): CadernoDoc {
  const pages = doc.pages.map((p) => {
    const i = p.blocks.findIndex((b) => b.id === id)
    if (i < 0) return p
    const j = i + dir
    if (j < 0 || j >= p.blocks.length) return p
    const blocks = [...p.blocks]
    ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
    return { ...p, blocks }
  })
  return { ...doc, pages }
}
