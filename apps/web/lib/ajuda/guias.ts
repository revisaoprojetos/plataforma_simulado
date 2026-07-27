import {
  ClipboardList, ListChecks, Database, BookOpen, Users,
  BarChart3, FileText, PencilRuler, Bold, Upload, type LucideIcon,
} from 'lucide-react'

/** Alvo do tour guiado: um seletor CSS e/ou um texto para achar o elemento na tela. */
export type Alvo = { sel?: string; txt?: string }

/** Ação que o tour executa ao ENTRAR num passo (para avançar telas internas, ex.: o assistente). */
export type AcaoTour = { clicar?: Alvo; digitar?: { sel: string; valor: string }; esperar?: number }

export type PassoAjuda = {
  titulo: string
  texto: string
  dica?: string
  /** Tour guiado: para onde navegar antes de destacar. */
  rota?: string
  /** Tour guiado: qual elemento destacar (spotlight + seta). Sem alvo → cartão central. */
  alvo?: Alvo
  /** Tour guiado: ações executadas ao entrar no passo (ex.: clicar “Próximo” do assistente). */
  aoEntrar?: AcaoTour[]
  /** Tour guiado: elemento a clicar ao VOLTAR deste passo (ex.: “Voltar” do assistente) para rebobinar a tela. */
  voltarClicando?: Alvo
}

export type GuiaAjuda = {
  id: string
  titulo: string
  resumo: string
  icone: LucideIcon
  categoria: 'Simulados' | 'Conteúdo' | 'Pessoas' | 'Análise' | 'Cadernos'
  /** Prefixos de rota onde este guia é mais relevante (para o modo contextual). */
  rotas: string[]
  passos: PassoAjuda[]
  /** Passos do TOUR guiado (mais granular). Se ausente, o tour usa `passos`. */
  tour?: PassoAjuda[]
  link?: { label: string; href: string }
}

export const GUIAS: GuiaAjuda[] = [
  {
    id: 'criar-simulado',
    titulo: 'Criar uma prova (simulado)',
    resumo: 'Passo a passo completo para montar uma prova do zero: nome, modo de aplicação, questões, regras e publicação.',
    icone: ClipboardList,
    categoria: 'Simulados',
    rotas: ['/admin/simulados', '/admin'],
    link: { label: 'Ir para Simulados', href: '/admin/simulados' },
    passos: [
      { titulo: 'Abra a área de simulados e clique em “Novo simulado”', texto: 'No menu à esquerda, entre em “Simulado” → “Aplicação de Simulado”. Você verá a lista de provas (em Quadro ou Catálogo). No canto superior direito, clique no botão roxo “Novo simulado” para abrir o assistente de criação.', rota: '/admin/simulados', alvo: { txt: 'Novo simulado' }, dica: 'O assistente tem 4 etapas: Tipo → Informações → Questões → Regras. Você pode voltar em qualquer uma antes de criar.' },
      { titulo: 'Confirme o tipo da prova (Objetivo)', texto: 'Escolha “Objetivo” — são questões de marcar (A, B, C…) que o sistema corrige sozinho, na hora. Clique em “Objetivo” e depois em “Próximo”. (Provas discursivas, corrigidas à mão, ficam para outra etapa.)', rota: '/admin/simulados/novo', alvo: { txt: 'Objetivo' } },
      { titulo: 'Dê um nome e escolha o modo de aplicação', texto: 'No campo “Título”, escreva um nome claro (ex.: “Simulado 1 – Turma A”). Depois, no “Modo de aplicação”, decida COMO a prova fica disponível: “Janela fixa” = todos no mesmo horário (ex.: 8h–13h; preencha início e fim); “Prazo relativo” = cada aluno tem um prazo em horas/dias/meses a partir de quando você liberar; “Aberto” = sempre disponível para praticar. Clique em “Próximo”.', dica: 'O “Modo de aplicação” é a decisão mais importante desta tela — é o que define quando e como o aluno consegue começar. Confira antes de avançar.', alvo: { sel: '[data-tour="wizard-info"]' }, aoEntrar: [{ clicar: { txt: 'Objetivo' } }, { esperar: 250 }, { clicar: { sel: 'button', txt: 'Próximo' } }, { esperar: 700 }], voltarClicando: { sel: 'button', txt: 'Voltar' } },
      { titulo: 'Escolha as questões da prova', texto: 'Marque as questões que vão cair. Use a busca pelo texto do enunciado ou os filtros (banco, matéria, ano) para achar rápido. Dá para começar a partir de um Banco de Simulado (que já traz as questões e os alunos) ou selecionar uma a uma. Quando terminar, clique em “Próximo”.', alvo: { txt: 'Buscar questão' }, aoEntrar: [{ digitar: { sel: 'input', valor: 'Prova de exemplo' } }, { esperar: 250 }, { clicar: { sel: 'button', txt: 'Próximo' } }, { esperar: 700 }], voltarClicando: { sel: 'button', txt: 'Voltar' }, dica: 'Selecionar um banco inteiro é o jeito mais rápido — ele já vincula as questões e matricula os alunos daquele banco.' },
      { titulo: 'Ajuste as regras da prova', texto: 'Defina os detalhes: tempo limite por aluno, quantas tentativas ele pode fazer (1, N ou ilimitado) e qual nota vale (última, melhor ou média), se as questões e alternativas aparecem embaralhadas, se há tela de revisão antes de enviar e quando o gabarito é liberado (na hora, após a janela ou manualmente). No fim, clique em “Criar simulado”.', alvo: { txt: 'Criar simulado' }, aoEntrar: [{ clicar: { sel: 'button', txt: 'Próximo' } }, { esperar: 700 }], voltarClicando: { sel: 'button', txt: 'Voltar' }, dica: 'Embaralhar as questões dificulta a “cola” entre alunos que fazem ao mesmo tempo.' },
      { titulo: 'Publique para liberar aos alunos', texto: 'A prova nasce como “Rascunho” — só você a vê. Para os alunos poderem fazer, abra a prova e mude o status para “Publicado”. Confira também se as turmas/alunos certos têm acesso.', dica: 'Antes de publicar de vez, você pode entrar como “testador” e fazer a prova sem que ela conte em estatísticas nem ranking.' },
    ],
    tour: [
      { titulo: 'Abra a área de simulados', texto: 'No menu à esquerda, entre em “Simulado” → “Aplicação de Simulado” e clique em “Novo simulado”.', rota: '/admin/simulados', alvo: { txt: 'Novo simulado' } },
      { titulo: 'Confirme o tipo da prova', texto: 'Deixe em “Objetivo” (questões de marcar, corrigidas automaticamente) e clique em “Próximo”.', rota: '/admin/simulados/novo', alvo: { txt: 'Objetivo' } },
      { titulo: 'Dê um nome à prova', texto: 'No campo “Título”, escreva o nome da prova — ex.: “Simulado 1 – Turma A”.', alvo: { sel: '[data-tour="wizard-info"] input' }, aoEntrar: [{ clicar: { sel: 'button', txt: 'Objetivo' } }, { esperar: 250 }, { clicar: { sel: 'button', txt: 'Próximo' } }, { esperar: 700 }], voltarClicando: { sel: 'button', txt: 'Voltar' } },
      { titulo: 'Escolha quando a prova abre', texto: 'No “Modo de aplicação”: “Janela fixa” = todos no mesmo horário (ex.: 8h–13h); “Prazo relativo” = cada aluno tem um tempo após você liberar; “Aberto” = sempre disponível. Se for janela fixa, preencha início e fim. Depois clique em “Próximo”.', alvo: { sel: '[data-tour="modo-aplicacao"]' } },
      { titulo: 'Escolha as questões', texto: 'Marque as questões que vão cair na prova. Dá para buscar pelo texto ou filtrar por banco e matéria. Clique em “Próximo”.', alvo: { txt: 'Buscar questão' }, aoEntrar: [{ digitar: { sel: '[data-tour="wizard-info"] input', valor: 'Prova de exemplo' } }, { esperar: 250 }, { clicar: { sel: 'button', txt: 'Próximo' } }, { esperar: 700 }], voltarClicando: { sel: 'button', txt: 'Voltar' } },
      { titulo: 'Ajuste as regras', texto: 'Defina tempo, tentativas, embaralhamento e quando liberar o gabarito. No fim, clique em “Criar simulado”.', alvo: { txt: 'Criar simulado' }, aoEntrar: [{ clicar: { sel: 'button', txt: 'Próximo' } }, { esperar: 700 }], voltarClicando: { sel: 'button', txt: 'Voltar' } },
      { titulo: 'Publique para liberar', texto: 'A prova começa como “rascunho” (só você vê). Para os alunos poderem fazer, abra a prova e mude o status para “Publicado”.', dica: 'Antes de liberar, dá para testar sem contar no resultado.' },
    ],
  },
  {
    id: 'simulado-requisitos',
    titulo: 'Conferir antes de publicar',
    resumo: 'Um checklist rápido para garantir que a prova está pronta antes de liberar para os alunos.',
    icone: ListChecks,
    categoria: 'Simulados',
    rotas: ['/admin/simulados'],
    passos: [
      { titulo: 'Tem nome e modo de aplicação definido', texto: 'Toda prova precisa de um nome claro e de um modo de aplicação escolhido: horário fixo, prazo por aluno ou sempre aberta. É por aí que o aluno sabe quando pode começar.', rota: '/admin/simulados', alvo: { txt: 'Novo simulado' } },
      { titulo: 'As datas fazem sentido', texto: 'Se você escolheu “Janela fixa”, confira a data/hora de início e de fim — o fim tem que ser depois do início. Fora da janela, ninguém consegue entrar.', dica: 'No fim da janela, o sistema encerra e corrige automaticamente todas as provas em andamento.' },
      { titulo: 'Tem pelo menos uma questão', texto: 'Sem questão, a prova não publica. Adicione as questões pela aba “Questões” da prova (ou herdando de um Banco de Simulado).' },
      { titulo: 'Você definiu quem pode fazer', texto: 'Vincule as turmas ou alunos que terão acesso, ou libere o acesso avulso. Quem não tem acesso ativo não consegue iniciar — e recebe a mensagem de bloqueio que você configurou.' },
      { titulo: 'Revisou as regras', texto: 'Dê uma última olhada em tempo limite, número de tentativas, política de nota (última/melhor/média), embaralhamento e quando o gabarito é liberado.' },
      { titulo: 'Mudou o status para “Publicado”', texto: 'Enquanto estiver “Rascunho”, o aluno não vê a prova. Mude para “Publicado” quando tudo estiver conferido. Se precisar, dá para voltar a rascunho depois.' },
    ],
  },
  {
    id: 'conectar-banco',
    titulo: 'Colocar questões do banco na prova',
    resumo: 'Como trazer questões que já estão no banco para dentro de uma prova, e como organizá-las lá.',
    icone: Database,
    categoria: 'Simulados',
    rotas: ['/admin/simulados', '/admin/banco-questoes'],
    link: { label: 'Ver Banco de Simulado', href: '/admin/banco-questoes' },
    passos: [
      { titulo: 'As questões vivem no banco', texto: 'As questões ficam cadastradas no “Banco de Simulado”, organizadas em bancos (que funcionam como pastas por tema). Uma mesma questão pode ser reaproveitada em várias provas.', rota: '/admin/banco-questoes' },
      { titulo: 'Abra a prova na aba “Questões”', texto: 'Entre na prova (em “Aplicação de Simulado”) e clique na aba “Questões”. Depois clique no botão “Adicionar Questões”.', rota: '/admin/simulados', alvo: { txt: 'Novo simulado' } },
      { titulo: 'Procure e filtre', texto: 'Abre uma janela com as questões disponíveis. Use a busca pelo enunciado e os filtros (banco, matéria, ano, dificuldade) para chegar rápido nas que você quer.' },
      { titulo: 'Marque e adicione', texto: 'Selecione as questões desejadas e confirme. Elas entram na prova imediatamente — dá para adicionar em lote.' },
      { titulo: 'Organize dentro da prova', texto: 'Depois de adicionadas, você pode reordenar, ajustar o peso de cada questão ou remover as que não vai usar. Também dá para anular uma questão depois — o sistema re-corrige e mostra quem foi beneficiado/prejudicado.', dica: 'Anular ou trocar o gabarito depois que os alunos responderam dispara a re-correção automática, com relatório de “antes e depois”.' },
    ],
  },
  {
    id: 'criar-questao',
    titulo: 'Cadastrar uma questão',
    resumo: 'Como escrever o enunciado (com negrito/itálico), colocar as alternativas, marcar a resposta certa e classificar.',
    icone: PencilRuler,
    categoria: 'Conteúdo',
    rotas: ['/admin/questoes'],
    link: { label: 'Ir para Questões', href: '/admin/questoes' },
    passos: [
      { titulo: 'Abra “Questões” e clique em “Nova questão”', texto: 'No menu, entre em “Simulado” → “Questões” e clique no botão “Nova questão”, no canto superior direito.', rota: '/admin/questoes', alvo: { txt: 'Nova questão' } },
      { titulo: 'Escreva o enunciado (e formate se precisar)', texto: 'Digite ou cole o texto da pergunta. Para destacar trechos, selecione o texto e use a barra de formatação acima do campo: Negrito (B), Itálico (I), listas e link. O botão “Prévia” mostra como o aluno vai ver.', rota: '/admin/questoes/nova', alvo: { sel: 'textarea' }, dica: 'A formatação usa markdown por baixo: negrito vira **texto** e itálico *texto*. O aluno vê já formatado, sem os símbolos.' },
      { titulo: 'Coloque as alternativas e marque a correta', texto: 'Se for objetiva, escreva as alternativas (A, B, C…) e clique no círculo da alternativa correta para marcá-la. Cada alternativa também aceita formatação e um comentário/lei opcional.' },
      { titulo: 'Classifique a questão', texto: 'Preencha banca, órgão, matéria, assunto, ano e dificuldade. Isso é o que permite filtrar as questões depois e gerar relatórios de acerto por matéria.', dica: 'Se a banca/matéria ainda não existe, dá para criá-la ali mesmo, na hora.' },
      { titulo: 'Salve', texto: 'Clique em salvar. A questão fica disponível para usar em qualquer prova. Você pode editá-la depois sem perder o histórico.', dica: 'Para cadastrar muitas de uma vez, use a importação por planilha (veja o guia “Importar questões de uma planilha”).' },
    ],
  },
  {
    id: 'formatar-questao',
    titulo: 'Formatar questões (negrito, itálico)',
    resumo: 'Como deixar trechos em negrito/itálico no editor e como o negrito chega já pronto na importação.',
    icone: Bold,
    categoria: 'Conteúdo',
    rotas: ['/admin/questoes'],
    link: { label: 'Ir para Questões', href: '/admin/questoes' },
    passos: [
      { titulo: 'Selecione o trecho e clique no botão', texto: 'No editor da questão (enunciado, alternativas ou comentário), selecione o texto que quer destacar e clique em Negrito (B) ou Itálico (I) na barra acima do campo — funciona igual ao Word. O trecho é envolvido pela marcação automaticamente.', rota: '/admin/questoes/nova', alvo: { sel: 'textarea' } },
      { titulo: 'Use a “Prévia” para conferir', texto: 'A barra tem também listas, código e link. Clique em “Prévia” para ver o resultado formatado (como o aluno verá) e volte em “Editar” para continuar mexendo.', dica: 'No editor você vê os símbolos (**negrito**, *itálico*); o aluno vê o texto já formatado, sem os símbolos.' },
      { titulo: 'Na importação, o negrito já vem pronto', texto: 'Se você importa questões por planilha, dá para trazer a formatação escrevendo, na própria célula do enunciado/alternativa, a convenção: #texto# vira negrito, _texto_ vira itálico e _#texto#_ vira negrito+itálico. O sistema converte na hora da importação.', dica: 'Lacunas de completar (____) e símbolos soltos são preservados — só os pares #…# e _…_ viram formatação.' },
      { titulo: 'Confira na prévia da importação', texto: 'Antes de confirmar a importação, a tela de prévia já mostra o enunciado e as alternativas com a formatação aplicada — assim você valida antes de gravar.' },
      { titulo: 'Onde a formatação aparece', texto: 'O negrito/itálico é exibido em todo lugar: na prova do aluno, no quiz do banco de questões, na revisão/gabarito e no PDF do caderno. É só formatar uma vez.' },
    ],
  },
  {
    id: 'importar-questoes',
    titulo: 'Importar questões de uma planilha',
    resumo: 'Como cadastrar dezenas de questões de uma vez a partir de um arquivo (CSV/Excel), com prévia antes de gravar.',
    icone: Upload,
    categoria: 'Conteúdo',
    rotas: ['/admin/questoes', '/admin/banco-questoes'],
    link: { label: 'Ir para Questões', href: '/admin/questoes' },
    passos: [
      { titulo: 'Baixe o modelo da planilha', texto: 'Na área de importação de questões, clique em “Baixar modelo”. Ele já vem com os cabeçalhos certos (enunciado, alternativas A–E, gabarito, matéria, banca, ano…) e uma linha de exemplo.', rota: '/admin/questoes' },
      { titulo: 'Preencha uma questão por linha', texto: 'Cada linha é uma questão. Preencha o enunciado, as alternativas, marque o gabarito (a letra da correta, ou Certo/Errado) e a classificação. Para formatar, use a convenção #negrito# / _itálico_ nas células (veja o guia de formatação).' },
      { titulo: 'Envie o arquivo', texto: 'Volte na tela de importação e envie o arquivo (CSV, Excel ou TXT). O sistema lê e monta uma prévia com todas as questões detectadas.', dica: 'Ele detecta sozinho se a questão é de múltipla escolha ou Certo/Errado, e aponta linhas com problema (ex.: sem gabarito).' },
      { titulo: 'Revise a prévia', texto: 'Confira a tabela de prévia: enunciado, gabarito, alternativas e classificação de cada questão. Clique numa linha para ver os detalhes (alternativas, leis e comentários). Questões repetidas são identificadas para você não duplicar.' },
      { titulo: 'Confirme a importação', texto: 'Quando estiver tudo certo, clique em “Importar”. As questões entram no banco na hora, prontas para usar nas provas.' },
    ],
  },
  {
    id: 'criar-banco',
    titulo: 'Organizar o banco de questões',
    resumo: 'Como juntar questões em “bancos” (pastas) para reaproveitar, e vincular turmas para liberar acesso em massa.',
    icone: BookOpen,
    categoria: 'Conteúdo',
    rotas: ['/admin/banco-questoes'],
    link: { label: 'Ir para Banco de Simulado', href: '/admin/banco-questoes' },
    passos: [
      { titulo: 'Abra o Banco de Simulado', texto: 'Clique em “Simulado” → “Banco de Simulado”. Pense em cada banco como uma pasta que reúne questões de um mesmo tema (ex.: “Direito Constitucional”).', rota: '/admin/banco-questoes', alvo: { txt: 'Novo' } },
      { titulo: 'Crie um banco', texto: 'Clique em “Novo banco”, dê um nome e salve. Você pode personalizar cor, ícone e capa para achar mais fácil depois.' },
      { titulo: 'Coloque questões dentro', texto: 'Abra o banco e adicione as questões que fazem parte dele — uma questão pode estar em mais de um banco ao mesmo tempo.' },
      { titulo: 'Vincule turmas e use na prova', texto: 'Na aba “Estudantes” do banco, vincule grupos/turmas — todos os membros passam a ter acesso aos simulados daquele banco automaticamente. E, ao criar uma prova, é só herdar o banco para trazer questões e alunos de uma vez.', dica: 'A coluna “Grupo” na lista de estudantes mostra por qual turma cada aluno chegou ao banco (ou “Direto”, se foi adicionado individualmente).' },
    ],
  },
  {
    id: 'estudantes-grupos',
    titulo: 'Cadastrar alunos e turmas',
    resumo: 'Como cadastrar alunos, juntá-los em turmas, controlar matrículas e liberar o acesso às provas.',
    icone: Users,
    categoria: 'Pessoas',
    rotas: ['/admin/estudantes', '/admin/grupos', '/admin/matriculas'],
    link: { label: 'Ir para Estudantes', href: '/admin/estudantes' },
    passos: [
      { titulo: 'Cadastre os alunos', texto: 'Em “Alunos” → “Estudantes”, clique em “Novo” e preencha nome, e-mail e, se quiser, CPF ou telefone. O e-mail é o que o aluno usa para entrar (sem senha, no acesso leve).', rota: '/admin/estudantes', alvo: { txt: 'Novo' } },
      { titulo: 'Junte em turmas (grupos)', texto: 'Em “Alunos” → “Grupos”, agrupe os alunos em turmas. Assim você libera uma prova (ou um banco) para várias pessoas de uma vez, em vez de uma a uma.', rota: '/admin/grupos', alvo: { txt: 'Novo' } },
      { titulo: 'Controle as matrículas', texto: 'Em “Alunos” → “Matrículas”, você define quem está com o acesso à plataforma ativo. Matrícula expirada bloqueia o acesso — o aluno vê a mensagem que você configurou.', rota: '/admin/matriculas', alvo: { txt: 'Nova' } },
      { titulo: 'Libere a prova', texto: 'Na prova, escolha quais turmas ou alunos podem fazer (ou libere acesso avulso com prazo). Só quem tem acesso liberado consegue começar.', dica: 'No perfil de cada aluno você vê os cards “Bancos vinculados” e “Grupos vinculados”, além do histórico de simulados feitos.' },
    ],
  },
  {
    id: 'relatorios',
    titulo: 'Ver resultados e ranking',
    resumo: 'Como acompanhar notas, desempenho por matéria, engajamento e a classificação dos alunos — na tela e em planilha/PDF.',
    icone: BarChart3,
    categoria: 'Análise',
    rotas: ['/admin/relatorios'],
    link: { label: 'Ir para Análise', href: '/admin/relatorios' },
    passos: [
      { titulo: 'Abra “Análise”', texto: 'No menu, entre em “Análise” e escolha o tipo de relatório: por simulado, por disciplina, ranking ou gráficos gerais.', rota: '/admin/relatorios', alvo: { txt: 'Relatório Simulado' } },
      { titulo: 'Veja o resultado de uma prova', texto: 'Em “Relatório Simulado”, clique numa prova para ver notas, acertos, tempo, desempenho por matéria, engajamento (quantos acessaram/finalizaram) e as questões que mais erraram.', rota: '/admin/relatorios/simulados' },
      { titulo: 'Baixe em planilha (Excel/CSV)', texto: 'Clique em “Excel” ou “CSV” para baixar tudo, aluno por aluno e questão por questão. O Excel vem com um painel de KPIs e gráficos (distribuição de notas, acerto por disciplina, ranking) já montados.' },
      { titulo: 'Gere o ranking', texto: 'Em “Ranking”, monte a classificação dos alunos de uma prova e baixe em PDF para divulgar. Provas de testadores não entram no ranking.', rota: '/admin/relatorios/ranking' },
    ],
  },
  {
    id: 'caderno-prova',
    titulo: 'Montar um caderno de prova',
    resumo: 'Como montar o caderno impresso: blocos, materiais do aluno (enunciado/gabarito), imagem de fundo e PDF.',
    icone: FileText,
    categoria: 'Cadernos',
    rotas: ['/admin/cadernos'],
    link: { label: 'Ir para Cadernos de Prova', href: '/admin/cadernos' },
    passos: [
      { titulo: 'Crie um caderno', texto: 'Abra “Simulado” → “Cadernos de Prova” e crie um caderno novo. Comece do zero ou parta de um modelo pronto.', rota: '/admin/cadernos', alvo: { txt: 'Novo' } },
      { titulo: 'Monte as páginas com blocos', texto: 'Arraste os blocos (capa, dados do aluno, questões, folha de respostas, diagnóstico…) para a folha e organize o caderno do jeito que quiser.' },
      { titulo: 'Defina os materiais do aluno', texto: 'Na aba “Caderno” do banco, em “Material do aluno”, você importa PDFs prontos: o “Gabarito Comentado” (entregue ao finalizar) e o “Enunciado de Questões” (que o aluno baixa antes de iniciar). Quando há o Enunciado importado, ele substitui o caderno de questões gerado.', dica: 'A imagem de fundo: clique no marcador “Fundo” no canto da folha e envie a imagem — ela fica guardada dentro do caderno e sai igual no PDF.' },
      { titulo: 'Gere o PDF', texto: 'Ao terminar, clique em “Imprimir/PDF” para gerar o caderno pronto. Com a “mala direta”, o sistema cria um caderno por aluno já com o nome preenchido.', dica: 'A geração pesada roda em segundo plano (worker) — o link do PDF chega quando fica pronto, mesmo que você mude de página.' },
    ],
  },
]

/** Guias relevantes para a rota atual (prefixo mais específico primeiro). */
export function guiasDaRota(pathname: string): GuiaAjuda[] {
  return GUIAS
    .map((g) => {
      const match = g.rotas.filter((r) => pathname.startsWith(r)).sort((a, b) => b.length - a.length)[0]
      return match ? { g, score: match.length } : null
    })
    .filter((x): x is { g: GuiaAjuda; score: number } => !!x)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.g)
}
