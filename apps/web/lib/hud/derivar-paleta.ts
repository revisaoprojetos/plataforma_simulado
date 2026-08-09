import type { HudCores } from '@/lib/caderno-designer/types'

// Gera uma paleta COMPLETA do HUD a partir de 1–2 cores da marca (primária + secundária/accent).
// Deriva tons claros/escuros e escolhe texto legível por luminância — recolore tudo de forma coerente.

function toRgb(hex: string): { r: number; g: number; b: number } {
  const h = (hex || '').replace('#', '')
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6)
  return { r: parseInt(s.slice(0, 2), 16) || 0, g: parseInt(s.slice(2, 4), 16) || 0, b: parseInt(s.slice(4, 6), 16) || 0 }
}
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
function mistura(hex: string, alvo: string, t: number): string {
  const a = toRgb(hex), b = toRgb(alvo)
  return toHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t)
}
const clarear = (hex: string, t: number) => mistura(hex, '#ffffff', t)
const escurecer = (hex: string, t: number) => mistura(hex, '#000000', t)
/** Luminância relativa (0 escuro … 1 claro). */
function lum(hex: string): number {
  const { r, g, b } = toRgb(hex)
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
/** Preto ou branco conforme o que contrasta melhor com o fundo. */
export const textoLegivel = (hex: string) => (lum(hex) > 0.5 ? '#1a1d24' : '#ffffff')

/** Deriva TODAS as cores do HUD a partir da primária (+ secundária opcional). */
export function derivarHud(prim: string, sec?: string): Partial<HudCores> {
  const s = sec || '#f59e0b'
  return {
    // base
    fundo: '#ffffff', card: '#ffffff', texto: '#1a1d24', borda: '#e5e7eb', textoSecundario: '#71767f', superficie: '#eceef2',
    // marca
    primaria: prim, selecionada: prim, finalizar: prim, respondida: prim, media: prim, loadingCor: prim, loadingTipo: 'circulo',
    // barra da prova
    topbar: clarear(prim, 0.92), topbarTexto: escurecer(prim, 0.35), timer: escurecer(prim, 0.4), timerFundo: clarear(prim, 0.88),
    // alternativas
    altFundo: '#ffffff', altHover: clarear(prim, 0.9),
    // accents
    revisar: s, aviso: s, alerta: '#dc2626',
    // resultados
    acerto: '#16a34a', erro: '#dc2626', branco: '#6b7280', anulada: '#6b7280', altTrocada: '#0891b2',
    // login / entrada
    loginInputBg: '#ffffff', tituloTexto: prim, loginDestaque: prim, loginBotao: prim, entradaBotao: prim, entradaTempo: prim,
    // selos de situação
    sitNaoIniciado: '#2563eb', sitAndamento: s, sitEncerrado: '#dc2626', sitDisponivel: prim,
    // botões da prova encerrada (normal + ativo)
    cadernoBtn: prim, cadernoBtnFundo: '#ffffff', cadernoBtnAtivo: textoLegivel(prim), cadernoBtnFundoAtivo: prim,
    inicioBtn: prim, inicioBtnFundo: '#ffffff', inicioBtnAtivo: textoLegivel(prim), inicioBtnFundoAtivo: prim,
    voltarBtn: textoLegivel(prim), voltarBtnFundo: prim, voltarBtnAtivo: textoLegivel(escurecer(prim, 0.15)), voltarBtnFundoAtivo: escurecer(prim, 0.15),
    // fita (gradiente dos cards)
    fita1: prim, fita2: s, fita3: clarear(prim, 0.35),
  }
}

/** Temas prontos (1 clique). */
export const PRESETS_HUD: { nome: string; prim: string; sec: string; cores: Partial<HudCores> }[] = [
  { nome: 'Roxo + Amarelo', prim: '#6d28d9', sec: '#f59e0b', cores: derivarHud('#6d28d9', '#f59e0b') },
  { nome: 'Verde', prim: '#059669', sec: '#f59e0b', cores: derivarHud('#059669', '#f59e0b') },
  { nome: 'Azul', prim: '#2563eb', sec: '#f59e0b', cores: derivarHud('#2563eb', '#f59e0b') },
  { nome: 'Vinho', prim: '#9f1239', sec: '#e0a83c', cores: derivarHud('#9f1239', '#e0a83c') },
  { nome: 'Grafite', prim: '#334155', sec: '#f59e0b', cores: derivarHud('#334155', '#f59e0b') },
]
