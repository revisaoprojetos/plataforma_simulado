/**
 * Caixas de destaque importadas como TABELA (Word: 1 coluna, `<td>` com background — ex.:
 * "ENTENDIMENTO DO STF/STJ"). O acervo antigo usa `<div data-caixa>` (renderizado como card nativo:
 * cantos arredondados, cabeçalho + prévia + seta + animação de recolher). Aqui CONVERTEMOS a tabela
 * nessa MESMA estrutura DIV (`[data-caixa]` + `.caixa-colapsavel` + `.caixa-cab` + `.caixa-corpo`),
 * reusando 100% do CSS nativo → as importadas ficam idênticas às nativas (cor por tipo: STJ creme,
 * STF azul), com recolher/expandir animado.
 *
 * Move os nós preservando a ORDEM do texto → a "espinha" das âncoras dos grifos permanece intacta.
 * `onToggle` roda após abrir/fechar (recompor overlay/layout). Retorna a limpeza dos listeners.
 * Compartilhado pelo leitor do aluno E pela prévia do admin, para ficar igual nos dois.
 */
const RE_DESTAQUE = /ENTENDIMENTO|S[ÚU]MULA|ATEN[ÇC]|OBSERVA|IMPORTANTE|\bDICA\b|JURISPRUD|INFORMATIVO|PRECEDENTE|\bTESE\b|N[ÃA]O ESQUE|DEPORTA|EXPULS|EXTRADI/i

function tipoCaixa(titulo: string): string {
  const t = titulo.toUpperCase()
  if (/\bSTJ\b/.test(t)) return 'stj'
  if (/\bSTF\b/.test(t)) return 'stf'
  if (/ATEN[ÇC]|N[ÃA]O ESQUE|IMPORTANTE|CUIDADO/.test(t)) return 'alerta'
  return 'comentario'
}

export function prepararCaixasTabela(cont: HTMLElement, onToggle?: () => void): () => void {
  const ligados: { el: HTMLElement; ev: 'click' | 'keydown'; fn: (e: Event) => void }[] = []
  const alternar = (box: HTMLElement, cab: HTMLElement) => {
    const aberto = !box.hasAttribute('data-aberto')
    if (aberto) box.setAttribute('data-aberto', '1'); else box.removeAttribute('data-aberto')
    cab.setAttribute('aria-expanded', aberto ? 'true' : 'false')
    onToggle?.()
  }
  const onKey = (e: Event) => {
    const k = (e as KeyboardEvent).key
    if (k === 'Enter' || k === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() }
  }

  for (const tab of Array.from(cont.querySelectorAll<HTMLTableElement>('table'))) {
    const rows = Array.from(tab.rows) // nativo (cobre tbody/thead) — robusto entre navegadores
    if (rows.length < 2) continue
    if (rows.some((r) => r.cells.length !== 1)) continue // só caixas de 1 coluna (ENTENDIMENTO etc.)
    const headCell = rows[0].cells[0] as HTMLElement
    const temFundo = /background/i.test(headCell.getAttribute('style') || '') || /background/i.test(rows[0].getAttribute('style') || '')
    const txt = (headCell.textContent || '').replace(/\s+/g, ' ').trim()
    if (!(temFundo && (RE_DESTAQUE.test(txt) || txt.length <= 80))) continue // não parece caixa de destaque

    // Converte a TABELA na estrutura de caixa DIV nativa (mesmo card das antigas).
    const div = document.createElement('div')
    div.setAttribute('data-caixa', tipoCaixa(txt))
    div.classList.add('caixa-colapsavel')
    const cab = document.createElement('div'); cab.className = 'caixa-cab'
    while (headCell.firstChild) cab.appendChild(headCell.firstChild) // conteúdo do cabeçalho (título)
    div.appendChild(cab)
    const corpo = document.createElement('div'); corpo.className = 'caixa-corpo'
    const inner = document.createElement('div'); inner.className = 'caixa-corpo-in'
    for (let i = 1; i < rows.length; i++) { const cell = rows[i].cells[0]; while (cell.firstChild) inner.appendChild(cell.firstChild) }
    corpo.appendChild(inner); div.appendChild(corpo)
    const previa = (inner.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
    if (previa) cab.setAttribute('data-previa', previa)
    cab.setAttribute('role', 'button'); cab.setAttribute('tabindex', '0'); cab.setAttribute('aria-expanded', 'false')
    div.removeAttribute('data-aberto') // recolhida por padrão
    tab.replaceWith(div)
    const clique = () => alternar(div, cab)
    cab.addEventListener('click', clique); cab.addEventListener('keydown', onKey)
    ligados.push({ el: cab, ev: 'click', fn: clique }, { el: cab, ev: 'keydown', fn: onKey })
  }

  return () => { for (const { el, ev, fn } of ligados) el.removeEventListener(ev, fn) }
}
