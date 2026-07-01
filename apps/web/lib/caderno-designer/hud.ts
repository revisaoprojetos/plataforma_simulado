import type { HudCores } from './types'

function contraste(hex: string): string {
  const h = (hex || '#000').replace('#', '')
  if (h.length < 6) return '#fff'
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#18181b' : '#ffffff'
}

/**
 * Mapeia as cores do HUD do caderno para as CSS variables do tema. Aplicar o
 * objeto retornado em `style` de um container recolore o <ProvaHud> dentro dele.
 *
 * `dark`: no modo escuro as SUPERFÍCIES (fundo/card/texto/bordas/topbar/inputs…)
 * vêm do tema escuro do sistema (`.dark`), e só os ACENTOS do caderno (marca,
 * fita, situações, acerto/erro, etc.) são aplicados.
 */
export function hudCssVars(c: HudCores, dark = false): Record<string, string> {
  const muted = `color-mix(in oklab, ${c.texto} 10%, ${c.fundo})`
  const mutedFg = `color-mix(in oklab, ${c.texto} 55%, ${c.fundo})`

  // Acentos do caderno — aplicados em claro E escuro.
  const acentos: Record<string, string> = {
    '--primary': c.primaria,
    '--primary-foreground': contraste(c.primaria),
    '--ring': c.primaria,
    '--destructive': c.alerta,
    '--prova-aviso': c.aviso,
    '--prova-selecionada': c.selecionada,
    '--prova-finalizar': c.finalizar,
    '--prova-marcada': c.respondida,
    '--prova-revisar': c.revisar,
    '--prova-anulada': c.anulada,
    '--prova-alt': c.altTrocada,
    '--prova-acerto': c.acerto,
    '--prova-erro': c.erro,
    '--prova-branco': c.branco,
    '--prova-media': c.media,
    '--prova-loading': c.loadingCor,
    '--prova-titulo': c.tituloTexto,
    '--prova-login-destaque': c.loginDestaque,
    '--prova-login-botao': c.loginBotao,
    '--prova-entrada-botao': c.entradaBotao,
    '--prova-entrada-tempo': c.entradaTempo,
    '--prova-sit-nao-iniciado': c.sitNaoIniciado,
    '--prova-sit-andamento': c.sitAndamento,
    '--prova-sit-encerrado': c.sitEncerrado,
    '--prova-sit-disponivel': c.sitDisponivel,
    '--prova-caderno-btn': c.cadernoBtn,
    '--prova-voltar-btn': c.voltarBtn,
    '--prova-voltar-btn-fundo': c.voltarBtnFundo,
    '--prova-fita1': c.fita1,
    '--prova-fita2': c.fita2,
    '--prova-fita3': c.fita3,
  }

  // No escuro, aplica superfícies escuras INLINE (autossuficiente, sem depender de .dark no SSR).
  if (dark) return {
    ...acentos,
    '--background': '#0b0b0f',
    '--foreground': '#f4f4f5',
    '--card': '#17171b',
    '--card-foreground': '#f4f4f5',
    '--popover': '#17171b',
    '--popover-foreground': '#f4f4f5',
    '--secondary': '#26262c',
    '--secondary-foreground': '#f4f4f5',
    '--muted': '#26262c',
    '--muted-foreground': '#a1a1aa',
    '--accent': '#26262c',
    '--accent-foreground': '#f4f4f5',
    '--border': '#2a2a30',
    '--input': '#2a2a30',
    '--prova-topbar': '#17171b',
    '--prova-topbar-texto': '#f4f4f5',
    '--prova-timer': '#f4f4f5',
    '--prova-timer-fundo': '#26262c',
    '--prova-alt-fundo': '#17171b',
    '--prova-alt-hover': '#26262c',
    '--prova-login-input': '#17171b',
    '--prova-caderno-btn-fundo': '#17171b',
  }

  // Superfícies do caderno — modo claro.
  return {
    ...acentos,
    '--background': c.fundo,
    '--foreground': c.texto,
    '--card': c.card,
    '--card-foreground': c.texto,
    '--popover': c.card,
    '--popover-foreground': c.texto,
    '--secondary': muted,
    '--secondary-foreground': c.texto,
    '--muted': muted,
    '--muted-foreground': mutedFg,
    '--accent': muted,
    '--accent-foreground': c.texto,
    '--border': c.borda,
    '--input': c.borda,
    '--prova-topbar': c.topbar,
    '--prova-topbar-texto': c.topbarTexto,
    '--prova-timer': c.timer,
    '--prova-timer-fundo': c.timerFundo,
    '--prova-alt-fundo': c.altFundo,
    '--prova-alt-hover': c.altHover,
    '--prova-login-input': c.loginInputBg,
    '--prova-caderno-btn-fundo': c.cadernoBtnFundo,
  }
}
