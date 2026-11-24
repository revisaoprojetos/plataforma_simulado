import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// ALIAS: "Versões" foi unificada com "Versões e exportação" na vista Versões do shell (histórico das regras incluído).
export default function VersoesPage() {
  redirect('/admin/revisao/cronograma?aba=adaptativo&sub=versoes&v=versoes')
}
