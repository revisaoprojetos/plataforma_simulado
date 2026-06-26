import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getTenantTheme } from '@/lib/tenant-theme'
import { AlunoHeader } from '@/components/aluno/aluno-header'

export default async function AlunoPortalLayout({ children }: { children: React.ReactNode }) {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const tema = await getTenantTheme()

  return (
    <>
      {tema.css && <style dangerouslySetInnerHTML={{ __html: tema.css }} />}
      <div className="min-h-screen bg-muted/20">
        <AlunoHeader nome={sessao.nome} plataforma={tema.tenantNome ?? 'Área do Aluno'} />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>
    </>
  )
}
