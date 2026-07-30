import { PlayCircle, ListChecks, Download, BarChart3, BookOpen, Flag } from 'lucide-react'

export type PassoAluno = { t: string; d: string; dica?: string }
export type GuiaAluno = {
  id: string
  titulo: string
  resumo: string
  icon: React.ComponentType<{ className?: string }>
  link?: { href: string; label: string }
  passos: PassoAluno[]
}

// Guias de ajuda do PORTAL DO ALUNO — usados na página (/aluno/ajuda) e no drawer lateral ("?").
export const GUIAS_ALUNO: GuiaAluno[] = [
  {
    id: 'iniciar', titulo: 'Como iniciar um simulado', resumo: 'Do menu até o cronômetro começar.', icon: PlayCircle, link: { href: '/aluno/simulado', label: 'Ir para Simulados' },
    passos: [
      { t: 'Abra "Simulados"', d: 'No menu à esquerda, toque em Simulados para ver o que está disponível para você.' },
      { t: 'Escolha o simulado', d: 'Clique no card do simulado. Você verá as regras: tempo, número de tentativas e questões.' },
      { t: 'Toque em "Iniciar"', d: 'Ao iniciar, o cronômetro começa. Você pode responder na ordem que quiser.', dica: 'Prefere ver antes? Alguns simulados deixam você baixar o caderno pelos 3 pontinhos do card.' },
    ],
  },
  {
    id: 'responder', titulo: 'Respondendo as questões', resumo: 'Marcar, cortar alternativas, revisar e enviar.', icon: ListChecks,
    passos: [
      { t: 'Marque a alternativa', d: 'Clique na letra (A–E) que você acha correta. Sua resposta é salva na hora — pode trocar quantas vezes quiser.' },
      { t: 'Use a tesoura', d: 'Corte as alternativas que já descartou para focar nas que sobraram.' },
      { t: 'Marque para revisar', d: 'Ficou em dúvida? Marque a questão e volte nela antes de enviar.' },
      { t: 'Revise e envie', d: 'Na tela de revisão você vê o que respondeu, o que ficou em branco e o que marcou. Aí é só enviar.', dica: 'Depois de enviar não dá para voltar — confira a revisão com calma.' },
    ],
  },
  {
    id: 'baixar', titulo: 'Baixar o caderno e materiais', resumo: 'Onde clicar para baixar em PDF.', icon: Download,
    passos: [
      { t: 'Abra o simulado ou o resultado', d: 'Entre no simulado (ou no seu resultado, se já finalizou).' },
      { t: 'Toque nos 3 pontos do card', d: 'No canto do card há um menu (⋮) com as opções: caderno de questões, gabarito e material.' },
      { t: 'Escolha o que baixar', d: 'O PDF é gerado e baixado. O caderno vem na sua ordem de questões.' },
    ],
  },
  {
    id: 'resultado', titulo: 'Ver resultado e desempenho', resumo: 'Sua nota, acertos por matéria e evolução.', icon: BarChart3, link: { href: '/aluno/desempenho', label: 'Abrir Meu Desempenho' },
    passos: [
      { t: 'Abra "Meu Desempenho"', d: 'Veja sua evolução, acertos por disciplina e a comparação com a turma.' },
      { t: 'Abra "Meus Simulados"', d: 'Cada simulado finalizado mostra sua nota e o gabarito (quando liberado).' },
    ],
  },
  {
    id: 'banco', titulo: 'Banco de questões e favoritos', resumo: 'Treine questões avulsas e organize seu estudo.', icon: BookOpen, link: { href: '/aluno/questoes', label: 'Abrir Banco de Questões' },
    passos: [
      { t: 'Banco de Questões', d: 'Resolva questões avulsas com filtros por matéria, banca, dificuldade e ano — quantas vezes quiser.' },
      { t: 'Favoritos', d: 'Salve questões importantes tocando na estrela para revê-las depois.' },
      { t: 'Cadernos', d: 'Monte cadernos de estudo com as questões que quer revisar.' },
    ],
  },
  {
    id: 'reportar', titulo: 'Reportar um erro numa questão', resumo: 'Achou um problema? Avise a equipe.', icon: Flag,
    passos: [
      { t: 'Abra a questão', d: 'Na questão, procure a opção "Reportar erro".' },
      { t: 'Descreva o problema', d: 'Escolha o motivo (gabarito, enunciado, desatualizada) e explique. A equipe recebe e te responde.' },
    ],
  },
]
