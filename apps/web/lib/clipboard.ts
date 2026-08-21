/**
 * Copia texto para a área de transferência com fallback robusto.
 *
 * A Clipboard API (`navigator.clipboard`) só existe em contexto SEGURO (HTTPS/localhost) e
 * pode ser BLOQUEADA em iframe, sem foco ou por política de permissão — nesses casos
 * `navigator.clipboard` é `undefined` (chamar `.writeText` lança) ou a Promise rejeita.
 * Antes, o copiar-link fazia `navigator.clipboard.writeText(...).then()` sem `.catch()`,
 * então qualquer uma dessas situações estourava um erro no clique. Este helper nunca lança:
 * tenta a Clipboard API e, se falhar, cai no `textarea + execCommand('copy')` (legado).
 *
 * Retorna `true` se copiou, `false` se não deu (o chamador mostra o toast que preferir).
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    /* Clipboard API indisponível/bloqueada → tenta o fallback abaixo. */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
