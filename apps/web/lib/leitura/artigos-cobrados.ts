/**
 * "Artigos já cobrados em prova" (LegProc Digital) = artigos que têm uma QUESTÃO ancorada
 * (doc.questoes.aposArtigo). Marca cada artigo `[data-art=N]` (N ∈ cobrados) com um SELO
 * "Cobrado em prova" + um controle de RECOLHER/EXPANDIR que oculta o corpo do artigo (os irmãos
 * até o próximo `[data-art]`).
 *
 * Cuidados (o leitor mede os grifos por OFFSET de caractere na "espinha" do texto):
 *  - NÃO injeta nós de TEXTO no fluxo — o rótulo do selo vem de CSS `content` (0 caractere).
 *  - NÃO move nós — só insere um <span> sem texto e alterna `display` dos irmãos do corpo.
 *  Assim os offsets das âncoras ficam intactos; `onToggle` roda ao abrir/fechar p/ realinhar o overlay.
 *
 * Idempotente (guarda `data-cobrado`) e reversível (a função de limpeza remove selos e restaura tudo).
 * Default: ABERTO — o aluno só ganha a OPÇÃO de recolher (nada some sem clique).
 */
export function prepararArtigosCobrados(cont: HTMLElement, cobrados: Set<number>, onToggle?: () => void): () => void {
  if (!cobrados.size) return () => {}
  const limpar: (() => void)[] = []

  for (const el of Array.from(cont.querySelectorAll<HTMLElement>('[data-art]'))) {
    const n = Number(el.getAttribute('data-art')) || 0
    if (!cobrados.has(n) || el.hasAttribute('data-cobrado')) continue
    el.setAttribute('data-cobrado', '1')

    // Corpo = irmãos seguintes até o próximo artigo.
    const corpo: HTMLElement[] = []
    for (let s = el.nextElementSibling as HTMLElement | null; s && !s.hasAttribute('data-art'); s = s.nextElementSibling as HTMLElement | null) corpo.push(s)

    // Barra (selo + chevron) sem nós de texto — rótulos via CSS. É clicável (role=button).
    const barra = document.createElement('span')
    barra.className = 'art-cobrado-barra'
    barra.setAttribute('role', 'button')
    barra.setAttribute('tabindex', '0')
    barra.setAttribute('aria-expanded', 'true')
    barra.setAttribute('title', 'Artigo já cobrado em prova — clique para recolher/expandir')
    const selo = document.createElement('span'); selo.className = 'art-cobrado-selo'
    const chev = document.createElement('span'); chev.className = 'art-cobrado-chev'
    barra.append(selo, chev)
    el.insertBefore(barra, el.firstChild)

    const setAberto = (aberto: boolean) => {
      for (const c of corpo) c.style.display = aberto ? '' : 'none'
      el.toggleAttribute('data-art-fechado', !aberto)
      barra.setAttribute('aria-expanded', aberto ? 'true' : 'false')
      onToggle?.()
    }
    const alternar = (e: Event) => { e.preventDefault(); e.stopPropagation(); setAberto(el.hasAttribute('data-art-fechado')) }
    const onKey = (e: Event) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') alternar(e) }
    barra.addEventListener('click', alternar)
    barra.addEventListener('keydown', onKey)

    limpar.push(() => {
      barra.removeEventListener('click', alternar)
      barra.removeEventListener('keydown', onKey)
      barra.remove()
      el.removeAttribute('data-cobrado')
      el.removeAttribute('data-art-fechado')
      for (const c of corpo) c.style.removeProperty('display')
    })
  }

  return () => { for (const f of limpar) f() }
}
