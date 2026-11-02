// Helpers p/ a barra de carregamento do topo (<NavProgress/>). Navegações PROGRAMÁTICAS
// (router.push via <button>, troca de aba por estado) não passam por um <a>, então precisam
// disparar o evento à mão. O FIM é automático quando a rota/busca muda; p/ troca de aba sem
// navegação (estado local), chame navProgressDone() logo após (ele respeita o tempo mínimo visível).

export function navProgressStart() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('navprogress:start'))
}
export function navProgressDone() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('navprogress:done'))
}
