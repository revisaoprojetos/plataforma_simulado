import {
  ClipboardList, ListChecks, Database, BookOpen, Users,
  BarChart3, FileText, PencilRuler, type LucideIcon,
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
    resumo: 'Passo a passo para montar uma prova do zero: dar um nome, definir as regras e escolher as questões.',
    icone: ClipboardList,
    categoria: 'Simulados',
    rotas: ['/admin/simulados', '/admin'],
    link: { label: 'Ir para Simulados', href: '/admin/simulados' },
    passos: [
      { titulo: 'Abra a área de simulados', texto: 'No menu do lado esquerdo, clique em “Simulado” e depois em “Aplicação de Simulado”. Agora clique no botão “Novo simulado”, lá no canto de cima à direita.', rota: '/admin/simulados', alvo: { txt: 'Novo simulado' } },
      { titulo: 'Confirme o tipo da prova', texto: 'A prova é de questões de marcar (A, B, C…), que o sistema corrige sozinho. Clique em “Objetivo” e depois em “Próximo”.', rota: '/admin/simulados/novo', alvo: { txt: 'Objetivo' } },
      { titulo: 'Preencha as informações', texto: 'Escreva o nome da prova (ex.: “Simulado 1 – Turma A”). No “Modo de aplicação”, escolha quando ela abre: “Janela fixa” (todos no mesmo horário, ex.: 8h–13h), “Prazo relativo” (cada aluno tem um tempo após você liberar) ou “Aberto” (sempre disponível). Se for janela fixa, preencha início e fim. Clique em “Próximo”.', dica: 'O “Modo de aplicação” é o que define como a prova fica disponível — confira antes de avançar.', alvo: { sel: '[data-tour="wizard-info"]' }, aoEntrar: [{ clicar: { txt: 'Objetivo' } }, { esperar: 250 }, { clicar: { sel: 'button', txt: 'Próximo' } }, { esperar: 700 }], voltarClicando: { sel: 'button', txt: 'Voltar' } },
      { titulo: 'Escolha as questões', texto: 'Marque as questões que vão cair na prova. Dá para procurar pelo texto ou filtrar por banco e matéria. Quando terminar, clique em “Próximo”.', alvo: { txt: 'Buscar questão' }, aoEntrar: [{ digitar: { sel: 'input', valor: 'Prova de exemplo' } }, { esperar: 250 }, { clicar: { sel: 'button', txt: 'Próximo' } }, { esperar: 700 }], voltarClicando: { sel: 'button', txt: 'Voltar' } },
      { titulo: 'Ajuste as regras', texto: 'Aqui você define os detalhes: quanto tempo o aluno tem, quantas vezes pode refazer, se as questões aparecem embaralhadas e quando ele pode ver o gabarito. No fim, clique em “Criar simulado”.', alvo: { txt: 'Criar simulado' }, aoEntrar: [{ clicar: { sel: 'button', txt: 'Próximo' } }, { esperar: 700 }], voltarClicando: { sel: 'button', txt: 'Voltar' } },
      { titulo: 'Publique para liberar', texto: 'A prova começa como “rascunho” (só você vê). Para os alunos poderem fazer, abra a prova e mude o status para “Publicado”.', dica: 'Antes de liberar, você pode testar a prova sem que ela conte no resultado.' },
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
    titulo: 'O que a prova precisa ter',
    resumo: 'Uma lista rápida para conferir antes de liberar a prova para os alunos.',
    icone: ListChecks,
    categoria: 'Simulados',
    rotas: ['/admin/simulados'],
    passos: [
      { titulo: 'Tem nome e sabe quando abre', texto: 'Toda prova precisa de um nome e de saber quando fica disponível (horário fixo, prazo por aluno ou sempre aberta).', rota: '/admin/simulados', alvo: { txt: 'Novo simulado' } },
      { titulo: 'As datas fazem sentido', texto: 'Se você escolheu horário fixo, a prova precisa ter data de início e de fim — e o fim tem que ser depois do início.' },
      { titulo: 'Tem pelo menos uma questão', texto: 'Sem questão, a prova não pode ser publicada. Adicione as questões pela aba “Questões” da prova.' },
      { titulo: 'Você definiu quem pode fazer', texto: 'Escolha quais turmas ou alunos têm acesso, ou libere o acesso individual. Quem não tiver acesso não consegue começar.' },
      { titulo: 'Revisou as regras', texto: 'Confira tempo, número de tentativas e quando o aluno vê o gabarito.' },
      { titulo: 'Está “Publicada”', texto: 'Enquanto estiver como “rascunho”, o aluno não vê. Mude para “Publicado” quando estiver tudo pronto.' },
    ],
  },
  {
    id: 'conectar-banco',
    titulo: 'Colocar questões do banco na prova',
    resumo: 'Como trazer as questões que já estão no banco para dentro de uma prova.',
    icone: Database,
    categoria: 'Simulados',
    rotas: ['/admin/simulados', '/admin/banco-questoes'],
    link: { label: 'Ver Banco de Questões', href: '/admin/banco-questoes' },
    passos: [
      { titulo: 'As questões ficam no banco', texto: 'Primeiro, as questões precisam estar cadastradas no “Banco de Questões”. Elas ficam organizadas em bancos (que funcionam como pastas).', rota: '/admin/banco-questoes' },
      { titulo: 'Abra a prova na aba “Questões”', texto: 'Entre na prova e clique na aba “Questões”. Depois clique no botão “Adicionar Questões”.', rota: '/admin/simulados', alvo: { txt: 'Novo simulado' } },
      { titulo: 'Procure as questões', texto: 'Vai abrir uma janela com as questões disponíveis. Use a busca e os filtros (banco, matéria) para encontrar as que você quer.' },
      { titulo: 'Marque e adicione', texto: 'Selecione as questões desejadas e confirme. Elas entram na prova na hora.' },
      { titulo: 'Organize na prova', texto: 'Depois de adicionadas, você pode mudar a ordem, o peso de cada questão ou tirar alguma que não vai mais usar.' },
    ],
  },
  {
    id: 'criar-questao',
    titulo: 'Cadastrar uma questão',
    resumo: 'Como escrever uma questão, colocar as alternativas e marcar a resposta certa.',
    icone: PencilRuler,
    categoria: 'Conteúdo',
    rotas: ['/admin/questoes'],
    link: { label: 'Ir para Questões', href: '/admin/questoes' },
    passos: [
      { titulo: 'Abra “Questões”', texto: 'No menu, clique em “Simulado” → “Questões” e depois no botão “Nova questão”.', rota: '/admin/questoes', alvo: { txt: 'Nova questão' } },
      { titulo: 'Escreva a pergunta', texto: 'Digite (ou cole) o enunciado, que é o texto da pergunta que o aluno vai responder.', rota: '/admin/questoes/nova', alvo: { sel: 'textarea' } },
      { titulo: 'Coloque as alternativas', texto: 'Se for de marcar, escreva as alternativas (A, B, C…) e marque qual é a correta.' },
      { titulo: 'Diga de onde ela é', texto: 'Preencha a banca, a matéria, o assunto, o ano e a dificuldade. Isso ajuda a achar a questão depois e a montar os relatórios.' },
      { titulo: 'Salve', texto: 'Clique em salvar e pronto — a questão fica disponível para usar nas provas.', dica: 'Dá para importar várias questões de uma vez usando uma planilha.' },
    ],
  },
  {
    id: 'criar-banco',
    titulo: 'Organizar o banco de questões',
    resumo: 'Como juntar questões em “bancos” (pastas) para reaproveitar nas provas.',
    icone: BookOpen,
    categoria: 'Conteúdo',
    rotas: ['/admin/banco-questoes'],
    link: { label: 'Ir para Banco de Questões', href: '/admin/banco-questoes' },
    passos: [
      { titulo: 'Abra o Banco de Questões', texto: 'Clique em “Simulado” → “Banco de Questões”. Pense em cada banco como uma pasta que junta questões do mesmo tema.', rota: '/admin/banco-questoes', alvo: { txt: 'Novo' } },
      { titulo: 'Crie um banco', texto: 'Clique em “Novo banco”, dê um nome (ex.: “Direito Constitucional”) e salve.' },
      { titulo: 'Coloque questões dentro', texto: 'Abra o banco e adicione as questões que fazem parte dele.' },
      { titulo: 'Use na hora de montar a prova', texto: 'Ao criar uma prova, é só filtrar por esse banco para achar as questões rapidinho.' },
    ],
  },
  {
    id: 'estudantes-grupos',
    titulo: 'Cadastrar alunos e turmas',
    resumo: 'Como cadastrar os alunos, juntá-los em turmas e liberar o acesso às provas.',
    icone: Users,
    categoria: 'Pessoas',
    rotas: ['/admin/estudantes', '/admin/grupos', '/admin/matriculas'],
    link: { label: 'Ir para Estudantes', href: '/admin/estudantes' },
    passos: [
      { titulo: 'Cadastre os alunos', texto: 'Em “Alunos” → “Estudantes”, clique em “Novo” e preencha os dados: nome, e-mail e, se quiser, CPF ou telefone.', rota: '/admin/estudantes', alvo: { txt: 'Novo' } },
      { titulo: 'Junte em turmas', texto: 'Em “Alunos” → “Grupos”, agrupe os alunos em turmas. Assim você libera uma prova para várias pessoas de uma vez.', rota: '/admin/grupos', alvo: { txt: 'Novo' } },
      { titulo: 'Controle o acesso', texto: 'Em “Alunos” → “Matrículas”, você define quem está com o acesso à plataforma liberado.', rota: '/admin/matriculas', alvo: { txt: 'Nova' } },
      { titulo: 'Libere a prova', texto: 'Na prova, escolha quais turmas ou alunos podem fazer. Só quem tem acesso liberado consegue começar.' },
    ],
  },
  {
    id: 'relatorios',
    titulo: 'Ver resultados e ranking',
    resumo: 'Como acompanhar as notas, o desempenho por matéria e a classificação dos alunos.',
    icone: BarChart3,
    categoria: 'Análise',
    rotas: ['/admin/relatorios'],
    link: { label: 'Ir para Análise', href: '/admin/relatorios' },
    passos: [
      { titulo: 'Abra “Análise”', texto: 'No menu, entre em “Análise” e escolha o tipo de relatório que quer ver.', rota: '/admin/relatorios', alvo: { txt: 'Relatório Simulado' } },
      { titulo: 'Veja o resultado de uma prova', texto: 'Em “Relatório Simulado”, clique numa prova para ver as notas, os acertos e o desempenho por matéria.', rota: '/admin/relatorios/simulados' },
      { titulo: 'Baixe em planilha', texto: 'Quer os números numa planilha? Clique em “Excel” ou “CSV” para baixar tudo, aluno por aluno.' },
      { titulo: 'Gere o ranking', texto: 'Em “Ranking”, você monta a classificação dos alunos de uma prova e ainda pode baixar em PDF.', rota: '/admin/relatorios/ranking' },
    ],
  },
  {
    id: 'caderno-prova',
    titulo: 'Montar um caderno de prova',
    resumo: 'Como montar o caderno impresso: blocos, imagem de fundo e geração do PDF.',
    icone: FileText,
    categoria: 'Cadernos',
    rotas: ['/admin/cadernos'],
    link: { label: 'Ir para Cadernos de Prova', href: '/admin/cadernos' },
    passos: [
      { titulo: 'Crie um caderno', texto: 'Abra “Simulado” → “Cadernos de Prova” e crie um caderno novo. Você pode começar do zero ou usar um modelo pronto.', rota: '/admin/cadernos', alvo: { txt: 'Novo' } },
      { titulo: 'Monte as páginas', texto: 'Arraste os blocos (capa, dados do aluno, questões, folha de respostas…) para a folha, montando o caderno do jeito que quiser.' },
      { titulo: 'Coloque a imagem de fundo', texto: 'Para usar uma imagem de fundo na folha, clique no marcador “Fundo” (no canto da folha) e envie a imagem.', dica: 'A imagem fica guardada dentro do caderno — ela não some e sai igual no PDF.' },
      { titulo: 'Gere o PDF', texto: 'Quando terminar, clique em “Imprimir/PDF” para gerar o caderno pronto.', dica: 'Com a “mala direta”, o sistema cria um caderno para cada aluno já com o nome preenchido.' },
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
