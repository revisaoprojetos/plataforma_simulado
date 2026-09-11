/**
 * Recolher/expandir das caixas de destaque em formato TABELA (importadas do Word: 1 coluna, `<td>`
 * com background — ex.: "ENTENDIMENTO DO STF/STJ"). É o formato que o enhancer de DIV (data-caixa /
 * .box-stj|stf) NÃO cobria. Compartilhado pelo leitor do aluno E pela prévia do admin, para o
 * recolher/expandir ficar IDÊNTICO nos dois.
 *
 * Não envolve/reordena nós (só classes + CSS escondendo as linhas seguintes) → a "espinha" das
 * âncoras dos grifos permanece intacta. `onToggle` roda após abrir/fechar (recompor overlay/layout).
 * Idempotente (pula tabelas já preparadas) → pode ser chamado dentro de MutationObserver/rAF.
 * Retorna a limpeza dos listeners que ESTA chamada adicionou.
 */
const RE_DESTAQUE = /ENTENDIMENTO|S[ÚU]MULA|ATEN[ÇC]|OBSERVA|IMPORTANTE|\bDICA\b|JURISPRUD|INFORMATIVO|PRECEDENTE|\bTESE\b/i

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
    if (tab.classList.contains('caixa-colapsavel')) continue
    const rows = Array.from(tab.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr, :scope > tr'))
    if (rows.length < 2) continue
    if (rows.some((r) => r.children.length !== 1)) continue // não é 1 coluna → tabela de dados, ignora
    const head = rows[0].children[0] as HTMLElement
    const temFundo = /background/i.test(head.getAttribute('style') || '') || /background/i.test(rows[0].getAttribute('style') || '')
    const txt = (head.textContent || '').replace(/\s+/g, ' ').trim()
    if (!(temFundo && (RE_DESTAQUE.test(txt) || txt.length <= 80))) continue // não parece caixa de destaque
    tab.classList.add('caixa-colapsavel', 'caixa-tabela')
    head.classList.add('caixa-cab')
    head.setAttribute('role', 'button'); head.setAttribute('tabindex', '0'); head.setAttribute('aria-expanded', 'false')
    tab.removeAttribute('data-aberto') // recolhida por padrão
    const clique = () => alternar(tab, head)
    head.addEventListener('click', clique); head.addEventListener('keydown', onKey)
    ligados.push({ el: head, ev: 'click', fn: clique }, { el: head, ev: 'keydown', fn: onKey })
  }

  return () => { for (const { el, ev, fn } of ligados) el.removeEventListener(ev, fn) }
}
