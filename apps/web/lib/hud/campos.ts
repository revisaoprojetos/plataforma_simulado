import { Loader2, LogIn, DoorOpen, ListChecks, CheckCircle2 } from 'lucide-react'
import { ESTILOS_PROVA_LOADING } from '@/components/prova/prova-intro'
import type { LoginResultadoTipo } from '@/components/prova/login-popups'
import type { HudCores } from '@/lib/caderno-designer/types'

// Config compartilhada do editor de HUD (páginas, grupos de campos, demos) — usada pelo editor v1
// (hud-simulado-editor) e pelo designer novo do banco (banco-hud-designer).

export type ScreenKey = 'loading' | 'login' | 'entrada' | 'prova' | 'encerrada'

export const SCREENS: { key: ScreenKey; label: string; icon: typeof Loader2 }[] = [
  { key: 'loading', label: 'Carregamento', icon: Loader2 },
  { key: 'login', label: 'Login', icon: LogIn },
  { key: 'entrada', label: 'Entrada', icon: DoorOpen },
  { key: 'prova', label: 'Prova', icon: ListChecks },
  { key: 'encerrada', label: 'Prova encerrada', icon: CheckCircle2 },
]

export type HudGrupo = { titulo: string; pages: ScreenKey[] | 'all'; desc?: string; campos: { k: keyof HudCores; label: string; desc: string; select?: { v: string; label: string }[] }[] }

export const GRUPOS: HudGrupo[] = [
  { titulo: 'Base da tela', pages: 'all', campos: [
    { k: 'fundo', label: 'Fundo da tela', desc: 'Cor de fundo geral' },
    { k: 'texto', label: 'Texto', desc: 'Cor do texto geral' },
    { k: 'textoSecundario', label: 'Texto secundário', desc: 'Rótulos e textos auxiliares (cinza)' },
    { k: 'superficie', label: 'Superfície suave', desc: 'Fundos cinza (caixas, chips, campos)' },
    { k: 'borda', label: 'Bordas', desc: 'Contornos e divisórias' },
  ] },
  { titulo: 'Carregamento', pages: ['loading'], campos: [
    { k: 'loadingTipo', label: 'Estilo da animação', desc: 'Formato do indicador de carregamento', select: ESTILOS_PROVA_LOADING.map((e) => ({ v: e.id, label: e.nome })) },
    { k: 'loadingCor', label: 'Cor do carregamento', desc: 'Barra/indicador de loading' },
    { k: 'loadingTexto', label: 'Cor do texto', desc: 'Texto "Carregando…"' },
    { k: 'loadingPct', label: 'Cor da porcentagem', desc: 'Número "%" (estilo Logo + Porcentagem)' },
  ] },
  { titulo: 'Página de login', pages: ['login'], campos: [
    { k: 'card', label: 'Fundo dos cards', desc: 'Cards de informações e identificação' },
    { k: 'tituloTexto', label: 'Texto do título', desc: 'Cor do nome do simulado' },
    { k: 'loginDestaque', label: 'Destaque "plataforma do…"', desc: 'Cor do texto em destaque no login' },
    { k: 'primaria', label: 'Ícones dos cards', desc: 'Ícones dos cabeçalhos dos cards' },
    { k: 'loginBotao', label: 'Botão "Iniciar simulado"', desc: 'Fundo do botão de iniciar' },
    { k: 'loginInputBg', label: 'Fundo da caixa de texto', desc: 'Campos de e-mail/CPF/telefone' },
    { k: 'sitNaoIniciado', label: 'Selo: não iniciado', desc: 'Cor do selo quando ainda não começou' },
    { k: 'sitAndamento', label: 'Selo: em andamento', desc: 'Cor do selo durante o período' },
    { k: 'sitEncerrado', label: 'Selo: encerrado', desc: 'Cor do selo após o encerramento' },
    { k: 'sitDisponivel', label: 'Selo: disponível', desc: 'Cor do selo quando sempre disponível' },
    { k: 'aviso', label: 'Pop-up: não liberado', desc: 'Cor do pop-up "simulado não liberado"' },
    { k: 'alerta', label: 'Pop-up: erro / encerrado', desc: 'Cor do pop-up de e-mail inválido / encerrado' },
  ] },
  { titulo: 'Entrada (pop-up)', pages: ['entrada'], campos: [
    { k: 'card', label: 'Fundo do card', desc: 'Card do pop-up de entrada' },
    { k: 'tituloTexto', label: 'Título e ícone', desc: 'Ícone e texto do topo do pop-up' },
    { k: 'entradaTempo', label: 'Tempo restante', desc: 'Valor do tempo restante' },
    { k: 'entradaBotao', label: 'Botão iniciar', desc: 'Fundo do botão do pop-up' },
  ] },
  { titulo: 'Barra superior', pages: ['prova'], campos: [
    { k: 'topbar', label: 'Fundo da barra', desc: 'Cor da top bar (header)' },
    { k: 'topbarTexto', label: 'Texto da barra', desc: 'Título e contador de questão' },
    { k: 'timer', label: 'Tempo (número)', desc: 'Número do cronômetro (normal)' },
    { k: 'timerFundo', label: 'Tempo (fundo)', desc: 'Fundo da pílula do cronômetro' },
    { k: 'alerta', label: 'Tempo (quando acaba)', desc: 'Cronômetro quando o tempo está acabando' },
  ] },
  { titulo: 'Questões e alternativas', pages: ['prova'], campos: [
    { k: 'card', label: 'Fundo do card da questão', desc: 'Enunciado da questão' },
    { k: 'primaria', label: 'Questão atual / progresso', desc: 'Destaque da questão atual e barra de progresso' },
    { k: 'finalizar', label: 'Botão Finalizar', desc: 'Botão de finalizar + "Enviar simulado" / "Confirmar envio" da revisão' },
    { k: 'selecionada', label: 'Alternativa marcada', desc: 'Borda, letra e fundo (versão clara) da selecionada' },
    { k: 'altFundo', label: 'Alternativa — fundo', desc: 'Fundo das alternativas (normal)' },
    { k: 'altHover', label: 'Alternativa — mouse por cima', desc: 'Fundo ao passar o mouse' },
  ] },
  { titulo: 'Navegador de questões', pages: ['prova'], campos: [
    { k: 'respondida', label: 'Marcadas (respondidas)', desc: 'Questões já respondidas (navegador e revisão do simulado)' },
    { k: 'anulada', label: 'Anuladas (bloqueadas)', desc: 'Questões anuladas/desatualizadas no navegador — ponto garantido, não respondíveis. Padrão azul.' },
    { k: 'revisar', label: 'Revisar (marcar)', desc: 'Botão Revisar + flag no navegador' },
  ] },
  { titulo: 'Encerrada · barra e cards', pages: ['encerrada'], campos: [
    { k: 'card', label: 'Fundo dos cards', desc: 'Resumo, questões e navegador' },
    { k: 'topbar', label: 'Fundo da barra', desc: 'Cor da top bar (header)' },
    { k: 'topbarTexto', label: 'Texto da barra', desc: 'Texto/ícone da barra superior' },
  ] },
  { titulo: 'Encerrada · botões (normal e ao passar o mouse)', pages: ['encerrada'], desc: 'Cada botão tem cor de texto e de fundo no estado normal e no estado ativo (ao passar o mouse).', campos: [
    { k: 'cadernoBtn', label: 'Caderno — texto (normal)', desc: 'Texto/borda dos botões de caderno' },
    { k: 'cadernoBtnFundo', label: 'Caderno — fundo (normal)', desc: 'Fundo dos botões de caderno' },
    { k: 'cadernoBtnAtivo', label: 'Caderno — texto (ativo)', desc: 'Texto/borda ao passar o mouse' },
    { k: 'cadernoBtnFundoAtivo', label: 'Caderno — fundo (ativo)', desc: 'Fundo ao passar o mouse' },
    { k: 'inicioBtn', label: 'Voltar ao início — texto (normal)', desc: 'Texto/borda do botão Voltar ao início' },
    { k: 'inicioBtnFundo', label: 'Voltar ao início — fundo (normal)', desc: 'Fundo do botão Voltar ao início' },
    { k: 'inicioBtnAtivo', label: 'Voltar ao início — texto (ativo)', desc: 'Texto/borda ao passar o mouse' },
    { k: 'inicioBtnFundoAtivo', label: 'Voltar ao início — fundo (ativo)', desc: 'Fundo ao passar o mouse' },
    { k: 'voltarBtn', label: 'Meus simulados — texto (normal)', desc: 'Texto do botão Meus simulados' },
    { k: 'voltarBtnFundo', label: 'Meus simulados — fundo (normal)', desc: 'Fundo do botão Meus simulados' },
    { k: 'voltarBtnAtivo', label: 'Meus simulados — texto (ativo)', desc: 'Texto ao passar o mouse' },
    { k: 'voltarBtnFundoAtivo', label: 'Meus simulados — fundo (ativo)', desc: 'Fundo ao passar o mouse' },
  ] },
  { titulo: 'Encerrada · resultados', pages: ['encerrada'], desc: 'Uma cor por estado — vale para o card, o navegador e as questões. O fundo é uma versão mais clara dela.', campos: [
    { k: 'acerto', label: 'Acerto', desc: 'Acertadas: card, navegador e questões' },
    { k: 'erro', label: 'Erro', desc: 'Erradas: card, navegador e questões' },
    { k: 'branco', label: 'Em branco', desc: 'Card de em branco' },
    { k: 'media', label: 'Média', desc: 'Card de média' },
  ] },
  { titulo: 'Encerrada · navegador e questões', pages: ['encerrada'], desc: 'Cores sólidas; o fundo da questão é uma versão mais clara.', campos: [
    { k: 'respondida', label: 'Respondida', desc: 'Questão respondida (gabarito não liberado)' },
    { k: 'anulada', label: 'Anulada', desc: 'Questão anulada — cor sólida + fundo claro' },
    { k: 'altTrocada', label: 'Gabarito alterado', desc: 'Questão alterada — cor sólida + fundo claro' },
  ] },
  { titulo: 'Fita dos cards', pages: ['login', 'entrada', 'prova', 'encerrada'], campos: [
    { k: 'fita1', label: 'Fita — cor 1', desc: 'Início do gradiente' },
    { k: 'fita2', label: 'Fita — cor 2', desc: 'Meio do gradiente' },
    { k: 'fita3', label: 'Fita — cor 3', desc: 'Fim do gradiente' },
  ] },
]

/** Situação exibida no selo do login, por tab de pop-up. */
export const STATUS_POR_TAB: Record<'form' | LoginResultadoTipo, string> = {
  form: 'Em andamento', sucesso: 'Em andamento', email_invalido: 'Em andamento',
  nao_iniciado: 'Não iniciado', encerrado: 'Encerrado',
}

/** Questão de exemplo p/ a prévia. */
export const DEMO_Q = {
  id: 'demo', enunciado: 'Qual é a capital da França?', disciplina: 'Direito Constitucional',
  alternativas: [{ id: 'a', texto: 'Londres' }, { id: 'b', texto: 'Paris' }, { id: 'c', texto: 'Roma' }],
}
export const DEMO_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="220"><rect width="480" height="220" fill="#e2e8f0"/><text x="240" y="32" font-family="sans-serif" font-size="15" fill="#334155" text-anchor="middle">Imagem de exemplo da questão</text><rect x="60" y="140" width="52" height="55" fill="#94a3b8"/><rect x="140" y="110" width="52" height="85" fill="#64748b"/><rect x="220" y="78" width="52" height="117" fill="#475569"/><rect x="300" y="118" width="52" height="77" fill="#64748b"/><rect x="380" y="95" width="52" height="100" fill="#94a3b8"/></svg>')
