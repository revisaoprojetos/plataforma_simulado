
-- Popula o campo `tipo` nas questões com base na disciplina + assunto do simulado AGU
-- Fonte: planilha CSV das 100 questões

WITH mapping (disc, ass, tipo_val) AS (
  VALUES
    -- DIREITO ADMINISTRATIVO
    ('Direito Administrativo', 'Processo Administrativo Federal (Lei nº 9.784/1999)',    'Lei seca'),
    ('Direito Administrativo', 'Licitações',                                              'Lei seca'),
    ('Direito Administrativo', 'Agente Públicos',                                         'Lei seca'),
    ('Direito Administrativo', 'Controle da Administração. Lei nº 12.846/2013 (Lei Anticorrupção)', 'Lei seca'),
    ('Direito Administrativo', 'Lei nº 13.303/2016',                                     'Lei seca'),
    ('Direito Administrativo', 'Lei nº 11.107/2005 (Consórcios Públicos)',               'Lei seca'),
    ('Direito Administrativo', 'Intervenção do Estado na Propriedade',                   'Doutrina'),
    ('Direito Administrativo', 'Concurso Público',                                        'Jurisprudência'),
    ('Direito Administrativo', 'Improbidade Administrativa',                              'Lei seca'),
    ('Direito Administrativo', 'Responsabilidade civil',                                  'Jurisprudência'),

    -- DIREITO CONSTITUCIONAL
    ('Direito Constitucional', 'Direitos Fundamentais.',                                  'Jurisprudência'),
    ('Direito Constitucional', 'Controle de constitucionalidade.',                        'Doutrina'),
    ('Direito Constitucional', 'Organização político-administrativa. Bens Públicos.',     'Lei seca'),
    ('Direito Constitucional', 'Finanças Públicas.',                                      'Lei seca'),
    ('Direito Constitucional', 'Ordem social. Índios.',                                   'Lei seca'),
    ('Direito Constitucional', 'Controle de Constitucionalidade.',                        'Jurisprudência'),
    ('Direito Constitucional', 'Organização dos Poderes. Poder Legislativo. Processo Legislativo.', 'Lei seca'),
    ('Direito Constitucional', 'Poder Judiciário. Precatórios.',                          'Lei seca'),
    ('Direito Constitucional', 'Organização do Estado. Intervenção Federal.',             'Lei seca'),
    ('Direito Constitucional', 'Poder Judiciário. Funções Essenciais à Justiça.',         'Jurisprudência'),
    ('Direito Constitucional', 'Direitos Políticos. Inelegibilidade.',                    'Jurisprudência'),
    ('Direito Constitucional', 'Ordem Econômica e Financeira. Princípios Gerais da Atividade Econômica.', 'Lei seca'),
    ('Direito Constitucional', 'Organização Político-Administrativa. Competência legislativa.', 'Jurisprudência'),
    ('Direito Constitucional', 'Direitos sociais.',                                       'Doutrina'),
    ('Direito Constitucional', 'Poder Constituinte.',                                     'Doutrina'),

    -- DIREITO TRIBUTÁRIO
    ('Direito Tributário', 'Competência tributária.',                                     'Lei seca'),
    ('Direito Tributário', 'Transação resolutiva de litígio relativo à cobrança de créditos da Fazenda Pública. Lei nº 13.988/2020.', 'Lei seca'),
    ('Direito Tributário', 'Averbação pré-executória. Portaria PGFN nº 33 de 08/02/2018.', 'Lei seca'),
    ('Direito Tributário', 'Responsabilidade tributária dos sócios.',                     'Lei seca'),
    ('Direito Tributário', 'Reforma Tributária.',                                         'Lei seca'),
    ('Direito Tributário', 'Comitê Gestor do IBS.',                                       'Lei seca'),
    ('Direito Tributário', 'Certidão de Regularidade Fiscal.',                            'Lei seca'),
    ('Direito Tributário', 'Legislação tributária.',                                      'Lei seca'),
    ('Direito Tributário', 'Decadência.',                                                 'Lei seca'),
    ('Direito Tributário', 'Modulação dos efeitos temporais das decisões do STF em matéria tributária. Coisa', 'Jurisprudência'),

    -- DIREITO AMBIENTAL
    ('Direito Ambiental', 'Responsabilidade por danos ambientais.',                       'Jurisprudência'),
    ('Direito Ambiental', 'Competência em matéria ambiental.',                            'Lei seca'),
    ('Direito Ambiental', 'Licenciamento ambiental.',                                     'Lei seca'),
    ('Direito Ambiental', 'Política nacional do meio ambiente (Lei nº 6.938/1981).',      'Lei seca'),
    ('Direito Ambiental', 'Gabinete do AGU, Secretaria de Controle Interno e Órgãos Vinculados', 'Lei seca'),
    ('Direito Ambiental', 'Das Citações, das Intimações e das Notificações',              'Lei seca'),
    ('Direito Ambiental', 'Dos Pareceres e da Súmula da AGU',                            'Lei seca'),
    ('Direito Ambiental', 'Súmulas da AGU',                                              'Jurisprudência'),
    ('Direito Ambiental', 'Atribuições do Advogado-Geral da União',                      'Lei seca'),

    -- DIREITO FINANCEIRO
    ('Direito Financeiro', 'Renúncia de Receitas - LRF',                                 'Lei seca'),
    ('Direito Financeiro', 'Cessão de Créditos',                                         'Lei seca'),
    ('Direito Financeiro', 'Despesas Públicas',                                          'Lei seca'),

    -- DIREITO PROCESSUAL CIVIL
    ('Direito Processual Civil', 'Recursos',                                             'Lei seca'),
    ('Direito Processual Civil', 'Transação na fase de execução',                        'Lei seca'),
    ('Direito Processual Civil', 'Ação declaratória',                                    'Lei seca'),
    ('Direito Processual Civil', 'Preclusão consumativa',                                'Jurisprudência'),
    ('Direito Processual Civil', 'Competência. Cumprimento de sentença',                 'Lei seca'),
    ('Direito Processual Civil', 'Ato atentatório à dignidade da justiça',               'Lei seca'),
    ('Direito Processual Civil', 'Citação por edital',                                   'Jurisprudência'),
    ('Direito Processual Civil', 'Honorários recursais',                                 'Jurisprudência'),
    ('Direito Processual Civil', 'Técnica de ampliação de julgamento',                   'Lei seca'),
    ('Direito Processual Civil', 'IRDR. Reiteração do pedido de instauração',            'Lei seca'),
    ('Direito Processual Civil', 'Ação Civil Pública.',                                  'Jurisprudência'),
    ('Direito Processual Civil', 'Gratuidade da justiça.',                               'Jurisprudência'),
    ('Direito Processual Civil', 'Negócio Jurídico Processual',                          'Lei seca'),
    ('Direito Processual Civil', 'Litigância de má-fé.',                                 'Lei seca'),

    -- DIREITO CIVIL
    ('Direito Civil', 'LINDB',                                                           'Lei seca'),
    ('Direito Civil', 'Negócio Jurídico',                                                'Lei seca'),
    ('Direito Civil', 'Bem de família',                                                  'Jurisprudência'),
    ('Direito Civil', 'Obrigações e contratos',                                          'Jurisprudência'),
    ('Direito Civil', 'Direitos de personalidade',                                       'Lei seca'),
    ('Direito Civil', 'Prescrição',                                                      'Lei seca'),
    ('Direito Civil', 'Contrato de doação.',                                             'Lei seca'),
    ('Direito Civil', 'Responsabilidade civil',                                          'Jurisprudência'),

    -- DIREITO INTERNACIONAL PÚBLICO E PRIVADO
    ('Direito Internacional Público e Privado', 'Fontes do Direito Internacional Público', 'Doutrina'),
    ('Direito Internacional Público e Privado', 'Lei de Migração',                       'Lei seca'),
    ('Direito Internacional Público e Privado', 'Relações Diplomáticas e Consulares',    'Lei seca'),
    ('Direito Internacional Público e Privado', 'LINDB',                                 'Lei seca'),
    ('Direito Internacional Público e Privado', 'Educação.',                             'Lei seca'),
    ('Direito Internacional Público e Privado', 'Tecnologia e inovação.',                'Lei seca'),

    -- DIREITO EMPRESARIAL
    ('Direito Empresarial', 'Teoria geral da empresa: empresário, registro e capacidade', 'Lei seca'),
    ('Direito Empresarial', 'Inscrição do empresário, filiais e sócio incapaz',          'Lei seca'),
    ('Direito Empresarial', 'Estabelecimento empresarial e trespasse',                   'Lei seca'),
    ('Direito Empresarial', 'Plano de recuperação judicial',                             'Jurisprudência'),

    -- DIREITO ELEITORAL
    ('Direito Eleitoral', 'Elegibilidade e inelegibilidade',                             'Jurisprudência'),
    ('Direito Eleitoral', 'Sistema eleitoral',                                           'Lei seca'),
    ('Direito Eleitoral', 'Propaganda eleitoral',                                        'Jurisprudência'),
    ('Direito Eleitoral', 'Condutas vedadas',                                            'Lei seca'),
    ('Direito Eleitoral', 'Direitos políticos',                                          'Jurisprudência'),

    -- DIREITO PREVIDENCIÁRIO
    ('Direito Previdenciário', 'Competência.',                                           'Lei seca'),
    ('Direito Previdenciário', 'Contagem recíproca.',                                    'Lei seca'),
    ('Direito Previdenciário', 'Segurado Especial.',                                     'Lei seca'),
    ('Direito Previdenciário', 'Pensão por morte.',                                      'Jurisprudência'),

    -- DIREITO DO TRABALHO
    ('Direito do Trabalho', 'Terceirização. Responsabilidade da Administração Pública.', 'Jurisprudência'),
    ('Direito do Trabalho', 'Empregados públicos.',                                      'Jurisprudência'),
    ('Direito do Trabalho', 'Jornada de trabalho.',                                      'Lei seca'),

    -- DIREITO PROCESSUAL DO TRABALHO
    ('Direito Processual do Trabalho', 'Prerrogativas da Fazenda Pública.',              'Lei seca'),
    ('Direito Processual do Trabalho', 'Competência.',                                   'Lei seca'),

    -- DIREITO PENAL
    ('Direito Penal', 'Crimes contra a organização do trabalho',                         'Lei seca'),
    ('Direito Penal', 'Conflito aparente de normas penais',                              'Doutrina'),
    ('Direito Penal', 'Lei penal no espaço - extraterritorialidade',                     'Lei seca'),
    ('Direito Penal', 'Princípio da insignificância',                                    'Jurisprudência'),

    -- DIREITO PROCESSUAL PENAL
    ('Direito Processual Penal', 'Prisão, medidas cautelares e liberdade provisória',    'Lei seca')
)
UPDATE public.questoes q
SET tipo = m.tipo_val
FROM mapping m
WHERE LOWER(q.disciplina) = LOWER(m.disc)
  AND (
    LOWER(COALESCE(q.assunto, '')) = LOWER(m.ass)
    OR LOWER(COALESCE(q.topico,  '')) = LOWER(m.ass)
  );
