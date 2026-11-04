/* Paleta nova nos iframes (mesma origem): copia o <link> do css da paleta que o portal injetou (só existe quando o
   interruptor do Console libera a paleta p/ este visitante). Sem o link no portal, não faz nada = cores atuais. */
(function () {
  try {
    if (window.parent === window) return
    var l = window.parent.document.querySelector('link[href^="/api/public/paleta"]')
    if (!l) return
    var n = document.createElement('link')
    n.rel = 'stylesheet'
    n.href = l.getAttribute('href') + '&x=ifr' // iframe: só variáveis --pn-* (o vocabulário do iframe é próprio)
    document.head.appendChild(n)
    // sem tema explícito no iframe, segue o do portal (evita a paleta clara sobre o escuro automático do SO)
    var h = document.documentElement
    if (!h.getAttribute('data-theme')) h.setAttribute('data-theme', window.parent.document.documentElement.classList.contains('dark') ? 'dark' : 'light')
  } catch (e) { /* cross-origin ou sem pai: ignora */ }
})()
