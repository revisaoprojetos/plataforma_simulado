/* Dados do Desafio de Jurisprudência: configuração, matérias e banco de teses. */
(() => {
'use strict';
/* =========================================================
   CONFIGURAÇÃO — tudo o que a plataforma pode ajustar
   ========================================================= */
const CONFIG = {
  liberacao: 'progresso',        // 'progresso' (conclui um dia, libera o próximo) ou 'calendario'
  inicioCalendario: '2026-10-01',// usado quando liberacao = 'calendario'
  vidas: 3,
  tempoResposta: 25,             // segundos por pergunta
  pontos: { ponto:10, vadeMecum:50, armadilha:200, tese:100, vida:200, labirintoLimpo:500 },
  storageKey: 'jurisclub-desafio-v1'
};

const MATERIAS = [
  {id:'adm', nome:'Administrativo', curto:'ADM', icon:'building', dias:[1,2]},
  {id:'civ', nome:'Civil e Empresarial', curto:'CIVIL', icon:'briefcase', dias:[3,4]},
  {id:'con', nome:'Constitucional', curto:'CONST', icon:'doc', dias:[5,6]},
  {id:'pre', nome:'Previdenciário', curto:'PREV', icon:'umbrella', dias:[7,8]},
  {id:'pc',  nome:'Processo Civil', curto:'PROC CIVIL', icon:'folder', dias:[9,10]},
  {id:'tra', nome:'Trabalho e Processo do Trabalho', curto:'TRAB', icon:'hardhat', dias:[11,12]},
  {id:'tri', nome:'Tributário e Financeiro', curto:'TRIB', icon:'dollar', dias:[13,14]},
];
const FINAL = {id:'rg', nome:'Selo final JurisClub', curto:'RG', icon:'rg', dias:[15]};

/* Banco de teses: q = enunciado, o = alternativas, a = índice da correta, tese = texto para revisão */
const T = (ref, tema, q, o, a, tese) => ({ref, tema, q, o, a, tese});
const DIAS = {
 1:{titulo:'Administrativo 2026', teses:[
  T('Súmula Vinculante 13 · STF','Nepotismo',
    'A autoridade nomeia o próprio cônjuge para cargo em comissão na mesma pessoa jurídica. Segundo a SV 13:',
    ['É válido se o nomeado tiver formação compatível com o cargo.','Viola a Constituição: é nepotismo, inclusive quando feito por designações recíprocas.','Só é vedado no Poder Executivo federal.'],1,
    'A nomeação de cônjuge, companheiro ou parente em linha reta, colateral ou por afinidade, até o terceiro grau, da autoridade nomeante ou de servidor investido em cargo de direção, chefia ou assessoramento, para cargo em comissão ou de confiança, viola a Constituição Federal, compreendido o ajuste mediante designações recíprocas.'),
  T('Súmula 473 · STF','Autotutela',
    'A Administração identifica um ato ilegal que ela mesma praticou. Conforme a Súmula 473 do STF, ela:',
    ['Pode anulá-lo, porque atos ilegais não geram direitos, ou revogá-lo por conveniência e oportunidade, respeitados os direitos adquiridos.','Precisa de ordem judicial para anular o ato.','Só pode revogá-lo, nunca anulá-lo.'],0,
    'A Administração pode anular seus próprios atos quando eivados de vícios que os tornam ilegais, porque deles não se originam direitos; ou revogá-los, por motivo de conveniência ou oportunidade, respeitados os direitos adquiridos e ressalvada, em todos os casos, a apreciação judicial.'),
  T('Tema 940 · STF','Dupla garantia',
    'Vítima de dano causado por servidor no exercício da função quer pedir indenização. Pelo Tema 940 do STF:',
    ['Pode escolher entre processar o servidor ou o Estado.','Deve processar servidor e Estado em litisconsórcio necessário.','Deve processar o Estado ou a prestadora de serviço público; o agente responde apenas em regresso.'],2,
    'A ação por danos causados por agente público deve ser ajuizada contra o Estado ou a pessoa jurídica de direito privado prestadora de serviço público, sendo parte ilegítima o autor do ato, assegurado o direito de regresso nos casos de dolo ou culpa (art. 37, § 6º, da CF).'),
  T('Súmula Vinculante 3 · STF','Contraditório no TCU',
    'Nos processos perante o TCU que possam anular ato que beneficie o interessado, a SV 3 garante contraditório e ampla defesa. Qual é a exceção?',
    ['A apreciação da legalidade do ato de concessão inicial de aposentadoria, reforma e pensão.','Qualquer ato de pessoal.','Atos praticados há menos de cinco anos.'],0,
    'Nos processos perante o TCU asseguram-se o contraditório e a ampla defesa quando da decisão puder resultar anulação ou revogação de ato administrativo que beneficie o interessado, excetuada a apreciação da legalidade do ato de concessão inicial de aposentadoria, reforma e pensão.')
 ]},
 2:{titulo:'Administrativo · RG e Repetitivos', teses:[
  T('Tema 246 · STF (RE 760.931)','Terceirização e Poder Público',
    'A empresa terceirizada deixa de pagar verbas trabalhistas. Pelo Tema 246 do STF, a Administração contratante:',
    ['Responde automaticamente, de forma solidária.','Não tem transferida automaticamente a responsabilidade pelo pagamento, seja solidária ou subsidiária.','Responde subsidiariamente sempre que o serviço for contínuo.'],1,
    'O inadimplemento dos encargos trabalhistas dos empregados do contratado não transfere automaticamente ao Poder Público contratante a responsabilidade pelo seu pagamento, seja em caráter solidário ou subsidiário.'),
  T('Tema 897 · STF','Ressarcimento e improbidade dolosa',
    'Ação de ressarcimento ao erário fundada em ato doloso de improbidade administrativa. Pelo Tema 897 do STF, ela:',
    ['Prescreve em 5 anos.','É imprescritível.','Prescreve em 8 anos, após a Lei 14.230/2021.'],1,
    'São imprescritíveis as ações de ressarcimento ao erário fundadas na prática de ato doloso tipificado na Lei de Improbidade Administrativa.'),
  T('Tema 1199 · STF (ARE 843.989)','Lei 14.230/2021 no tempo',
    'Sobre a revogação da modalidade culposa de improbidade pela Lei 14.230/2021, o STF decidiu no Tema 1199 que a norma:',
    ['Retroage inclusive sobre condenações transitadas em julgado.','Não se aplica a nenhum processo anterior à lei.','Não atinge a coisa julgada, mas se aplica aos atos culposos ainda sem condenação transitada em julgado.'],2,
    'É necessária a comprovação de dolo para tipificar ato de improbidade. A revogação da modalidade culposa não retroage sobre a coisa julgada, mas se aplica aos atos culposos praticados na vigência do texto anterior sem condenação transitada em julgado, cabendo ao juízo analisar eventual dolo. O novo regime prescricional é irretroativo.'),
  T('Tema 899 · STF','Decisão de Tribunal de Contas',
    'A pretensão de ressarcimento ao erário fundada em decisão de Tribunal de Contas (Tema 899 do STF):',
    ['É prescritível.','É imprescritível, como toda pretensão de ressarcimento.','Só prescreve se não houver dolo.'],0,
    'É prescritível a pretensão de ressarcimento ao erário fundada em decisão de Tribunal de Contas.')
 ]},
 3:{titulo:'Civil e Empresarial 2026', teses:[
  T('Súmula 54 · STJ','Juros na responsabilidade extracontratual',
    'Na responsabilidade extracontratual, os juros moratórios fluem:',
    ['Da citação.','Do evento danoso.','Do arbitramento da indenização.'],1,
    'Os juros moratórios fluem a partir do evento danoso, em caso de responsabilidade extracontratual.'),
  T('Súmula 385 · STJ','Inscrição preexistente',
    'Quem já tem inscrição legítima e preexistente em cadastro de inadimplentes sofre uma nova anotação irregular. Pela Súmula 385:',
    ['Não cabe indenização por dano moral, ressalvado o direito ao cancelamento.','Cabe dano moral em dobro.','O dano moral é sempre presumido.'],0,
    'Da anotação irregular em cadastro de proteção ao crédito não cabe indenização por dano moral quando preexistente legítima inscrição, ressalvado o direito ao cancelamento.'),
  T('Súmula 479 · STJ','Fortuito interno bancário',
    'Um terceiro abre conta bancária com documentos falsos em nome da vítima. A instituição financeira:',
    ['Responde apenas se provada sua culpa.','Fica isenta, por fato exclusivo de terceiro.','Responde objetivamente, porque se trata de fortuito interno.'],2,
    'As instituições financeiras respondem objetivamente pelos danos gerados por fortuito interno relativo a fraudes e delitos praticados por terceiros no âmbito de operações bancárias.'),
  T('Súmula 549 · STJ','Bem de família do fiador',
    'O bem de família pertencente a fiador de contrato de locação:',
    ['É impenhorável, como qualquer bem de família.','É penhorável.','Só é penhorável se o fiador tiver outro imóvel.'],1,
    'É válida a penhora de bem de família pertencente a fiador de contrato de locação.')
 ]},
 4:{titulo:'Civil e Empresarial · RG e Repetitivos', teses:[
  T('Tema 786 · STF','Direito ao esquecimento',
    'O “direito ao esquecimento”, como poder de impedir, pela passagem do tempo, a divulgação de fatos verídicos e licitamente obtidos:',
    ['É incompatível com a Constituição.','É direito fundamental implícito.','Vale para fatos ocorridos há mais de 10 anos.'],0,
    'É incompatível com a Constituição a ideia de um direito ao esquecimento, assim entendido como o poder de obstar, em razão da passagem do tempo, a divulgação de fatos ou dados verídicos e licitamente obtidos e publicados. Eventuais excessos devem ser analisados caso a caso.'),
  T('Tema 809 · STF','Sucessão do companheiro',
    'A diferença de regime sucessório entre cônjuge e companheiro (art. 1.790 do CC):',
    ['É válida, porque união estável difere de casamento.','É inconstitucional; aplica-se ao companheiro o regime do art. 1.829 do CC.','Só se aplica à união estável homoafetiva.'],1,
    'É inconstitucional a distinção de regimes sucessórios entre cônjuges e companheiros, devendo ser aplicado, em ambos os casos, o regime estabelecido no art. 1.829 do Código Civil.'),
  T('Tema 1127 · STF','Fiador de locação comercial',
    'Penhora do bem de família de fiador em contrato de locação comercial (Tema 1127 do STF):',
    ['É vedada, porque a locação não é residencial.','Só é possível se o locatário for empresário individual.','É constitucional, seja a locação residencial ou comercial.'],2,
    'É constitucional a penhora de bem de família pertencente a fiador de contrato de locação, seja residencial, seja comercial.')
 ]},
 5:{titulo:'Constitucional 2026', teses:[
  T('Súmula Vinculante 11 · STF','Uso de algemas',
    'Segundo a SV 11, o uso de algemas:',
    ['É livre, a critério da autoridade policial.','Só é lícito em caso de resistência, fundado receio de fuga ou perigo, com justificativa escrita.','É proibido em qualquer hipótese.'],1,
    'Só é lícito o uso de algemas em casos de resistência e de fundado receio de fuga ou de perigo à integridade física própria ou alheia, por parte do preso ou de terceiros, justificada a excepcionalidade por escrito, sob pena de responsabilidade.'),
  T('Súmula Vinculante 25 · STF','Depositário infiel',
    'A prisão civil de depositário infiel:',
    ['É ilícita, qualquer que seja a modalidade do depósito.','É lícita apenas no depósito judicial.','É lícita no depósito convencional.'],0,
    'É ilícita a prisão civil de depositário infiel, qualquer que seja a modalidade do depósito.'),
  T('Súmula Vinculante 14 · STF','Acesso do defensor',
    'Sobre o acesso do defensor aos autos de investigação, a SV 14 garante:',
    ['Acesso apenas com autorização do delegado.','Nenhum acesso enquanto durar o inquérito.','Acesso amplo aos elementos de prova já documentados, no interesse do representado.'],2,
    'É direito do defensor, no interesse do representado, ter acesso amplo aos elementos de prova que, já documentados em procedimento investigatório realizado por órgão com competência de polícia judiciária, digam respeito ao exercício do direito de defesa.'),
  T('ADI 4277 e ADPF 132 · STF','União homoafetiva',
    'No julgamento da ADI 4277 e da ADPF 132 (2011), o STF:',
    ['Reconheceu a união estável entre pessoas do mesmo sexo como entidade familiar.','Restringiu a união estável a pessoas de sexos diferentes.','Deixou o tema exclusivamente para o Congresso.'],0,
    'O STF deu interpretação conforme ao art. 1.723 do Código Civil para reconhecer a união contínua, pública e duradoura entre pessoas do mesmo sexo como entidade familiar, com as mesmas regras e consequências da união estável.')
 ]},
 6:{titulo:'Constitucional · RG e Repetitivos', teses:[
  T('Tema 793 · STF','Solidariedade na saúde',
    'Em demandas de tratamento de saúde (Tema 793 do STF), os entes federados:',
    ['Não respondem; a responsabilidade é só da União.','Respondem solidariamente, cabendo ao juiz direcionar o cumprimento conforme a repartição de competências.','Respondem só no nível municipal.'],1,
    'Os entes da federação, em decorrência da competência comum, são solidariamente responsáveis nas demandas prestacionais na área da saúde, competindo à autoridade judicial direcionar o cumprimento conforme as regras de repartição de competências e determinar o ressarcimento a quem suportou o ônus financeiro.'),
  T('Tema 698 · STF','Políticas públicas',
    'Sobre a intervenção do Judiciário em políticas públicas (Tema 698 do STF):',
    ['É legítima diante de ausência ou deficiência grave do serviço; a decisão aponta as finalidades e a Administração apresenta um plano.','É vedada pela separação de Poderes.','Permite ao juiz escolher livremente os meios no lugar do administrador.'],0,
    'A intervenção do Judiciário em políticas públicas voltadas a direitos fundamentais, em caso de ausência ou deficiência grave do serviço, não viola a separação dos Poderes. A decisão deve, em regra, apontar as finalidades a serem alcançadas e determinar que a Administração apresente um plano e os meios adequados.'),
  T('Tema 500 · STF','Medicamento sem registro',
    'Sobre medicamentos sem registro na Anvisa (Tema 500 do STF):',
    ['O Estado deve fornecer qualquer medicamento prescrito.','O Estado não pode ser obrigado a fornecer medicamento experimental, e a falta de registro impede, como regra, o fornecimento por decisão judicial.','Basta laudo médico particular para afastar a exigência de registro.'],1,
    'O Estado não pode ser obrigado a fornecer medicamentos experimentais. A ausência de registro na Anvisa impede, como regra geral, o fornecimento de medicamento por decisão judicial, admitidas exceções em caso de mora irrazoável da agência e preenchidos requisitos específicos.')
 ]},
 7:{titulo:'Previdenciário 2026', teses:[
  T('Súmula 149 · STJ','Prova do trabalho rural',
    'Para comprovar atividade rurícola e obter benefício previdenciário:',
    ['A prova exclusivamente testemunhal basta.','A prova exclusivamente testemunhal não basta.','É indispensável perícia judicial.'],1,
    'A prova exclusivamente testemunhal não basta à comprovação da atividade rurícola, para efeito da obtenção de benefício previdenciário.'),
  T('Súmula 340 · STJ','Lei da pensão por morte',
    'Qual lei rege a concessão da pensão por morte?',
    ['A vigente na data do requerimento.','A mais favorável ao dependente.','A vigente na data do óbito do segurado.'],2,
    'A lei aplicável à concessão de pensão previdenciária por morte é aquela vigente na data do óbito do segurado.'),
  T('Súmula 416 · STJ','Perda da qualidade de segurado',
    'O segurado perdeu essa qualidade, mas já preenchia os requisitos de aposentadoria quando morreu. Seus dependentes:',
    ['Têm direito à pensão por morte.','Não têm direito, porque houve perda da qualidade de segurado.','Recebem apenas pecúlio.'],0,
    'É devida a pensão por morte aos dependentes do segurado que, apesar de ter perdido essa qualidade, preencheu os requisitos legais para a obtenção de aposentadoria até a data do seu óbito.')
 ]},
 8:{titulo:'Previdenciário · RG e Repetitivos', teses:[
  T('Tema 350 · STF (RE 631.240)','Prévio requerimento',
    'Para ajuizar ação de concessão de benefício previdenciário (Tema 350 do STF):',
    ['Não é preciso qualquer requerimento administrativo.','Exige-se, em regra, prévio requerimento administrativo, sem necessidade de esgotar a via administrativa.','É preciso esgotar todas as instâncias administrativas.'],1,
    'A concessão de benefícios previdenciários depende de requerimento do interessado, não se caracterizando ameaça ou lesão a direito antes de sua apreciação e indeferimento pelo INSS, ou se excedido o prazo legal para sua análise. Não se exige o exaurimento da via administrativa.'),
  T('Tema 503 · STF','Desaposentação',
    'Sobre a desaposentação no Regime Geral (Tema 503 do STF):',
    ['Não há previsão legal; só lei pode criar benefícios e vantagens previdenciárias.','É direito de quem volta a contribuir.','É possível mediante devolução dos valores recebidos.'],0,
    'No âmbito do RGPS, somente lei pode criar benefícios e vantagens previdenciárias, não havendo, por ora, previsão legal do direito à desaposentação ou à reaposentação.'),
  T('Tema 555 · STF (ARE 664.335)','EPI e atividade especial',
    'O uso de EPI eficaz e a aposentadoria especial (Tema 555 do STF):',
    ['EPI eficaz nunca afasta a especialidade.','EPI eficaz afasta a especialidade em todos os casos.','EPI eficaz afasta a especialidade, salvo na exposição a ruído acima dos limites.'],2,
    'Se o EPI for realmente capaz de neutralizar a nocividade, não haverá respaldo à aposentadoria especial. Na exposição a ruído acima dos limites de tolerância, a declaração de eficácia do EPI no PPP não descaracteriza o tempo especial.'),
  T('ADIs 2110 e 2111 · STF (2024)','Revisão da vida toda',
    'Qual é a situação da chamada “revisão da vida toda” após o julgamento das ADIs 2110 e 2111 pelo STF em 2024?',
    ['Foi garantida a todos os segurados.','Foi afastada, porque a regra de transição do art. 3º da Lei 9.876/1999 é obrigatória.','Depende de opção do segurado até 2030.'],1,
    'Em 2024, o STF declarou constitucional o art. 3º da Lei 9.876/1999 e afirmou que a regra de transição é obrigatória, o que afastou a possibilidade de o segurado optar pela regra definitiva (revisão da vida toda).')
 ]},
 9:{titulo:'Processo Civil 2026', teses:[
  T('Súmula 7 · STJ','Reexame de prova',
    'A pretensão de simples reexame de prova:',
    ['Não enseja recurso especial.','Enseja recurso especial se houver divergência.','Enseja recurso extraordinário.'],0,
    'A pretensão de simples reexame de prova não enseja recurso especial.'),
  T('Súmula 410 · STJ','Multa cominatória',
    'Para cobrar multa por descumprimento de obrigação de fazer ou não fazer:',
    ['Não é preciso intimar o devedor.','Basta a intimação do advogado, sempre.','A prévia intimação pessoal do devedor é condição necessária.'],2,
    'A prévia intimação pessoal do devedor constitui condição necessária para a cobrança de multa pelo descumprimento de obrigação de fazer ou não fazer. O STJ reafirmou o enunciado sob o CPC/2015.'),
  T('Súmula 106 · STJ','Demora na citação',
    'A ação foi proposta no prazo, mas a citação demorou por motivos inerentes ao mecanismo da Justiça:',
    ['Isso justifica acolher a prescrição.','Isso não justifica o acolhimento da prescrição ou da decadência.','A responsabilidade passa a ser do autor.'],1,
    'Proposta a ação no prazo fixado para o seu exercício, a demora na citação, por motivos inerentes ao mecanismo da Justiça, não justifica o acolhimento da arguição de prescrição ou decadência.')
 ]},
 10:{titulo:'Processo Civil · RG e Repetitivos', teses:[
  T('Tema 988 · STJ','Agravo de instrumento',
    'O rol do art. 1.015 do CPC (Tema 988 do STJ) é:',
    ['De taxatividade mitigada: cabe agravo quando há urgência que torne inútil o julgamento na apelação.','Absolutamente taxativo.','Meramente exemplificativo.'],0,
    'O rol do art. 1.015 do CPC é de taxatividade mitigada, por isso admite a interposição de agravo de instrumento quando verificada a urgência decorrente da inutilidade do julgamento da questão no recurso de apelação.'),
  T('Tema 1076 · STJ','Honorários por equidade',
    'Honorários fixados por equidade (Tema 1076 do STJ):',
    ['Podem ser usados sempre que o valor da causa for elevado.','São vedados quando o valor da condenação, da causa ou o proveito econômico forem elevados; aplicam-se os percentuais do art. 85.','Dependem só do zelo do advogado.'],1,
    'A fixação dos honorários por apreciação equitativa não é permitida quando os valores da condenação, da causa ou o proveito econômico forem elevados. Nesses casos, observam-se os percentuais dos §§ 2º ou 3º do art. 85 do CPC. A equidade só cabe quando o proveito for inestimável ou irrisório, ou o valor da causa muito baixo.')
 ]},
 11:{titulo:'Trabalho e Processo do Trabalho 2026', teses:[
  T('Súmula 331 · TST','Responsabilidade do tomador',
    'Se a empresa prestadora não paga as verbas trabalhistas, o tomador dos serviços:',
    ['Responde subsidiariamente, se participou da relação processual e consta do título; para a Administração, exige-se culpa na fiscalização.','Passa a ter vínculo direto com o empregado.','Não responde de forma alguma.'],0,
    'O inadimplemento das obrigações trabalhistas por parte do empregador implica a responsabilidade subsidiária do tomador dos serviços, desde que tenha participado da relação processual e conste do título executivo. Os entes da Administração respondem subsidiariamente se evidenciada conduta culposa na fiscalização do contrato.'),
  T('Súmula 443 · TST','Dispensa discriminatória',
    'A dispensa de empregado portador do HIV ou de doença grave que suscite estigma:',
    ['É válida, pelo poder potestativo do empregador.','Presume-se discriminatória; invalidado o ato, o empregado tem direito à reintegração.','Só é inválida com prova testemunhal.'],1,
    'Presume-se discriminatória a despedida de empregado portador do vírus HIV ou de outra doença grave que suscite estigma ou preconceito. Inválido o ato, o empregado tem direito à reintegração no emprego.')
 ]},
 12:{titulo:'Trabalho e Processo do Trabalho · RG e Repetitivos', teses:[
  T('Tema 1046 · STF','Negociado sobre o legislado',
    'Acordos e convenções coletivas que limitam ou afastam direitos trabalhistas (Tema 1046 do STF):',
    ['São inconstitucionais.','Só valem com homologação judicial.','São constitucionais, mesmo sem vantagem compensatória, respeitados os direitos absolutamente indisponíveis.'],2,
    'São constitucionais os acordos e as convenções coletivas que, ao considerarem a adequação setorial negociada, pactuam limitações ou afastamentos de direitos trabalhistas, independentemente da explicitação de vantagens compensatórias, desde que respeitados os direitos absolutamente indisponíveis.'),
  T('Tema 725 · STF','Terceirização de atividade-fim',
    'A terceirização de atividade-fim (Tema 725 do STF):',
    ['É lícita, assim como outras formas de divisão do trabalho, mantida a responsabilidade subsidiária da contratante.','É ilícita e gera vínculo com a tomadora.','Só é lícita no setor público.'],0,
    'É lícita a terceirização ou qualquer outra forma de divisão do trabalho entre pessoas jurídicas distintas, independentemente do objeto social das empresas envolvidas, mantida a responsabilidade subsidiária da empresa contratante.'),
  T('ADC 58 · STF','Atualização de créditos trabalhistas',
    'Na ADC 58 (2020), antes da Lei 14.905/2024, o STF definiu para a atualização dos créditos trabalhistas:',
    ['TR em todas as fases.','IPCA-E na fase pré-judicial e, a partir do ajuizamento, a taxa SELIC.','Apenas juros de 1% ao mês.'],1,
    'Até que sobreviesse solução legislativa, aplicavam-se aos créditos trabalhistas os mesmos índices das condenações cíveis em geral: IPCA-E na fase pré-judicial e, a partir do ajuizamento da ação, a taxa SELIC.')
 ]},
 13:{titulo:'Tributário e Financeiro 2026', teses:[
  T('Súmula 435 · STJ','Dissolução irregular',
    'A empresa deixa de funcionar no domicílio fiscal sem comunicar aos órgãos competentes. Isso:',
    ['Presume dissolução irregular e legitima o redirecionamento da execução fiscal ao sócio-gerente.','Não autoriza o redirecionamento.','Autoriza redirecionar a qualquer sócio, mesmo sem poderes de gerência.'],0,
    'Presume-se dissolvida irregularmente a empresa que deixar de funcionar no seu domicílio fiscal, sem comunicação aos órgãos competentes, legitimando o redirecionamento da execução fiscal para o sócio-gerente.'),
  T('Súmula 392 · STJ','Substituição da CDA',
    'A Fazenda Pública pode substituir a certidão de dívida ativa:',
    ['A qualquer tempo, inclusive para trocar o executado.','Até a sentença dos embargos, para corrigir erro material ou formal, vedada a mudança do sujeito passivo.','Nunca depois da citação.'],1,
    'A Fazenda Pública pode substituir a certidão de dívida ativa (CDA) até a prolação da sentença de embargos, quando se tratar de correção de erro material ou formal, vedada a modificação do sujeito passivo da execução.'),
  T('Súmula 393 · STJ','Exceção de pré-executividade',
    'Na execução fiscal, a exceção de pré-executividade:',
    ['Não é admitida.','Serve para qualquer matéria, com ampla instrução.','É admitida para matérias conhecíveis de ofício que não exijam dilação probatória.'],2,
    'A exceção de pré-executividade é admissível na execução fiscal relativamente às matérias conhecíveis de ofício que não demandem dilação probatória.'),
  T('Súmula Vinculante 8 · STF','Prazos do crédito previdenciário',
    'Os arts. 45 e 46 da Lei 8.212/1991, que fixavam prazo de 10 anos para o crédito previdenciário:',
    ['São inconstitucionais, porque prescrição e decadência tributárias exigem lei complementar.','São constitucionais.','Valem só para contribuições do empregador.'],0,
    'São inconstitucionais o parágrafo único do art. 5º do DL 1.569/1977 e os arts. 45 e 46 da Lei 8.212/1991, que tratam de prescrição e decadência de crédito tributário.')
 ]},
 14:{titulo:'Tributário e Financeiro · RG e Repetitivos', teses:[
  T('Tema 69 · STF','ICMS na base do PIS/Cofins',
    'O ICMS e a base de cálculo do PIS e da Cofins (Tema 69 do STF):',
    ['O ICMS integra a base de cálculo.','O ICMS não compõe a base de cálculo.','Integra apenas para optantes do Simples.'],1,
    'O ICMS não compõe a base de cálculo para a incidência do PIS e da Cofins.'),
  T('Tema 1093 · STF','DIFAL do ICMS',
    'A cobrança do diferencial de alíquota do ICMS em operações com consumidor final não contribuinte, após a EC 87/2015 (Tema 1093):',
    ['Dispensa lei complementar.','Pode ser regulada só por convênio do Confaz.','Pressupõe lei complementar com normas gerais.'],2,
    'A cobrança do diferencial de alíquota alusivo ao ICMS, conforme introduzido pela EC 87/2015, pressupõe edição de lei complementar veiculando normas gerais.')
 ]},
 15:{titulo:'Revisão final: temas de RG para levar à prova de procuradorias', teses:null}
};

window.DESAFIO = { CONFIG, MATERIAS, FINAL, DIAS };
})();
