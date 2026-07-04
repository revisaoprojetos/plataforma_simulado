// Modelos prontos de caderno: cada preset devolve um CadernoDoc completo,
// aplicável num clique sobre a modalidade ativa (substitui o conteúdo).

import { createBlock } from './blocks'
import { genId, RUNNING_PADRAO, type CadernoDoc, type Block, type Page, type PageKind } from './types'

/** Cria um bloco com os defaults do tipo + um patch de atributos (e filhos opcionais). */
function blk(type: string, patch: Record<string, unknown> = {}, inner?: Block[]): Block {
  const b = createBlock(type)
  Object.assign(b.attributes as Record<string, unknown>, patch)
  if (inner) b.innerBlocks = inner
  return b
}
function page(kind: PageKind, titulo: string, blocks: Block[]): Page {
  return { id: genId('page'), kind, titulo, blocks }
}
function doc(pages: Page[]): CadernoDoc {
  return { versao: 1, pages, cabecalho: [], rodape: [], running: { ...RUNNING_PADRAO } }
}

export type CadernoPreset = { id: string; nome: string; descricao: string; build: () => CadernoDoc }

export const PRESETS_CADERNO: CadernoPreset[] = [
  {
    id: 'prova-completa',
    nome: 'Prova completa',
    descricao: 'Capa + questões (enunciado e alternativas) por questão.',
    build: () => doc([
      page('capa', 'Capa', [
        blk('cabecalho-prova', { campos: [{ rotulo: 'Banca', valor: '' }, { rotulo: 'Órgão', valor: '' }, { rotulo: 'Cargo', valor: '' }, { rotulo: 'Ano', valor: '' }], colunas: 2 }),
        blk('espacador', { altura: 16 }),
        blk('titulo-secao', { texto: '{simulado}', nivel: 1, align: 'center' }),
        blk('espacador', { altura: 12 }),
        blk('identificacao', { titulo: 'Identificação do candidato', campos: ['Nome completo', 'Nº de inscrição', 'Data'] }),
        blk('espacador', { altura: 12 }),
        blk('instrucoes', { titulo: 'Instruções', texto: 'Leia atentamente cada questão. Marque apenas uma alternativa por questão.' }),
      ]),
      page('conteudo', 'Questões', [
        blk('repeticao', { gap: 18 }, [
          blk('titulo-secao', { texto: 'Questão {q_num}', nivel: 2, align: 'left', mostrarLinha: false }),
          blk('texto-livre', { texto: '{q_enunciado}', size: 12 }),
          blk('alternativas', { mostrarGabarito: false }),
        ]),
      ]),
    ]),
  },
  {
    id: 'folha-respostas',
    nome: 'Folha de respostas',
    descricao: 'Cartão-resposta (grade de bolhas) + identificação + assinatura.',
    build: () => doc([
      page('gabarito', 'Folha de respostas', [
        blk('titulo-secao', { texto: 'Folha de Respostas', nivel: 1, align: 'center' }),
        blk('espacador', { altura: 8 }),
        blk('identificacao', { titulo: '', campos: ['Nome completo', 'Nº de inscrição'] }),
        blk('espacador', { altura: 12 }),
        blk('gabarito-grid', { titulo: '', numQuestoes: null, numAlternativas: 5, colunas: 2, estilo: 'circulo' }),
        blk('espacador', { altura: 24 }),
        blk('assinatura', { assinaturas: ['Assinatura do candidato'], align: 'left', larguraLinha: 240 }),
      ]),
    ]),
  },
  {
    id: 'caderno-redacao',
    nome: 'Caderno de redação',
    descricao: 'Instruções + folha pautada para resposta discursiva.',
    build: () => doc([
      page('conteudo', 'Redação', [
        blk('titulo-secao', { texto: 'Redação', nivel: 1, align: 'center' }),
        blk('instrucoes', { titulo: 'Proposta', texto: 'Desenvolva um texto dissertativo-argumentativo sobre o tema proposto.' }),
        blk('espacador', { altura: 10 }),
        blk('linhas-resposta', { quantidade: 30, rotulo: '', altura: 30 }),
      ]),
    ]),
  },
  {
    id: 'gabarito-comentado',
    nome: 'Gabarito comentado',
    descricao: 'Enunciado + alternativas com gabarito + correção por questão.',
    build: () => doc([
      page('gabarito', 'Gabarito comentado', [
        blk('titulo-secao', { texto: 'Gabarito Comentado — {simulado}', nivel: 1, align: 'center' }),
        blk('espacador', { altura: 8 }),
        blk('repeticao', { gap: 16 }, [
          blk('titulo-secao', { texto: 'Questão {q_num}', nivel: 2, mostrarLinha: false }),
          blk('texto-livre', { texto: '{q_enunciado}', size: 12 }),
          blk('alternativas', { mostrarGabarito: true }),
          blk('gabarito-correcao', { rotulo: 'Sua resposta:', mostrarCorreta: true }),
        ]),
      ]),
    ]),
  },
]
