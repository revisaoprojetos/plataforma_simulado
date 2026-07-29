import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { PrivacidadeClient } from './privacidade-client'
import { ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PrivacidadeAlunoPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><ShieldCheck className="h-6 w-6 text-primary" /> Privacidade e meus dados</h1>
        <p className="mt-1 text-sm text-muted-foreground">Seus direitos como titular de dados (LGPD): acessar, portar e pedir a exclusão dos seus dados pessoais.</p>
      </div>
      <PrivacidadeClient />
    </div>
  )
}
