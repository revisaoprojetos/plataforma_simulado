// Conteúdo estruturado da modalidade "Diagnóstico" (rico) — base do modelo pronto e alvo da
// importação (Word/HTML). Um item de diagnóstico guarda este objeto em `item.conteudo`.

export type DiagBanda = { faixa: string; texto: string }
/** Fonte dos dados de um card: pilar canônico (`{pct_pilar_<chave>}`) ou disciplina (`{pct_<chave>}`). */
export type TipoFonte = 'pilar' | 'disciplina'
/** `chave` = slug do pilar/disciplina. `tipoFonte` decide o prefixo da variável (pilar_ ou nada). */
export type DiagPilar = { nome: string; chave?: string; tipoFonte?: TipoFonte; totalTxt: string; bandas: DiagBanda[] }
/** `chave` = slug da disciplina → casa com {pct_<chave>}/{acerto_<chave>}/{total_<chave>}/{assuntos_<chave>}. */
export type DiagDisciplina = { nome: string; chave?: string; total: string; categoria: string }

/** Prefixo da variável conforme a fonte: pilar canônico usa `pilar_`; disciplina, sem prefixo. */
export function prefFonte(tipo?: TipoFonte): string { return tipo === 'disciplina' ? '' : 'pilar_' }
/** Legenda "x de N questões" com as variáveis certas para a chave/fonte. */
export function totalTxtDe(chave: string, tipo?: TipoFonte): string { const p = prefFonte(tipo); return `{acerto_${p}${chave}} de {total_${p}${chave}} questões` }

/** Slug igual ao de merge.ts (para as variáveis casarem com os dados do banco/aluno). */
export function slugDiag(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

/** Variáveis padronizadas do diagnóstico (documentação do formato adaptativo). */
export const VARS_DIAGNOSTICO = {
  aluno: ['{nome}', '{email}', '{telefone}', '{cpf}', '{classificacao}'],
  simulado: ['{simulado}', '{acertos}', '{erros}', '{total_questoes}', '{nota}', '{percentual}'],
  porPilar: ['{pct_pilar_<slug>}', '{acerto_pilar_<slug>}', '{total_pilar_<slug>}'],
  porDisciplina: ['{pct_<slug>}', '{acerto_<slug>}', '{total_<slug>}', '{assuntos_<slug>}'],
}
export type DiagItemSugestao = { forte: boolean; texto: string }
export type DiagSugestao = { titulo: string; prioridade: string; intro: string; itens: DiagItemSugestao[]; corTitulo?: string }

/** Junta os itens da sugestão num texto único (um por linha), preservando o marcador `>`/`>>`
 * (dos itens antigos com `forte`) quando o texto ainda não começa com marcador. */
export function topicosParaTexto(itens: DiagItemSugestao[]): string {
  return (itens ?? []).map((it) => {
    const t = it.texto ?? ''
    return /^\s*>/.test(t) ? t : `${it.forte ? '>>' : '>'} ${t}`
  }).join('\n')
}

export type DiagConteudo = {
  /** Título do cabeçalho do diagnóstico (independente do título do grupo). */
  tituloCabecalho?: string
  /** Rótulo do campo do nome (ex.: "NOME:"). */
  rotuloNome?: string
  subtitulo: string
  notaTotal: string
  notaTexto: string
  intro: string[]
  /** Títulos das seções (editáveis). Opcionais — usam o texto padrão quando ausentes. */
  tituloPilares?: string
  tituloDisciplinas?: string
  tituloSugestoes?: string
  pilares: DiagPilar[]
  /** Seção SEPARADA (ex.: Língua Portuguesa na PGE/RS) — card de pilar/disciplina próprio, fora dos jurídicos.
   * `chave`/`tipoFonte` tornam adaptável a qualquer matéria (ex.: história) conforme os dados do simulado. */
  linguaPortuguesa?: { titulo: string; chave: string; tipoFonte?: TipoFonte; totalTxt: string; secTitulo: string; secIntro: string; bandas: DiagBanda[] }
  disciplinasIntro: string
  disciplinas: DiagDisciplina[]
  /** Overrides por disciplina do BANCO (chave → nome editado) e disciplinas ocultadas (chaves). */
  discNomes?: Record<string, string>
  discOcultas?: string[]
  /** Blocos estruturais ocultados (nota/nome/pilares/disciplinas/sugestoes/gabarito). */
  partesOcultas?: string[]
  /** Card "Dados do estudante" (nome/e-mail/tempo/nota) — mesmo estilo da Folha de Respostas. */
  dadosCard?: boolean
  /** Overrides de cor do card "Dados do estudante" (chave = atributo do bloco identificacao → hex). */
  dadosCardCores?: Record<string, string>
  /** Cards de pilar INDIVIDUAIS/separados: cada "Desempenho por pilar" adicionado vira um grupo próprio. */
  pilaresGrupos?: DiagPilar[][]
  /** Cards de sugestão INDIVIDUAIS (só o card, sem faixa de seção). */
  sugsIndividuais?: DiagSugestao[]
  /** Faixas de seção avulsas (barra colorida com título, ex.: "GABARITO OFICIAL DESATUALIZADO"). */
  cards?: { texto: string }[]
  /** Cards com fita (fundo claro + faixa colorida à esquerda OU no topo + linhas de texto). */
  fitas?: { texto: string; pos?: 'left' | 'top' }[]
  /** Cards de disciplina INDIVIDUAIS (só o card com a fita, sem faixa/introdução): chave + posição da fita. */
  discsIndividuais?: { chave: string; pos?: 'top' | 'left' }[]
  /** Ordem dos blocos na prévia (chaves das entradas). Ausentes ficam na ordem natural, ao final. */
  ordem?: string[]
  /** Cor dos marcadores no início da linha: `>` (normal) e `>>` (forte). */
  corMarcador?: string
  corMarcadorForte?: string
  /** Cor do TEXTO (nome) por card de disciplina (chave → hex). */
  discCorTexto?: Record<string, string>
  /** Fonte dos dados por card (chave do card → chave da disciplina cujos assuntos/estatísticas exibir). */
  discFonte?: Record<string, string>
  sugestoes: DiagSugestao[]
  /** Parágrafos de fechamento (após as sugestões) — encerramento motivacional do diagnóstico. */
  fechamento?: string[]
  gabaritoTitulo: string
  gabaritoIntro: string[]
  gabaritoObs: string[]
}

/** Diagnóstico genérico (default quando um item de diagnóstico não tem conteúdo salvo). */
export const DIAG_PADRAO: DiagConteudo = {
  tituloCabecalho: 'Diagnóstico de Desempenho',
  subtitulo: 'Adicionar Subtítulo',
  notaTotal: '{total_questoes}',
  notaTexto: '{acertos} acertos de {total_questoes} questões — {percentual} de aproveitamento',
  intro: ['Texto de abertura do diagnóstico. Explique o objetivo do relatório e como o aluno deve lê-lo.'],
  pilares: [
    { nome: 'LEI SECA', chave: 'lei_seca', totalTxt: '{acerto_pilar_lei_seca} de {total_pilar_lei_seca} questões', bandas: [{ faixa: '0-49', texto: '' }, { faixa: '50-80', texto: '' }, { faixa: '81-100', texto: '' }] },
    { nome: 'JURISPRUDÊNCIA', chave: 'jurisprudencia', totalTxt: '{acerto_pilar_jurisprudencia} de {total_pilar_jurisprudencia} questões', bandas: [{ faixa: '0-49', texto: '' }, { faixa: '50-80', texto: '' }, { faixa: '81-100', texto: '' }] },
    { nome: 'DOUTRINA', chave: 'doutrina', totalTxt: '{acerto_pilar_doutrina} de {total_pilar_doutrina} questões', bandas: [{ faixa: '0-49', texto: '' }, { faixa: '50-80', texto: '' }, { faixa: '81-100', texto: '' }] },
  ],
  disciplinasIntro: 'A análise a seguir tem foco nos seus pontos de erros. Para cada disciplina, você encontra o desempenho por categoria (lei seca, jurisprudência e doutrina) e uma leitura personalizada.',
  disciplinas: [{ nome: 'Disciplina', chave: 'disciplina', total: 'x/N', categoria: 'Assunto' }],
  sugestoes: [{ titulo: 'LEI SECA', prioridade: 'Prioridade Alta', intro: '', itens: [] }],
  gabaritoTitulo: 'GABARITO OFICIAL DESATUALIZADO',
  gabaritoIntro: ['Observações sobre questões que sofreram atualização legislativa ou jurisprudencial.'],
  gabaritoObs: [],
}

/** Diagnóstico VAZIO — canvas "em branco total" para criação do zero: nenhum bloco renderiza até
 *  o usuário adicioná-los (painel Estrutura). As chaves estruturais ficam em `partesOcultas`;
 *  cabeçalho/dados do aluno são desligados nos ajustes do item (ver novoItemVazio). */
export const DIAG_VAZIO: DiagConteudo = {
  tituloCabecalho: 'Diagnóstico de Desempenho',
  subtitulo: '',
  notaTotal: '{total_questoes}',
  notaTexto: '{acertos} acertos de {total_questoes} questões — {percentual} de aproveitamento',
  intro: [],
  pilares: [],
  disciplinasIntro: '',
  disciplinas: [],
  sugestoes: [],
  gabaritoTitulo: 'GABARITO OFICIAL DESATUALIZADO',
  gabaritoIntro: [],
  gabaritoObs: [],
  partesOcultas: ['nome', 'nota', 'pilares', 'sec_pilares', 'disciplinas', 'sec_disciplinas', 'sugestoes', 'sec_sugestoes', 'gabarito', 'sec_gabarito', 'lingua'],
}

/** Preset pronto: Diagnóstico de Desempenho — AGU 2023 (base montada a partir do documento enviado). */
export const DIAG_AGU_2023: DiagConteudo = {
  tituloCabecalho: 'Diagnóstico de Desempenho',
  subtitulo: 'Adicionar Subtítulo',
  notaTotal: '{total_questoes}',
  notaTexto: '{acertos} acertos de {total_questoes} questões — {percentual} de aproveitamento',
  intro: [
    'Este é o seu simulado com base na prova do concurso da AGU de 2023, no estilo CEBRASPE. Ele não foi pensado para medir se você "está pronto(a)", na verdade, isso pouco importa aqui, mas sim para colocar você diante da forma como a banca cobrava naquele certame e mostrar, com precisão, onde direcionar as próximas semanas de estudo.',
    'O número de acertos é a parte menos importante deste relatório. O que importa de verdade está no que vem a seguir: o desempenho por pilar (lei seca, jurisprudência e doutrina) e por disciplina, que revela exatamente que tipo de erro você está cometendo. Errar por não ter visto o assunto é diferente de errar por não dominar o texto de lei, que é diferente de errar por não acompanhar jurisprudência. Cada uma dessas lacunas se resolve de um jeito, com material e prioridade diferentes.',
    'Revisitar a cobrança antiga da CEBRASPE na AGU é justamente o que torna esse treino valioso: você se testa contra o estilo real da banca, entende como ela costuma explorar cada tema e usa isso para calibrar seu preparo. Ao final da leitura, você vai saber exatamente qual pilar merece reforço imediato, quais disciplinas concentram os pontos perdidos e quais assuntos precisa revisar.',
    'Guarde este diagnóstico. Ele é o ponto de partida e o comparativo que você vai usar para medir sua evolução até o próximo simulado.',
  ],
  pilares: [
    { nome: 'LEGISLAÇÃO', chave: 'lei_seca', totalTxt: '{acerto_pilar_lei_seca} de {total_pilar_lei_seca} questões', bandas: [
      { faixa: '0-49', texto: 'O seu desempenho em lei seca ficou abaixo de 50%, um resultado que pode ser considerado ruim. A CEBRASPE cobra texto literal de lei em muitas questões, sendo um dos principais fatores de reprovação entre nossos alunos. Você demonstrou dificuldade no ponto mais importante de uma prova objetiva, o que indica que o estudo precisa ir além do contato superficial com a legislação e chegar ao nível do detalhe que a banca exige.' },
      { faixa: '50-80', texto: 'O seu desempenho em lei seca foi intermediário. Ao que parece, você tem base, mas ainda está deixando pontos na mesa. A banca cobra o dispositivo exato, e questões que parecem simples se tornam armadilhas quando o candidato não domina o texto com precisão. O caminho agora é focar nos diplomas de maior incidência, com atenção aos detalhes que diferenciam uma alternativa da outra.' },
      { faixa: '81-100', texto: 'O seu desempenho em lei seca foi excelente! Esse pode ser o diferencial para sua aprovação. A grande maioria dos candidatos falha justamente em lei seca. Agora, você precisa manter esse resultado até a sua prova: mantenha-se firme no estudo da lei seca, foque em revisões periódicas e estude os novos conteúdos específicos da AGU.' },
    ] },
    { nome: 'JURISPRUDÊNCIA', chave: 'jurisprudencia', totalTxt: '{acerto_pilar_jurisprudencia} de {total_pilar_jurisprudencia} questões', bandas: [
      { faixa: '0-49', texto: 'O seu desempenho em jurisprudência ficou abaixo de 50%, e isso é muito ruim. A CEBRASPE não abre mão de cobrar informativos. É uma forte característica da banca. Atente-se urgentemente para a necessidade de reforçar o estudo de jurisprudência, pelo DOD, pelo JurisClub ou mesmo pelos informativos do STF e STJ.' },
      { faixa: '50-80', texto: 'O seu desempenho em jurisprudência foi médio, o que indica que há espaço relevante para crescimento. As questões de jurisprudência refletem um valor qualitativo e diferenciam os primeiros colocados. Vale muito a pena reforçar, pelo DoD ou pelo JurisClub do Revisão.' },
      { faixa: '81-100', texto: 'O seu desempenho em jurisprudência foi maravilhoso! Isso demonstra que você acompanha os informativos e aplica os entendimentos dos tribunais com segurança. Mantenha esse hábito, com atenção especial à jurisprudência mais recente, sem esquecer dos julgados com teses mais emblemáticas e consolidadas.' },
    ] },
    { nome: 'DOUTRINA', chave: 'doutrina', totalTxt: '{acerto_pilar_doutrina} de {total_pilar_doutrina} questões', bandas: [
      { faixa: '0-49', texto: 'O desempenho em doutrina ficou abaixo de 50%, o que merece atenção não apenas pelas questões eminentemente doutrinárias, mas porque a doutrina é a base que sustenta o raciocínio jurídico. Quem não domina classificações, distinções conceituais e princípios tende a errar também em questões de lei e jurisprudência. O investimento em doutrina tem retorno duplo.' },
      { faixa: '50-80', texto: 'O desempenho em doutrina foi intermediário. Você acerta nas questões mais diretas, mas perde quando a banca explora distinções mais finas ou classificações menos óbvias. Dominar doutrina ajuda a ganhar pontos também em questões de lei e jurisprudência com elemento conceitual de fundo.' },
      { faixa: '81-100', texto: 'O desempenho em doutrina foi excelente. Você demonstra domínio das classificações, distinções conceituais e fundamentos teóricos que a banca costuma explorar, e isso tende a se refletir positivamente também em questões de lei e jurisprudência com elemento conceitual de fundo. Mantenha a solidez.' },
    ] },
  ],
  disciplinasIntro: 'A análise a seguir tem foco nos seus pontos de erros. Para cada disciplina, você encontra o desempenho por categoria (lei seca, jurisprudência e doutrina) e uma leitura personalizada do que os erros revelam sobre as lacunas a priorizar.',
  disciplinas: [
    { nome: 'Legislação da AGU, Gestão de Conflitos e Governança', total: 'x/8', categoria: 'Assunto' },
    { nome: 'D. Internacional Público e Privado', total: 'x/4', categoria: 'Assunto' },
    { nome: 'D. Trabalho/Proc. Trab.', total: 'x/4', categoria: 'Assunto' },
    { nome: 'D. Constitucional', total: 'x/15', categoria: 'Assunto' },
    { nome: 'D. Eleitoral', total: 'x/5', categoria: 'Assunto' },
    { nome: 'D. Tributário', total: 'x/5', categoria: 'Assunto' },
    { nome: 'D. Financeiro e Econômico', total: 'x/4', categoria: 'Assunto' },
    { nome: 'D. Previdenciário', total: 'x/5', categoria: 'Assunto' },
    { nome: 'D. Administrativo', total: 'x/10', categoria: 'Assunto' },
    { nome: 'D. Ambiental', total: 'x/4', categoria: 'Assunto' },
    { nome: 'D. Processual Civil', total: 'x/17', categoria: 'Assunto' },
    { nome: 'D. Civil', total: 'x/10', categoria: 'Assunto' },
    { nome: 'D. Empresarial', total: 'x/3', categoria: 'Assunto' },
    { nome: 'D. Penal/Proc. Penal', total: 'x/6', categoria: 'Assunto' },
  ],
  sugestoes: [
    { titulo: 'LEI SECA', prioridade: 'Prioridade Alta', intro: 'A lei seca respondeu por 69 das 100 questões do recorte da AGU 2023. Os dispositivos de maior incidência, por disciplina, são:', itens: [
      { forte: true, texto: 'CF/1988 (transversal): 45 citações — controle de constitucionalidade, Poder Judiciário, Poder Legislativo, processo legislativo, bens públicos e ordem econômica e financeira.' },
      { forte: true, texto: 'Código de Processo Civil (Processual Civil / Legislação da AGU): 12 das 17 questões — tutela provisória, coisa julgada, IRDR, recursos, reclamação, ação rescisória, cumprimento de sentença e processo coletivo.' },
      { forte: true, texto: 'Código Civil (Civil, Administrativo, Processual Civil e Empresarial): contratos, obrigações, negócios jurídicos, bens, responsabilidade civil e desconsideração da personalidade jurídica.' },
      { forte: true, texto: 'Lei nº 9.868/1999 e EC nº 3/1993 (Constitucional): processo de ADI e ADC no controle de constitucionalidade.' },
      { forte: true, texto: 'Lei nº 14.133/2021 — Nova Lei de Licitações (Administrativo / Legislação da AGU / Trabalho).' },
      { forte: true, texto: 'Lei Complementar nº 73/1993 — Lei Orgânica da AGU: organização e prerrogativas da Advocacia-Geral da União.' },
      { forte: true, texto: 'Lei nº 9.307/1996 (Arbitragem) e Lei nº 13.140/2015 (Mediação): meios alternativos de resolução de conflitos.' },
      { forte: true, texto: 'Lei nº 13.303/2016 — Lei das Estatais (Administrativo / Financeiro).' },
      { forte: false, texto: 'Código Penal e CPP: omissão imprópria, efeitos da condenação, prisões e crimes contra a Administração Pública.' },
      { forte: false, texto: 'Lei nº 12.846/2013 — Lei Anticorrupção (Administrativo / Penal).' },
      { forte: false, texto: 'Código Tributário Nacional (Tributário / Empresarial): competência e administração tributária.' },
      { forte: false, texto: 'Lei nº 8.213/1991 e Decreto nº 3.048/1999 (Previdenciário): pensão por morte, segurado especial e carência.' },
      { forte: false, texto: 'Lei nº 9.504/1997 — Lei das Eleições (Eleitoral / Constitucional).' },
      { forte: false, texto: 'LC nº 101/2000 (LRF) e Lei nº 4.320/1964 (Financeiro e Econômico).' },
      { forte: false, texto: 'Lei nº 9.605/1998 e LC nº 140/2011 (Ambiental).' },
      { forte: false, texto: 'CLT (Trabalho e Processual do Trabalho): teletrabalho, recursos e competência.' },
      { forte: false, texto: 'Lei nº 11.101/2005 — Lei de Falências (Empresarial).' },
      { forte: false, texto: 'Decreto nº 3.413/2000 (Internacional Público e Privado): cooperação jurídica internacional.' },
    ] },
    { titulo: 'JURISPRUDÊNCIA', prioridade: 'Prioridade Alta', intro: 'A jurisprudência respondeu por 15 das 100 questões do recorte da AGU 2023 — decisiva em Processual Civil, Constitucional e Tributário. Os temas de maior recorrência são:', itens: [
      { forte: true, texto: 'Cumprimento de Sentença e Coisa Julgada (Processual Civil — STF/STJ): RE 1.205.530 (Tema 831), RE 889.173 (Tema 28), Súmula 345/STJ, REsp 1.636.124 (Tema 1076).' },
      { forte: true, texto: 'Tutela Provisória e Processo Coletivo (Processual Civil — STJ): REsp 1.797.365, REsp 1.938.645, REsp 1.243.887, REsp 1.956.312 (Tema 480).' },
      { forte: true, texto: 'Remédios Constitucionais (Constitucional — STF): Súmulas 268, 330, 606 e 624/STF.' },
      { forte: true, texto: 'Controle de Constitucionalidade e Direitos Fundamentais (Constitucional — STF): ADC 29.' },
      { forte: true, texto: 'Crimes contra a Administração Pública (Penal — STJ): REsp 2.204.503.' },
      { forte: false, texto: 'Repartição de Receitas e Administração Tributária (Tributário — STF): RE 705.423 (Tema 653), MS 22.934, MS 33.340, RE 1.055.941 (Tema 990).' },
      { forte: false, texto: 'Aposentadoria Especial (Previdenciário — STF): ARE 664.335 (Tema 555), RE 791.961 (Tema 709).' },
      { forte: false, texto: 'Terceirização na Administração Pública (Trabalho — STF/TST): RE 1.298.647 (Tema 1118), Súmula 331/TST.' },
      { forte: false, texto: 'Responsabilidade Ambiental (Ambiental — STJ): Súmula 652/STJ.' },
      { forte: false, texto: 'Sistema Interamericano de Direitos Humanos (Internacional — Corte IDH): Caso Vladimir Herzog vs. Brasil.' },
    ] },
    { titulo: 'DOUTRINA', prioridade: 'Prioridade Alta', intro: 'Doutrina respondeu por 16 das 100 questões do recorte da AGU 2023 — concentrada sobretudo em Direito Constitucional (5 das 15 questões da disciplina, 33%). Os temas mais relevantes são:', itens: [
      { forte: true, texto: 'Teoria Geral do Direito Constitucional: Poder Constituinte, Hermenêutica Constitucional, Constitucionalismo e controle de constitucionalidade.' },
      { forte: true, texto: 'Teoria Geral do Processo e Desconsideração da Personalidade Jurídica (Processual Civil).' },
      { forte: true, texto: 'Aspectos Introdutórios, Responsabilidade Civil e Direitos Reais (Civil).' },
      { forte: true, texto: 'Limitações ao Poder de Tributar e Competência Tributária (Tributário).' },
      { forte: false, texto: 'Processo Administrativo Federal (Administrativo).' },
      { forte: false, texto: 'Crimes contra a Administração Pública (Penal e Processual Penal).' },
      { forte: false, texto: 'Princípios Gerais de Direito Financeiro (Financeiro e Econômico).' },
      { forte: false, texto: 'Responsabilidade Internacional do Estado (Internacional Público e Privado).' },
    ] },
  ],
  gabaritoTitulo: 'GABARITO OFICIAL DESATUALIZADO',
  gabaritoIntro: [
    'Importante: este simulado reproduz integralmente a prova da AGU aplicada em 2023. Por esse motivo, algumas questões — especialmente as que envolvem legislação e jurisprudência — podem estar desatualizadas em razão de alterações legislativas e da evolução do entendimento dos tribunais.',
    'Para preservar a fidelidade da prova original e, ao mesmo tempo, garantir um estudo alinhado ao cenário atual, apresentamos abaixo as questões que sofreram atualização:',
  ],
  gabaritoObs: [
    'Questão 39 - alteração da redação da LRF',
    'Questão 42 - lei antiga de licitações (permanece relevante)',
    'Questão 63 - mudança da jurisprudência sobre estabilização da tutela antecipada (permanece relevante)',
  ],
}

/** Preset pronto: Diagnóstico de Desempenho — PGE/RS (banca FUNDATEC; inclui seção de Língua Portuguesa). */
export const DIAG_PGE_RS: DiagConteudo = {
  tituloCabecalho: 'Diagnóstico de Desempenho',
  subtitulo: 'PGE/RS - PROCURADOR DO ESTADO',
  notaTotal: '{total_questoes}',
  notaTexto: '{acertos} acertos de {total_questoes} questões — {percentual} de aproveitamento',
  intro: [
    'Este é o seu simulado com base na prova para Procurador do Estado da PGE/RS, no padrão da banca FUNDATEC. Ele não foi pensado para medir se você "está pronto(a)", mas para colocar você diante da forma como a banca cobra e mostrar, com precisão, onde direcionar as próximas semanas de estudo.',
    'O número de acertos é a parte menos importante deste relatório. O que importa de verdade está no que vem a seguir: o desempenho por pilar (lei seca, jurisprudência e doutrina) e por disciplina, que revela exatamente que tipo de erro você está cometendo e pode direcionar completamente o que você precisa fazer daqui para frente. Errar por não ter visto o assunto é diferente de errar por não dominar o texto de lei, que é diferente de errar por não acompanhar jurisprudência. Cada uma dessas lacunas se resolve de um jeito, com material e prioridade diferentes.',
    'Ao final da leitura, você vai saber exatamente qual pilar merece reforço imediato, quais disciplinas concentram os pontos perdidos e quais assuntos, dentro de cada uma, precisa voltar para a sua revisão nas próximas semanas. Esse é o objetivo real do nosso simulado: transformar um placar em rota de estudo.',
    'Guarde este diagnóstico. Ele é o ponto de partida e o comparativo que você vai usar para medir sua evolução até o próximo simulado.',
  ],
  linguaPortuguesa: {
    chave: 'lingua_portuguesa', tipoFonte: 'pilar',
    secTitulo: 'Desempenho em Língua Portuguesa',
    secIntro: 'Este simulado inclui 20 questões de língua portuguesa, no mesmo padrão da prova real da FUNDATEC. É uma seção separada porque português tem lógica própria: não se estuda pela mesma lente de "lei seca x jurisprudência x doutrina" usada nas matérias jurídicas, mas por frentes de gramática, sintaxe e interpretação.',
    titulo: 'LÍNGUA PORTUGUESA',
    totalTxt: '{acerto_pilar_lingua_portuguesa} de {total_pilar_lingua_portuguesa} questões',
    bandas: [
      { faixa: '0-49', texto: 'Seu desempenho em Língua Portuguesa ficou abaixo do esperado, e isso merece atenção. No último concurso da PGE/RS, Português representou 20% de toda a prova, sendo a disciplina com maior peso, inclusive acima de Direito Constitucional. Como a FUNDATEC costuma combinar regras gramaticais e interpretação de texto em uma mesma questão, a melhor estratégia é fortalecer essas duas frentes simultaneamente. Retome a leitura ativa de crônicas e artigos de opinião e, paralelamente, revise temas como regência, crase, pontuação e funções sintáticas. Essa combinação fortalece tanto as questões objetivas quanto aquelas de reescrita e interpretação.' },
      { faixa: '50-80', texto: 'Seu desempenho em Língua Portuguesa foi intermediário. Como português é a disciplina de maior peso na prova da FUNDATEC (cerca de 20%), vale muito reforçar: mantenha a leitura ativa de crônicas e artigos de opinião e revise regência, crase, pontuação e funções sintáticas — a banca costuma combinar gramática e interpretação numa mesma questão.' },
      { faixa: '81-100', texto: 'Excelente desempenho em Língua Portuguesa! Sendo a disciplina de maior peso da prova, esse resultado é um diferencial forte. Mantenha a leitura ativa e revisões periódicas de gramática e interpretação para não perder o ritmo até a prova.' },
    ],
  },
  pilares: [
    { nome: 'LEI SECA', chave: 'lei_seca', totalTxt: '{acerto_pilar_lei_seca} de {total_pilar_lei_seca} questões', bandas: [
      { faixa: '0-49', texto: 'O seu desempenho em lei seca ficou abaixo de 50%, um resultado que pode ser considerado ruim. A CEBRASPE cobra texto literal de lei em muitas questões, sendo um dos principais fatores de reprovação entre nossos alunos.' },
      { faixa: '50-80', texto: 'O seu desempenho em lei seca foi intermediário: você tem base, mas ainda deixa pontos na mesa. A banca cobra o dispositivo exato e questões que parecem simples viram armadilhas sem o domínio preciso do texto. Foque nos diplomas de maior incidência.' },
      { faixa: '81-100', texto: 'O seu desempenho em lei seca foi excelente — esse costuma ser o diferencial da aprovação. Mantenha o resultado com revisões periódicas e atenção às leis específicas da PGE/RS e do Estado.' },
    ] },
    { nome: 'JURISPRUDÊNCIA', chave: 'jurisprudencia', totalTxt: '{acerto_pilar_jurisprudencia} de {total_pilar_jurisprudencia} questões', bandas: [
      { faixa: '0-49', texto: 'O seu desempenho em jurisprudência ficou abaixo de 50%, e isso é muito ruim. A CEBRASPE não abre mão de cobrar informativos. Reforce o estudo pelo DOD, JurisClub ou informativos do STF e STJ.' },
      { faixa: '50-80', texto: 'O seu desempenho em jurisprudência foi médio — há espaço relevante para crescer. Questões de jurisprudência diferenciam os primeiros colocados. Vale reforçar com informativos e as principais teses dos tribunais superiores.' },
      { faixa: '81-100', texto: 'O seu desempenho em jurisprudência foi ótimo! Você acompanha os informativos e aplica os entendimentos com segurança. Mantenha o hábito, com atenção especial à jurisprudência mais recente.' },
    ] },
    { nome: 'DOUTRINA', chave: 'doutrina', totalTxt: '{acerto_pilar_doutrina} de {total_pilar_doutrina} questões', bandas: [
      { faixa: '0-49', texto: 'O desempenho em doutrina ficou abaixo de 50%. Doutrina é a base do raciocínio jurídico — quem não domina classificações, distinções e princípios erra também em lei e jurisprudência. O investimento tem retorno duplo.' },
      { faixa: '50-80', texto: 'O desempenho em doutrina foi intermediário. Você acerta nas questões diretas, mas perde nas distinções mais finas. Dominar doutrina ajuda a ganhar pontos também em questões de lei e jurisprudência com fundo conceitual.' },
      { faixa: '81-100', texto: 'O desempenho em doutrina foi excelente. Você domina classificações, distinções conceituais e fundamentos teóricos — o que se reflete também em questões de lei e jurisprudência. Mantenha a solidez.' },
    ] },
  ],
  disciplinasIntro: 'A análise a seguir tem foco nos seus pontos de erros. Para cada disciplina, você encontra o desempenho por categoria (lei seca, jurisprudência e doutrina) e uma leitura personalizada do que os erros revelam sobre as lacunas a priorizar.',
  disciplinas: [
    { nome: 'D. Administrativo', total: 'x/N', categoria: 'Assunto' },
    { nome: 'D. Constitucional', total: 'x/N', categoria: 'Assunto' },
    { nome: 'D. Tributário', total: 'x/N', categoria: 'Assunto' },
    { nome: 'D. Financeiro e Econômico', total: 'x/N', categoria: 'Assunto' },
    { nome: 'D. Civil', total: 'x/N', categoria: 'Assunto' },
    { nome: 'D. Processual Civil', total: 'x/N', categoria: 'Assunto' },
    { nome: 'D. Ambiental', total: 'x/N', categoria: 'Assunto' },
    { nome: 'D. Empresarial', total: 'x/N', categoria: 'Assunto' },
    { nome: 'D. do Trabalho/Proc. Trab.', total: 'x/N', categoria: 'Assunto' },
    { nome: 'D. Penal/Proc. Penal', total: 'x/N', categoria: 'Assunto' },
  ],
  sugestoes: [
    { titulo: 'LEI SECA', prioridade: 'Prioridade Alta', intro: 'Priorize a legislação de maior incidência na prova. Os dispositivos a reforçar, por disciplina, são:', itens: [
      { forte: true, texto: 'CF/1988 e Constituição do Estado do RS (transversal): organização do Estado, competências, controle de constitucionalidade e ordem econômica.' },
      { forte: true, texto: 'Lei nº 14.133/2021 — Nova Lei de Licitações e Contratos (Administrativo).' },
      { forte: false, texto: 'Código Tributário Nacional e legislação tributária estadual do RS (Tributário).' },
      { forte: false, texto: 'LC nº 101/2000 (LRF) e Lei nº 4.320/1964 (Financeiro).' },
      { forte: false, texto: 'Código Civil e Código de Processo Civil (Civil / Processual Civil).' },
    ] },
    { titulo: 'JURISPRUDÊNCIA', prioridade: 'Prioridade Alta', intro: 'Reforce os entendimentos consolidados dos tribunais superiores nos temas de maior recorrência:', itens: [
      { forte: true, texto: 'Fazenda Pública em juízo, execução contra a Fazenda e precatórios (Processual Civil — STF/STJ).' },
      { forte: false, texto: 'Repartição de receitas e administração tributária (Tributário — STF).' },
      { forte: false, texto: 'Responsabilidade civil do Estado e improbidade administrativa (Administrativo — STF/STJ).' },
    ] },
    { titulo: 'DOUTRINA', prioridade: 'Prioridade Alta', intro: 'Consolide os fundamentos teóricos mais cobrados:', itens: [
      { forte: true, texto: 'Teoria Geral do Direito Constitucional e controle de constitucionalidade.' },
      { forte: false, texto: 'Teoria geral do processo e Fazenda Pública em juízo (Processual Civil).' },
      { forte: false, texto: 'Limitações ao poder de tributar e competência tributária (Tributário).' },
    ] },
  ],
  fechamento: [
    'Você já tem em mãos um mapa claro do que priorizar até o próximo simulado. Comece pelos pilares que mais precisam de atenção, focando primeiro nas disciplinas com maior peso na prova e nos assuntos destacados neste diagnóstico.',
    'Esse é o verdadeiro valor desta análise: mais do que mostrar uma nota, ela indica onde vale a pena investir seu tempo de estudo para obter o maior retorno até a próxima etapa do nosso Pré-Edital.',
    'Este é apenas o seu ponto de partida. No próximo simulado, você poderá comparar este diagnóstico com o novo resultado e enxergar sua evolução de forma concreta. Afinal, o que realmente importa não é apenas a nota de um único simulado, mas o progresso consistente que você constrói ao longo da preparação.',
  ],
  gabaritoTitulo: 'GABARITO OFICIAL DESATUALIZADO',
  gabaritoIntro: [
    'Importante: caso este simulado reproduza uma prova aplicada, algumas questões — especialmente as de legislação e jurisprudência — podem estar desatualizadas por alterações legislativas e evolução do entendimento dos tribunais.',
    'Abaixo, as questões que sofreram atualização (edite conforme o recorte da PGE/RS):',
  ],
  gabaritoObs: [],
}

/** Preset BASE reutilizável: estrutura completa com 4 disciplinas e textos genéricos (sem citar banca/concurso).
 * Serve de ponto de partida para qualquer simulado — edite textos, pilares e disciplinas conforme necessário. */
export const DIAG_BASE_4: DiagConteudo = {
  tituloCabecalho: 'Diagnóstico de Desempenho',
  subtitulo: 'Adicionar Subtítulo',
  notaTotal: '{total_questoes}',
  notaTexto: '{acertos} acertos de {total_questoes} questões — {percentual} de aproveitamento',
  intro: [
    'Este é o seu diagnóstico de desempenho. Ele não foi pensado para medir se você "está pronto(a)", mas para mostrar, com precisão, onde direcionar as próximas semanas de estudo.',
    'O número de acertos é a parte menos importante deste relatório. O que importa está no que vem a seguir: o desempenho por pilar (lei seca, jurisprudência e doutrina) e por disciplina, que revela que tipo de erro você está cometendo. Errar por não ter visto o assunto é diferente de errar por não dominar o texto de lei, que é diferente de errar por não acompanhar jurisprudência — cada lacuna se resolve de um jeito.',
    'Ao final da leitura, você vai saber qual pilar merece reforço imediato, quais disciplinas concentram os pontos perdidos e quais assuntos precisa revisar. Esse é o objetivo: transformar um placar em rota de estudo.',
    'Guarde este diagnóstico. Ele é o ponto de partida e o comparativo que você vai usar para medir sua evolução até o próximo simulado.',
  ],
  linguaPortuguesa: {
    chave: 'secao_separada', tipoFonte: 'pilar',
    secTitulo: 'Desempenho em Seção Separada',
    secIntro: 'Use esta seção para uma frente que tem lógica própria e não se encaixa na lente de "lei seca x jurisprudência x doutrina" (ex.: Língua Portuguesa, Raciocínio Lógico, uma disciplina específica). Ajuste o título, o texto e a fonte de dados conforme o simulado — ou remova o bloco se não precisar.',
    titulo: 'SEÇÃO SEPARADA',
    totalTxt: '{acerto_pilar_secao_separada} de {total_pilar_secao_separada} questões',
    bandas: [
      { faixa: '0-49', texto: 'Seu desempenho nesta frente ficou abaixo do esperado e merece atenção. Retome os fundamentos e pratique com questões no mesmo padrão da prova para consolidar a base.' },
      { faixa: '50-80', texto: 'Seu desempenho nesta frente foi intermediário: há base, mas ainda há espaço relevante para crescer. Reforce os pontos de maior incidência e mantenha a prática constante.' },
      { faixa: '81-100', texto: 'Excelente desempenho nesta frente! Mantenha o ritmo com revisões periódicas para não perder o rendimento até a prova.' },
    ],
  },
  pilares: [
    { nome: 'LEI SECA', chave: 'lei_seca', totalTxt: '{acerto_pilar_lei_seca} de {total_pilar_lei_seca} questões', bandas: [
      { faixa: '0-49', texto: 'Seu desempenho em lei seca ficou abaixo de 50%, um resultado que merece atenção. A cobrança do texto literal da lei costuma ser um dos principais fatores de reprovação. O estudo precisa ir além do contato superficial e chegar ao nível do detalhe.' },
      { faixa: '50-80', texto: 'Seu desempenho em lei seca foi intermediário: você tem base, mas ainda deixa pontos na mesa. Questões que parecem simples viram armadilhas sem o domínio preciso do dispositivo. Foque nos diplomas de maior incidência.' },
      { faixa: '81-100', texto: 'Seu desempenho em lei seca foi excelente — esse costuma ser o diferencial da aprovação. Mantenha o resultado com revisões periódicas e atenção às leis específicas do seu concurso.' },
    ] },
    { nome: 'JURISPRUDÊNCIA', chave: 'jurisprudencia', totalTxt: '{acerto_pilar_jurisprudencia} de {total_pilar_jurisprudencia} questões', bandas: [
      { faixa: '0-49', texto: 'Seu desempenho em jurisprudência ficou abaixo de 50%. Reforce urgentemente o estudo de informativos e das principais teses dos tribunais superiores (STF e STJ).' },
      { faixa: '50-80', texto: 'Seu desempenho em jurisprudência foi médio — há espaço relevante para crescer. As questões de jurisprudência costumam diferenciar os primeiros colocados. Vale reforçar com informativos recentes.' },
      { faixa: '81-100', texto: 'Seu desempenho em jurisprudência foi ótimo! Você acompanha os informativos e aplica os entendimentos com segurança. Mantenha o hábito, com atenção à jurisprudência mais recente.' },
    ] },
    { nome: 'DOUTRINA', chave: 'doutrina', totalTxt: '{acerto_pilar_doutrina} de {total_pilar_doutrina} questões', bandas: [
      { faixa: '0-49', texto: 'Seu desempenho em doutrina ficou abaixo de 50%. Doutrina é a base do raciocínio jurídico — quem não domina classificações, distinções e princípios erra também em lei e jurisprudência. O investimento tem retorno duplo.' },
      { faixa: '50-80', texto: 'Seu desempenho em doutrina foi intermediário. Você acerta nas questões diretas, mas perde nas distinções mais finas. Dominar doutrina ajuda a ganhar pontos também em lei e jurisprudência com fundo conceitual.' },
      { faixa: '81-100', texto: 'Seu desempenho em doutrina foi excelente. Você domina classificações, distinções conceituais e fundamentos teóricos — o que se reflete também nas demais frentes. Mantenha a solidez.' },
    ] },
  ],
  disciplinasIntro: 'A análise a seguir tem foco nos seus pontos de erros. Para cada disciplina, você encontra o desempenho por categoria (lei seca, jurisprudência e doutrina) e uma leitura personalizada do que os erros revelam sobre as lacunas a priorizar.',
  disciplinas: [
    { nome: 'Disciplina 1', total: 'x/N', categoria: 'Assunto' },
    { nome: 'Disciplina 2', total: 'x/N', categoria: 'Assunto' },
    { nome: 'Disciplina 3', total: 'x/N', categoria: 'Assunto' },
    { nome: 'Disciplina 4', total: 'x/N', categoria: 'Assunto' },
  ],
  sugestoes: [
    { titulo: 'LEI SECA', prioridade: 'Prioridade Alta', intro: 'Priorize a legislação de maior incidência na prova. Liste aqui os dispositivos a reforçar, por disciplina:', itens: [
      { forte: true, texto: 'Adicione aqui os principais diplomas/artigos cobrados (use > para item normal e >> para item de destaque).' },
    ] },
    { titulo: 'JURISPRUDÊNCIA', prioridade: 'Prioridade Alta', intro: 'Reforce os entendimentos consolidados dos tribunais superiores nos temas de maior recorrência:', itens: [
      { forte: true, texto: 'Adicione aqui os temas/julgados de maior incidência.' },
    ] },
    { titulo: 'DOUTRINA', prioridade: 'Prioridade Alta', intro: 'Consolide os fundamentos teóricos mais cobrados:', itens: [
      { forte: true, texto: 'Adicione aqui os temas doutrinários de maior recorrência.' },
    ] },
  ],
  fechamento: [
    'Você já tem em mãos um mapa claro do que priorizar até o próximo simulado. Comece pelos pilares que mais precisam de atenção, focando primeiro nas disciplinas com maior peso na prova e nos assuntos destacados neste diagnóstico.',
    'Esse é o verdadeiro valor desta análise: mais do que mostrar uma nota, ela indica onde vale a pena investir seu tempo de estudo para obter o maior retorno até a próxima etapa.',
    'Este é apenas o seu ponto de partida. No próximo simulado, você poderá comparar este diagnóstico com o novo resultado e enxergar sua evolução de forma concreta. Afinal, o que realmente importa não é apenas a nota de um único simulado, mas o progresso consistente que você constrói ao longo da preparação.',
  ],
  // Base limpa: sem card de gabarito desatualizado por padrão (título fica pronto p/ quem quiser adicionar).
  gabaritoTitulo: 'GABARITO OFICIAL DESATUALIZADO',
  gabaritoIntro: [],
  gabaritoObs: [],
}
