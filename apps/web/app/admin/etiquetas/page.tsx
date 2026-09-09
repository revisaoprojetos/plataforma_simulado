import { redirect } from 'next/navigation'

// Etiquetas virou uma ABA dentro de Questões (saiu da sidebar). Mantém links antigos funcionando.
export default function EtiquetasRedirect() {
  redirect('/admin/questoes?tab=etiquetas')
}
