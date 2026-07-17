// Modelos prontos de caderno: cada preset devolve um CadernoDoc completo,
// aplicável num clique sobre a modalidade ativa (substitui o conteúdo).

import { createBlock } from './blocks'
import { genId, RUNNING_PADRAO, type CadernoDoc, type Block, type Page, type PageKind, type RunningConfig } from './types'

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

export const PRESETS_CADERNO: CadernoPreset[] = [
  {
    id: 'diagnostico',
    nome: 'Diagnóstico de Desempenho',
    descricao: 'Barras de seção, cartão de nota, 3 pilares com divisória e cards com fita. Ajuste os textos e vincule as variáveis ({nome}, {acertos}, {total_questoes}, {percentual}, pct_<disciplina>).',
    build: () => doc([
      page('conteudo', 'Diagnóstico', [
        blk('plano-fundo', { url: '', opacidade: 100 }),
        blk('espacador', { altura: 24 }),
        blk('titulo-secao', { texto: 'Diagnóstico de Desempenho', subtitulo: '{simulado}', nivel: 1, corFundo: '#2c5ea5', cor: '#ffffff', fundoRaio: 6, align: 'left', mostrarLinha: false }),
        blk('espacador', { altura: 8 }),
        blk('titulo-secao', { texto: 'NOME:   {nome}', nivel: 2, corFundo: '#3b5bdb', cor: '#ffffff', fundoRaio: 6, align: 'left', mostrarLinha: false }),
        blk('espacador', { altura: 8 }),
        blk('card', { corFundo: '#f6c445', bordaLargura: 0, bordaRaio: 6, padding: 12, largura: 100, alinhamento: 'center' }, [
          blk('texto-livre', { texto: '{acertos} / {total_questoes}      —      {percentual} de aproveitamento', bold: true, size: 18, align: 'left', color: '#3b3260' }),
        ]),
        blk('espacador', { altura: 12 }),
        blk('titulo-secao', { texto: 'DESEMPENHO POR PILAR', nivel: 2, corFundo: '#2b2a4a', cor: '#ffffff', fundoRaio: 4, align: 'left', mostrarLinha: false }),
        blk('espacador', { altura: 8 }),
        // Bloco dinâmico: 3 pilares colados, % real + faixa automática (0–50 / 51–80 / 81–100).
        blk('diag-pilares', { pilares: [
          { chave: 'lei_seca', nome: 'LEI SECA',
            f1: 'O seu desempenho em lei seca ficou abaixo de 50%, um resultado que pode ser considerado ruim. A CEBRASPE cobra texto literal de lei em muitas questões, sendo um dos principais fatores de reprovação entre nossos alunos.',
            f2: 'O seu desempenho em lei seca foi intermediário. Você tem base, mas ainda está deixando pontos na mesa. A banca cobra o dispositivo exato — foque nos diplomas de maior incidência, com atenção aos detalhes.',
            f3: 'O seu desempenho em lei seca foi excelente! Esse pode ser o diferencial para sua aprovação. Mantenha-se firme, com revisões periódicas, e estude os conteúdos específicos da AGU com foco na lei seca.' },
          { chave: 'jurisprudencia', nome: 'JURISPRUDÊNCIA',
            f1: 'O seu desempenho em jurisprudência ficou abaixo de 50%, e isso é muito ruim. A CEBRASPE não abre mão de cobrar informativos. Reforce o estudo pelo DOD, JurisClub ou informativos do STF e STJ.',
            f2: 'O seu desempenho em jurisprudência foi médio — há espaço relevante para crescimento. As questões de jurisprudência diferenciam os primeiros colocados. Reforce pelo DoD ou pelo JurisClub do Revisão.',
            f3: 'O seu desempenho em jurisprudência foi maravilhoso! Você acompanha os informativos e aplica os entendimentos com segurança. Mantenha o hábito, com atenção à jurisprudência mais recente e às teses consolidadas.' },
          { chave: 'doutrina', nome: 'DOUTRINA',
            f1: 'O desempenho em doutrina ficou abaixo de 50%. Doutrina é a base do raciocínio jurídico — quem não domina classificações, distinções e princípios erra também em lei e jurisprudência. O investimento tem retorno duplo.',
            f2: 'O desempenho em doutrina foi intermediário. Você acerta nas questões diretas, mas perde nas distinções mais finas. Dominar doutrina ajuda a ganhar pontos também em questões de lei e jurisprudência.',
            f3: 'O desempenho em doutrina foi excelente. Você domina classificações, distinções conceituais e fundamentos teóricos — o que se reflete também em questões de lei e jurisprudência. Mantenha a solidez.' },
        ], corFundo: '#fef3d6', fitaCor: '#3b5bdb', fitaAltura: 4, divisoriaCor: '#cbb26b', corTitulo: '#243b7a' }),
        blk('espacador', { altura: 12 }),
        blk('titulo-secao', { texto: 'DESEMPENHO POR DISCIPLINA', nivel: 2, corFundo: '#2b2a4a', cor: '#ffffff', fundoRaio: 4, align: 'left', mostrarLinha: false }),
        blk('espacador', { altura: 8 }),
        blk('card', { corFundo: '#eef3fb', bordaLargura: 0, bordaRaio: 4, padding: 10, largura: 100, fitaCor: '#f6c445', fitaAltura: 4 }, [
          blk('texto-livre', { texto: 'Direito Administrativo — {pct_direito_administrativo} ({acerto_direito_administrativo} de {total_direito_administrativo})', size: 12, align: 'left', bold: true }),
          blk('texto-livre', { texto: 'Troque pelo nome real das suas disciplinas. As variáveis pct_/acerto_/total_ existem por disciplina do banco.', size: 10, align: 'left', color: '#888888', italico: true }),
        ]),
      ]),
    ]),
  },
  {
    id: 'caderno-objetivo',
    nome: 'Folha de respostas',
    descricao: 'Capa + cabeçalho + dados do estudante + grade de respostas (reenvie as imagens de fundo).',
    build: () => doc([
      page('capa', 'Capa', [
        blk('plano-fundo', { url: '', opacidade: 100 }),
        blk('espacador', { altura: 749 }),
        blk('texto-livre', { bold: true, size: 48, align: 'center', color: '#ffffff', fonte: 'montserrat', texto: 'CADERNO DE \nQUESTÕES OBJETIVAS', italico: false, valignV: 'center', alturaMin: 171, lineHeight: 1, sublinhado: false, espacamento: 0 }),
      ]),
      page('conteudo', 'Conteúdo', [
        blk('plano-fundo', { url: '', opacidade: 100 }),
        blk('espacador', { altura: 36 }),
        blk('card', { largura: 100, padding: 14, bordaCor: '', corFundo: '#2c5ea5', bordaRaio: 0, alinhamento: 'center', bordaLargura: 1 }, [
          blk('texto-livre', { bold: true, size: 24, align: 'left', color: '#ffffff', fonte: 'sans', texto: 'CADERNO DE QUESTÕES OBJETIVAS\n', italico: false, lineHeight: 1.8, sublinhado: false, espacamento: 0 }),
          blk('texto-livre', { bold: false, size: 20, align: 'left', color: '#ffffff', fonte: 'montserrat', texto: 'Concurso Simulado AGU \n', italico: false, valignV: 'top', alturaMin: 0, lineHeight: 1.5, sublinhado: false, espacamento: 0 }),
        ]),
        blk('espacador', { altura: 4 }),
        blk('identificacao', {
          fonte: 'montserrat', titulo: 'DADOS DO ESTUDANTE', bordaRaio: 0, corHeader: '#2c5ea5', corHeaderTexto: '#ffffff',
          destaque: [{ rotulo: 'Nome', valor: '{{nome}}' }, { rotulo: 'E-mail', valor: '{{email}}' }],
          campos: [{ rotulo: 'Data', valor: '{{data}}' }, { rotulo: 'Início', valor: '{{inicio}}' }, { rotulo: 'Término', valor: '{{termino}}' }, { rotulo: 'Tempo total', valor: '{{tempo_total}}' }, { rotulo: 'Respondidas', valor: '{{respondidas}}' }, { rotulo: 'Em branco', valor: '{{em_branco}}' }],
        }),
        blk('gabarito-grid', { fonte: 'montserrat', origem: 'marcado', titulo: 'GABARITO DE ALTERNATIVA', corHeader: '#2c5ea5', corHeaderTexto: '#ffffff', fundoImpar: '#ffbd35', textoImpar: '#ffffff', fundoPar: '#3b3260', textoPar: '#ffffff', corMarcadas: '#000000', porLinha: 10, bordaRaio: 0, numQuestoes: null, numAlternativas: 5 }),
      ]),
    ]),
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
    descricao: 'Capa + dados do estudante + questões (enunciado, alternativas e resposta marcada) com cabeçalho/rodapé. Reenvie as imagens de fundo.',
    build: () => doc([
      page('capa', 'Capa', [
        blk('plano-fundo', { url: '', opacidade: 100 }),
        blk('espacador', { altura: 749 }),
        blk('texto-livre', { bold: true, size: 48, align: 'center', color: '#ffffff', fonte: 'montserrat', texto: 'CADERNO DE \nPROVA COMPLETO', italico: false, valignV: 'center', alturaMin: 171, lineHeight: 1, sublinhado: false, espacamento: 0 }),
      ]),
      page('conteudo', 'Conteúdo', [
        blk('plano-fundo', { url: '', opacidade: 100 }),
        blk('card', { largura: 100, padding: 14, bordaCor: '', corFundo: '#2c5ea5', bordaRaio: 0, alinhamento: 'center', bordaLargura: 1 }, [
          blk('texto-livre', { bold: true, size: 24, align: 'left', color: '#ffffff', fonte: 'sans', texto: 'CADERNO DE QUESTÕES OBJETIVAS\n', italico: false, valignV: 'top', alturaMin: 0, lineHeight: 1.8, sublinhado: false, espacamento: 0 }),
          blk('texto-livre', { bold: false, size: 20, align: 'left', color: '#ffffff', fonte: 'montserrat', texto: 'Concurso Simulado AGU \n', italico: false, valignV: 'top', alturaMin: 0, lineHeight: 1.5, sublinhado: false, espacamento: 0 }),
        ]),
        blk('espacador', { altura: 4 }),
        blk('identificacao', {
          fonte: 'montserrat', titulo: 'DADOS DO ESTUDANTE', bordaRaio: 0, corHeader: '#2c5ea5', corHeaderTexto: '#ffffff',
          destaque: [{ rotulo: 'Nome', valor: '{{nome}}' }, { rotulo: 'E-mail', valor: '{{email}}' }],
          campos: [{ rotulo: 'Data', valor: '{{data}}' }, { rotulo: 'Início', valor: '{{inicio}}' }, { rotulo: 'Término', valor: '{{termino}}' }, { rotulo: 'Tempo total', valor: '{{tempo_total}}' }, { rotulo: 'Respondidas', valor: '{{respondidas}}' }, { rotulo: 'Em branco', valor: '{{em_branco}}' }],
        }),
        blk('repeticao', { gap: 16, quantidade: null }, [
          blk('card', { largura: 20, padding: 1, bordaCor: '', corFundo: '#2c5ea5', bordaRaio: 8, alinhamento: 'left', bordaLargura: 1 }, [
            blk('texto-livre', { bold: true, size: 14, align: 'center', color: '#ffffff', fonte: 'montserrat', texto: 'QUESTÃO {q_num}', italico: false, valignV: 'top', alturaMin: 0, lineHeight: 1.5, sublinhado: false, espacamento: 0 }),
          ]),
          blk('texto-livre', { bold: false, size: 12, align: 'justify', color: '', fonte: '', texto: '{q_enunciado}', italico: false, valignV: 'top', alturaMin: 0, lineHeight: 1.5, sublinhado: false, espacamento: 0 }),
          blk('texto-livre', { bold: false, size: 12, align: 'left', color: '', fonte: '', texto: '{q_alt_a}\n{q_alt_b}\n{q_alt_c}\n{q_alt_d}\n{q_alt_e}', italico: false, valignV: 'top', alturaMin: 0, lineHeight: 1.5, sublinhado: false, espacamento: 0 }),
          blk('colunas', { gap: 16 }, [
            blk('coluna', {}, [
              blk('texto-livre', { bold: false, size: 12, align: 'center', color: '', fonte: '', texto: 'RESPOSTA MARCADA: ', italico: false, largura: 20, valignV: 'center', alturaMin: 0, lineHeight: 3, sublinhado: false, espacamento: 0 }),
            ]),
            blk('coluna', {}, [
              blk('card', { largura: 6, padding: 3, bordaCor: '#ffffff', corFundo: '#2c5ea5', bordaRaio: 10, alinhamento: 'center', bordaLargura: 0 }, [
                blk('texto-livre', { bold: false, size: 12, align: 'center', color: '#ffffff', fonte: '', texto: '{q_resposta_letra}', italico: false, largura: 65, valignV: 'top', alturaMin: 0, lineHeight: 1.7, sublinhado: false, espacamento: 0, alinhamentoBloco: 'center' }),
              ]),
            ]),
          ]),
        ]),
      ]),
    ], { cabecalhoAtivo: true, cabecalhoAltura: 75, cabecalhoPaginas: 'exceto_capa', rodapeAtivo: true, rodapeAltura: 40, rodapePaginas: 'exceto_capa', mostrarNumeroPagina: true }),
  },
  {
    id: 'caderno-perguntas',
    nome: 'Caderno de perguntas',
    descricao: 'Só as perguntas e as alternativas de cada questão (sem dados do aluno, sem gabarito).',
    build: () => doc([
      page('conteudo', 'Perguntas', [
        blk('titulo-secao', { texto: '{simulado}', nivel: 1, align: 'left', mostrarLinha: true, espacamento: 6 }),
        blk('repeticao', { gap: 18, quantidade: null }, [
          blk('titulo-secao', { texto: 'Questão {q_num}', nivel: 2, align: 'left', mostrarLinha: false }),
          blk('texto-livre', { texto: '{q_enunciado}', size: 12, align: 'justify', lineHeight: 1.5, espacamento: 4 }),
          blk('alternativas', { mostrarGabarito: false }),
        ]),
      ]),
    ]),
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
