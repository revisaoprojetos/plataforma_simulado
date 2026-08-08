// Conteúdo estruturado da modalidade "Diagnóstico" (rico) — base do modelo pronto e alvo da
// importação (Word/HTML). Um item de diagnóstico guarda este objeto em `item.conteudo`.

export type DiagBanda = { faixa: string; texto: string }
/** `chave` = slug do pilar (lei_seca/jurisprudencia/doutrina/lingua_portuguesa) → casa com {pct_pilar_<chave>} etc. */
export type DiagPilar = { nome: string; chave?: string; totalTxt: string; bandas: DiagBanda[] }
/** `chave` = slug da disciplina → casa com {pct_<chave>}/{acerto_<chave>}/{total_<chave>}/{assuntos_<chave>}. */
export type DiagDisciplina = { nome: string; chave?: string; total: string; categoria: string }

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
export type DiagSugestao = { titulo: string; prioridade: string; intro: string; itens: DiagItemSugestao[] }

export type DiagConteudo = {
  subtitulo: string
  notaTotal: string
  notaTexto: string
  intro: string[]
  /** Títulos das seções (editáveis). Opcionais — usam o texto padrão quando ausentes. */
  tituloPilares?: string
  tituloDisciplinas?: string
  tituloSugestoes?: string
  pilares: DiagPilar[]
  disciplinasIntro: string
  disciplinas: DiagDisciplina[]
  /** Overrides por disciplina do BANCO (chave → nome editado) e disciplinas ocultadas (chaves). */
  discNomes?: Record<string, string>
  discOcultas?: string[]
  /** Blocos estruturais ocultados (nota/nome/pilares/disciplinas/sugestoes/gabarito). */
  partesOcultas?: string[]
  /** Cor do TEXTO (nome) por card de disciplina (chave → hex). */
  discCorTexto?: Record<string, string>
  /** Fonte dos dados por card (chave do card → chave da disciplina cujos assuntos/estatísticas exibir). */
  discFonte?: Record<string, string>
  sugestoes: DiagSugestao[]
  gabaritoTitulo: string
  gabaritoIntro: string[]
  gabaritoObs: string[]
}

/** Diagnóstico genérico (default quando um item de diagnóstico não tem conteúdo salvo). */
export const DIAG_PADRAO: DiagConteudo = {
  subtitulo: 'Nome do simulado / recorte',
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

/** Preset pronto: Diagnóstico de Desempenho — AGU 2023 (base montada a partir do documento enviado). */
export const DIAG_AGU_2023: DiagConteudo = {
  subtitulo: 'CONCURSOS ANTIGOS - AGU 2023 - ADVOGADO DA UNIÃO',
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
