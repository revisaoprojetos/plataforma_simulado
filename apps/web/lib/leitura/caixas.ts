/**
 * Blocos de destaque configuráveis. O tipo/cor de cada bloco vem da config do documento (blocos.ts) —
 * a detecção casa por PALAVRAS-CHAVE no título (tabela) ou no início (parágrafo). A ESTRUTURA visual
 * (card colapsável: cabeçalho + prévia + seta + animação) é a mesma de sempre; a COR é aplicada inline
 * a partir do bloco. Move nós preservando a ordem do texto → a "espinha" das âncoras dos grifos fica ok.
 * `onToggle` roda após abrir/fechar. Compartilhado leitor + prévia admin.
 */
import { DEFAULT_BLOCOS, acharBlocoPorTitulo, acharBlocoPorInicio, estiloBloco, type BlocoDef } from './blocos'

function pintar(div: HTMLElement, bloco: BlocoDef) {
  const e = estiloBloco(bloco.cor)
  div.style.setProperty('background', e.background)
  div.style.setProperty('border-color', e.borderColor)
}
// Cor do TEXTO do título no cabeçalho (aplicada no cab e no 1º filho, p/ vencer CSS específico).
function pintarTitulo(cab: HTMLElement, corTitulo: string) {
  cab.style.setProperty('color', corTitulo, 'important')
  const f = cab.firstElementChild as HTMLElement | null
  if (f) f.style.setProperty('color', corTitulo, 'important')
}

/** Caixas em TABELA (cabeçalho de 1 célula com fundo) → card colapsável do bloco que casar no título. */
export function prepararCaixasTabela(cont: HTMLElement, blocos: BlocoDef[] = DEFAULT_BLOCOS, _onToggle?: () => void): () => void {
  const generico: BlocoDef = blocos.find((b) => b.id === 'destaque') ?? blocos[blocos.length - 1] ?? { id: 'destaque', rotulo: 'Destaque', palavras: '', cor: '#eef1f4', corTitulo: '#111111', previa: true }
  for (const tab of Array.from(cont.querySelectorAll<HTMLTableElement>('table'))) {
    const rows = Array.from(tab.rows)
    if (rows.length < 2) continue
    if (rows[0].cells.length !== 1) continue // cabeçalho = 1ª linha, uma faixa (título)
    const headCell = rows[0].cells[0] as HTMLElement
    const temFundo = /background/i.test(headCell.getAttribute('style') || '') || /background/i.test(rows[0].getAttribute('style') || '')
    const txt = (headCell.textContent || '').replace(/\s+/g, ' ').trim()
    if (!temFundo) continue
    const bloco = acharBlocoPorTitulo(txt, blocos) ?? (txt.length <= 80 ? generico : null)
    if (!bloco) continue

    const div = document.createElement('div')
    div.setAttribute('data-caixa', bloco.id)
    div.classList.add('caixa-colapsavel')
    pintar(div, bloco)
    const cab = document.createElement('div'); cab.className = 'caixa-cab'
    while (headCell.firstChild) cab.appendChild(headCell.firstChild) // título
    pintarTitulo(cab, bloco.corTitulo)
    div.appendChild(cab)
    const corpo = document.createElement('div'); corpo.className = 'caixa-corpo'
    const inner = document.createElement('div'); inner.className = 'caixa-corpo-in'

    const bodyRows = rows.slice(1)
    const multiCol = bodyRows.some((r) => r.cells.length > 1)
    if (multiCol) {
      rows[0].remove()
      tab.replaceWith(div)
      inner.appendChild(tab)
    } else {
      for (const r of bodyRows) { const cell = r.cells[0]; while (cell && cell.firstChild) inner.appendChild(cell.firstChild) }
      tab.replaceWith(div)
    }
    corpo.appendChild(inner); div.appendChild(corpo)

    const previa = (inner.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
    if (previa && bloco.previa) cab.setAttribute("data-previa", previa)
    const tit = (cab.textContent || '').replace(/\s+/g, ' ').trim()
    if (tit && !/[:：]$/.test(tit)) cab.setAttribute('data-add-colon', '1')
    cab.setAttribute('role', 'button'); cab.setAttribute('tabindex', '0'); cab.setAttribute('aria-expanded', 'false')
    div.removeAttribute('data-aberto')
  }
  return () => {}
}

/**
 * Parágrafos/`<li>` cujo INÍCIO casa com as palavras de um bloco (ex.: "📌 Já cobrado em prova:") viram
 * card colapsável (cabeçalho = o rótulo; corpo = o resto). Só MOVE nós (divide no fim do rótulo),
 * preservando a ordem do texto → espinha intacta. Recolhido por padrão. Idempotente.
 */
export function prepararCaixasParagrafo(cont: HTMLElement, blocos: BlocoDef[] = DEFAULT_BLOCOS, _onToggle?: () => void): () => void {
  let els: HTMLElement[] = []
  try { els = Array.from(cont.querySelectorAll<HTMLElement>('p, li')) } catch { return () => {} }
  for (const el of els) {
    try {
      if (!el.isConnected || el.closest('.caixa-colapsavel')) continue
      if (Array.from(el.children).some((c) => /^(P|DIV|LI|TABLE|UL|OL|BLOCKQUOTE)$/.test(c.tagName))) continue
      const full = el.textContent || ''
      const hit = acharBlocoPorInicio(full, blocos)
      if (!hit) continue
      const bloco = hit.bloco, k = hit.tam // fim do rótulo no texto original

      const box = document.createElement('div')
      box.setAttribute('data-caixa', bloco.id)
      box.classList.add('caixa-colapsavel')
      pintar(box, bloco)
      const cab = document.createElement('div'); cab.className = 'caixa-cab'
      const titulo = document.createElement('span'); titulo.style.setProperty('color', bloco.corTitulo, 'important'); cab.appendChild(titulo)
      const corpo = document.createElement('div'); corpo.className = 'caixa-corpo'
      const inner = document.createElement('div'); inner.className = 'caixa-corpo-in'; corpo.appendChild(inner)

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let acc = 0
      let boundNode: Text | null = null, boundOff = 0, tn: Node | null = null
      while ((tn = walker.nextNode())) {
        const len = (tn.textContent || '').length
        if (acc + len >= k) { boundNode = tn as Text; boundOff = Math.max(0, Math.min(len, k - acc)); break }
        acc += len
      }
      if (boundNode) {
        const range = document.createRange()
        range.setStart(el, 0)
        range.setEnd(boundNode, boundOff)
        titulo.appendChild(range.extractContents())
      }
      while (el.firstChild) inner.appendChild(el.firstChild)

      box.appendChild(cab); box.appendChild(corpo)
      el.replaceWith(box)

      if (!(inner.textContent || '').trim()) {
        let s = box.nextElementSibling as HTMLElement | null
        let n = 0
        while (s && n < 6 && !s.hasAttribute('data-art') && !s.classList.contains('caixa-colapsavel') && !/^(H1|H2|H3|TABLE)$/.test(s.tagName) && !acharBlocoPorInicio(s.textContent || '', blocos)) {
          const prox = s.nextElementSibling as HTMLElement | null
          inner.appendChild(s); s = prox; n++
        }
      }

      const previa = (inner.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
      if (previa && bloco.previa) cab.setAttribute("data-previa", previa)
      const tit = (cab.textContent || '').replace(/\s+/g, ' ').trim()
      if (tit && !/[:：]$/.test(tit)) cab.setAttribute('data-add-colon', '1')
      cab.setAttribute('role', 'button'); cab.setAttribute('tabindex', '0'); cab.setAttribute('aria-expanded', 'false')
      box.removeAttribute('data-aberto')
    } catch { /* não deixa 1 elemento quebrar os demais */ }
  }
  return () => {}
}

/** Alias de compat: nome antigo. */
export const prepararCaixasCobrado = prepararCaixasParagrafo
