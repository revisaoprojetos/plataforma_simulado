'use client'
// Injeta um <style> no <head> UMA vez por id (o CSS do editor é global e escopado por classe: não precisa ser reinjetado a cada render
// nem a cada página aberta). Só no cliente; idempotente.
export function garantirCss(id: string, css: string): void {
  if (typeof document === 'undefined') return
  const sel = `style[data-nb-css="${id}"]`
  const atual = document.head.querySelector(sel)
  if (atual) { if (atual.textContent !== css) atual.textContent = css; return }
  const el = document.createElement('style')
  el.setAttribute('data-nb-css', id)
  el.textContent = css
  document.head.appendChild(el)
}
