'use client'

import { useEffect } from 'react'

// Transição SUAVE ao trocar o tema (claro ↔ escuro) em TODAS as áreas, sem editar cada botão.
// Como funciona: observa a classe `.dark` / `data-theme` no <html> (gatilho único de todos os toggles
// via next-themes). Quando o tema realmente vira, adiciona `theme-anim` ao <html> por ~450ms — e o CSS
// (globals.css) ativa transição das propriedades de COR só nesse intervalo. O timing funciona porque a
// troca de classe e a adição de `theme-anim` caem no MESMO recálculo de estilo (antes do paint), então
// o navegador interpola da cor antiga para a nova. Fora da troca, zero transição global (sem efeito colateral).
export function ThemeTransition() {
  useEffect(() => {
    const html = document.documentElement
    const estaEscuro = () =>
      html.classList.contains('dark') || html.getAttribute('data-theme') === 'dark'
    let anterior = estaEscuro()
    let t: ReturnType<typeof setTimeout> | null = null
    const obs = new MutationObserver(() => {
      const agora = estaEscuro()
      if (agora === anterior) return // ignora mudanças de classe que não são do tema (inclui o próprio theme-anim)
      anterior = agora
      html.classList.add('theme-anim')
      if (t) clearTimeout(t)
      t = setTimeout(() => html.classList.remove('theme-anim'), 450)
    })
    obs.observe(html, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => { obs.disconnect(); if (t) clearTimeout(t) }
  }, [])
  return null
}
