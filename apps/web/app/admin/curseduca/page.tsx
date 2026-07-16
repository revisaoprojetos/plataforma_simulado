import { redirect } from 'next/navigation'

// A Curseduca foi unificada em Integrações (abas). Mantém o link antigo funcionando.
export default function CurseducaRedirect() {
  redirect('/admin/integracoes/curseduca')
}
