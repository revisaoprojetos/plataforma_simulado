/**
 * Caixas de destaque importadas como TABELA (Word: `<td>` com background — ex.: "ENTENDIMENTO DO
 * STF/STJ", "NATUREZA JURÍDICA DO PREÂMBULO"). O acervo antigo usa `<div data-caixa>` (card nativo:
 * cantos arredondados, cabeçalho + prévia + seta + animação de recolher). Aqui CONVERTEMOS a tabela
 * nessa MESMA estrutura DIV, reusando 100% do CSS nativo → as importadas ficam idênticas às nativas.
 *
 * Dois formatos:
 *  - 1 coluna (ENTENDIMENTO…): o corpo é o texto das células, achatado (parágrafos direto no card).
 *  - multi-coluna (comparativos: NATUREZA/DIFERENCIAÇÃO): mantém a TABELA (sem a linha do título)
 *    dentro do corpo, preservando o comparativo.
 *
 * Move os nós preservando a ORDEM do texto → a "espinha" das âncoras dos grifos permanece intacta.
 * `onToggle` roda após abrir/fechar (recompor overlay/layout). Compartilhado leitor + prévia admin.
 */
const RE_DESTAQUE = /ENTENDIMENTO|S[ÚU]MULA|ATEN[ÇC]|OBSERVA|IMPORTANTE|\bDICA\b|JURISPRUD|INFORMATIVO|PRECEDENTE|\bTESE\b|N[ÃA]O ESQUE|DEPORTA|EXPULS|EXTRADI|NATUREZA|DIFEREN|CLASSIFICA|CONCEITO|REQUISITO|CARACTER|DISTIN/i

function tipoCaixa(titulo: string): string {
  const t = titulo.toUpperCase()
  if (/\bSTJ\b/.test(t)) return 'stj'
  if (/\bSTF\b/.test(t)) return 'stf'
  if (/ATEN[ÇC]|N[ÃA]O ESQUE|IMPORTANTE|CUIDADO/.test(t)) return 'alerta'
  return 'comentario'
}

export function prepararCaixasTabela(cont: HTMLElement, _onToggle?: () => void): () => void {
  // Clique/tecla são tratados por DELEGAÇÃO única no leitor (não anexa listener por caixa → sem duplicar).
  for (const tab of Array.from(cont.querySelectorAll<HTMLTableElement>('table'))) {
    const rows = Array.from(tab.rows) // nativo (cobre tbody/thead) — robusto entre navegadores
    if (rows.length < 2) continue
    if (rows[0].cells.length !== 1) continue // cabeçalho = 1ª linha, uma faixa (título)
    const headCell = rows[0].cells[0] as HTMLElement
    const temFundo = /background/i.test(headCell.getAttribute('style') || '') || /background/i.test(rows[0].getAttribute('style') || '')
    const txt = (headCell.textContent || '').replace(/\s+/g, ' ').trim()
    if (!(temFundo && (RE_DESTAQUE.test(txt) || txt.length <= 80))) continue // não parece caixa de destaque

    // Estrutura de caixa DIV nativa (mesmo card das antigas).
    const div = document.createElement('div')
    div.setAttribute('data-caixa', tipoCaixa(txt))
    div.classList.add('caixa-colapsavel')
    const cab = document.createElement('div'); cab.className = 'caixa-cab'
    while (headCell.firstChild) cab.appendChild(headCell.firstChild) // título
    div.appendChild(cab)
    const corpo = document.createElement('div'); corpo.className = 'caixa-corpo'
    const inner = document.createElement('div'); inner.className = 'caixa-corpo-in'

    const bodyRows = rows.slice(1)
    const multiCol = bodyRows.some((r) => r.cells.length > 1)
    if (multiCol) {
      // Comparativo: preserva a TABELA (remove só a linha do título) dentro do corpo.
      rows[0].remove()
      tab.replaceWith(div)
      inner.appendChild(tab)
    } else {
      // 1 coluna: achata o texto das células direto no corpo (parágrafos, sem borda de tabela).
      for (const r of bodyRows) { const cell = r.cells[0]; while (cell && cell.firstChild) inner.appendChild(cell.firstChild) }
      tab.replaceWith(div)
    }
    corpo.appendChild(inner); div.appendChild(corpo)

    const previa = (inner.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
    if (previa) cab.setAttribute('data-previa', previa)
    const tit = (cab.textContent || '').replace(/\s+/g, ' ').trim()
    if (tit && !/[:：]$/.test(tit)) cab.setAttribute('data-add-colon', '1')
    cab.setAttribute('role', 'button'); cab.setAttribute('tabindex', '0'); cab.setAttribute('aria-expanded', 'false')
    div.removeAttribute('data-aberto') // recolhida por padrão (clique via delegação no leitor)
  }

  return () => {}
}

/**
 * "📌 Já cobrado em prova:" — parágrafos que começam com esse rótulo viram CAIXAS COLAPSÁVEIS no MESMO
 * estilo das outras (cabeçalho = o rótulo; corpo = o resto do parágrafo). Só MOVE nós (divide o text node
 * do rótulo no ':'), preservando a ORDEM do texto → a "espinha" das âncoras dos grifos fica intacta.
 * Recolhido por padrão. Idempotente (pula o que já está dentro de caixa).
 */
const RE_COBRADO = /^\s*📌?\s*j[áa]\s+cobrad[oa]s?\s+em\s+prova\s*:?/i

export function prepararCaixasCobrado(cont: HTMLElement, _onToggle?: () => void): () => void {
  // Clique/tecla tratados por DELEGAÇÃO única no leitor (não anexa listener por caixa → sem duplicar).
  let els: HTMLElement[] = []
  try { els = Array.from(cont.querySelectorAll<HTMLElement>('p, li')) } catch { return () => {} }
  for (const el of els) {
    try {
      if (!el.isConnected || el.closest('.caixa-colapsavel')) continue
      if (Array.from(el.children).some((c) => /^(P|DIV|LI|TABLE|UL|OL|BLOCKQUOTE)$/.test(c.tagName))) continue
      const full = el.textContent || ''
      const m = RE_COBRADO.exec(full)
      if (!m) continue
      const k = m[0].length // fim do rótulo (inclui o ':' se houver)

      const box = document.createElement('div')
      box.setAttribute('data-caixa', 'cobrado')
      box.classList.add('caixa-colapsavel')
      const cab = document.createElement('div'); cab.className = 'caixa-cab'
      const titulo = document.createElement('span'); cab.appendChild(titulo) // :first-child = título (rótulo)
      const corpo = document.createElement('div'); corpo.className = 'caixa-corpo'
      const inner = document.createElement('div'); inner.className = 'caixa-corpo-in'; corpo.appendChild(inner)

      // Acha o ponto de corte (offset k) na árvore de texto do parágrafo — mesmo quando o rótulo+lista
      // estão dentro de um <strong> — e usa Range.extractContents (divide subárvores corretamente):
      // fragmento até k = TÍTULO; o restante do parágrafo = CORPO. Não remove/adiciona texto (espinha ok).
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
        titulo.appendChild(range.extractContents()) // rótulo (com wrappers preservados)
      }
      while (el.firstChild) inner.appendChild(el.firstChild) // resto do parágrafo → corpo

      box.appendChild(cab); box.appendChild(corpo)
      el.replaceWith(box)

      // Se o rótulo estava sozinho no parágrafo, a lista costuma vir nos parágrafos SEGUINTES → absorve-os
      // no corpo (até um limite/estrutura), preservando a ordem do texto.
      if (!(inner.textContent || '').trim()) {
        let s = box.nextElementSibling as HTMLElement | null
        let n = 0
        while (s && n < 6 && !s.hasAttribute('data-art') && !s.classList.contains('caixa-colapsavel') && !/^(H1|H2|H3|TABLE)$/.test(s.tagName) && !RE_COBRADO.test(s.textContent || '')) {
          const prox = s.nextElementSibling as HTMLElement | null
          inner.appendChild(s); s = prox; n++
        }
      }

      // Prévia (começo da lista) ao lado do título — igual aos ENTENDIMENTOS; some ao expandir.
      const previa = (inner.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
      if (previa) cab.setAttribute('data-previa', previa)
      cab.setAttribute('role', 'button'); cab.setAttribute('tabindex', '0'); cab.setAttribute('aria-expanded', 'false')
      box.removeAttribute('data-aberto') // recolhida por padrão (clique via delegação no leitor)
    } catch { /* não deixa 1 elemento quebrar os demais nem o resto do leitor */ }
  }

  return () => {}
}
