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
 * comenta cada etapa. Passos com `alvo` inexistente na tela são pulados automaticamente — então
 * o mesmo tour serve para gamificação ON e OFF (os passos `gamOnly` só entram quando ativa).
 */
export const TOURS_ALUNO: Record<string, PassoTour[]> = {
  iniciar: [
    { pose: 'feliz', titulo: 'Bora fazer um simulado!', texto: 'Oi! Eu sou a Capi e vou te mostrar o caminho. Vem comigo! 🎯', rota: '/aluno' },
    { pose: 'ideia', titulo: 'Meus Simulados', texto: 'Aqui na lateral ficam os seus simulados. É por aqui que tudo começa.', alvo: 'nav-simulados' },
    { pose: 'estudante', titulo: 'Escolha e comece', texto: 'Cada card é um simulado — toque nele e depois em "Fazer" para começar a responder.', rota: '/aluno/simulados', alvo: 'simulados-lista', topo: true },
    { pose: 'ideia', titulo: 'Monte o seu também', texto: 'Na aba "Personalizados" você cria um simulado só seu, com as questões que quiser.', alvo: 'aba-personalizados' },
    { pose: 'concluido', titulo: 'Siga a Trilha', texto: 'Com a gamificação ativa, a Trilha organiza seus simulados em ordem — é só ir avançando!', alvo: 'nav-trilha', gamOnly: true },
    { pose: 'joinha', titulo: 'Prontinho! 💜', texto: 'É isso! Faça no seu ritmo e acompanhe seus resultados depois. Qualquer dúvida, é só me chamar na Ajuda.' },
  ],

  responder: [
    { pose: 'estudante', titulo: 'Respondendo as questões', texto: 'Dentro do simulado é bem simples — deixa eu te explicar o básico. 📝', rota: '/aluno' },
    { pose: 'ideia', titulo: 'Marque a alternativa', texto: 'Toque na letra (A, B, C…) para marcar sua resposta. Pode trocar quantas vezes quiser.' },
    { pose: 'pensando', titulo: 'Use a tesoura ✂️', texto: 'Riscou uma alternativa que você já eliminou? Toque na tesoura ao lado dela.' },
    { pose: 'atencao', titulo: 'Marque para revisar', texto: 'Ficou na dúvida? Marque a questão para revisar e volte nela antes de enviar.' },
    { pose: 'joinha', titulo: 'Revise e envie', texto: 'No fim, a tela de revisão mostra respondidas, em branco e marcadas. Confira e envie! ✅' },
  ],

  baixar: [
    { pose: 'procurando', titulo: 'Baixar caderno e materiais', texto: 'Dá para baixar o caderno de questões e o gabarito em PDF. Te mostro onde. 📄', rota: '/aluno/simulados' },
    { pose: 'ideia', titulo: 'Abra um simulado', texto: 'Toque em um simulado concluído para ver o resultado.', alvo: 'simulados-lista', topo: true },
    { pose: 'estudante', titulo: 'Baixe pelas tentativas', texto: 'No resultado, cada realização tem os downloads: "Sem gabarito" e "Com gabarito".' },
    { pose: 'joinha', titulo: 'É só tocar', texto: 'Toque no material desejado e o PDF é gerado para você. Simples assim! 💜' },
  ],

  resultado: [
    { pose: 'estudante', titulo: 'Ver resultado e desempenho', texto: 'Depois de concluir, seus simulados ficam guardadinhos aqui. 📊', rota: '/aluno/simulados', alvo: 'nav-simulados' },
    { pose: 'ideia', titulo: 'Abra e explore', texto: 'Toque num simulado concluído para ver nota, acerto por matéria e a revisão das questões.', alvo: 'simulados-lista', topo: true },
    { pose: 'coracao', titulo: 'Seu perfil', texto: 'No seu perfil tem a evolução da nota e o acerto por disciplina — sua evolução num olhar.', alvo: 'perfil', rota: '/aluno/perfil', topo: true },
    { pose: 'balanca', titulo: 'Suba nas Ligas', texto: 'Com a gamificação, cada simulado dá XP e te leva mais longe nas Ligas!', alvo: 'nav-liga', gamOnly: true },
  ],

  banco: [
    { pose: 'procurando', titulo: 'Banco de Questões', texto: 'Aqui você treina questão por questão, quantas vezes quiser. 🔎', alvo: 'nav-questoes' },
    { pose: 'ideia', titulo: 'Filtre do seu jeito', texto: 'Toque em "Filtros" para escolher disciplina, banca, ano — e até só as suas favoritas.', rota: '/aluno/questoes', alvo: 'banco-filtros' },
    { pose: 'coracao', titulo: 'Favorite as melhores', texto: 'Toque na estrela ⭐ de uma questão para salvá-la. Ela vira favorita na hora.', alvo: 'banco-lista', topo: true },
    { pose: 'satisfeita', titulo: 'Suas favoritas', texto: 'Todas as questões favoritas ficam reunidas em "Favoritos".', alvo: 'nav-favoritos' },
  ],

  reportar: [
    { pose: 'atencao', titulo: 'Reportar um erro', texto: 'Achou algo estranho numa questão? Você pode avisar a equipe. 🚩', rota: '/aluno' },
    { pose: 'escrevendo', titulo: 'Abra a questão', texto: 'Na revisão de um simulado ou no banco, cada questão tem a opção "Reportar erro".' },
    { pose: 'ideia', titulo: 'Descreva o problema', texto: 'Escolha o tipo (gabarito, enunciado…) e conte o que houve. Simples e rápido.' },
    { pose: 'joinha', titulo: 'Obrigada! 💜', texto: 'Seu report ajuda a melhorar o banco para todo mundo. Valeu demais!' },
  ],
}
