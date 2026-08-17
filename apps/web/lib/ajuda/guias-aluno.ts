import { PlayCircle, ListChecks, Download, BarChart3, BookOpen, Flag, Wand2, Trophy } from 'lucide-react'

export type PassoAluno = { t: string; d: string; dica?: string }
export type GuiaAluno = {
  id: string
  titulo: string
  resumo: string
  icon: React.ComponentType<{ className?: string }>
  link?: { href: string; label: string }
  /** Só faz sentido com a gamificação ATIVA (ex.: Trilha/Ligas/XP). Escondido quando desativada. */
  gamOnly?: boolean
  passos: PassoAluno[]
}

// Guias de ajuda do PORTAL DO ALUNO — usados na página (/aluno/ajuda) e no drawer lateral ("?").
// Cada guia tem um tour guiado (TOURS_ALUNO, chave = id) acionado pelo "Iniciar passo a passo".
export const GUIAS_ALUNO: GuiaAluno[] = [
  {
    id: 'iniciar', titulo: 'Como iniciar um simulado', resumo: 'Do menu até o cronômetro começar.', icon: PlayCircle, link: { href: '/aluno/simulados', label: 'Ir para Simulados' },
    passos: [
      { t: 'Abra "Meus Simulados"', d: 'No menu à esquerda, toque em Meus Simulados para ver o que está disponível para você.' },
      { t: 'Escolha o simulado', d: 'Toque no card do simulado. Você verá as regras: tempo, número de tentativas e questões.' },
      { t: 'Toque em "Fazer"', d: 'Ao iniciar, o cronômetro começa (nos modos cronometrados). Você pode responder na ordem que quiser.', dica: 'Sem saber por onde começar? O "Recomendado" sugere simulados pra você.' },
    ],
  },
  {
    id: 'personalizados', titulo: 'Criar seu próprio simulado', resumo: 'Monte um simulado só seu, com as questões que quiser.', icon: Wand2, link: { href: '/aluno/simulados?aba=personalizados', label: 'Abrir Personalizados' },
    passos: [
      { t: 'Aba "Personalizados"', d: 'Em Meus Simulados, toque na aba "Personalizados".' },
      { t: 'Criar simulado', d: 'Toque em "Criar simulado" para abrir o construtor em etapas.' },
      { t: 'Escolha as questões e a capa', d: 'Selecione as questões (das que você tem acesso), defina tempo e modo, e a aparência (cor + ícone) da capa.', dica: 'Dá para mostrar só as favoritas na hora de escolher.' },
      { t: 'Faça e acompanhe', d: 'Depois é só "Fazer" — e o resultado fica igual ao dos simulados oficiais: nota, revisão e download.' },
    ],
  },
  {
    id: 'responder', titulo: 'Respondendo as questões', resumo: 'Marcar, cortar alternativas, revisar e enviar.', icon: ListChecks,
    passos: [
      { t: 'Marque a alternativa', d: 'Toque na letra (A–E) que você acha correta. Sua resposta é salva na hora — pode trocar quantas vezes quiser.' },
      { t: 'Use a tesoura', d: 'Corte as alternativas que já descartou para focar nas que sobraram.' },
      { t: 'Marque para revisar', d: 'Ficou em dúvida? Marque a questão e volte nela antes de enviar.' },
      { t: 'Revise e envie', d: 'Na tela de revisão você vê o que respondeu, o que ficou em branco e o que marcou. Aí é só enviar.', dica: 'Depois de enviar não dá para voltar — confira a revisão com calma.' },
    ],
  },
  {
    id: 'baixar', titulo: 'Baixar o caderno e materiais', resumo: 'Onde clicar para baixar em PDF.', icon: Download,
    passos: [
      { t: 'Abra um simulado concluído', d: 'Em Meus Simulados, toque num simulado que você já finalizou para ver o resultado.' },
      { t: 'Baixe pelas realizações', d: 'No card "Realizações", cada tentativa traz os downloads separados: "Sem gabarito" e "Com gabarito".' },
      { t: 'Escolha o que baixar', d: 'Toque no material desejado (caderno de questões, folha de respostas, gabarito comentado…) e o PDF é gerado.' },
    ],
  },
  {
    id: 'resultado', titulo: 'Ver resultado e desempenho', resumo: 'Sua nota, acertos por matéria e evolução.', icon: BarChart3, link: { href: '/aluno/perfil', label: 'Abrir meu perfil' },
    passos: [
      { t: 'Abra "Meus Simulados"', d: 'Cada simulado finalizado mostra a nota; toque para ver a revisão completa e o desempenho por matéria.' },
      { t: 'Veja seu perfil', d: 'No seu perfil ficam a evolução da nota (em barras ou linha, com filtro por período) e o acerto por disciplina.' },
    ],
  },
  {
    id: 'banco', titulo: 'Banco de questões e favoritos', resumo: 'Treine questões avulsas e organize seu estudo.', icon: BookOpen, link: { href: '/aluno/questoes', label: 'Abrir Banco de Questões' },
    passos: [
      { t: 'Banco de Questões', d: 'Resolva questões avulsas quantas vezes quiser.' },
      { t: 'Filtre do seu jeito', d: 'Toque em "Filtros" e escolha disciplina, banca, dificuldade, ano — e até só as suas favoritas.' },
      { t: 'Favorite as melhores', d: 'Toque na estrela ⭐ de uma questão para salvá-la nos Favoritos e revê-la depois.' },
      { t: 'Cadernos', d: 'Em "Cadernos" você organiza questões para revisar de forma agrupada.' },
    ],
  },
  {
    id: 'gamificacao', titulo: 'Trilha, Ligas e XP', resumo: 'Ganhe XP, mantenha a sequência e suba de liga.', icon: Trophy, gamOnly: true, link: { href: '/aluno/trilha', label: 'Abrir a Trilha' },
    passos: [
      { t: 'Ganhe XP e suba de nível', d: 'Cada simulado e prática rendem XP — e o XP faz o seu nível subir.' },
      { t: 'Meta do dia e sequência', d: 'Cumpra a meta diária e estude todo dia para manter a sequência (streak) 🔥.' },
      { t: 'Missões', d: 'Complete missões para ganhar XP extra.' },
      { t: 'Trilha', d: 'A Trilha organiza seus simulados em ordem — vá avançando pelos nós.' },
      { t: 'Ligas e ranking', d: 'Acumule XP para subir de liga e acompanhar sua posição no ranking.' },
    ],
  },
  {
    id: 'reportar', titulo: 'Reportar um erro numa questão', resumo: 'Achou um problema? Avise a equipe.', icon: Flag,
    passos: [
      { t: 'Abra a questão', d: 'Na revisão de um simulado, cada questão tem a opção "Reportar erro".' },
      { t: 'Descreva o problema', d: 'Escolha o motivo (gabarito, enunciado, desatualizada…) e explique. A equipe recebe e te responde.', dica: 'Na tela de resultado também há a aba "Avaliação" para reportar um problema geral do simulado.' },
    ],
  },
]
