// Atalhos de teclado (spec §8). `GLOBAIS` = só navegação/estrutura (tratados pela casca com preventDefault);
// formatação/inserção (Ctrl+B, Ctrl+K...) ficam com o editor/onda 2 e aparecem apenas na ajuda.
// Obs.: Ctrl+T, Ctrl+Tab e Ctrl+PgDn/PgUp são reservados por alguns navegadores (nem sempre dá para interceptar):
// por isso cada um tem uma alternativa (Alt+Shift+T, Ctrl+Alt+setas, Alt+PgDn/PgUp).
type Tecla = { ctrl?: boolean; alt?: boolean; shift?: boolean; code?: string; key?: string }
export type AtalhoGlobal = { cmd: string; teclas: Tecla[] }

export const GLOBAIS: AtalhoGlobal[] = [
  { cmd: 'arquivo.nova_pagina', teclas: [{ ctrl: true, code: 'KeyO' }] },
  { cmd: 'arquivo.nova_secao', teclas: [{ ctrl: true, code: 'KeyT' }, { alt: true, shift: true, code: 'KeyS' }] },
  { cmd: 'pagina.subpagina', teclas: [{ ctrl: true, shift: true, alt: true, code: 'KeyN' }] },
  { cmd: 'pagina.mover', teclas: [{ ctrl: true, alt: true, code: 'KeyM' }] },
  { cmd: 'busca.caderno', teclas: [{ ctrl: true, code: 'KeyE' }] },
  { cmd: 'busca.pagina', teclas: [{ ctrl: true, code: 'KeyL' }] },
  { cmd: 'nav.secao_prox', teclas: [{ ctrl: true, code: 'Tab' }, { ctrl: true, alt: true, code: 'ArrowRight' }] },
  { cmd: 'nav.secao_ant', teclas: [{ ctrl: true, shift: true, code: 'Tab' }, { ctrl: true, alt: true, code: 'ArrowLeft' }] },
  { cmd: 'nav.pagina_prox', teclas: [{ ctrl: true, code: 'PageDown' }, { alt: true, code: 'PageDown' }] },
  { cmd: 'nav.pagina_ant', teclas: [{ ctrl: true, code: 'PageUp' }, { alt: true, code: 'PageUp' }] },
  { cmd: 'nav.pagina_primeira', teclas: [{ alt: true, code: 'Home' }] },
  { cmd: 'nav.pagina_ultima', teclas: [{ alt: true, code: 'End' }] },
  { cmd: 'exibir.ampliar', teclas: [{ ctrl: true, key: '+' }, { ctrl: true, key: '=' }, { ctrl: true, code: 'NumpadAdd' }] },
  { cmd: 'exibir.reduzir', teclas: [{ ctrl: true, key: '-' }, { ctrl: true, code: 'NumpadSubtract' }] },
  { cmd: 'exibir.navegacao', teclas: [{ ctrl: true, alt: true, code: 'KeyN' }] },
  { cmd: 'ajuda.atalhos', teclas: [{ code: 'F1' }] },
]

export function atalhoGlobal(e: KeyboardEvent): string | null {
  const ctrl = e.ctrlKey || e.metaKey
  for (const a of GLOBAIS) {
    for (const t of a.teclas) {
      if (!!t.ctrl !== ctrl || !!t.alt !== e.altKey) continue
      if (t.key ? e.key !== t.key : !!t.shift !== e.shiftKey) continue // `key` (+,-) tolera Shift
      if (t.code && e.code !== t.code) continue
      return a.cmd
    }
  }
  return null
}

export const LISTA_ATALHOS: { grupo: string; itens: [string, string][] }[] = [
  { grupo: 'Estrutura', itens: [
    ['Ctrl+O', 'Nova página'], ['Ctrl+T  ou  Alt+Shift+S', 'Nova seção'], ['Ctrl+Shift+Alt+N', 'Nova subpágina'], ['Ctrl+Alt+M', 'Mover ou copiar página'],
  ] },
  { grupo: 'Navegação', itens: [
    ['Ctrl+Tab  ou  Ctrl+Alt+→', 'Próxima seção'], ['Ctrl+Shift+Tab  ou  Ctrl+Alt+←', 'Seção anterior'],
    ['Ctrl+PgDn  ou  Alt+PgDn', 'Próxima página'], ['Ctrl+PgUp  ou  Alt+PgUp', 'Página anterior'],
    ['Alt+Home', 'Primeira página da seção'], ['Alt+End', 'Última página da seção'], ['Ctrl+Alt+N', 'Mostrar/ocultar painel de navegação'],
  ] },
  { grupo: 'Pesquisa', itens: [['Ctrl+E', 'Pesquisar no caderno'], ['Ctrl+L', 'Pesquisar na página'], ['Enter / F3', 'Próximo resultado'], ['Shift+F3', 'Resultado anterior']] },
  { grupo: 'Exibição', itens: [['Ctrl++', 'Ampliar'], ['Ctrl+-', 'Reduzir'], ['F1', 'Atalhos de teclado']] },
  { grupo: 'Texto', itens: [
    ['Ctrl+B / I / U', 'Negrito / itálico / sublinhado'], ['Alt+Hífen', 'Tachado'], ['Ctrl+Shift+N', 'Limpar formatação'], ['Ctrl+Q / Ctrl+R', 'Alinhar à esquerda / direita'],
    ['Ctrl+Alt+1 … 6', 'Títulos 1 a 6'], ['Ctrl+. / Ctrl+/', 'Marcadores / numeração'], ['Tab / Shift+Tab', 'Aumentar / diminuir nível'], ['Ctrl+K', 'Inserir link'],
  ] },
  { grupo: 'Marcas e data', itens: [
    ['Ctrl+1 … 5', 'A Fazer, Importante, Pergunta, Lembrar-se, Definição'], ['Ctrl+0', 'Remover marca'],
    ['Alt+Shift+D / F / T', 'Inserir data / data e hora / hora'], ['Ctrl+Z / Ctrl+Y', 'Desfazer / refazer'],
  ] },
]
