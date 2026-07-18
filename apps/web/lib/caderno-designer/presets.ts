// Modelos prontos de caderno: cada preset devolve um CadernoDoc completo,
// aplicável num clique sobre a modalidade ativa (substitui o conteúdo).

import { createBlock } from './blocks'
import { genId, RUNNING_PADRAO, type CadernoDoc, type Block, type Page, type PageKind, type RunningConfig } from './types'
import { DIAGNOSTICO_DOC } from './preset-diagnostico-doc'
import { CADERNO_COMPLETO_DOC, CADERNO_PERGUNTAS_DOC, FOLHA_RESPOSTAS_DOC } from './preset-cadernos-doc'

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
function doc(pages: Page[], running?: Partial<RunningConfig>): CadernoDoc {
  return { versao: 1, pages, cabecalho: [], rodape: [], running: { ...RUNNING_PADRAO, ...(running ?? {}) } }
}

export type CadernoPreset = { id: string; nome: string; descricao: string; build: () => CadernoDoc }

/** Reconstrói um doc capturado (JSON sem ids) em blocos reais, com IDs novos a cada aplicação. */
function docCapturado(raw: any): CadernoDoc {
  const cloneBlock = (b: any): Block => {
    const nb = createBlock(b.type)
    Object.assign(nb.attributes as Record<string, unknown>, b.attributes ?? {})
    nb.innerBlocks = Array.isArray(b.innerBlocks) ? b.innerBlocks.map(cloneBlock) : (nb.innerBlocks ?? [])
    return nb
  }
  return {
    versao: raw.versao ?? 1,
    running: { ...RUNNING_PADRAO, ...(raw.running ?? {}) },
    cabecalho: (raw.cabecalho ?? []).map(cloneBlock),
    rodape: (raw.rodape ?? []).map(cloneBlock),
    pages: (raw.pages ?? []).map((p: any): Page => ({ id: genId('page'), kind: p.kind, titulo: p.titulo, valign: p.valign, blocks: (p.blocks ?? []).map(cloneBlock) })),
  }
}

export const PRESETS_CADERNO: CadernoPreset[] = [
  {
    id: 'diagnostico',
    nome: 'Diagnóstico de Desempenho',
    descricao: 'Modelo pronto (Simulado AGU): capa + nota, 3 pilares, desempenho por disciplina em grupos e sugestões de estudo. Reenvie as imagens de fundo e ajuste os textos/variáveis.',
    build: () => docCapturado(DIAGNOSTICO_DOC),
  },
  {
    id: 'caderno-objetivo',
    nome: 'Folha de respostas',
    descricao: 'Modelo pronto (Simulado AGU): capa + dados do estudante + respostas por questão. Reenvie as imagens de fundo.',
    build: () => docCapturado(FOLHA_RESPOSTAS_DOC),
  },
  {
    id: 'caderno-discursivo',
    nome: 'Caderno discursivo',
    descricao: 'Capa + cabeçalho + dados do estudante (discursivas). Reenvie as imagens de fundo.',
    build: () => doc([
      page('capa', 'Capa', [
        blk('plano-fundo', { url: '', opacidade: 100 }),
        blk('espacador', { altura: 749 }),
        blk('texto-livre', { bold: true, size: 48, align: 'center', color: '#ffffff', fonte: 'montserrat', texto: 'CADERNO DE \nQUESTÕES DISCURSIVA', italico: false, valignV: 'center', alturaMin: 171, lineHeight: 1, sublinhado: false, espacamento: 0 }),
      ]),
      page('conteudo', 'Conteúdo', [
        blk('plano-fundo', { url: '', opacidade: 100 }),
        blk('espacador', { altura: 36 }),
        blk('card', { largura: 100, padding: 14, bordaCor: '', corFundo: '#2c5ea5', bordaRaio: 0, alinhamento: 'center', bordaLargura: 1 }, [
          blk('texto-livre', { bold: true, size: 24, align: 'left', color: '#ffffff', fonte: 'sans', texto: 'CADERNO DE QUESTÕES DISCURSIVA\n', italico: false, valignV: 'top', alturaMin: 0, lineHeight: 1.8, sublinhado: false, espacamento: 0 }),
          blk('texto-livre', { bold: false, size: 20, align: 'left', color: '#ffffff', fonte: 'montserrat', texto: 'Concurso Simulado AGU \n', italico: false, valignV: 'top', alturaMin: 0, lineHeight: 1.5, sublinhado: false, espacamento: 0 }),
        ]),
        blk('espacador', { altura: 4 }),
        blk('identificacao', {
          fonte: 'montserrat', titulo: 'DADOS DO ESTUDANTE', bordaRaio: 0, corHeader: '#2c5ea5', corHeaderTexto: '#ffffff',
          destaque: [{ rotulo: 'Nome', valor: '{{nome}}' }, { rotulo: 'E-mail', valor: '{{email}}' }],
          campos: [{ rotulo: 'Data', valor: '{{data}}' }, { rotulo: 'Início', valor: '{{inicio}}' }, { rotulo: 'Término', valor: '{{termino}}' }, { rotulo: 'Tempo total', valor: '{{tempo_total}}' }, { rotulo: 'Respondidas', valor: '{{respondidas}}' }, { rotulo: 'Em branco', valor: '{{em_branco}}' }],
        }),
      ]),
    ]),
  },
  {
    id: 'caderno-completo',
    nome: 'Caderno completo',
    descricao: 'Modelo pronto (Simulado AGU): capa + dados do estudante + questões (enunciado, alternativas e resposta marcada) com cabeçalho/rodapé. Reenvie as imagens de fundo.',
    build: () => docCapturado(CADERNO_COMPLETO_DOC),
  },
  {
    id: 'caderno-perguntas',
    nome: 'Caderno de perguntas',
    descricao: 'Modelo pronto (Simulado AGU): capa + dados do estudante + perguntas e alternativas de cada questão. Reenvie as imagens de fundo.',
    build: () => docCapturado(CADERNO_PERGUNTAS_DOC),
  },
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
