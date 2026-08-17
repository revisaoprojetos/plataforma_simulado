import type { ReacaoMascote } from '@/components/mascote/mascote'

/**
 * Passo de um tour guiado da Capi. `alvo` = valor de um [data-tour="..."] na tela (spotlight);
 * sem `alvo` = card central (intro/fecho). `rota` navega antes (se diferente da atual). `gamOnly`
 * pula o passo quando a gamificação está DESATIVADA. `topo` destaca só a faixa de cima do alvo.
 */
export type PassoTour = {
  pose: ReacaoMascote
  titulo: string
  texto: string
  alvo?: string
  rota?: string
  topo?: boolean
  gamOnly?: boolean
}

/**
 * Tours por GUIA (mesma chave do guia em guias-aluno). A Capi navega pelas páginas reais e
 * comenta cada etapa. Passos com `alvo` inexistente na tela são pulados automaticamente e os
 * `gamOnly` só entram com a gamificação ativa — então o mesmo tour serve para ON e OFF.
 */
export const TOURS_ALUNO: Record<string, PassoTour[]> = {
  // Tour COMPLETO ("Conheça o portal") — passeia pelas áreas principais de ponta a ponta.
  // Os passos gamOnly só entram com a gamificação ativa; senão o tour segue direto.
  completo: [
    { pose: 'feliz', titulo: 'Oi, eu sou a Capi! 👋', texto: 'Vem que eu te dou um tour rapidinho pelo portal — em 1 minutinho você conhece tudo!', rota: '/aluno' },
    { pose: 'satisfeita', titulo: 'Seu nível', texto: 'Aqui você acompanha seu nível — ele sobe conforme você ganha XP estudando.', alvo: 'nivel', gamOnly: true },
    { pose: 'cafe', titulo: 'Meta do dia', texto: 'Todo dia tem uma meta rapidinha pra você cumprir. 🎯', alvo: 'meta', gamOnly: true },
    { pose: 'atencao', titulo: 'Sequência 🔥', texto: 'Estude todo dia para manter a sua sequência acesa.', alvo: 'sequencia', gamOnly: true },
    { pose: 'concluido', titulo: 'Missões', texto: 'Complete missões e ganhe XP extra.', alvo: 'missoes', gamOnly: true },
    { pose: 'ideia', titulo: 'Meus Simulados', texto: 'Nesta lateral fica tudo. Comece pelos seus simulados.', alvo: 'nav-simulados' },
    { pose: 'estudante', titulo: 'Escolha e faça', texto: 'Cada card é um simulado — toque nele e depois em "Fazer".', rota: '/aluno/simulados', alvo: 'simulados-lista', topo: true },
    { pose: 'ideia', titulo: 'Crie o seu', texto: 'Na aba "Personalizados" você monta um simulado só seu.', alvo: 'aba-personalizados' },
    { pose: 'procurando', titulo: 'Banco de Questões', texto: 'Aqui você treina questão por questão, quantas vezes quiser.', alvo: 'nav-questoes' },
    { pose: 'ideia', titulo: 'Filtre do seu jeito', texto: 'Toque em "Filtros" para escolher disciplina, banca, ano — e até só as suas favoritas.', rota: '/aluno/questoes', alvo: 'banco-filtros' },
    { pose: 'coracao', titulo: 'Favorite as melhores', texto: 'Toque na estrela ⭐ de uma questão para salvá-la. Depois é só filtrar por "Favoritas" para revê-las.', alvo: 'favoritar' },
    { pose: 'ideia', titulo: 'A Trilha', texto: 'A Trilha organiza seus simulados em ordem — é só ir avançando.', alvo: 'trilha', rota: '/aluno/trilha', topo: true, gamOnly: true },
    { pose: 'balanca', titulo: 'Ligas', texto: 'Acumule XP para subir de liga e brilhar no ranking. 🏆', alvo: 'liga', rota: '/aluno/ligas', topo: true, gamOnly: true },
    { pose: 'coracao', titulo: 'Seu perfil', texto: 'No perfil ficam sua evolução da nota e o acerto por disciplina — sua evolução num olhar.', alvo: 'perfil-desempenho', rota: '/aluno/perfil' },
    { pose: 'joinha', titulo: 'Precisou de ajuda?', texto: 'É só tocar aqui na Ajuda — e me chamar de novo quando quiser! 💜', alvo: 'ajuda' },
    { pose: 'feliz', titulo: 'Tudo pronto! 🎉', texto: 'Agora é com você. Bons estudos — e conte comigo sempre que precisar!' },
  ],

  iniciar: [
    { pose: 'feliz', titulo: 'Bora fazer um simulado!', texto: 'Oi! Eu sou a Capi, sua guia por aqui. Vem que eu te mostro o caminho. 🎯', rota: '/aluno' },
    { pose: 'ideia', titulo: 'Meus Simulados', texto: 'Aqui na lateral ficam os seus simulados. É por aqui que tudo começa.', alvo: 'nav-simulados' },
    { pose: 'estudante', titulo: 'Escolha e comece', texto: 'Cada card é um simulado — toque nele e depois em "Fazer" para começar a responder.', rota: '/aluno/simulados', alvo: 'simulados-lista', topo: true },
    { pose: 'ideia', titulo: 'Monte o seu também', texto: 'Na aba "Personalizados" você cria um simulado só seu, com as questões que quiser.', alvo: 'aba-personalizados' },
    { pose: 'procurando', titulo: 'Não sabe por onde começar?', texto: 'O "Recomendado" sugere simulados sob medida pra você. Vale a espiada!', alvo: 'nav-recomendado' },
    { pose: 'concluido', titulo: 'Siga a Trilha', texto: 'Com a gamificação ativa, a Trilha organiza seus simulados em ordem — é só ir avançando!', alvo: 'nav-trilha', gamOnly: true },
    { pose: 'joinha', titulo: 'Prontinho! 💜', texto: 'É isso! Faça no seu ritmo e acompanhe seus resultados depois. Qualquer dúvida, me chame na Ajuda.' },
  ],

  personalizados: [
    { pose: 'ideia', titulo: 'Crie um simulado seu!', texto: 'Vou te mostrar como montar um simulado só seu, com as questões que você escolher. ✨', rota: '/aluno' },
    { pose: 'estudante', titulo: 'Vá em Meus Simulados', texto: 'Tudo começa aqui, na lateral.', alvo: 'nav-simulados' },
    { pose: 'ideia', titulo: 'Aba "Personalizados"', texto: 'Toque nesta aba para ver e criar os seus simulados.', rota: '/aluno/simulados?aba=personalizados', alvo: 'aba-personalizados' },
    { pose: 'escrevendo', titulo: 'Criar simulado', texto: 'Toque em "Criar simulado" para abrir o construtor em etapas.', alvo: 'criar-simulado' },
    { pose: 'pensando', titulo: 'Escolha e personalize', texto: 'No construtor você seleciona as questões (pode filtrar só as favoritas!), define tempo e modo, e escolhe a cor e o ícone da capa.' },
    { pose: 'joinha', titulo: 'Faça e acompanhe 💜', texto: 'Depois é só "Fazer" — o resultado fica igual ao dos oficiais: nota, revisão das questões e download.' },
  ],

  responder: [
    { pose: 'estudante', titulo: 'Respondendo as questões', texto: 'Dentro do simulado é bem simples — deixa eu te explicar o essencial. 📝', rota: '/aluno' },
    { pose: 'ideia', titulo: 'Marque a alternativa', texto: 'Toque na letra (A, B, C…) para marcar sua resposta. Pode trocar quantas vezes quiser.' },
    { pose: 'pensando', titulo: 'Use a tesoura ✂️', texto: 'Já eliminou uma alternativa? Toque na tesoura ao lado dela para riscá-la e focar no que resta.' },
    { pose: 'atencao', titulo: 'Marque para revisar', texto: 'Ficou na dúvida? Marque a questão para revisar e volte nela antes de enviar.' },
    { pose: 'joinha', titulo: 'Revise e envie', texto: 'No fim, a tela de revisão mostra respondidas, em branco e marcadas. Confira com calma e envie! ✅' },
  ],

  baixar: [
    { pose: 'procurando', titulo: 'Baixar caderno e materiais', texto: 'Dá para baixar o caderno de questões, a folha de respostas e o gabarito em PDF. Te mostro onde. 📄', rota: '/aluno/simulados' },
    { pose: 'ideia', titulo: 'Abra um simulado concluído', texto: 'Toque num simulado que você já finalizou para ver o resultado.', alvo: 'simulados-lista', topo: true },
    { pose: 'estudante', titulo: 'Baixe pelas realizações', texto: 'No card "Realizações", cada tentativa tem os downloads separados: "Sem gabarito" e "Com gabarito".' },
    { pose: 'joinha', titulo: 'É só tocar', texto: 'Toque no material desejado e o PDF é gerado para você. Simples assim! 💜' },
  ],

  resultado: [
    { pose: 'estudante', titulo: 'Ver resultado e desempenho', texto: 'Depois de concluir, seus simulados ficam guardadinhos aqui. 📊', rota: '/aluno/simulados', alvo: 'nav-simulados' },
    { pose: 'ideia', titulo: 'Abra e explore', texto: 'Toque num simulado concluído para ver nota, acerto por matéria e a revisão das questões.', alvo: 'simulados-lista', topo: true },
    { pose: 'coracao', titulo: 'Seu perfil', texto: 'No seu perfil tem a evolução da nota (barras ou linha) e o acerto por disciplina — sua evolução num olhar.', alvo: 'perfil-desempenho', rota: '/aluno/perfil' },
    { pose: 'satisfeita', titulo: 'Nível & XP', texto: 'Com a gamificação, seu nível e XP também aparecem no topo do perfil.', alvo: 'perfil-nivel', gamOnly: true },
    { pose: 'balanca', titulo: 'Suba nas Ligas', texto: 'E cada simulado te leva mais longe nas Ligas!', alvo: 'nav-liga', gamOnly: true },
  ],

  banco: [
    { pose: 'procurando', titulo: 'Banco de Questões', texto: 'Aqui você treina questão por questão, quantas vezes quiser. 🔎', alvo: 'nav-questoes' },
    { pose: 'ideia', titulo: 'Filtre do seu jeito', texto: 'Toque em "Filtros" para escolher disciplina, banca, ano — e até só as suas favoritas.', rota: '/aluno/questoes', alvo: 'banco-filtros' },
    { pose: 'coracao', titulo: 'Favorite as melhores', texto: 'Toque na estrela ⭐ da questão para salvá-la. Depois é só marcar "Favoritas" nos filtros para revê-las.', alvo: 'favoritar' },
    { pose: 'estudante', titulo: 'Responda e confira', texto: 'Marque a alternativa e toque em "Resolver" para ver o gabarito e o comentário na hora.', alvo: 'banco-lista', topo: true },
    { pose: 'joinha', titulo: 'Treine à vontade 💜', texto: 'Sem limite de tentativas por aqui — pratique quanto quiser e volte sempre!' },
  ],

  gamificacao: [
    { pose: 'balanca', titulo: 'Trilha, Ligas e XP! 🏆', texto: 'Bora conhecer a gamificação? Aqui você ganha XP, sobe de liga e completa missões. Vem comigo!', rota: '/aluno', gamOnly: true },
    { pose: 'satisfeita', titulo: 'Seu nível', texto: 'Cada simulado e prática rendem XP — e o XP faz o seu nível subir. Este é o seu nível atual.', alvo: 'nivel', gamOnly: true },
    { pose: 'cafe', titulo: 'Meta do dia', texto: 'A meta diária te dá um objetivo pra hoje. Cumpra e ganhe XP!', alvo: 'meta', gamOnly: true },
    { pose: 'atencao', titulo: 'Mantenha a sequência 🔥', texto: 'Estude todo dia para não perder a sua sequência (streak).', alvo: 'sequencia', gamOnly: true },
    { pose: 'concluido', titulo: 'Missões', texto: 'Complete missões para ganhar XP extra e acelerar seu nível.', alvo: 'missoes', gamOnly: true },
    { pose: 'ideia', titulo: 'A Trilha', texto: 'A Trilha organiza seus simulados em ordem — vá avançando pelos nós.', alvo: 'trilha', rota: '/aluno/trilha', topo: true, gamOnly: true },
    { pose: 'balanca', titulo: 'Suba de liga', texto: 'Acumule XP para subir na escada de ligas.', alvo: 'liga', rota: '/aluno/ligas', topo: true, gamOnly: true },
    { pose: 'estudante', titulo: 'Ranking', texto: 'E acompanhe sua posição no ranking da sua liga.', alvo: 'ranking', gamOnly: true },
    { pose: 'joinha', titulo: 'É isso! 💜', texto: 'Estude, ganhe XP e suba no ranking. Cada dia conta — bora?', gamOnly: true },
  ],

  reportar: [
    { pose: 'atencao', titulo: 'Reportar um erro', texto: 'Achou algo estranho numa questão? Você pode avisar a equipe. 🚩', rota: '/aluno' },
    { pose: 'escrevendo', titulo: 'Abra a questão', texto: 'Na revisão de um simulado, cada questão tem a opção "Reportar erro".' },
    { pose: 'ideia', titulo: 'Descreva o problema', texto: 'Escolha o tipo (gabarito, enunciado…) e conte o que houve. Na tela de resultado, a aba "Avaliação" também reporta um problema geral.' },
    { pose: 'joinha', titulo: 'Obrigada! 💜', texto: 'Seu report ajuda a melhorar o banco para todo mundo. Valeu demais!' },
  ],
}
