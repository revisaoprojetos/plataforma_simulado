/**
 * Rótulo da PRÓXIMA aula a liberar, calculado no CLIENTE (usa a data local do aluno):
 *  - libera amanhã            → "Aula de amanhã"
 *  - libera hoje (ou já passou)→ "Fazer aula de hoje"
 *  - libera depois            → "Libera dd/mm"
 */
export function rotuloProximaAula(liberaEm?: string | null): string {
  if (!liberaEm) return 'Próxima aula'
  const d = new Date(liberaEm)
  if (Number.isNaN(d.getTime())) return 'Próxima aula'
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(d); alvo.setHours(0, 0, 0, 0)
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000)
  if (dias <= 0) return 'Fazer aula de hoje'
  if (dias === 1) return 'Aula de amanhã'
  return `Libera ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
}
